const assert = require('assert');

/**
 * Rentora Landlord App - PDF Payment Details & Allocation Verification Test Suite
 * Tests all 8 required scenarios per specification:
 * 1. No payment received: monthly received amount is ₹0 and balance remains correct
 * 2. One partial payment: actual received amount, allocation, and remaining balance are correct
 * 3. Previous due cleared first: previous outstanding is cleared before remainder is applied to current bill
 * 4. Multiple payments in one month: monthly total is correct without duplication
 * 5. Payments in different months: each payment is associated with its actual payment date/month
 * 6. Fully paid invoice: received amount and remaining balance display correctly
 * 7. Pending / rejected payment: not incorrectly counted as received
 * 8. Generate same PDF more than once: balances and records do not change (read-only)
 */

const formatPaymentMonthYear = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return { monthKey: '', monthLabel: '' };
  try {
    const trimmed = dateStr.trim();
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const monthIdx = parseInt(isoMatch[2], 10) - 1;
      const d = new Date(year, monthIdx, 1);
      return {
        monthKey: `${isoMatch[1]}-${isoMatch[2]}`,
        monthLabel: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      };
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return {
        monthKey,
        monthLabel: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      };
    }
  } catch {}
  return { monthKey: String(dateStr), monthLabel: String(dateStr) };
};

const formatMonth = (monthStr) => {
  try {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } catch (e) {
    return monthStr;
  }
};

function computePdfPaymentDetails(bill, paymentsList = []) {
  // 1. Filter approved payments only
  const approvedPayments = paymentsList.filter(p => {
    if (p.status === 'rejected' || p.status === 'pending') return false;
    return p.status === 'approved' || (!p.status && (Number(p.amount) || Number(p.amountPaid) || 0) > 0);
  });
  approvedPayments.sort((a, b) => (a.paymentDate || '').localeCompare(b.paymentDate || ''));

  // 2. Group approved payments by payment month
  const paymentsByMonth = new Map();
  approvedPayments.forEach(p => {
    const { monthKey, monthLabel } = formatPaymentMonthYear(p.paymentDate);
    const amt = Number(p.amount) || Number(p.amountPaid) || 0;
    if (!monthKey) return;
    if (!paymentsByMonth.has(monthKey)) {
      paymentsByMonth.set(monthKey, {
        monthKey,
        monthLabel,
        totalReceived: 0,
        payments: []
      });
    }
    const group = paymentsByMonth.get(monthKey);
    group.totalReceived += amt;
    group.payments.push(p);
  });
  const monthGroups = Array.from(paymentsByMonth.values());

  // 3. Financial amounts calculation
  const currentBillTotal = Number(bill.subtotal) || (
    (Number(bill.rent) || 0) +
    (Number(bill.electricityCharge) || 0) +
    (Number(bill.waterCharge) || 0) +
    (Number(bill.parkingCharge) || 0) +
    (Number(bill.maintenanceCharge) || 0) +
    (Number(bill.otherCharges) || 0)
  );
  const previousDue = Math.max(0, Number(bill.previousDue) || 0);
  const hasPrevDue = previousDue > 0;
  const totalPayable = Number(bill.totalAmount) || (currentBillTotal + previousDue);

  const approvedSum = approvedPayments.reduce((sum, p) => sum + (Number(p.amount) || Number(p.amountPaid) || 0), 0);
  const totalReceived = approvedSum > 0 ? approvedSum : Math.max(0, Number(bill.paidAmount) || 0);

  let previousDuePaid = 0;
  let currentBillPaid = 0;
  if (bill.previousDuePaid !== undefined && bill.currentBillPaid !== undefined) {
    previousDuePaid = Math.max(0, Number(bill.previousDuePaid));
    currentBillPaid = Math.max(0, Number(bill.currentBillPaid));
  } else {
    previousDuePaid = Math.min(previousDue, totalReceived);
    currentBillPaid = Math.min(currentBillTotal, Math.max(0, totalReceived - previousDuePaid));
  }

  const isPaid = bill.paymentStatus === 'paid' || (bill.remainingAmount !== undefined && Number(bill.remainingAmount) <= 0 && (totalPayable > 0 || totalReceived > 0));
  let remainingAmountDue = 0;
  if (isPaid) {
    remainingAmountDue = 0;
  } else if (bill.remainingAmount !== undefined) {
    remainingAmountDue = Math.max(0, Number(bill.remainingAmount));
  } else {
    remainingAmountDue = Math.max(0, totalPayable - (previousDuePaid + currentBillPaid));
  }

  const formattedBillingMonth = formatMonth(bill.billingMonth);
  let dynamicPaymentReceivedHeading = '';
  if (monthGroups.length === 1) {
    dynamicPaymentReceivedHeading = `Payment Received in ${monthGroups[0].monthLabel}`;
  } else if (monthGroups.length > 1) {
    const labels = monthGroups.map(g => g.monthLabel).join(', ');
    dynamicPaymentReceivedHeading = `Payment Received (${labels})`;
  } else {
    dynamicPaymentReceivedHeading = `Payment Received in ${formattedBillingMonth}`;
  }

  const isPartial = !isPaid && totalReceived > 0 && remainingAmountDue > 0;
  const statusLabel = isPaid ? 'PAID' : isPartial ? 'PARTIALLY PAID' : 'UNPAID';

  return {
    dynamicPaymentReceivedHeading,
    currentBillTotal,
    previousDue,
    hasPrevDue,
    totalPayable,
    totalReceived,
    previousDuePaid,
    currentBillPaid,
    remainingAmountDue,
    statusLabel,
    monthGroups,
  };
}

