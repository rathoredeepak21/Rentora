import db from '../utils/db';
import { Payment, Bill, Tenant, PaymentVerificationStatus, PaymentAllocation } from '../types';
import { billService, decorateBills, isBillClosedOrPaid, sortBillsChronological } from './billService';
import { notificationService } from './notificationService';

const COLLECTION = 'payments';

export const paymentService = {
  /**
   * Filters out legacy split child records so that multi-bill split payments from older app versions
   * are never double-counted as separate transactions, while preserving full allocation data.
   */
  filterCanonicalPayments(payments: Payment[]): Payment[] {
    if (!Array.isArray(payments)) return [];
    
    // 1. If explicit isSplitChild is set to true, filter it out
    const withoutExplicitChild = payments.filter((p) => !p.isSplitChild);

    // 2. For legacy records that have parentPaymentId where multiple docs share that parentPaymentId,
    //    if docs don't have explicit allocations, merge them into 1 canonical payment transaction.
    const seenParentIds = new Set<string>();
    const result: Payment[] = [];

    for (const p of withoutExplicitChild) {
      if (p.allocations && p.allocations.length > 0) {
        result.push(p);
      } else if (p.parentPaymentId && withoutExplicitChild.filter((x) => x.parentPaymentId === p.parentPaymentId).length > 1) {
        if (!seenParentIds.has(p.parentPaymentId)) {
          seenParentIds.add(p.parentPaymentId);
          // Combine legacy split parts into 1 unified transaction
          const siblings = withoutExplicitChild.filter((x) => x.parentPaymentId === p.parentPaymentId);
          const totalAmount = siblings.reduce((sum, s) => sum + (Number(s.amount) || Number(s.amountPaid) || 0), 0);
          const combinedAllocations: PaymentAllocation[] = siblings.map((s) => ({
            billId: s.billId,
            amount: Number(s.amount) || Number(s.amountPaid) || 0,
            type: s.billId === 'advance' ? ('advance' as const) : ('bill_due' as const),
          }));
          result.push({
            ...p,
            amount: totalAmount,
            amountPaid: totalAmount,
            allocations: combinedAllocations,
          });
        }
      } else {
        result.push(p);
      }
    }

    return result;
  },

  /**
   * Returns all canonical payment transactions for a given tenant.
   */
  async getPaymentsForTenant(tenantId: string): Promise<Payment[]> {
    const raw = await db.queryDocs<Payment>(COLLECTION, (doc) => doc.tenantId === tenantId);
    return paymentService.filterCanonicalPayments(raw);
  },

  /**
   * Returns all payments that apply to a specific bill (either directly or via allocations).
   */
  async getPaymentsForBill(billId: string): Promise<Payment[]> {
    const raw = await db.getDocs<Payment>(COLLECTION);
    const canonical = paymentService.filterCanonicalPayments(raw);
    return canonical.filter((doc) => {
      if (Array.isArray(doc.allocations) && doc.allocations.length > 0) {
        return doc.allocations.some((a) => a.billId === billId && Number(a.amount) > 0);
      }
      return doc.billId === billId;
    });
  },

  /**
   * Extracts the amount allocated to a specific bill from a payment transaction.
   */
  getPaymentAmountForBill(payment: Payment, billId: string): number {
    if (Array.isArray(payment.allocations) && payment.allocations.length > 0) {
      const alloc = payment.allocations.find((a) => a.billId === billId);
      return alloc ? Number(alloc.amount) || 0 : 0;
    }
    return payment.billId === billId ? (Number(payment.amount) || Number(payment.amountPaid) || 0) : 0;
  },

  async getPendingPayments(ownerId: string): Promise<Payment[]> {
    return db.queryDocs<Payment>(
      COLLECTION,
      (doc) => doc.ownerId === ownerId && doc.status === 'pending'
    );
  },

  async getPendingPaymentsForBill(billId: string): Promise<Payment[]> {
    return db.queryDocs<Payment>(
      COLLECTION,
      (doc) => doc.billId === billId && doc.status === 'pending'
    );
  },

  /**
   * Tenant Payment Submission (from Tenant App).
   * Creates a payment in 'pending' status without altering bill balances until Landlord approves.
   */
  async submitTenantPayment(payment: {
    ownerId: string;
    billId: string;
    tenantId: string;
    tenantAuthUid?: string;
    propertyId?: string;
    unitId?: string;
    amount: number;
    transactionId?: string;
    paymentDate?: string;
    paymentMethod?: any;
    screenshotUrl?: string;
  }): Promise<Payment> {
    const data: Omit<Payment, 'id' | 'createdAt'> = {
      ownerId: payment.ownerId,
      billId: payment.billId,
      tenantId: payment.tenantId,
      tenantAuthUid: payment.tenantAuthUid || null,
      propertyId: payment.propertyId,
      unitId: payment.unitId,
      amount: payment.amount,
      amountPaid: payment.amount,
      paymentDate: payment.paymentDate || new Date().toISOString().split('T')[0],
      paymentMethod: payment.paymentMethod || 'upi',
      transactionId: payment.transactionId || '',
      screenshotUrl: payment.screenshotUrl,
      status: 'pending' as PaymentVerificationStatus,
      submittedAt: new Date().toISOString(),
    };

    return db.addDoc<Payment>(COLLECTION, data);
  },

  /**
   * Landlord approves a pending payment submission.
   * Runs the exact Rentora sequential bill payment allocation logic,
   * stores allocations on the single payment document, and updates status to approved.
   */
  async approvePayment(paymentId: string): Promise<Payment> {
    const payment = await db.getDoc<Payment>(COLLECTION, paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }
    if (payment.status === 'approved') {
      return payment;
    }

    // 1. Fetch tenant
    const tenant = await db.getDoc<Tenant>('tenants', payment.tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const parentPaymentId = payment.parentPaymentId || 'PAY-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const nowIso = new Date().toISOString();

    // 2. Fetch all bills of this tenant
    const allBills = await db.queryDocs<Bill>('bills', (doc) => doc.tenantId === payment.tenantId);
    const decoratedBills = decorateBills(allBills);
    
    // Sort oldest first chronologically: billingMonth -> billNumber -> createdAt
    const outstandingBills = sortBillsChronological(
      decoratedBills.filter((b) => (Number(b.remainingAmount) || 0) > 0 || b.paymentStatus !== 'paid')
    );

    let remainingPayment = Number(payment.amount) || 0;
    const allocations: PaymentAllocation[] = [];
    const txnId = payment.transactionId || parentPaymentId;

    const allBillsSorted = sortBillsChronological(allBills);

    // 3. Apply payment sequentially to oldest outstanding bills first
    for (const bill of outstandingBills) {
      if (remainingPayment <= 0) break;

      const isFirstTenantBill = allBillsSorted.length > 0 && bill.id === allBillsSorted[0].id;
      const capacity = isFirstTenantBill ? Number(bill.totalAmount || bill.subtotal) : Number(bill.subtotal);
      const needed = Math.max(0, capacity - (Number(bill.paidAmount) || 0));
      if (needed <= 0) continue;
      const allocatedAmount = Math.min(remainingPayment, needed);

      const currentPaid = Number(bill.paidAmount) || 0;
      const newPaidAmount = currentPaid + allocatedAmount;

      await billService.updateBill(bill.id!, {
        paidAmount: newPaidAmount,
      });

      allocations.push({
        paymentId,
        transactionId: txnId,
        billId: bill.id!,
        billNumber: bill.billNumber,
        billingMonth: bill.billingMonth,
        amount: allocatedAmount,
        type: 'bill_due',
        allocatedAt: nowIso,
      });

      remainingPayment -= allocatedAmount;
    }

    // 4. Storing any excess payment in advanceAmount
    if (remainingPayment > 0) {
      const currentAdvance = tenant.advanceAmount || 0;
      const newAdvance = currentAdvance + remainingPayment;

      await db.updateDoc<Tenant>('tenants', tenant.id!, {
        advanceAmount: newAdvance,
      } as any);

      allocations.push({
        paymentId,
        transactionId: txnId,
        billId: 'advance',
        amount: remainingPayment,
        type: 'advance',
        allocatedAt: nowIso,
      });
    }

    // 5. Update the payment document status to approved with allocations on the SAME document
    const updatedPayment = await db.updateDoc<Payment>(COLLECTION, paymentId, {
      status: 'approved' as PaymentVerificationStatus,
      verifiedAt: nowIso,
      parentPaymentId,
      billId: allocations.length === 1 ? allocations[0].billId : (allocations.length > 1 ? 'multiple' : payment.billId),
      allocations,
    });

    // 6. Sync updated decorated states to bills in Firestore
    const updatedBills = await db.queryDocs<Bill>('bills', (doc) => doc.tenantId === payment.tenantId);
    const redecorated = decorateBills(updatedBills);
    for (const b of redecorated) {
      await billService.updateBill(b.id!, {
        paidAmount: b.paidAmount,
        remainingAmount: b.remainingAmount,
        paymentStatus: b.paymentStatus,
        previousDuePaid: b.previousDuePaid,
        previousDueRemaining: b.previousDueRemaining,
        currentBillPaid: b.currentBillPaid,
        currentBillRemaining: b.currentBillRemaining,
        totalPaymentAllocated: b.totalPaymentAllocated,
      });
    }

    // 7. Dispatch notification to tenant (in-app + Android status-bar push)
    try {
      const formattedAmount = Number(payment.amount || 0).toLocaleString('en-IN');
      const tenantTitle = 'Payment Approved';
      const tenantBody = `Your payment of ₹${formattedAmount} has been approved.`;
      const tenantAuthUid = payment.tenantAuthUid || tenant.tenantAuthUid || '';

      await db.addDoc('notifications', {
        recipientUserId: tenantAuthUid,
        tenantId: payment.tenantId,
        tenantAuthUid,
        ownerId: payment.ownerId,
        type: 'payment_approved',
        notificationType: 'payment_approved',
        title: tenantTitle,
        message: tenantBody,
        body: tenantBody,
        relatedPaymentId: paymentId,
        relatedBillId: payment.billId || '',
        isRead: false,
        createdAt: new Date().toISOString(),
      });

      const tokenSet = new Set<string>();
      if (Array.isArray(tenant.notificationTokens)) {
        tenant.notificationTokens.forEach((t: string) => t && tokenSet.add(t));
      }
      if (tenantAuthUid) {
        const uDoc = await db.getDoc<any>('users', tenantAuthUid);
        if (uDoc && Array.isArray(uDoc.notificationTokens)) {
          uDoc.notificationTokens.forEach((t: string) => t && tokenSet.add(t));
        }
      }

      if (tokenSet.size > 0) {
        await notificationService.sendPushNotificationDirect({
          tokens: Array.from(tokenSet),
          title: tenantTitle,
          body: tenantBody,
          data: {
            type: 'payment_approved',
            notificationType: 'payment_approved',
            paymentId,
            billId: payment.billId || '',
            tenantId: payment.tenantId,
            amount: String(payment.amount),
          },
        });
      }
    } catch (notifErr) {
      console.warn('Tenant notification on approval skipped:', notifErr);
    }

    return updatedPayment;
  },

  /**
   * Landlord rejects a pending payment submission.
   * Payment remains unverified; bills and dues remain completely untouched.
   */
  async rejectPayment(paymentId: string, reason?: string): Promise<Payment> {
    const payment = await db.getDoc<Payment>(COLLECTION, paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }

    const updatedPayment = await db.updateDoc<Payment>(COLLECTION, paymentId, {
      status: 'rejected' as PaymentVerificationStatus,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason || 'Payment rejected by landlord.',
    });

    // Dispatch notification to tenant (in-app + Android status-bar push)
    try {
      const formattedAmount = Number(payment.amount || 0).toLocaleString('en-IN');
      const tenantTitle = 'Payment Rejected';
      const tenantBody = `Your payment of ₹${formattedAmount} was rejected. Please check your payment details.`;
      const tenant = await db.getDoc<Tenant>('tenants', payment.tenantId);
      const tenantAuthUid = payment.tenantAuthUid || tenant?.tenantAuthUid || '';

      await db.addDoc('notifications', {
        recipientUserId: tenantAuthUid,
        tenantId: payment.tenantId,
        tenantAuthUid,
        ownerId: payment.ownerId,
        type: 'payment_rejected',
        notificationType: 'payment_rejected',
        title: tenantTitle,
        message: tenantBody,
        body: tenantBody,
        relatedPaymentId: paymentId,
        relatedBillId: payment.billId || '',
        isRead: false,
        createdAt: new Date().toISOString(),
      });

      const tokenSet = new Set<string>();
      if (tenant && Array.isArray(tenant.notificationTokens)) {
        tenant.notificationTokens.forEach((t: string) => t && tokenSet.add(t));
      }
      if (tenantAuthUid) {
        const uDoc = await db.getDoc<any>('users', tenantAuthUid);
        if (uDoc && Array.isArray(uDoc.notificationTokens)) {
          uDoc.notificationTokens.forEach((t: string) => t && tokenSet.add(t));
        }
      }

      if (tokenSet.size > 0) {
        await notificationService.sendPushNotificationDirect({
          tokens: Array.from(tokenSet),
          title: tenantTitle,
          body: tenantBody,
          data: {
            type: 'payment_rejected',
            notificationType: 'payment_rejected',
            paymentId,
            billId: payment.billId || '',
            tenantId: payment.tenantId,
            amount: String(payment.amount),
          },
        });
      }
    } catch (notifErr) {
      console.warn('Tenant notification on rejection skipped:', notifErr);
    }

    return updatedPayment;
  },

  /**
   * Landlord records a payment directly in the Landlord App.
   * Stores EXACTLY ONE permanent transaction record representing actual money received.
   * Allocates to oldest outstanding bills first, then next bills, then advance.
   * Stores allocations breakdown on the single transaction.
   */
  async recordPayment(payment: Omit<Payment, 'createdAt'>): Promise<Payment> {
    // 1. Fetch the tenant
    const tenant = await db.getDoc<Tenant>('tenants', payment.tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const parentPaymentId = payment.transactionId && payment.transactionId.startsWith('PAY-')
      ? payment.transactionId
      : 'PAY-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const txnId = (payment.transactionId && payment.transactionId.trim()) ? payment.transactionId.trim() : parentPaymentId;
    const nowIso = new Date().toISOString();
    const actualPaymentDate = (payment.paymentDate && payment.paymentDate.trim())
      ? payment.paymentDate.trim()
      : nowIso.split('T')[0];

    // 2. Fetch all bills of this tenant
    const allBills = await db.queryDocs<Bill>('bills', (doc) => doc.tenantId === payment.tenantId);
    const decoratedBills = decorateBills(allBills);
    
    // Sort oldest first chronologically: billingMonth -> billNumber -> createdAt
    const outstandingBills = sortBillsChronological(
      decoratedBills.filter((b) => (Number(b.remainingAmount) || 0) > 0 || b.paymentStatus !== 'paid')
    );

    let remainingPayment = Number(payment.amount) || 0;
    const allocations: PaymentAllocation[] = [];

    const allBillsSorted = sortBillsChronological(allBills);

    // 3. Apply payment sequentially to oldest outstanding bills first
    for (const bill of outstandingBills) {
      if (remainingPayment <= 0) break;

      const isFirstTenantBill = allBillsSorted.length > 0 && bill.id === allBillsSorted[0].id;
      const capacity = isFirstTenantBill ? Number(bill.totalAmount || bill.subtotal) : Number(bill.subtotal);
      const needed = Math.max(0, capacity - (Number(bill.paidAmount) || 0));
      if (needed <= 0) continue;
      const allocatedAmount = Math.min(remainingPayment, needed);

      const currentPaid = Number(bill.paidAmount) || 0;
      const newPaidAmount = currentPaid + allocatedAmount;

      await billService.updateBill(bill.id!, {
        paidAmount: newPaidAmount,
      });

      allocations.push({
        transactionId: txnId,
        billId: bill.id!,
        billNumber: bill.billNumber,
        billingMonth: bill.billingMonth,
        amount: allocatedAmount,
        type: 'bill_due',
        allocatedAt: nowIso,
      });

      remainingPayment -= allocatedAmount;
    }

    // 4. Storing any excess payment in advanceAmount
    if (remainingPayment > 0) {
      const currentAdvance = tenant.advanceAmount || 0;
      const newAdvance = currentAdvance + remainingPayment;

      await db.updateDoc<Tenant>('tenants', tenant.id!, {
        advanceAmount: newAdvance,
      } as any);

      allocations.push({
        transactionId: txnId,
        billId: 'advance',
        amount: remainingPayment,
        type: 'advance',
        allocatedAt: nowIso,
      });
    }

    // 5. Save EXACTLY ONE Master Payment Transaction Document
    const singlePaymentDoc = await db.addDoc<Payment>(COLLECTION, {
      ownerId: payment.ownerId,
      billId: allocations.length === 1 ? allocations[0].billId : (allocations.length > 1 ? 'multiple' : (payment.billId || 'direct')),
      tenantId: payment.tenantId,
      tenantAuthUid: tenant.tenantAuthUid || null,
      propertyId: payment.propertyId || tenant.propertyId,
      unitId: payment.unitId || tenant.unitId,
      amount: Number(payment.amount) || 0,
      amountPaid: Number(payment.amount) || 0,
      paymentDate: actualPaymentDate,
      paymentMethod: payment.paymentMethod,
      transactionId: txnId,
      screenshotUrl: payment.screenshotUrl,
      status: 'approved' as PaymentVerificationStatus,
      verifiedAt: nowIso,
      parentPaymentId,
      allocations,
      isSplitChild: false,
    } as any);

    // 6. Sync updated decorated states to bills in Firestore
    const updatedBills = await db.queryDocs<Bill>('bills', (doc) => doc.tenantId === payment.tenantId);
    const redecorated = decorateBills(updatedBills);
    for (const b of redecorated) {
      await billService.updateBill(b.id!, {
        paidAmount: b.paidAmount,
        remainingAmount: b.remainingAmount,
        paymentStatus: b.paymentStatus,
        previousDuePaid: b.previousDuePaid,
        previousDueRemaining: b.previousDueRemaining,
        currentBillPaid: b.currentBillPaid,
        currentBillRemaining: b.currentBillRemaining,
        totalPaymentAllocated: b.totalPaymentAllocated,
      });
    }

    return singlePaymentDoc;
  },
};
export default paymentService;

