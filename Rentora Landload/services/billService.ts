import db from '../utils/db';
import { Bill, Payment } from '../types';
import { localStorageService } from './localStorageService';
import { notificationService } from './notificationService';

const COLLECTION = 'bills';

export const decorateBills = (tenantBills: Bill[]): Bill[] => {
  if (!Array.isArray(tenantBills)) return [];
  // Sort oldest first by billingMonth
  const sorted = [...tenantBills].sort((a, b) => (a.billingMonth || '').localeCompare(b.billingMonth || ''));
  
  let accumulatedDue = 0;
  
  return sorted.map((bill, index) => {
    // If accumulated from prior bills, use it. If first bill and has manual previousDue, preserve it.
    let previousDue = accumulatedDue;
    if (index === 0 && previousDue === 0 && (bill.previousDue || 0) > 0) {
      previousDue = Number(bill.previousDue) || 0;
    }

    const sub = bill.subtotal !== undefined 
      ? bill.subtotal 
      : ((bill.rent || 0) + (bill.electricityCharge || 0) + (bill.waterCharge || 0) + (bill.parkingCharge || 0) + (bill.maintenanceCharge || 0) + (bill.otherCharges || 0));
      
    const totalAmount = sub + previousDue;
    const paidAmount = bill.paidAmount || 0;
    const remainingAmount = Math.max(0, totalAmount - paidAmount);
    
    // Chronological payment allocation:
    // 1. Clear previous due first
    const previousDuePaid = Math.min(previousDue, paidAmount);
    const previousDueRemaining = Math.max(0, previousDue - previousDuePaid);

    // 2. Apply remaining payment to current month bill
    const remainingPaymentForCurrent = Math.max(0, paidAmount - previousDuePaid);
    const currentBillPaid = Math.min(sub, remainingPaymentForCurrent);
    const currentBillRemaining = Math.max(0, sub - currentBillPaid);

    let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';
    if (remainingAmount === 0) {
      paymentStatus = 'paid';
    } else if (paidAmount > 0) {
      paymentStatus = 'partial';
    }
    
    accumulatedDue = remainingAmount;
    
    return {
      ...bill,
      previousDue,
      totalAmount,
      remainingAmount,
      paymentStatus,
      previousDuePaid,
      previousDueRemaining,
      currentBillPaid,
      currentBillRemaining,
    };
  });
};

