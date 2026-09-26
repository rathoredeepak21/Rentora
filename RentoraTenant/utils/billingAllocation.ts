import type { Bill, MonthWiseAccounting, PaymentStatus, PaymentSubmission } from '../types';

export interface BillingAllocation {
  /** Current month subtotal charges (Rent + Electricity + Water + Maintenance + Parking + Other) */
  subtotal: number;
  /** Previous unpaid arrears / due before this billing period */
  previousDue: number;
  /** Total statement payable = subtotal + previousDue */
  totalPayable: number;
  
  /** Cumulative approved/verified payment amount applied */
  totalApprovedPaid: number;
  /** Amount of payment allocated to clearing the oldest previous due/arrears first */
  previousDuePaid: number;
  /** Remaining unpaid previous due/arrears after allocation (0 if fully cleared) */
  previousDueRemaining: number;
  
  /** Amount of payment allocated to the current month bill charges */
  currentBillPaid: number;
  /** Remaining unpaid current month bill charges after allocation */
  currentBillRemaining: number;
  
  /** Final remaining outstanding balance = previousDueRemaining + currentBillRemaining */
  totalOutstanding: number;
  /** Payment status: 'paid' (0 outstanding), 'partial', or 'unpaid' */
  paymentStatus: PaymentStatus;
  /** Overpayment amount stored as advance (if paid > totalPayable) */
  excessAdvance: number;

  /** Structured Month-Wise Accounting breakdown */
  monthWiseAccounting: MonthWiseAccounting;
}

export const formatMonthDisplay = (monthStr?: string): string => {
  if (!monthStr) return 'Current Month';
  try {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } catch (e) {
    return monthStr;
  }
};

export const getPreviousMonthDisplay = (monthStr?: string): string => {
  if (!monthStr) return 'Previous Month';
  try {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 2, 1);
    return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } catch (e) {
    return 'Previous Month';
  }
};

/**
 * Calculates payment allocation according to Rentora core business rules:
 * 1. FIRST clear the oldest previous due/arrears.
 * 2. THEN apply remaining payment to current month charges.
 * 3. NEVER double-count the previous due or treat charges as independent after payment.
 * 4. Total Outstanding = previousDueRemaining + currentBillRemaining.
 */
export function calculateBillAllocation(
  bill: Partial<Bill>,
  approvedPaymentsTotal?: number
): BillingAllocation {
  const subtotal = bill.subtotal !== undefined
    ? Number(bill.subtotal) || 0
    : (Number(bill.rent) || 0) +
      (Number(bill.electricityCharge) || 0) +
      (Number(bill.waterCharge) || 0) +
      (Number(bill.parkingCharge) || 0) +
      (Number(bill.maintenanceCharge) || 0) +
      (Number(bill.otherCharges) || 0);

  const previousDue = Math.max(0, Number(bill.previousDue) || 0);
  const totalPayable = subtotal + previousDue;

  // Determine actual approved paid amount
  let totalApprovedPaid = 0;
  if (approvedPaymentsTotal !== undefined) {
    totalApprovedPaid = Math.max(0, Number(approvedPaymentsTotal) || 0);
  } else {
    totalApprovedPaid = Math.max(0, Number(bill.paidAmount) || 0);
  }

  // 1. FIRST clear the oldest previous due/arrears
  const previousDuePaid = Math.min(previousDue, totalApprovedPaid);
  const previousDueRemaining = Math.max(0, previousDue - previousDuePaid);

  // 2. THEN apply remaining payment to current month bill
  const remainingPaymentForCurrent = Math.max(0, totalApprovedPaid - previousDuePaid);
  const currentBillPaid = Math.min(subtotal, remainingPaymentForCurrent);
  const currentBillRemaining = Math.max(0, subtotal - currentBillPaid);

  // 3. Final total outstanding balance
  // Guaranteed: totalOutstanding = previousDueRemaining + currentBillRemaining
  // = Math.max(0, totalPayable - totalApprovedPaid)
  const totalOutstanding = Math.max(0, totalPayable - totalApprovedPaid);

  // 4. Overpayment / Advance (does not allow negative balance)
  const excessAdvance = Math.max(0, totalApprovedPaid - totalPayable);

  // 5. Payment status
  let paymentStatus: PaymentStatus = 'unpaid';
  if (totalOutstanding === 0 && totalPayable > 0) {
    paymentStatus = 'paid';
  } else if (totalApprovedPaid > 0) {
    paymentStatus = 'partial';
  }

  const prevStatus: PaymentStatus = previousDueRemaining === 0 ? 'paid' : (previousDuePaid > 0 ? 'partial' : 'unpaid');
  const curStatus: PaymentStatus = currentBillRemaining === 0 ? 'paid' : (currentBillPaid > 0 ? 'partial' : 'unpaid');

  const prevLabel = bill.monthWiseAccounting?.previousMonthLabel ||
    (bill.billingMonth ? `${getPreviousMonthDisplay(bill.billingMonth)} (Arrears)` : 'Previous Month / Arrears');

  const monthWiseAccounting: MonthWiseAccounting = {
    hasPreviousDue: previousDue > 0,
    previousMonthLabel: prevLabel,
    previousMonthOriginal: previousDue,
    previousMonthPaid: previousDuePaid,
    previousMonthRemaining: previousDueRemaining,
    previousMonthStatus: prevStatus,

    currentMonthLabel: formatMonthDisplay(bill.billingMonth),
    currentMonthOriginal: subtotal,
    currentMonthPaid: currentBillPaid,
    currentMonthRemaining: currentBillRemaining,
    currentMonthStatus: curStatus,

    overallTotalPayable: totalPayable,
    overallTotalPaid: totalApprovedPaid,
    overallTotalRemaining: totalOutstanding,
  };

  return {
    subtotal,
    previousDue,
    totalPayable,
    totalApprovedPaid,
    previousDuePaid,
    previousDueRemaining,
    currentBillPaid,
    currentBillRemaining,
    totalOutstanding,
    paymentStatus,
    excessAdvance,
    monthWiseAccounting,
  };
}

