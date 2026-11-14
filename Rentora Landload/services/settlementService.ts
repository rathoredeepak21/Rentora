import db from '../utils/db';
import { 
  Settlement, 
  SettlementAdjustment, 
  SettlementPaymentStatus,
  SettlementTransaction,
  SettlementTransactionType,
  PaymentMethod,
  ExtraStayPolicy, 
  Tenant, 
  Bill, 
  Payment, 
  Property, 
  Unit 
} from '../types';
import { calculateTenantOutstanding, decorateBills } from './billService';
import { unitService } from './unitService';
import { tenantAuthService } from './tenantAuthService';

const COLLECTION = 'settlements';

/**
 * Computes the unified settlement status, amounts, and payment direction.
 * Works seamlessly with both newly created and historical settlements.
 */
export const computeSettlementStatus = (
  settlement: Partial<Settlement>
): {
  targetTotal: number;
  amountSettled: number;
  amountPending: number;
  status: SettlementPaymentStatus;
  direction: 'refund_to_tenant' | 'payment_by_tenant' | 'zero_balance';
  partyMessage: string;
  directionTitle: string;
  statusLabel: string;
} => {
  const isZero = settlement.finalStatus === 'zero_balance' || 
    (Math.abs(settlement.finalAmount || 0) === 0 && !settlement.totalRefundableAmount && !settlement.totalPayableAmount);

  if (isZero) {
    return {
      targetTotal: 0,
      amountSettled: 0,
      amountPending: 0,
      status: 'fully_settled',
      direction: 'zero_balance',
      partyMessage: 'No amount is payable by either party.',
      directionTitle: 'FULLY SETTLED',
      statusLabel: 'FULLY SETTLED',
    };
  }

  const isRefundable = settlement.finalStatus === 'refundable' || 
    (settlement.totalRefundableAmount !== undefined && settlement.totalRefundableAmount > 0) ||
    settlement.settlementDirection === 'refund_to_tenant';

  if (isRefundable) {
    const targetTotal = Math.round(
      (settlement.totalRefundableAmount !== undefined 
        ? settlement.totalRefundableAmount 
        : Math.abs(settlement.finalAmount || 0)) * 100
    ) / 100;

    const refundTxs = (settlement.transactions || []).filter(t => t.type === 'refund');
    const amountSettled = Math.round(
      refundTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) * 100
    ) / 100;

    const amountPending = Math.max(0, Math.round((targetTotal - amountSettled) * 100) / 100);

    let status: SettlementPaymentStatus = 'refund_pending';
    let statusLabel = 'REFUND PENDING';

    if (amountSettled >= targetTotal && targetTotal > 0) {
      status = 'fully_settled';
      statusLabel = 'FULLY SETTLED';
    } else if (amountSettled > 0) {
      status = 'partially_refunded';
      statusLabel = 'PARTIALLY REFUNDED';
    } else {
      status = 'refund_pending';
      statusLabel = 'REFUND PENDING';
    }

    const partyMessage = status === 'fully_settled'
      ? `The landlord has fully refunded ₹${targetTotal.toLocaleString('en-IN')} to the tenant.`
      : `The landlord must refund ₹${amountPending.toLocaleString('en-IN')} to the tenant.`;

    return {
      targetTotal,
      amountSettled,
      amountPending,
      status,
      direction: 'refund_to_tenant',
      partyMessage,
      directionTitle: 'REFUND PAYABLE TO TENANT',
      statusLabel,
    };
  }

  // Payment by tenant
  const targetTotal = Math.round(
    (settlement.totalPayableAmount !== undefined 
      ? settlement.totalPayableAmount 
      : Math.abs(settlement.finalAmount || 0)) * 100
  ) / 100;

  const paymentTxs = (settlement.transactions || []).filter(t => t.type === 'payment_received');
  const amountSettled = Math.round(
    paymentTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) * 100
  ) / 100;

  const amountPending = Math.max(0, Math.round((targetTotal - amountSettled) * 100) / 100);

  let status: SettlementPaymentStatus = 'payment_pending';
  let statusLabel = 'PAYMENT PENDING';

  if (amountSettled >= targetTotal && targetTotal > 0) {
    status = 'fully_settled';
    statusLabel = 'FULLY SETTLED';
  } else if (amountSettled > 0) {
    status = 'partially_paid';
    statusLabel = 'PARTIALLY PAID';
  } else {
    status = 'payment_pending';
    statusLabel = 'PAYMENT PENDING';
  }

  const partyMessage = status === 'fully_settled'
    ? `The tenant has fully paid ₹${targetTotal.toLocaleString('en-IN')} to the landlord.`
    : `The tenant must pay ₹${amountPending.toLocaleString('en-IN')} to the landlord.`;

  return {
    targetTotal,
    amountSettled,
    amountPending,
    status,
    direction: 'payment_by_tenant',
    partyMessage,
    directionTitle: 'PAYMENT PAYABLE BY TENANT',
    statusLabel,
  };
};

