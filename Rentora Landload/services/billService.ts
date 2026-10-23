import db from '../utils/db';
import { Bill, Payment, PaymentStatus } from '../types';
import { localStorageService } from './localStorageService';
import { notificationService } from './notificationService';

const COLLECTION = 'bills';

export const isBillClosedOrPaid = (bill: Bill): boolean => {
  if (!bill) return false;
  if (bill.paymentStatus === 'paid') return true;
  if (bill.remainingAmount !== undefined && Number(bill.remainingAmount) <= 0 && Number(bill.paidAmount || 0) > 0) return true;
  return false;
};

export const sortBillsChronological = (bills: Bill[]): Bill[] => {
  return [...bills].sort((a, b) => {
    // 1. Primary: billingMonth ("YYYY-MM") ascending
    const monthA = a.billingMonth || '';
    const monthB = b.billingMonth || '';
    if (monthA !== monthB) {
      return monthA.localeCompare(monthB);
    }
    // 2. Secondary: billNumber ("INV-YYYY-XXXXX") ascending
    const numA = a.billNumber || '';
    const numB = b.billNumber || '';
    if (numA && numB && numA !== numB) {
      return numA.localeCompare(numB);
    }
    // 3. Tertiary: createdAt ascending
    const dateA = a.createdAt || '';
    const dateB = b.createdAt || '';
    return dateA.localeCompare(dateB);
  });
};

export const sortBillsDescending = (bills: Bill[]): Bill[] => {
  return [...bills].sort((a, b) => {
    // 1. Primary: billingMonth ("YYYY-MM") descending
    const monthA = a.billingMonth || '';
    const monthB = b.billingMonth || '';
    if (monthA !== monthB) {
      return monthB.localeCompare(monthA);
    }
    // 2. Secondary: billNumber ("INV-YYYY-XXXXX") descending
    const numA = a.billNumber || '';
    const numB = b.billNumber || '';
    if (numA && numB && numA !== numB) {
      return numB.localeCompare(numA);
    }
    // 3. Tertiary: createdAt descending
    const dateA = a.createdAt || '';
    const dateB = b.createdAt || '';
    return dateB.localeCompare(dateA);
  });
};

/**
 * Calculates a tenant's canonical actual outstanding liabilities across all bills.
 * Equals the latest bill's remaining amount (which carries forward unpaid arrears).
 */
export const calculateTenantOutstanding = (tenantBills: Bill[], _payments?: Payment[]): number => {
  if (!Array.isArray(tenantBills) || tenantBills.length === 0) return 0;
  const decorated = decorateBills(tenantBills);
  const latest = decorated[decorated.length - 1];
  return latest ? latest.remainingAmount : 0;
};

/**
 * Calculates portfolio-wide pending balance across all bills by grouping by tenant,
 * computing each tenant's canonical outstanding once, and summing them.
 */
export const calculateOverallPending = (bills: Bill[], _payments?: Payment[]): number => {
  if (!Array.isArray(bills) || bills.length === 0) return 0;

  const billsByTenant: Record<string, Bill[]> = {};
  bills.forEach(b => {
    if (!b || !b.tenantId) return;
    if (!billsByTenant[b.tenantId]) {
      billsByTenant[b.tenantId] = [];
    }
    billsByTenant[b.tenantId].push(b);
  });

  let totalPending = 0;
  Object.keys(billsByTenant).forEach(tId => {
    totalPending += calculateTenantOutstanding(billsByTenant[tId]);
  });

  return totalPending;
};

/**
 * Canonical Oldest-Outstanding-First Payment Allocation & Decorator:
 * - Preserves original invoice breakdown: subtotal, previousDue, totalAmount.
 * - Allocates payments chronologically oldest-first to previous arrears and then current month charges.
 * - Correctly reflects when previous arrears carried over into a subsequent bill are paid off by prior bill settlements.
 * - Preserves the invariant: totalAmount - totalPaymentAllocated === remainingAmount.
 * - Guaranteed: Creating a new bill without payments leaves it UNPAID with ₹0 paid and full payable amount remaining.
 */
