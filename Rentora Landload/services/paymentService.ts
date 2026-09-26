import db from '../utils/db';
import { Payment, Bill, Tenant, PaymentVerificationStatus } from '../types';
import { billService, decorateBills, isBillClosedOrPaid } from './billService';
import { notificationService } from './notificationService';

const COLLECTION = 'payments';

export const paymentService = {
  async getPaymentsForTenant(tenantId: string): Promise<Payment[]> {
    return db.queryDocs<Payment>(COLLECTION, (doc) => doc.tenantId === tenantId);
  },

  async getPaymentsForBill(billId: string): Promise<Payment[]> {
    return db.queryDocs<Payment>(COLLECTION, (doc) => doc.billId === billId);
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
   * Runs the exact Rentora sequential bill payment allocation logic.
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

    // 2. Fetch all bills of this tenant
    const allBills = await db.queryDocs<Bill>('bills', (doc) => doc.tenantId === payment.tenantId);
    const decoratedBills = decorateBills(allBills);
    
    // CRITICAL: Filter out any bill that is already closed or fully paid (remainingAmount <= 0 or status == 'paid')
    // Old paid bills must NEVER receive any payment allocation!
    const outstandingBills = decoratedBills
      .filter((b) => !isBillClosedOrPaid(b) && (Number(b.remainingAmount) || 0) > 0)
      .sort((a, b) => (a.billingMonth || '').localeCompare(b.billingMonth || ''));

    let remainingPayment = Number(payment.amount) || 0;
    const parentPaymentId = payment.parentPaymentId || 'PAY-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

    // 3. Apply payment sequentially to outstanding bills only
    for (const bill of outstandingBills) {
      if (remainingPayment <= 0) break;

      const needed = Number(bill.remainingAmount) || 0;
      if (needed <= 0) continue;
      const allocatedAmount = Math.min(remainingPayment, needed);

      const currentPaid = Number(bill.paidAmount) || 0;
      const newPaidAmount = currentPaid + allocatedAmount;
      const totalAmt = Number(bill.totalAmount) || (Number(bill.subtotal || 0) + Number(bill.previousDue || 0));
      const newRemainingAmount = Math.max(0, totalAmt - newPaidAmount);
      
      const prevDue = Number(bill.previousDue) || 0;
      const prevDuePaid = Math.min(prevDue, newPaidAmount);
      const prevDueRemaining = Math.max(0, prevDue - prevDuePaid);
      const remForCurrent = Math.max(0, newPaidAmount - prevDuePaid);
      const sub = Number(bill.subtotal) || Math.max(0, totalAmt - prevDue);
      const curPaid = Math.min(sub, remForCurrent);
      const curRemaining = Math.max(0, sub - curPaid);

      let newStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';
      if (newRemainingAmount === 0 && totalAmt > 0) {
        newStatus = 'paid';
      } else if (newPaidAmount > 0) {
        newStatus = 'partial';
      }

      await billService.updateBill(bill.id!, {
        paidAmount: newPaidAmount,
        remainingAmount: newRemainingAmount,
        paymentStatus: newStatus,
        previousDuePaid: prevDuePaid,
        previousDueRemaining: prevDueRemaining,
        currentBillPaid: curPaid,
        currentBillRemaining: curRemaining,
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
    }

    // 5. Update the payment document status to approved
    const updatedPayment = await db.updateDoc<Payment>(COLLECTION, paymentId, {
      status: 'approved' as PaymentVerificationStatus,
      verifiedAt: new Date().toISOString(),
      parentPaymentId,
    });

    // 6. Dispatch notification to tenant (in-app + Android status-bar push)
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
   * Automatically sets status to 'approved' and executes immediate allocation.
   */
  async recordPayment(payment: Omit<Payment, 'createdAt'>): Promise<Payment> {
    // 1. Fetch the tenant
    const tenant = await db.getDoc<Tenant>('tenants', payment.tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // 2. Fetch all bills of this tenant
    const allBills = await db.queryDocs<Bill>('bills', (doc) => doc.tenantId === payment.tenantId);
    const decoratedBills = decorateBills(allBills);
    
    // CRITICAL: Filter out any bill that is already closed or fully paid (remainingAmount <= 0 or status == 'paid')
    // Old paid bills must NEVER receive any payment allocation!
    const outstandingBills = decoratedBills
      .filter((b) => !isBillClosedOrPaid(b) && (Number(b.remainingAmount) || 0) > 0)
      .sort((a, b) => (a.billingMonth || '').localeCompare(b.billingMonth || ''));

    let remainingPayment = Number(payment.amount) || 0;
    const parentPaymentId = 'PAY-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    let mainPaymentRef: Payment | null = null;
    const nowIso = new Date().toISOString();

    // 3. Apply payment sequentially to outstanding bills only
    for (const bill of outstandingBills) {
      if (remainingPayment <= 0) break;

      const needed = Number(bill.remainingAmount) || 0;
      if (needed <= 0) continue;
      const allocatedAmount = Math.min(remainingPayment, needed);

      const currentPaid = Number(bill.paidAmount) || 0;
      const newPaidAmount = currentPaid + allocatedAmount;
      const totalAmt = Number(bill.totalAmount) || (Number(bill.subtotal || 0) + Number(bill.previousDue || 0));
      const newRemainingAmount = Math.max(0, totalAmt - newPaidAmount);

      const prevDue = Number(bill.previousDue) || 0;
      const prevDuePaid = Math.min(prevDue, newPaidAmount);
      const prevDueRemaining = Math.max(0, prevDue - prevDuePaid);
      const remForCurrent = Math.max(0, newPaidAmount - prevDuePaid);
      const sub = Number(bill.subtotal) || Math.max(0, totalAmt - prevDue);
      const curPaid = Math.min(sub, remForCurrent);
      const curRemaining = Math.max(0, sub - curPaid);

      let newStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';
      if (newRemainingAmount === 0 && totalAmt > 0) {
        newStatus = 'paid';
      } else if (newPaidAmount > 0) {
        newStatus = 'partial';
      }

      // Update Bill
      await billService.updateBill(bill.id!, {
        paidAmount: newPaidAmount,
        remainingAmount: newRemainingAmount,
        paymentStatus: newStatus,
        previousDuePaid: prevDuePaid,
        previousDueRemaining: prevDueRemaining,
        currentBillPaid: curPaid,
        currentBillRemaining: curRemaining,
      });

      // Save split payment record
      const paymentDoc = await db.addDoc<Payment>(COLLECTION, {
        ownerId: payment.ownerId,
        billId: bill.id!,
        tenantId: payment.tenantId,
        tenantAuthUid: tenant.tenantAuthUid || null,
        propertyId: bill.propertyId,
        unitId: bill.unitId,
        amount: allocatedAmount,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        transactionId: payment.transactionId,
        screenshotUrl: payment.screenshotUrl,
        status: 'approved' as PaymentVerificationStatus,
        verifiedAt: nowIso,
        parentPaymentId,
      } as any);

      if (!mainPaymentRef) {
        mainPaymentRef = paymentDoc;
      }

      remainingPayment -= allocatedAmount;
    }

    // 4. Storing any excess payment in advanceAmount
    if (remainingPayment > 0) {
      const currentAdvance = tenant.advanceAmount || 0;
      const newAdvance = currentAdvance + remainingPayment;

      await db.updateDoc<Tenant>('tenants', tenant.id!, {
        advanceAmount: newAdvance,
      } as any);

      const advancePaymentDoc = await db.addDoc<Payment>(COLLECTION, {
        ownerId: payment.ownerId,
        billId: 'advance',
        tenantId: payment.tenantId,
        tenantAuthUid: tenant.tenantAuthUid || null,
        propertyId: tenant.propertyId,
        unitId: tenant.unitId,
        amount: remainingPayment,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        transactionId: payment.transactionId,
        screenshotUrl: payment.screenshotUrl,
        status: 'approved' as PaymentVerificationStatus,
        verifiedAt: nowIso,
        parentPaymentId,
      } as any);

      if (!mainPaymentRef) {
        mainPaymentRef = advancePaymentDoc;
      }
    }

    // Return the payment ref
    if (!mainPaymentRef) {
      mainPaymentRef = await db.addDoc<Payment>(COLLECTION, {
        ...payment,
        status: 'approved' as PaymentVerificationStatus,
        verifiedAt: nowIso,
        parentPaymentId,
      } as any);
    }

    return mainPaymentRef;
  },
};
export default paymentService;