/**
 * Calculates the exact eligible extra stay days between normal period end and actual move-out date.
 * Following Rentora convention: if normal period ends on the 14th and tenant leaves on the 16th,
 * the result is exactly 2 extra days.
 * If moveOutDate is on or before normalPeriodEndDate, returns 0.
 */
export const calculateEligibleExtraDays = (
  moveOutDateStr: string,
  normalPeriodEndDateStr: string
): number => {
  if (!moveOutDateStr || !normalPeriodEndDateStr) return 0;
  
  const [outY, outM, outD] = moveOutDateStr.split('-').map(Number);
  const [endY, endM, endD] = normalPeriodEndDateStr.split('-').map(Number);

  if (!outY || !outM || !outD || !endY || !endM || !endD) return 0;

  const outUtc = Date.UTC(outY, outM - 1, outD);
  const endUtc = Date.UTC(endY, endM - 1, endD);

  if (outUtc <= endUtc) {
    return 0;
  }

  const diffMs = outUtc - endUtc;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
};

/**
 * Determines the relevant billing period and actual calendar days count.
 * Handles periods of 28, 29 (leap year), 30, and 31 days accurately.
 */
export const getRelevantBillingPeriod = (
  normalPeriodEndDateStr: string
): { startDate: string; endDate: string; daysInPeriod: number } => {
  const fallbackDate = new Date();
  const fallbackIso = fallbackDate.toISOString().split('T')[0];

  if (!normalPeriodEndDateStr || typeof normalPeriodEndDateStr !== 'string') {
    return { startDate: fallbackIso, endDate: fallbackIso, daysInPeriod: 30 };
  }

  const parts = normalPeriodEndDateStr.trim().split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return { startDate: fallbackIso, endDate: fallbackIso, daysInPeriod: 30 };
  }

  const [y, m, d] = parts;

  try {
    // The next period starts the day after normalPeriodEndDate
    const startObj = new Date(Date.UTC(y, m - 1, d + 1));
    if (isNaN(startObj.getTime())) {
      return { startDate: fallbackIso, endDate: fallbackIso, daysInPeriod: 30 };
    }

    // The relevant 1-month period ends 1 month later minus 1 day
    const endObj = new Date(
      Date.UTC(
        startObj.getUTCFullYear(),
        startObj.getUTCMonth() + 1,
        startObj.getUTCDate() - 1
      )
    );
    if (isNaN(endObj.getTime())) {
      const sIso = startObj.toISOString().split('T')[0];
      return { startDate: sIso, endDate: sIso, daysInPeriod: 30 };
    }

    const startIso = startObj.toISOString().split('T')[0];
    const endIso = endObj.toISOString().split('T')[0];

    const diffDays = Math.round((endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    return {
      startDate: startIso,
      endDate: endIso,
      daysInPeriod: diffDays > 0 ? diffDays : 30,
    };
  } catch (e) {
    return { startDate: fallbackIso, endDate: fallbackIso, daysInPeriod: 30 };
  }
};

/**
 * Calculates daily rent basis safely according to selected policy.
 */
export const calculateDailyRent = (
  monthlyRent: number,
  policy: ExtraStayPolicy,
  daysInPeriod: number
): number => {
  const rent = Number(monthlyRent) || 0;
  if (rent <= 0) return 0;

  if (policy === 'actualBillingPeriod') {
    const divisor = daysInPeriod > 0 ? daysInPeriod : 30;
    return rent / divisor;
  }

  // Default: Fixed 30-day basis
  return rent / 30;
};

/**
 * Calculates extra-stay rent.
 */
export const calculateExtraStayRent = (params: {
  monthlyRent: number;
  policy: ExtraStayPolicy;
  eligibleExtraDays: number;
  daysInPeriod: number;
}): {
  dailyRateBasis: number;
  eligibleExtraDays: number;
  periodDays: number;
  extraStayAmount: number;
} => {
  const { monthlyRent, policy, eligibleExtraDays, daysInPeriod } = params;
  const periodDays = policy === 'actualBillingPeriod' ? daysInPeriod : 30;
  const dailyRateBasis = calculateDailyRent(monthlyRent, policy, daysInPeriod);

  if (eligibleExtraDays <= 0) {
    return {
      dailyRateBasis,
      eligibleExtraDays: 0,
      periodDays,
      extraStayAmount: 0,
    };
  }

  const rawAmount = dailyRateBasis * eligibleExtraDays;
  // Round to 2 decimal places to avoid floating point money issues
  const extraStayAmount = Math.round(rawAmount * 100) / 100;

  return {
    dailyRateBasis,
    eligibleExtraDays,
    periodDays,
    extraStayAmount,
  };
};

/**
 * Calculates final electricity charges for settlement.
 */
export const calculateFinalElectricity = (params: {
  billType: 'fixed' | 'perUnit' | 'none';
  previousReading: number;
  finalReading?: number;
  ratePerUnit: number;
  fixedAmount: number;
}): {
  units: number;
  charge: number;
  isValid: boolean;
  error?: string;
} => {
  const { billType, previousReading, finalReading, ratePerUnit, fixedAmount } = params;

  if (billType === 'none') {
    return { units: 0, charge: 0, isValid: true };
  }

  if (billType === 'fixed') {
    return { units: 0, charge: Math.max(0, fixedAmount || 0), isValid: true };
  }

  // perUnit mode
  if (finalReading === undefined || finalReading === null || isNaN(finalReading)) {
    return {
      units: 0,
      charge: 0,
      isValid: false,
      error: 'Final electricity meter reading is required for per-unit billing.',
    };
  }

  if (finalReading < previousReading) {
    return {
      units: 0,
      charge: 0,
      isValid: false,
      error: `Final reading (${finalReading}) cannot be less than previous reading (${previousReading}).`,
    };
  }

  const units = Math.max(0, finalReading - previousReading);
  const rawCharge = units * (ratePerUnit || 0);
  const charge = Math.round(rawCharge * 100) / 100;

  return {
    units,
    charge,
    isValid: true,
  };
};

/**
 * Derives the prefilled normal period end date for a tenant.
 * Uses the latest bill's period or anniversary of move-in date.
 */
export const deriveNormalPeriodDates = (
  tenant: Tenant,
  tenantBills: Bill[]
): { normalPeriodStartDate: string; normalPeriodEndDate: string } => {
  const fallbackDate = new Date().toISOString().split('T')[0];
  if (!tenant) {
    return { normalPeriodStartDate: fallbackDate, normalPeriodEndDate: fallbackDate };
  }

  const moveInStr = (tenant.moveInDate || fallbackDate).trim();
  const inParts = moveInStr.split('-').map(Number);
  const inY = inParts[0] || new Date().getFullYear();
  const inM = inParts[1] || (new Date().getMonth() + 1);
  const inD = inParts[2] || 1;

  if (!Array.isArray(tenantBills) || tenantBills.length === 0) {
    try {
      const startObj = new Date(Date.UTC(inY, inM - 1, inD));
      const endObj = new Date(Date.UTC(inY, inM, inD - 1));
      if (!isNaN(startObj.getTime()) && !isNaN(endObj.getTime())) {
        return {
          normalPeriodStartDate: startObj.toISOString().split('T')[0],
          normalPeriodEndDate: endObj.toISOString().split('T')[0],
        };
      }
    } catch (e) {}
    return { normalPeriodStartDate: fallbackDate, normalPeriodEndDate: fallbackDate };
  }

  // Sort bills chronologically descending to find latest
  const sorted = [...tenantBills].sort((a, b) => ((b && b.billingMonth) || '').localeCompare((a && a.billingMonth) || ''));
  const latestBill = sorted[0];

  if (latestBill && latestBill.billingMonth) {
    const bParts = latestBill.billingMonth.split('-').map(Number);
    const bY = bParts[0];
    const bM = bParts[1];
    if (bY && bM) {
      try {
        if (inD === 1) {
          const startObj = new Date(Date.UTC(bY, bM - 1, 1));
          const endObj = new Date(Date.UTC(bY, bM, 0)); // last day of billing month
          if (!isNaN(startObj.getTime()) && !isNaN(endObj.getTime())) {
            return {
              normalPeriodStartDate: startObj.toISOString().split('T')[0],
              normalPeriodEndDate: endObj.toISOString().split('T')[0],
            };
          }
        } else {
          const startObj = new Date(Date.UTC(bY, bM - 1, inD));
          const endObj = new Date(Date.UTC(bY, bM, inD - 1));
          if (!isNaN(startObj.getTime()) && !isNaN(endObj.getTime())) {
            return {
              normalPeriodStartDate: startObj.toISOString().split('T')[0],
              normalPeriodEndDate: endObj.toISOString().split('T')[0],
            };
          }
        }
      } catch (e) {}
    }
  }

  try {
    const startObj = new Date(Date.UTC(inY, inM - 1, inD));
    const endObj = new Date(Date.UTC(inY, inM, inD - 1));
    if (!isNaN(startObj.getTime()) && !isNaN(endObj.getTime())) {
      return {
        normalPeriodStartDate: startObj.toISOString().split('T')[0],
        normalPeriodEndDate: endObj.toISOString().split('T')[0],
      };
    }
  } catch (e) {}

  return { normalPeriodStartDate: fallbackDate, normalPeriodEndDate: fallbackDate };
};

export const settlementService = {
  async getSettlements(ownerId: string): Promise<Settlement[]> {
    return db.queryDocs<Settlement>(COLLECTION, (doc) => doc.ownerId === ownerId);
  },

  async getSettlementById(id: string): Promise<Settlement | null> {
    return db.getDoc<Settlement>(COLLECTION, id);
  },

  async getSettlementByTenantId(tenantId: string): Promise<Settlement | null> {
    const list = await db.queryDocs<Settlement>(COLLECTION, (doc) => doc.tenantId === tenantId);
    return list.length > 0 ? list[0] : null;
  },

  async generateSettlementNumber(ownerId: string, year: number): Promise<string> {
    const ownerSettlements = await this.getSettlements(ownerId);
    const prefix = `SET-${year}-`;
    const sameYear = ownerSettlements.filter(s => s.settlementNumber && s.settlementNumber.startsWith(prefix));

    let maxSeq = 0;
    sameYear.forEach(s => {
      const parts = (s.settlementNumber || '').split('-');
      if (parts.length === 3) {
        const seq = parseInt(parts[2], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });

    const nextSeq = maxSeq + 1;
    const padded = String(nextSeq).padStart(5, '0');
    return `${prefix}${padded}`;
  },

  /**
   * Finalizes a move-out settlement with complete idempotency and duplicate prevention.
   */
  async finalizeSettlement(data: {
    ownerId: string;
    tenantId: string;
    propertyId: string;
    unitId: string;
    tenantName: string;
    unitNumber?: string;
    propertyName?: string;

    moveInDate: string;
    moveOutDate: string;
    normalPeriodStartDate?: string;
    normalPeriodEndDate: string;
    finalMeterReadingDate?: string;

    extraStayPolicy: ExtraStayPolicy;
    dailyRateBasis: number;
    periodDays: number;
    eligibleExtraDays: number;
    monthlyRent: number;
    extraStayAmount: number;

    electricityBillType: 'fixed' | 'perUnit' | 'none';
    previousMeterReading: number;
    finalMeterReading: number;
    electricityUnits: number;
    electricityRate: number;
    electricityCharge: number;

    outstandingBillsBalance: number;
    otherCharges: number;
    otherChargesNotes?: string;
    totalCharges: number;

    advanceRentOriginal: number;
    advanceRentAdjusted: number;
    advanceRentRefunded: number;
    advanceRentRemaining: number;

    securityDepositOriginal: number;
    securityDepositAdjusted: number;
    securityDepositRefunded: number;
    securityDepositRemaining: number;

    adjustments: SettlementAdjustment[];

    finalAmount: number;
    finalStatus: 'payable' | 'refundable' | 'zero_balance';
    settlementDirection?: 'refund_to_tenant' | 'payment_by_tenant' | 'zero_balance';

    totalRefundableAmount?: number;
    totalPayableAmount?: number;
    amountSettled?: number;
    amountPending?: number;
    paymentStatus?: SettlementPaymentStatus;
    transactions?: SettlementTransaction[];

    notes?: string;
    settlementDate: string;
  }): Promise<Settlement> {
    // 1. Idempotency Check: if tenant is already vacated or settlement exists, return existing
    const existingSettlement = await this.getSettlementByTenantId(data.tenantId);
    if (existingSettlement) {
      return existingSettlement;
    }

    const tenant = await db.getDoc<Tenant>('tenants', data.tenantId);
    if (!tenant) {
      throw new Error('Tenant record not found.');
    }
    if (tenant.status === 'vacated') {
      const existing = await this.getSettlementByTenantId(data.tenantId);
      if (existing) return existing;
    }

    const year = new Date().getFullYear();
    const settlementNumber = await this.generateSettlementNumber(data.ownerId, year);

    // Compute consistent status values
    const statusSummary = computeSettlementStatus({
      finalAmount: data.finalAmount,
      finalStatus: data.finalStatus,
      settlementDirection: data.settlementDirection,
      totalRefundableAmount: data.totalRefundableAmount,
      totalPayableAmount: data.totalPayableAmount,
      transactions: data.transactions || [],
    });

    // 2. Persist the durable settlement document
    const settlementPayload: Omit<Settlement, 'id' | 'createdAt' | 'updatedAt'> = {
      ...data,
      settlementNumber,
      settlementDirection: statusSummary.direction,
      totalRefundableAmount: statusSummary.direction === 'refund_to_tenant' ? statusSummary.targetTotal : 0,
      totalPayableAmount: statusSummary.direction === 'payment_by_tenant' ? statusSummary.targetTotal : 0,
      amountSettled: statusSummary.amountSettled,
      amountPending: statusSummary.amountPending,
      paymentStatus: statusSummary.status,
      transactions: data.transactions || [],
    };

    const newSettlement = await db.addDoc<Settlement>(COLLECTION, settlementPayload);

    // 3. Mark tenant as vacated & disable app login
    if (tenant.tenantAuthUid) {
      try {
        await tenantAuthService.updateTenantLoginStatus(tenant.id!, 'disabled', tenant.tenantAuthUid);
      } catch (authErr) {
        console.warn('Disabling tenant auth on settlement non-fatal:', authErr);
      }
    }

    await db.updateDoc<Tenant>('tenants', tenant.id!, {
      status: 'vacated',
      loginStatus: 'disabled',
      moveOutDate: data.moveOutDate,
      advanceAmount: data.advanceRentRemaining,
      securityDeposit: data.securityDepositRemaining,
    } as any);

    // 4. Release assigned unit to vacant
    try {
      await unitService.updateUnitStatus(tenant.unitId, 'vacant', null);
    } catch (unitErr) {
      console.warn('Releasing unit on settlement non-fatal:', unitErr);
    }

    // 5. Clear caches
    db.clearCache('tenants');
    db.clearCache('units');
    db.clearCache('settlements');

    return newSettlement;
  },

  /**
   * Records a payment received from tenant or a refund paid to tenant for a final settlement.
   * Enforces validations against over-refunds or overpayments and updates settlement status.
   */
  async recordSettlementTransaction(params: {
    settlementId: string;
    type: SettlementTransactionType;
    amount: number;
    date: string;
    paymentMethod: PaymentMethod;
    transactionReference?: string;
    notes?: string;
  }): Promise<Settlement> {
    const settlement = await this.getSettlementById(params.settlementId);
    if (!settlement) {
      throw new Error('Settlement record not found.');
    }

    const currentStatus = computeSettlementStatus(settlement);

    if (params.amount <= 0) {
      throw new Error('Transaction amount must be greater than zero.');
    }

    if (params.amount > currentStatus.amountPending + 0.01) {
      const pendingFormatted = currentStatus.amountPending.toLocaleString('en-IN', { minimumFractionDigits: 2 });
      throw new Error(
        `Amount (₹${params.amount}) exceeds remaining pending settlement balance (₹${pendingFormatted}).`
      );
    }

    const newTx: SettlementTransaction = {
      id: `stx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      settlementId: settlement.id!,
      tenantId: settlement.tenantId,
      ownerId: settlement.ownerId,
      type: params.type,
      amount: Math.round(params.amount * 100) / 100,
      date: params.date || new Date().toISOString().split('T')[0],
      paymentMethod: params.paymentMethod,
      transactionReference: params.transactionReference?.trim() || undefined,
      notes: params.notes?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    const updatedTransactions = [...(settlement.transactions || []), newTx];
    const newStatus = computeSettlementStatus({
      ...settlement,
      transactions: updatedTransactions,
    });

    await db.updateDoc<Settlement>(COLLECTION, settlement.id!, {
      transactions: updatedTransactions,
      amountSettled: newStatus.amountSettled,
      amountPending: newStatus.amountPending,
      paymentStatus: newStatus.status,
      updatedAt: new Date().toISOString(),
    } as any);

    db.clearCache(COLLECTION);

    return {
      ...settlement,
      transactions: updatedTransactions,
      amountSettled: newStatus.amountSettled,
      amountPending: newStatus.amountPending,
      paymentStatus: newStatus.status,
      updatedAt: new Date().toISOString(),
    };
  },

  /**
   * Deletes a settlement transaction and safely recomputes balances.
   */
  async deleteSettlementTransaction(
    settlementId: string,
    transactionId: string
  ): Promise<Settlement> {
    const settlement = await this.getSettlementById(settlementId);
    if (!settlement) {
      throw new Error('Settlement record not found.');
    }

    const updatedTransactions = (settlement.transactions || []).filter(t => t.id !== transactionId);
    const newStatus = computeSettlementStatus({
      ...settlement,
      transactions: updatedTransactions,
    });

    await db.updateDoc<Settlement>(COLLECTION, settlement.id!, {
      transactions: updatedTransactions,
      amountSettled: newStatus.amountSettled,
      amountPending: newStatus.amountPending,
      paymentStatus: newStatus.status,
      updatedAt: new Date().toISOString(),
    } as any);

    db.clearCache(COLLECTION);

    return {
      ...settlement,
      transactions: updatedTransactions,
      amountSettled: newStatus.amountSettled,
      amountPending: newStatus.amountPending,
      paymentStatus: newStatus.status,
      updatedAt: new Date().toISOString(),
    };
  },
};

export default settlementService;