export const decorateBills = (tenantBills: Bill[], _payments?: Payment[]): Bill[] => {
  if (!Array.isArray(tenantBills) || tenantBills.length === 0) return [];
  // Sort oldest first chronologically (billingMonth -> billNumber -> createdAt)
  const sorted = sortBillsChronological(tenantBills);

  let accumulatedPriorRemaining = 0;

  return sorted.map((bill, index) => {
    const subtotal = bill.subtotal !== undefined 
      ? Number(bill.subtotal) 
      : ((Number(bill.rent) || 0) + (Number(bill.electricityCharge) || 0) + (Number(bill.waterCharge) || 0) + (Number(bill.parkingCharge) || 0) + (Number(bill.maintenanceCharge) || 0) + (Number(bill.otherCharges) || 0));

    // Preserve original invoice figures
    const previousDue = Math.max(0, Number(bill.previousDue) || 0);
    const totalAmount = subtotal + previousDue; // Original Total Payable

    const paidAmount = Number(bill.paidAmount) || 0;

    const isClosed = bill.paymentStatus === 'paid' && (bill.remainingAmount === 0 || (bill.paidAmount !== undefined && Number(bill.paidAmount) >= totalAmount));
    if (isClosed) {
      accumulatedPriorRemaining = 0;
      return {
        ...bill,
        subtotal,
        previousDue,
        totalAmount,
        paidAmount: Math.max(paidAmount, totalAmount),
        remainingAmount: 0,
        paymentStatus: 'paid' as const,
        previousDuePaid: previousDue,
        previousDueRemaining: 0,
        currentBillPaid: subtotal,
        currentBillRemaining: 0,
        totalPaymentAllocated: totalAmount,
      };
    }

    let previousDuePaid = 0;
    let previousDueRemaining = 0;
    let currentBillPaid = 0;
    let currentBillRemaining = 0;
    let remainingAmount = 0;

    if (index === 0) {
      previousDuePaid = Math.min(previousDue, paidAmount);
      previousDueRemaining = Math.max(0, previousDue - previousDuePaid);

      const remForCurrent = Math.max(0, paidAmount - previousDuePaid);
      currentBillPaid = Math.min(subtotal, remForCurrent);
      currentBillRemaining = Math.max(0, subtotal - currentBillPaid);

      remainingAmount = previousDueRemaining + currentBillRemaining;
      accumulatedPriorRemaining = remainingAmount;
    } else {
      previousDueRemaining = Math.min(previousDue, accumulatedPriorRemaining);
      previousDuePaid = Math.max(0, previousDue - previousDueRemaining);

      currentBillPaid = Math.min(subtotal, paidAmount);
      currentBillRemaining = Math.max(0, subtotal - currentBillPaid);

      remainingAmount = previousDueRemaining + currentBillRemaining;
      accumulatedPriorRemaining = remainingAmount;
    }

    const totalPaymentAllocated = previousDuePaid + currentBillPaid;

    let paymentStatus: PaymentStatus = 'unpaid';
    if (remainingAmount === 0 && (totalAmount > 0 || paidAmount > 0)) {
      paymentStatus = 'paid';
    } else if (paidAmount > 0 || previousDuePaid > 0) {
      paymentStatus = 'partial';
    } else {
      paymentStatus = 'unpaid';
    }

    return {
      ...bill,
      previousDue,
      subtotal,
      totalAmount,
      paidAmount,
      remainingAmount,
      paymentStatus,
      previousDuePaid,
      previousDueRemaining,
      currentBillPaid,
      currentBillRemaining,
      totalPaymentAllocated,
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
    
    // Always return sorted newest-first (descending: billingMonth -> billNumber -> createdAt)
    return sortBillsDescending(decorated);
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

    // Sort descending using multi-tier sorting
    const sorted = sortBillsDescending(decorated);
    return sorted[0];
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
    
    const subtotal = bill.subtotal !== undefined
      ? Number(bill.subtotal)
      : ((Number(bill.rent) || 0) + (Number(bill.electricityCharge) || 0) + (Number(bill.waterCharge) || 0) + (Number(bill.parkingCharge) || 0) + (Number(bill.maintenanceCharge) || 0) + (Number(bill.otherCharges) || 0));
    const previousDue = Math.max(0, Number(bill.previousDue) || 0);
    const totalAmount = subtotal + previousDue;

    const data: Omit<Bill, 'id' | 'createdAt' | 'updatedAt'> = {
      ...bill,
      billNumber,
      tenantAuthUid: tenantAuthUid || null,
      subtotal,
      previousDue,
      totalAmount,
      paidAmount: 0,
      totalPaymentAllocated: 0,
      remainingAmount: totalAmount,
      paymentStatus: 'unpaid',
      previousDuePaid: 0,
      previousDueRemaining: previousDue,
      currentBillPaid: 0,
      currentBillRemaining: subtotal,
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
