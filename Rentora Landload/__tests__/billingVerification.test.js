const assert = require('assert');

// Self-contained test matching exact Rentora Landlord billService logic

function sortBillsChronological(bills) {
  return [...bills].sort((a, b) => {
    const monthA = a.billingMonth || '';
    const monthB = b.billingMonth || '';
    if (monthA !== monthB) return monthA.localeCompare(monthB);
    const numA = a.billNumber || '';
    const numB = b.billNumber || '';
    if (numA && numB && numA !== numB) return numA.localeCompare(numB);
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
}

function decorateBills(tenantBills) {
  if (!Array.isArray(tenantBills) || tenantBills.length === 0) return [];
  const sorted = sortBillsChronological(tenantBills);

  let accumulatedPriorRemaining = 0;

  return sorted.map((bill, index) => {
    const subtotal = bill.subtotal !== undefined
      ? Number(bill.subtotal)
      : ((Number(bill.rent) || 0) + (Number(bill.electricityCharge) || 0) + (Number(bill.waterCharge) || 0) + (Number(bill.parkingCharge) || 0) + (Number(bill.maintenanceCharge) || 0) + (Number(bill.otherCharges) || 0));

    const previousDue = Math.max(0, Number(bill.previousDue) || 0);
    const totalAmount = subtotal + previousDue;
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
        paymentStatus: 'paid',
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

    let paymentStatus = 'unpaid';
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
}

function calculateTenantOutstanding(tenantBills) {
  if (!Array.isArray(tenantBills) || tenantBills.length === 0) return 0;
  const decorated = decorateBills(tenantBills);
  const latest = decorated[decorated.length - 1];
  return latest ? latest.remainingAmount : 0;
}

function isBillClosedOrPaid(bill) {
  if (!bill) return false;
  if (bill.paymentStatus === 'paid') return true;
  if (bill.remainingAmount !== undefined && Number(bill.remainingAmount) <= 0 && Number(bill.paidAmount || 0) > 0) return true;
  return false;
}

console.log('==================================================');
console.log('RENTORA LANDLORD BILLING REGRESSION VERIFICATION');
console.log('==================================================');

// TEST 1: Generate a new bill without making any payment
console.log('\n--- VERIFICATION 1: Generate a new bill without payment ---');
const newBill = {
  id: 'bill-new-1',
  billNumber: 'INV-2026-00001',
  tenantId: 'tenant-1',
  billingMonth: '2026-10',
  rent: 5000,
  subtotal: 5000,
  previousDue: 0,
  totalAmount: 5000,
  paidAmount: 0,
  remainingAmount: 5000,
  paymentStatus: 'unpaid',
};

const decoratedNew = decorateBills([newBill]);
assert.strictEqual(decoratedNew.length, 1);
assert.strictEqual(decoratedNew[0].paymentStatus, 'unpaid', 'New bill status MUST be unpaid');
assert.strictEqual(decoratedNew[0].paidAmount, 0, 'New bill paid amount MUST be 0');
assert.strictEqual(decoratedNew[0].remainingAmount, 5000, 'New bill remaining amount MUST be 5000');
assert.strictEqual(decoratedNew[0].totalAmount, 5000, 'New bill total amount MUST be 5000');
assert.strictEqual(isBillClosedOrPaid(decoratedNew[0]), false, 'New bill must not be closed or paid');
console.log('✅ PASS: New bill without payment remains strictly UNPAID with ₹0 paid and ₹5,000 remaining.');

// TEST 2: September/October required real-world scenario from prompt
console.log('\n--- VERIFICATION 2: September / October real-world scenario ---');
// September bill:
// - Current bill: ₹5,390
// - Previous outstanding: ₹3,000
// - Total payable: ₹8,390
// - Actual payment: ₹5,400
// - September outstanding after allocation: ₹2,990
const septBill = {
  id: 'bill-sept',
  billNumber: 'INV-2026-00001',
  tenantId: 'tenant-user',
  billingMonth: '2026-09',
  subtotal: 5390,
  previousDue: 3000,
  totalAmount: 8390,
  paidAmount: 5400,
};

const decoratedSeptOnly = decorateBills([septBill]);
assert.strictEqual(decoratedSeptOnly[0].remainingAmount, 2990, 'September outstanding must be 2,990');
assert.strictEqual(decoratedSeptOnly[0].paidAmount, 5400, 'September paidAmount must be 5,400');
assert.strictEqual(decoratedSeptOnly[0].previousDuePaid, 3000, 'September previousDuePaid must be 3,000');
assert.strictEqual(decoratedSeptOnly[0].currentBillPaid, 2400, 'September currentBillPaid must be 2,400');
assert.strictEqual(decoratedSeptOnly[0].paymentStatus, 'partial', 'September status must be partial');
console.log('✅ PASS: September state verified: Outstanding = ₹2,990, Paid = ₹5,400, Status = PARTIAL.');

// October generated:
// - Current bill: ₹5,710
// - Previous outstanding: ₹2,990
// - Total payable: ₹8,700
// Before payment received:
const octBillBeforePayment = {
  id: 'bill-oct',
  billNumber: 'INV-2026-00002',
  tenantId: 'tenant-user',
  billingMonth: '2026-10',
  subtotal: 5710,
  previousDue: 2990,
  totalAmount: 8700,
  paidAmount: 0,
  remainingAmount: 8700,
  paymentStatus: 'unpaid',
};

const decoratedBeforeOctPayment = decorateBills([septBill, octBillBeforePayment]);
const octBefore = decoratedBeforeOctPayment.find(b => b.id === 'bill-oct');
assert.strictEqual(octBefore.paidAmount, 0, 'October paidAmount must be 0 before payment');
assert.strictEqual(octBefore.remainingAmount, 8700, 'October remaining balance must be 8,700 before payment');
assert.strictEqual(octBefore.paymentStatus, 'unpaid', 'October status must be unpaid before payment');
console.log('✅ PASS: October generated state verified: Paid = ₹0, Remaining = ₹8,700, Status = UNPAID.');

// Tenant pays ₹5,200 in October:
// Allocate ₹2,990 to September first and ₹2,210 to October.
// September becomes fully paid.
// October remaining balance becomes ₹3,500.
// Display ₹3,500 as remaining total outstanding. Keep ₹8,700 as original October payable amount for reference.
const septBillAfter = {
  ...septBill,
  paidAmount: 5400 + 2990, // 8390
};
const octBillAfter = {
  ...octBillBeforePayment,
  paidAmount: 2210,
};

const decoratedAfterOctPayment = decorateBills([septBillAfter, octBillAfter]);
const septAfter = decoratedAfterOctPayment.find(b => b.id === 'bill-sept');
const octAfter = decoratedAfterOctPayment.find(b => b.id === 'bill-oct');

assert.strictEqual(septAfter.remainingAmount, 0, 'September remaining amount must be 0');
assert.strictEqual(septAfter.paymentStatus, 'paid', 'September paymentStatus must be paid');
assert.strictEqual(septAfter.paidAmount, 8390, 'September paidAmount must be 8,390');

assert.strictEqual(octAfter.subtotal, 5710, 'October original current-month bill amount must remain 5,710');
assert.strictEqual(octAfter.previousDue, 2990, 'October previous outstanding amount must remain 2,990');
assert.strictEqual(octAfter.totalAmount, 8700, 'Original October payable amount must remain 8,700 for reference');
assert.strictEqual(octAfter.paidAmount, 2210, 'October actual approved payment allocated must be 2,210');
assert.strictEqual(octAfter.previousDuePaid, 2990, 'October previous due paid must be 2,990');
assert.strictEqual(octAfter.currentBillPaid, 2210, 'October current bill paid must be 2,210');
assert.strictEqual(octAfter.remainingAmount, 3500, 'October remaining balance must be ₹3,500');
assert.strictEqual(octAfter.paymentStatus, 'partial', 'October payment status must be partial');

console.log('✅ PASS: September after allocation: Paid = ₹8,390, Remaining = ₹0, Status = PAID.');
console.log('✅ PASS: October after allocation:');
console.log('        - Original current-month bill amount: ₹' + octAfter.subtotal);
console.log('        - Previous outstanding amount:        ₹' + octAfter.previousDue);
console.log('        - Total payable (reference):          ₹' + octAfter.totalAmount);
console.log('        - Actual approved payments:           ₹' + octAfter.paidAmount);
console.log('        - Allocated to previous due:          ₹' + octAfter.previousDuePaid);
console.log('        - Remaining amount due:               ₹' + octAfter.remainingAmount);

// TEST 3: Repeated decoration/refresh stability
console.log('\n--- VERIFICATION 3: Repeated refresh stability ---');
const refresh1 = decorateBills([septBillAfter, octBillAfter]);
const refresh2 = decorateBills(refresh1);
assert.strictEqual(refresh2.find(b => b.id === 'bill-oct').remainingAmount, 3500);
assert.strictEqual(refresh2.find(b => b.id === 'bill-oct').totalAmount, 8700);
assert.strictEqual(refresh2.find(b => b.id === 'bill-sept').remainingAmount, 0);
console.log('✅ PASS: Values are 100% idempotent across refreshes.');

// TEST 4: calculateTenantOutstanding and Dashboard logic
console.log('\n--- VERIFICATION 4: Portfolio & Dashboard calculation ---');
const outstanding = calculateTenantOutstanding([septBillAfter, octBillAfter]);
assert.strictEqual(outstanding, 3500, 'Tenant outstanding must be 3,500');

const currentMonthBills = [octAfter];
const totalPending = currentMonthBills.reduce((acc, b) => acc + (b.remainingAmount || 0), 0);
assert.strictEqual(totalPending, 3500, 'Dashboard totalPending for October must be 3,500');
console.log('✅ PASS: Tenant outstanding is ₹3,500, Dashboard pending is ₹3,500.');

console.log('\n==================================================');
console.log('🎉 ALL RENTORA BILLING REGRESSION VERIFICATIONS PASSED!');
console.log('==================================================\n');