console.log('================================================================');
console.log('RENTORA LANDLORD APP: PDF PAYMENT DETAILS & ALLOCATION TEST SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Scenario 1: No payment received
// -----------------------------------------------------------------------------
{
  const bill = {
    billingMonth: '2026-10',
    rent: 5000,
    electricityCharge: 710,
    subtotal: 5710,
    previousDue: 2990,
    totalAmount: 8700,
    paidAmount: 0,
    remainingAmount: 8700,
    paymentStatus: 'unpaid'
  };
  const res = computePdfPaymentDetails(bill, []);

  assert.strictEqual(res.dynamicPaymentReceivedHeading, 'Payment Received in October 2026');
  assert.strictEqual(res.totalReceived, 0);
  assert.strictEqual(res.previousDuePaid, 0);
  assert.strictEqual(res.currentBillPaid, 0);
  assert.strictEqual(res.remainingAmountDue, 8700);
  assert.strictEqual(res.statusLabel, 'UNPAID');
  console.log('✅ Scenario 1 Passed: No payment received shows ₹0, preserves balance ₹8,700, status UNPAID');
}

// -----------------------------------------------------------------------------
// Scenario 2: One partial payment
// -----------------------------------------------------------------------------
{
  const bill = {
    billingMonth: '2026-10',
    subtotal: 5000,
    previousDue: 0,
    totalAmount: 5000,
    paidAmount: 2000,
    remainingAmount: 3000,
    paymentStatus: 'partial'
  };
  const payments = [
    { amount: 2000, paymentDate: '2026-10-10', status: 'approved', paymentMethod: 'upi', transactionId: 'UPI123' }
  ];
  const res = computePdfPaymentDetails(bill, payments);

  assert.strictEqual(res.dynamicPaymentReceivedHeading, 'Payment Received in October 2026');
  assert.strictEqual(res.totalReceived, 2000);
  assert.strictEqual(res.currentBillPaid, 2000);
  assert.strictEqual(res.remainingAmountDue, 3000);
  assert.strictEqual(res.statusLabel, 'PARTIALLY PAID');
  console.log('✅ Scenario 2 Passed: Single partial payment received ₹2,000, remaining ₹3,000, status PARTIALLY PAID');
}

// -----------------------------------------------------------------------------
// Scenario 3: Previous due cleared first (The specification scenario)
// -----------------------------------------------------------------------------
{
  const bill = {
    billingMonth: '2026-10',
    subtotal: 5710,
    previousDue: 2990,
    totalAmount: 8700,
    paidAmount: 5200,
    remainingAmount: 3500,
    previousDuePaid: 2990,
    currentBillPaid: 2210,
    paymentStatus: 'partial'
  };
  const payments = [
    { amount: 5200, paymentDate: '2026-10-15', status: 'approved', paymentMethod: 'upi', transactionId: 'UPI-987654' }
  ];
  const res = computePdfPaymentDetails(bill, payments);

  assert.strictEqual(res.dynamicPaymentReceivedHeading, 'Payment Received in October 2026');
  assert.strictEqual(res.totalPayable, 8700);
  assert.strictEqual(res.totalReceived, 5200);
  assert.strictEqual(res.previousDuePaid, 2990);
  assert.strictEqual(res.currentBillPaid, 2210);
  assert.strictEqual(res.remainingAmountDue, 3500);
  assert.strictEqual(res.statusLabel, 'PARTIALLY PAID');
  console.log('✅ Scenario 3 Passed: Previous due cleared first (₹2,990), applied to month (₹2,210), remaining (₹3,500)');
}

// -----------------------------------------------------------------------------
// Scenario 4: Multiple payments in one month
// -----------------------------------------------------------------------------
{
  const bill = {
    billingMonth: '2026-10',
    subtotal: 5710,
    previousDue: 2990,
    totalAmount: 8700,
    paymentStatus: 'partial'
  };
  const payments = [
    { amount: 3000, paymentDate: '2026-10-05', status: 'approved', paymentMethod: 'upi', transactionId: 'TXN1' },
    { amount: 2200, paymentDate: '2026-10-15', status: 'approved', paymentMethod: 'cash' }
  ];
  const res = computePdfPaymentDetails(bill, payments);

  assert.strictEqual(res.monthGroups.length, 1);
  assert.strictEqual(res.dynamicPaymentReceivedHeading, 'Payment Received in October 2026');
  assert.strictEqual(res.totalReceived, 5200);
  assert.strictEqual(res.monthGroups[0].totalReceived, 5200);
  assert.strictEqual(res.monthGroups[0].payments.length, 2);
  assert.strictEqual(res.previousDuePaid, 2990);
  assert.strictEqual(res.currentBillPaid, 2210);
  assert.strictEqual(res.remainingAmountDue, 3500);
  console.log('✅ Scenario 4 Passed: Multiple payments in same month correctly summed to ₹5,200 without duplication');
}

// -----------------------------------------------------------------------------
// Scenario 5: Payments in different months
// -----------------------------------------------------------------------------
{
  const bill = {
    billingMonth: '2026-10',
    subtotal: 5710,
    previousDue: 2990,
    totalAmount: 8700,
    paymentStatus: 'partial'
  };
  const payments = [
    { amount: 3000, paymentDate: '2026-10-20', status: 'approved', paymentMethod: 'upi', transactionId: 'OCT_PAY' },
    { amount: 2200, paymentDate: '2026-11-02', status: 'approved', paymentMethod: 'bank_transfer', transactionId: 'NOV_PAY' }
  ];
  const res = computePdfPaymentDetails(bill, payments);

  assert.strictEqual(res.monthGroups.length, 2);
  assert.strictEqual(res.monthGroups[0].monthLabel, 'October 2026');
  assert.strictEqual(res.monthGroups[0].totalReceived, 3000);
  assert.strictEqual(res.monthGroups[1].monthLabel, 'November 2026');
  assert.strictEqual(res.monthGroups[1].totalReceived, 2200);
  assert.strictEqual(res.totalReceived, 5200);
  assert.strictEqual(res.dynamicPaymentReceivedHeading, 'Payment Received (October 2026, November 2026)');
  assert.strictEqual(res.remainingAmountDue, 3500);
  console.log('✅ Scenario 5 Passed: Payments in different months correctly grouped and labeled dynamically');
}

// -----------------------------------------------------------------------------
// Scenario 6: Fully paid invoice
// -----------------------------------------------------------------------------
{
  const bill = {
    billingMonth: '2026-10',
    subtotal: 5710,
    previousDue: 2990,
    totalAmount: 8700,
    paidAmount: 8700,
    remainingAmount: 0,
    previousDuePaid: 2990,
    currentBillPaid: 5710,
    paymentStatus: 'paid'
  };
  const payments = [
    { amount: 8700, paymentDate: '2026-10-18', status: 'approved', paymentMethod: 'upi', transactionId: 'FULL_PAID' }
  ];
  const res = computePdfPaymentDetails(bill, payments);

  assert.strictEqual(res.totalReceived, 8700);
  assert.strictEqual(res.previousDuePaid, 2990);
  assert.strictEqual(res.currentBillPaid, 5710);
  assert.strictEqual(res.remainingAmountDue, 0);
  assert.strictEqual(res.statusLabel, 'PAID');
  console.log('✅ Scenario 6 Passed: Fully paid bill shows received ₹8,700, remaining ₹0, status PAID');
}

// -----------------------------------------------------------------------------
// Scenario 7: Pending or rejected payments must not count as received
// -----------------------------------------------------------------------------
{
  const bill = {
    billingMonth: '2026-10',
    subtotal: 5710,
    previousDue: 2990,
    totalAmount: 8700,
    paidAmount: 2000,
    remainingAmount: 6700,
    paymentStatus: 'partial'
  };
  const payments = [
    { amount: 2000, paymentDate: '2026-10-12', status: 'approved', paymentMethod: 'upi', transactionId: 'OK_PAY' },
    { amount: 3000, paymentDate: '2026-10-14', status: 'pending', paymentMethod: 'upi', transactionId: 'PENDING_PAY' },
    { amount: 1500, paymentDate: '2026-10-16', status: 'rejected', paymentMethod: 'upi', transactionId: 'REJECTED_PAY' }
  ];
  const res = computePdfPaymentDetails(bill, payments);

  assert.strictEqual(res.totalReceived, 2000);
  assert.strictEqual(res.remainingAmountDue, 6700);
  assert.strictEqual(res.previousDuePaid, 2000);
  assert.strictEqual(res.currentBillPaid, 0);
  assert.strictEqual(res.statusLabel, 'PARTIALLY PAID');
  console.log('✅ Scenario 7 Passed: Pending (₹3,000) and Rejected (₹1,500) ignored; only approved ₹2,000 counted');
}

// -----------------------------------------------------------------------------
// Scenario 8: Generate same PDF more than once does not alter data (read-only)
// -----------------------------------------------------------------------------
{
  const bill = {
    id: 'BILL_001',
    billingMonth: '2026-10',
    subtotal: 5710,
    previousDue: 2990,
    totalAmount: 8700,
    paidAmount: 5200,
    remainingAmount: 3500,
    previousDuePaid: 2990,
    currentBillPaid: 2210,
    paymentStatus: 'partial'
  };
  const originalBillCopy = JSON.stringify(bill);

  const payments = [
    { id: 'PAY_1', amount: 5200, paymentDate: '2026-10-15', status: 'approved' }
  ];
  const originalPaymentsCopy = JSON.stringify(payments);

  const resRun1 = computePdfPaymentDetails(bill, payments);
  const resRun2 = computePdfPaymentDetails(bill, payments);
  const resRun3 = computePdfPaymentDetails(bill, payments);

  assert.deepStrictEqual(resRun1, resRun2);
  assert.deepStrictEqual(resRun2, resRun3);
  assert.strictEqual(JSON.stringify(bill), originalBillCopy);
  assert.strictEqual(JSON.stringify(payments), originalPaymentsCopy);
  console.log('✅ Scenario 8 Passed: Multiple invocations produce identical results with zero mutation (read-only)');
}

console.log('\n================================================================');
console.log('🎉 ALL 8 SCENARIOS PASSED WITH 100% ACCURACY!');
console.log('================================================================\n');