export const isBillClosedOrPaid = (bill: Partial<Bill>): boolean => {
  if (!bill) return false;
  if (bill.paymentStatus === 'paid') return true;
  if (bill.remainingAmount !== undefined && Number(bill.remainingAmount) <= 0 && Number(bill.paidAmount || 0) > 0) return true;
  if (bill.totalAmount !== undefined && bill.paidAmount !== undefined && Number(bill.totalAmount) > 0 && Number(bill.paidAmount) >= Number(bill.totalAmount)) return true;
  return false;
};

/**
 * Decorates an array of tenant bills chronologically from oldest to newest:
 * - Allocates previous due and approved payments sequentially.
 * - Filters for approved payments only (pending & rejected never reduce balance).
 * - Distributes total approved payment pool oldest-bill-first across open tenant bills.
 * - Guarantees landlord and tenant apps compute identical results.
 * - Historical PAID bills are locked and NEVER receive future payment allocation.
 */
export function decorateTenantBills(
  bills: Bill[],
  payments?: PaymentSubmission[]
): Bill[] {
  if (!Array.isArray(bills) || bills.length === 0) return [];

  // Sort oldest first chronologically: billingMonth -> billNumber -> createdAt
  const sorted = [...bills].sort((a, b) => {
    const monthA = a.billingMonth || '';
    const monthB = b.billingMonth || '';
    if (monthA !== monthB) {
      return monthA.localeCompare(monthB);
    }
    const numA = a.billNumber || '';
    const numB = b.billNumber || '';
    if (numA && numB && numA !== numB) {
      return numA.localeCompare(numB);
    }
    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    return createdA.localeCompare(createdB);
  });

  // Calculate total approved payment pool for this tenant (only approved payments count)
  let availablePaymentPool = 0;
  if (Array.isArray(payments) && payments.length > 0) {
    payments.forEach((p) => {
      if (p.status === 'approved') {
        availablePaymentPool += Number(p.amount) || 0;
      }
    });
  } else {
    // Fallback: sum of recorded paidAmount on bills if payments array is empty/omitted
    availablePaymentPool = bills.reduce((sum, b) => sum + (Number(b.paidAmount) || 0), 0);
  }

  // Ensure pool is at least the sum of confirmed bill paid amounts
  const sumRecordedBills = bills.reduce((sum, b) => sum + (Number(b.paidAmount) || 0), 0);
  availablePaymentPool = Math.max(availablePaymentPool, sumRecordedBills);

  let remainingPaymentPool = availablePaymentPool;

  const decoratedOldestFirst = sorted.map((bill, index) => {
    const isClosed = isBillClosedOrPaid(bill);

    // Current bill charges (subtotal)
    const subtotal = bill.subtotal !== undefined
      ? Number(bill.subtotal) || 0
      : (Number(bill.rent) || 0) +
        (Number(bill.electricityCharge) || 0) +
        (Number(bill.waterCharge) || 0) +
        (Number(bill.parkingCharge) || 0) +
        (Number(bill.maintenanceCharge) || 0) +
        (Number(bill.otherCharges) || 0);

    // PRESERVE PREVIOUS DUE: Each bill retains its own recorded previous arrears
    // Previous Outstanding Due + Current Bill = Total Payable
    const previousDue = Math.max(0, Number(bill.previousDue) || 0);
    const totalAmount = subtotal + previousDue;

    // If bill is already closed/paid, lock it from any recalculation or payment allocation!
    if (isClosed) {
      const paidAmount = Number(bill.paidAmount) || totalAmount;
      const prevDuePaid = Math.min(previousDue, paidAmount);
      const curPaid = Math.max(0, paidAmount - prevDuePaid);

      // Deduct this bill's paid amount from the available payment pool
      remainingPaymentPool = Math.max(0, remainingPaymentPool - paidAmount);

      const prevLabel = bill.monthWiseAccounting?.previousMonthLabel ||
        (index > 0 && sorted[index - 1]?.billingMonth
          ? formatMonthDisplay(sorted[index - 1].billingMonth)
          : (bill.billingMonth ? `${getPreviousMonthDisplay(bill.billingMonth)} (Arrears)` : 'Previous Month / Arrears'));

      const monthWiseAccounting: MonthWiseAccounting = {
        hasPreviousDue: previousDue > 0,
        previousMonthLabel: prevLabel,
        previousMonthOriginal: previousDue,
        previousMonthPaid: prevDuePaid,
        previousMonthRemaining: 0,
        previousMonthStatus: 'paid',

        currentMonthLabel: formatMonthDisplay(bill.billingMonth),
        currentMonthOriginal: subtotal,
        currentMonthPaid: curPaid,
        currentMonthRemaining: 0,
        currentMonthStatus: 'paid',

        overallTotalPayable: totalAmount,
        overallTotalPaid: paidAmount,
        overallTotalRemaining: 0,
      };

      return {
        ...bill,
        subtotal,
        previousDue,
        totalAmount,
        paidAmount,
        remainingAmount: 0,
        paymentStatus: 'paid' as const,
        previousDuePaid: prevDuePaid,
        previousDueRemaining: 0,
        currentBillPaid: curPaid,
        currentBillRemaining: 0,
        monthWiseAccounting,
      } as Bill;
    }

    // Bill is open (unpaid or partial)
    // If this is the first/standalone bill and has manual previousDue, allocate payment to previousDue first
    let previousDuePaid = 0;
    let previousDueRemaining = previousDue;

    if (index === 0 && previousDue > 0) {
      previousDuePaid = Math.min(previousDue, remainingPaymentPool);
      previousDueRemaining = Math.max(0, previousDue - previousDuePaid);
      remainingPaymentPool = Math.max(0, remainingPaymentPool - previousDuePaid);
    } else {
      // For index > 0, prior bills in the array already consumed the payment pool for older dues
      previousDuePaid = 0;
      previousDueRemaining = previousDue;
    }

    // Apply remaining payment pool to this bill's own charges (oldest open bill first)
    const currentBillPaid = Math.min(subtotal, remainingPaymentPool);
    const currentBillRemaining = Math.max(0, subtotal - currentBillPaid);
    remainingPaymentPool = Math.max(0, remainingPaymentPool - currentBillPaid);

    const paidAmount = index === 0 && previousDue > 0 ? (previousDuePaid + currentBillPaid) : currentBillPaid;
    const remainingAmount = index === 0 && previousDue > 0 ? (previousDueRemaining + currentBillRemaining) : currentBillRemaining;

    // Payment status for this bill
    let paymentStatus: PaymentStatus = 'unpaid';
    if (remainingAmount === 0 && totalAmount > 0) {
      paymentStatus = 'paid';
    } else if (paidAmount > 0) {
      paymentStatus = 'partial';
    }

    const prevStatus: PaymentStatus = previousDueRemaining === 0 ? 'paid' : (previousDuePaid > 0 ? 'partial' : 'unpaid');
    const curStatus: PaymentStatus = currentBillRemaining === 0 ? 'paid' : (currentBillPaid > 0 ? 'partial' : 'unpaid');

    const monthWiseAccounting: MonthWiseAccounting = {
      hasPreviousDue: previousDue > 0,
      previousMonthLabel: index > 0 && sorted[index - 1]?.billingMonth
        ? formatMonthDisplay(sorted[index - 1].billingMonth)
        : (bill.billingMonth ? `${getPreviousMonthDisplay(bill.billingMonth)} (Arrears)` : 'Previous Month / Arrears'),
      previousMonthOriginal: previousDue,
      previousMonthPaid: previousDuePaid,
      previousMonthRemaining: previousDueRemaining,
      previousMonthStatus: prevStatus,

      currentMonthLabel: formatMonthDisplay(bill.billingMonth),
      currentMonthOriginal: subtotal,
      currentMonthPaid: currentBillPaid,
      currentMonthRemaining: currentBillRemaining,
      currentMonthStatus: curStatus,

      overallTotalPayable: totalAmount,
      overallTotalPaid: paidAmount,
      overallTotalRemaining: remainingAmount,
    };

    return {
      ...bill,
      subtotal,
      previousDue,
      totalAmount,
      paidAmount,
      remainingAmount,
      paymentStatus,
      previousDuePaid,
      previousDueRemaining,
      currentBillPaid,
      currentBillRemaining,
      monthWiseAccounting,
    } as Bill;
  });

  // Return sorted newest-first for tenant UI views
  return decoratedOldestFirst.sort((a, b) => {
    const monthA = a.billingMonth || '';
    const monthB = b.billingMonth || '';
    if (monthA !== monthB) {
      return monthB.localeCompare(monthA);
    }
    const numA = a.billNumber || '';
    const numB = b.billNumber || '';
    if (numA && numB && numA !== numB) {
      return numB.localeCompare(numA);
    }
    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    return createdB.localeCompare(createdA);
  });
}