export const billService = {
  async getBills(ownerId: string): Promise<Bill[]> {
    const rawBills = await db.queryDocs<Bill>(COLLECTION, (doc) => doc.ownerId === ownerId);
    
    // Group by tenantId
    const billsByTenant: Record<string, Bill[]> = {};
    rawBills.forEach(b => {
      if (!b || !b.tenantId) return;
      if (!billsByTenant[b.tenantId]) {
        billsByTenant[b.tenantId] = [];
      }
      billsByTenant[b.tenantId].push(b);
    });
    
    // Decorate each tenant's bills
    const decorated: Bill[] = [];
    Object.keys(billsByTenant).forEach(tId => {
      decorated.push(...decorateBills(billsByTenant[tId]));
    });
    
    return decorated;
  },

  async getBillById(id: string): Promise<Bill | null> {
    const rawBill = await db.getDoc<Bill>(COLLECTION, id);
    if (!rawBill) return null;
    
    const tenantBills = await db.queryDocs<Bill>(COLLECTION, (doc) => doc.tenantId === rawBill.tenantId);
    const decorated = decorateBills(tenantBills);
    return decorated.find(b => b.id === id) || null;
  },

  async getLatestBillForUnit(ownerId: string, propertyId: string, unitId: string): Promise<Bill | null> {
    const unitBills = await db.queryDocs<Bill>(COLLECTION, (doc) => {
      return doc.ownerId === ownerId && doc.propertyId === propertyId && doc.unitId === unitId;
    });

    if (unitBills.length === 0) return null;

    // Group by tenantId and decorate
    const billsByTenant: Record<string, Bill[]> = {};
    unitBills.forEach(b => {
      if (!b || !b.tenantId) return;
      if (!billsByTenant[b.tenantId]) {
        billsByTenant[b.tenantId] = [];
      }
      billsByTenant[b.tenantId].push(b);
    });
    
    const decorated: Bill[] = [];
    Object.keys(billsByTenant).forEach(tId => {
      decorated.push(...decorateBills(billsByTenant[tId]));
    });

    // Sort by billingMonth descending (Format "YYYY-MM")
    decorated.sort((a, b) => (b.billingMonth || '').localeCompare(a.billingMonth || ''));
    return decorated[0];
  },

  async generateBillNumber(ownerId: string, year: number): Promise<string> {
    const ownerBills = await this.getBills(ownerId);
    
    // Filter bills of the same year
    const yearPrefix = `INV-${year}-`;
    const sameYearBills = ownerBills.filter((b) => b.billNumber && b.billNumber.startsWith(yearPrefix));

    let maxSeq = 0;
    sameYearBills.forEach((b) => {
      const parts = (b.billNumber || '').split('-');
      if (parts.length === 3) {
        const seq = parseInt(parts[2]);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });

    const nextSeq = maxSeq + 1;
    const paddedSeq = String(nextSeq).padStart(5, '0'); // Pad with leading zeros
    return `${yearPrefix}${paddedSeq}`;
  },

  async createBill(bill: Omit<Bill, 'billNumber' | 'createdAt' | 'updatedAt'>): Promise<Bill> {
    const year = new Date().getFullYear();
    const billNumber = await this.generateBillNumber(bill.ownerId, year);

    let tenantAuthUid = bill.tenantAuthUid;
    if (!tenantAuthUid && bill.tenantId) {
      try {
        const tenant = await db.getDoc<any>('tenants', bill.tenantId);
        if (tenant && tenant.tenantAuthUid) {
          tenantAuthUid = tenant.tenantAuthUid;
        }
      } catch (e) {
        console.warn('Could not fetch tenantAuthUid for bill creation', e);
      }
    }
    
    const data: Omit<Bill, 'id' | 'createdAt' | 'updatedAt'> = {
      ...bill,
      billNumber,
      tenantAuthUid: tenantAuthUid || null,
    };
    
    const newBill = await db.addDoc<Bill>(COLLECTION, data);

    // Dispatch notification to tenant (in-app + Android status-bar push)
    try {
      const month = bill.billingMonth || '';
      const tenantTitle = 'New Rent Bill';
      const tenantBody = `Your ${month} rent bill is ready.`;

      await db.addDoc('notifications', {
        recipientUserId: tenantAuthUid || '',
        tenantId: bill.tenantId,
        tenantAuthUid: tenantAuthUid || '',
        ownerId: bill.ownerId,
        type: 'new_bill',
        notificationType: 'new_bill',
        title: tenantTitle,
        message: tenantBody,
        body: tenantBody,
        relatedBillId: newBill.id,
        billId: newBill.id,
        isRead: false,
        createdAt: new Date().toISOString(),
      });

      const tokenSet = new Set<string>();
      const tenantDoc = await db.getDoc<any>('tenants', bill.tenantId);
      if (tenantDoc && Array.isArray(tenantDoc.notificationTokens)) {
        tenantDoc.notificationTokens.forEach((t: string) => t && tokenSet.add(t));
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
            type: 'new_bill',
            notificationType: 'new_bill',
            billId: newBill.id,
            tenantId: bill.tenantId,
            billingMonth: month,
            amount: String(bill.totalAmount || 0),
          },
        });
      }
    } catch (notifErr) {
      console.warn('Tenant notification on bill create skipped:', notifErr);
    }

    return newBill;
  },

  async updateBill(id: string, bill: Partial<Bill>): Promise<Bill> {
    return db.updateDoc<Bill>(COLLECTION, id, bill);
  },

  async deleteBill(id: string): Promise<void> {
    // 1. Fetch payments associated with this bill
    const billPayments = await db.queryDocs<Payment>('payments', (doc) => doc.billId === id);
    
    // 2. Delete the associated payments and clean up screenshots
    for (const payment of billPayments) {
      if (payment.screenshotUrl) {
        await localStorageService.deleteFile(payment.screenshotUrl);
      }
      await db.deleteDoc('payments', payment.id!);
    }

    // 3. Delete the bill document
    await db.deleteDoc(COLLECTION, id);
  },

  async searchBills(ownerId: string, query: string, status?: string): Promise<Bill[]> {
    const normalizedQuery = (query || '').toLowerCase().trim();
    const allBills = await this.getBills(ownerId);

    // Filter by status if provided
    let filtered = allBills;
    if (status && status !== 'all') {
      const normStatus = status.toLowerCase();
      if (normStatus === 'pending') {
        filtered = allBills.filter((b) => b.remainingAmount > 0 || b.paymentStatus === 'unpaid' || b.paymentStatus === 'partial');
      } else {
        filtered = allBills.filter((b) => b.paymentStatus === normStatus);
      }
    }

    if (!normalizedQuery) {
      return filtered;
    }

    return filtered.filter((doc) => {
      return (
        (doc.billNumber || '').toLowerCase().includes(normalizedQuery) ||
        (doc.billingMonth || '').toLowerCase().includes(normalizedQuery)
      );
    });
  }
};
export default billService;
