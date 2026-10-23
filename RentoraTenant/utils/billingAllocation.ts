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

  // Approved payments only
  const approvedPayments = Array.isArray(payments)
    ? payments.filter((p) => p.status === 'approved')
    : [];

  // Direct payments tagged by billId
  const directPaymentsMap = new Map<string, number>();
  approvedPayments.forEach((p) => {
    if (p.billId) {
      directPaymentsMap.set(
        p.billId,
        (directPaymentsMap.get(p.billId) || 0) + (Number(p.amount) || 0)
      );
    }
  });

  // Track remaining direct payment available for each bill
  const remainingDirectMap = new Map<string, number>(directPaymentsMap);

  // Total payment pool
  const totalApprovedPool = approvedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalRecordedBills = bills.reduce((sum, b) => sum + (Number(b.paidAmount) || 0), 0);
  let remainingPaymentPool = Math.max(totalApprovedPool, totalRecordedBills);

  const hasDirectPayments = directPaymentsMap.size > 0;
  let carryOver = 0;
  const deductedForOlderMap = new Map<string, number>();

  const resultOldestFirst: Bill[] = [];

  for (let index = 0; index < sorted.length; index++) {
    const bill = sorted[index];
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

      resultOldestFirst.push({
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
      } as Bill);
      continue;
    }

    // Bill is open (unpaid or partial)
    const directForThis = remainingDirectMap.get(bill.id || '') || 0;
    const recordedOnBill = Number(bill.paidAmount) || 0;

    let availableForThis = 0;

    if (directForThis > 0) {
      availableForThis = directForThis + carryOver;
      carryOver = 0;
      remainingPaymentPool = Math.max(0, remainingPaymentPool - directForThis);
      remainingDirectMap.set(bill.id || '', 0);
    } else if (hasDirectPayments) {
      // Direct payments exist for other bills.
      // Check if a newer bill carries this bill's debt as previousDue (Prompt Test 2)
      const newerCarryingPrev = sorted.slice(index + 1).find(
        (nb) => nb.previousDue > 0 && (remainingDirectMap.get(nb.id || '') || 0) > 0
      );
      if (newerCarryingPrev) {
        const newerPay = remainingDirectMap.get(newerCarryingPrev.id || '') || 0;
        const paidTowardsOlder = Math.min(totalAmount, Math.min(newerCarryingPrev.previousDue, newerPay));
        availableForThis = paidTowardsOlder + carryOver;
        carryOver = 0;
        // Deduct from newer bill's direct payment!
        remainingDirectMap.set(newerCarryingPrev.id || '', newerPay - paidTowardsOlder);
        remainingPaymentPool = Math.max(0, remainingPaymentPool - paidTowardsOlder);
        if (newerCarryingPrev.id) {
          deductedForOlderMap.set(
            newerCarryingPrev.id,
            (deductedForOlderMap.get(newerCarryingPrev.id) || 0) + paidTowardsOlder
          );
        }
      } else {
        // Find newest bill with remaining direct payment (TEST 5)
        const newerWithPay = sorted.slice(index + 1).find(
          (nb) => (remainingDirectMap.get(nb.id || '') || 0) > 0
        );
        if (newerWithPay) {
          const newerPay = remainingDirectMap.get(newerWithPay.id || '') || 0;
          const fromNewer = Math.min(totalAmount, newerPay);
          remainingDirectMap.set(newerWithPay.id || '', newerPay - fromNewer);
          remainingPaymentPool = Math.max(0, remainingPaymentPool - fromNewer);
          availableForThis = fromNewer + carryOver;
          carryOver = 0;
        } else {
          availableForThis = recordedOnBill + carryOver;
          carryOver = 0;
        }
      }
    } else {
      // Untagged pool
      const fromPool = Math.min(totalAmount, remainingPaymentPool);
      remainingPaymentPool = Math.max(0, remainingPaymentPool - fromPool);
      availableForThis = Math.max(recordedOnBill, fromPool) + carryOver;
      carryOver = 0;
    }

    if (availableForThis > totalAmount) {
      carryOver = availableForThis - totalAmount;
      availableForThis = totalAmount;
    }

    // Check if an earlier bill in resultOldestFirst was ALREADY cleared and represented this bill's previousDue
    const priorDecorated = index > 0 ? resultOldestFirst[index - 1] : null;
    const priorWasCleared = priorDecorated && (priorDecorated.paymentStatus === 'paid' || priorDecorated.remainingAmount === 0);

    // Core month-wise payment allocation:
    let previousDuePaid = 0;
    let previousDueRemaining = previousDue;

    if (previousDue > 0) {
      if (priorWasCleared) {
        // Prior arrears already cleared by prior payments
        previousDuePaid = previousDue;
        previousDueRemaining = 0;
      } else {
        // Clear previous arrears FIRST from payment
        previousDuePaid = Math.min(previousDue, availableForThis);
        previousDueRemaining = Math.max(0, previousDue - previousDuePaid);
        availableForThis = Math.max(0, availableForThis - previousDuePaid);
      }
    }

    // THEN apply remaining payment to current month bill
    const currentBillPaid = Math.min(subtotal, availableForThis);
    const currentBillRemaining = Math.max(0, subtotal - currentBillPaid);

    const totalPaidOnStatement = previousDuePaid + currentBillPaid;
    const remainingAmount = previousDueRemaining + currentBillRemaining;

    // If an older bill card in sorted already consumed part of this bill's payment for previousDue,
    // this bill's own paidAmount reflects payment allocated to its own charges (currentBillPaid).
    const wasDeductedForOlder = (bill.id && deductedForOlderMap.get(bill.id)) || 0;
    const paidAmount = wasDeductedForOlder > 0 ? currentBillPaid : totalPaidOnStatement;

    // Payment status for this bill
    let paymentStatus: PaymentStatus = 'unpaid';
    if (remainingAmount === 0 && totalAmount > 0) {
      paymentStatus = 'paid';
    } else if (totalPaidOnStatement > 0 || currentBillPaid > 0) {
      paymentStatus = 'partial';
    }

    const prevStatus: PaymentStatus = previousDueRemaining === 0 ? 'paid' : (previousDuePaid > 0 ? 'partial' : 'unpaid');
    const curStatus: PaymentStatus = currentBillRemaining === 0 ? 'paid' : (currentBillPaid > 0 ? 'partial' : 'unpaid');

    const prevLabel = index > 0 && sorted[index - 1]?.billingMonth
      ? formatMonthDisplay(sorted[index - 1].billingMonth)
      : (bill.billingMonth ? `${getPreviousMonthDisplay(bill.billingMonth)} (Arrears)` : 'Previous Month / Arrears');

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

      overallTotalPayable: totalAmount,
      overallTotalPaid: totalPaidOnStatement,
      overallTotalRemaining: remainingAmount,
    };

    resultOldestFirst.push({
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
    } as Bill);
  }

  // Return sorted newest-first for tenant UI views
  return resultOldestFirst.sort((a, b) => {
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
