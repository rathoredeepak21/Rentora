import { 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  addDoc, 
  updateDoc,
  onSnapshot, 
  query, 
  where, 
  limit,
  Unsubscribe 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  Bill, 
  Property, 
  Unit, 
  TenantDetails, 
  BillSettings, 
  PaymentSubmission, 
  NotificationPreferences,
  TenantDocument 
} from '../types';
import { calculateBillAllocation, decorateTenantBills } from '../utils/billingAllocation';

export const tenantDataService = {
  /**
   * Subscribes to real-time bills for the authenticated tenant with chronological payment allocation
   */
  subscribeTenantBills(
    tenantId: string,
    onUpdate: (bills: Bill[]) => void,
    onError?: (error: any) => void
  ): Unsubscribe {
    if (!tenantId) {
      onUpdate([]);
      return () => {};
    }

    let latestBills: Bill[] = [];
    let latestPayments: PaymentSubmission[] = [];
    let hasBillsSnapshot = false;

    const emitDecorated = () => {
      if (!hasBillsSnapshot) return;
      const decorated = decorateTenantBills(latestBills, latestPayments);
      onUpdate(decorated);
    };

    const billsQuery = query(
      collection(db, 'bills'),
      where('tenantId', '==', tenantId),
      limit(50)
    );

    const paymentsQuery = query(
      collection(db, 'payments'),
      where('tenantId', '==', tenantId),
      limit(50)
    );

    const unsubBills = onSnapshot(
      billsQuery,
      (snapshot) => {
        const raw: Bill[] = [];
        snapshot.forEach((docSnap) => {
          raw.push({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Bill, 'id'>),
          });
        });
        latestBills = raw;
        hasBillsSnapshot = true;
        emitDecorated();
      },
      (error) => {
        console.error('Error fetching tenant bills:', error);
        if (onError) onError(error);
      }
    );

    const unsubPayments = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        const list: PaymentSubmission[] = [];
        snapshot.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...(docSnap.data() as Omit<PaymentSubmission, 'id'>),
          });
        });
        latestPayments = list;
        emitDecorated();
      },
      (error) => {
        console.warn('Error fetching payments for bills decoration:', error);
      }
    );

    return () => {
      unsubBills();
      unsubPayments();
    };
  },

  /**
   * Subscribes to real-time payment submissions for the authenticated tenant
   */
  subscribeTenantPayments(
    tenantId: string,
    onUpdate: (payments: PaymentSubmission[]) => void,
    onError?: (error: any) => void
  ): Unsubscribe {
    if (!tenantId) {
      onUpdate([]);
      return () => {};
    }

    const paymentsQuery = query(
      collection(db, 'payments'),
      where('tenantId', '==', tenantId),
      limit(50)
    );

    return onSnapshot(
      paymentsQuery,
      (snapshot) => {
        const list: PaymentSubmission[] = [];
        snapshot.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...(docSnap.data() as Omit<PaymentSubmission, 'id'>),
          });
        });

        // Sort newest first by submittedAt or createdAt
        list.sort((a, b) => {
          const timeA = a.submittedAt || a.createdAt || '';
          const timeB = b.submittedAt || b.createdAt || '';
          return timeB.localeCompare(timeA);
        });

        onUpdate(list);
      },
      (error) => {
        console.error('Error fetching tenant payments:', error);
        if (onError) onError(error);
      }
    );
  },

  /**
   * Subscribes to real-time documents for the authenticated tenant (tenant-specific + property-level)
   */
  subscribeTenantDocuments(
    tenantId: string,
    propertyId?: string,
    onUpdate?: (docs: TenantDocument[]) => void,
    onError?: (error: any) => void
  ): Unsubscribe {
    if (!tenantId && !propertyId) {
      if (onUpdate) onUpdate([]);
      return () => {};
    }

    // Query 1: Tenant-specific documents
    const qTenant = query(
      collection(db, 'documents'),
      where('tenantId', '==', tenantId),
      limit(50)
    );

    let tenantDocs: TenantDocument[] = [];
    let propertyDocs: TenantDocument[] = [];

    const mergeAndSort = () => {
      const docMap = new Map<string, TenantDocument>();
      tenantDocs.forEach((d) => { if (d.id) docMap.set(d.id, d); });
      propertyDocs.forEach((d) => { if (d.id) docMap.set(d.id, d); });

      const combined = Array.from(docMap.values());
      combined.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
      if (onUpdate) onUpdate(combined);
    };

    const unsubTenant = onSnapshot(
      qTenant,
      (snap) => {
        tenantDocs = [];
        snap.forEach((docSnap) => {
          tenantDocs.push({
            id: docSnap.id,
            ...(docSnap.data() as Omit<TenantDocument, 'id'>),
          });
        });
        mergeAndSort();
      },
      (err) => {
        console.error('Error fetching tenant documents:', err);
        if (onError) onError(err);
      }
    );

    let unsubProp = () => {};
    if (propertyId) {
      const qProp = query(
        collection(db, 'documents'),
        where('propertyId', '==', propertyId),
        limit(50)
      );
      unsubProp = onSnapshot(
        qProp,
        (snap) => {
          propertyDocs = [];
          snap.forEach((docSnap) => {
            const data = docSnap.data() as Omit<TenantDocument, 'id'>;
            // Only include property-level documents (without a conflicting different tenantId)
            if (!data.tenantId || data.tenantId === tenantId) {
              propertyDocs.push({
                id: docSnap.id,
                ...data,
              });
            }
          });
          mergeAndSort();
        },
        (err) => {
          console.error('Error fetching property documents:', err);
        }
      );
    }

    return () => {
      unsubTenant();
      unsubProp();
    };
  },

  /**
   * Fetches single document metadata by ID
   */
  async fetchDocumentDetails(documentId: string): Promise<TenantDocument | null> {
    if (!documentId) return null;
    try {
      const snap = await getDoc(doc(db, 'documents', documentId));
      if (snap.exists()) {
        return { id: snap.id, ...(snap.data() as Omit<TenantDocument, 'id'>) };
      }
      return null;
    } catch (error) {
      console.warn('Failed to fetch document details:', error);
      return null;
    }
  },

  /**
   * Subscribes to payments for a specific bill
   */
  subscribeBillPayments(
    billId: string,
    onUpdate: (payments: PaymentSubmission[]) => void,
    onError?: (error: any) => void
  ): Unsubscribe {
    if (!billId) {
      onUpdate([]);
      return () => {};
    }

    const billPaymentsQuery = query(
      collection(db, 'payments'),
      where('billId', '==', billId)
    );

    return onSnapshot(
      billPaymentsQuery,
      (snapshot) => {
        const list: PaymentSubmission[] = [];
        snapshot.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...(docSnap.data() as Omit<PaymentSubmission, 'id'>),
          });
        });

        list.sort((a, b) => {
          const timeA = a.submittedAt || a.createdAt || '';
          const timeB = b.submittedAt || b.createdAt || '';
          return timeB.localeCompare(timeA);
        });

        onUpdate(list);
      },
      (error) => {
        console.error('Error fetching bill payments:', error);
        if (onError) onError(error);
      }
    );
  },

  /**
   * Submits a new payment for landlord verification (status: 'pending')
   */
  async submitTenantPayment(payment: Omit<PaymentSubmission, 'id' | 'createdAt'>): Promise<PaymentSubmission> {
    if (!payment.amount || payment.amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }
    if (!payment.transactionId || !payment.transactionId.trim()) {
      throw new Error('Transaction ID / UTR is required.');
    }

    const nowIso = new Date().toISOString();
    const dataData: Omit<PaymentSubmission, 'id'> = {
      ...payment,
      amount: payment.amount,
      amountPaid: payment.amountPaid || payment.amount,
      transactionId: payment.transactionId.trim(),
      status: 'pending',
      submittedAt: payment.submittedAt || nowIso,
      createdAt: nowIso,
    };

    const docRef = await addDoc(collection(db, 'payments'), dataData);

    // Create event notification for the tenant
    try {
      await addDoc(collection(db, 'notifications'), {
        tenantId: payment.tenantId,
        tenantAuthUid: payment.tenantAuthUid,
        ownerId: payment.ownerId,
        notificationType: 'payment_submitted',
        title: '💳 Payment Submitted',
        body: `Your payment of ₹${payment.amount.toLocaleString('en-IN')} (UTR: ${payment.transactionId.trim()}) has been submitted and is awaiting landlord verification.`,
        relatedBillId: payment.billId,
        relatedPaymentId: docRef.id,
        isRead: false,
        createdAt: nowIso,
      });
    } catch (notifErr) {
      console.warn('Notification creation on payment submit skipped:', notifErr);
    }

    return {
      id: docRef.id,
      ...dataData,
    };
  },

  /**
   * Updates tenant notification preferences in Firestore
   */
  async updateNotificationPreferences(uid: string, prefs: NotificationPreferences, tenantId?: string): Promise<void> {
    if (!uid) return;
    try {
      const userDocRef = doc(db, 'users', uid);
      await updateDoc(userDocRef, {
        notificationPreferences: prefs,
        updatedAt: new Date().toISOString(),
      });

      if (tenantId) {
        try {
          const tenantDocRef = doc(db, 'tenants', tenantId);
          await updateDoc(tenantDocRef, {
            notificationPreferences: prefs,
            updatedAt: new Date().toISOString(),
          });
        } catch (e) {
          console.log('Note: Tenant document preferences update skipped.', e);
        }
      }
    } catch (error) {
      console.warn('Failed to update notification preferences:', error);
      throw error;
    }
  },

  /**
   * Fetches single payment submission details by ID
   */
  async fetchPaymentDetails(paymentId: string): Promise<PaymentSubmission | null> {
    if (!paymentId) return null;
    try {
      const snap = await getDoc(doc(db, 'payments', paymentId));
      if (snap.exists()) {
        return { id: snap.id, ...(snap.data() as Omit<PaymentSubmission, 'id'>) };
      }
      return null;
    } catch (error) {
      console.warn('Failed to fetch payment details:', error);
      return null;
    }
  },

  /**
   * Fetches single bill document details by ID with accurate month-wise payment allocation
   */
  async fetchBillDetails(billId: string): Promise<Bill | null> {
    if (!billId) return null;
    try {
      const snap = await getDoc(doc(db, 'bills', billId));
      if (!snap.exists()) return null;

      const rawBill = { id: snap.id, ...(snap.data() as Omit<Bill, 'id'>) };

      if (rawBill.tenantId) {
        try {
          const [billsSnap, paySnap] = await Promise.all([
            getDocs(query(collection(db, 'bills'), where('tenantId', '==', rawBill.tenantId), limit(50))),
            getDocs(query(collection(db, 'payments'), where('tenantId', '==', rawBill.tenantId), limit(50))),
          ]);

          const allTenantBills: Bill[] = [];
          billsSnap.forEach((d) => {
            allTenantBills.push({ id: d.id, ...(d.data() as Omit<Bill, 'id'>) });
          });

          const allTenantPayments: PaymentSubmission[] = [];
          paySnap.forEach((d) => {
            allTenantPayments.push({ id: d.id, ...(d.data() as Omit<PaymentSubmission, 'id'>) });
          });

          const decorated = decorateTenantBills(allTenantBills, allTenantPayments);
          const match = decorated.find((b) => b.id === billId);
          if (match) return match;
        } catch (multiErr) {
          console.warn('Could not decorate across all tenant bills, falling back to single bill allocation:', multiErr);
        }
      }

      const allocation = calculateBillAllocation(rawBill);
      return {
        ...rawBill,
        subtotal: allocation.subtotal,
        previousDue: allocation.previousDue,
        totalAmount: allocation.totalPayable,
        paidAmount: allocation.totalApprovedPaid,
        remainingAmount: allocation.totalOutstanding,
        paymentStatus: allocation.paymentStatus,
        previousDuePaid: allocation.previousDuePaid,
        previousDueRemaining: allocation.previousDueRemaining,
        currentBillPaid: allocation.currentBillPaid,
        currentBillRemaining: allocation.currentBillRemaining,
        monthWiseAccounting: allocation.monthWiseAccounting,
      };
    } catch (error) {
      console.warn('Failed to fetch bill details:', error);
      return null;
    }
  },

  /**
   * Fetches tenant document details
   */
  async fetchTenantDetails(tenantId: string): Promise<TenantDetails | null> {
    if (!tenantId) return null;
    try {
      const snap = await getDoc(doc(db, 'tenants', tenantId));
      if (snap.exists()) {
        return { id: snap.id, ...(snap.data() as Omit<TenantDetails, 'id'>) };
      }
      return null;
    } catch (error) {
      console.warn('Failed to fetch tenant details:', error);
      return null;
    }
  },

  /**
   * Fetches property document details
   */
  async fetchPropertyDetails(propertyId: string): Promise<Property | null> {
    if (!propertyId) return null;
    try {
      const snap = await getDoc(doc(db, 'properties', propertyId));
      if (snap.exists()) {
        return { id: snap.id, ...(snap.data() as Omit<Property, 'id'>) };
      }
      return null;
    } catch (error) {
      console.warn('Failed to fetch property details:', error);
      return null;
    }
  },

  /**
   * Subscribes to real-time property details
   */
  subscribePropertyDetails(
    propertyId: string,
    onUpdate: (property: Property | null) => void,
    onError?: (error: any) => void
  ): Unsubscribe {
    if (!propertyId) {
      onUpdate(null);
      return () => {};
    }

    const propDocRef = doc(db, 'properties', propertyId);
    return onSnapshot(
      propDocRef,
      (snap) => {
        if (snap.exists()) {
          onUpdate({ id: snap.id, ...(snap.data() as Omit<Property, 'id'>) });
        } else {
          onUpdate(null);
        }
      },
      (error) => {
        console.error('Error listening to property details:', error);
        if (onError) onError(error);
      }
    );
  },

  /**
   * Fetches unit document details
   */
  async fetchUnitDetails(unitId: string): Promise<Unit | null> {
    if (!unitId) return null;
    try {
      const snap = await getDoc(doc(db, 'units', unitId));
      if (snap.exists()) {
        return { id: snap.id, ...(snap.data() as Omit<Unit, 'id'>) };
      }
      return null;
    } catch (error) {
      console.warn('Failed to fetch unit details:', error);
      return null;
    }
  },

  /**
   * Fetches landlord business/bill settings
   */
  async fetchLandlordSettings(ownerId: string): Promise<BillSettings | null> {
    if (!ownerId) return null;
    try {
      const snap = await getDoc(doc(db, 'settings', ownerId));
      if (snap.exists()) {
        return { id: snap.id, ...(snap.data() as Omit<BillSettings, 'id'>) };
      }
      return null;
    } catch (error) {
      console.warn('Failed to fetch landlord settings:', error);
      return null;
    }
  },
};

export default tenantDataService;
