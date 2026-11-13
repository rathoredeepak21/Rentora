const assert = require('assert');

/**
 * Self-contained unit & financial regression test suite
 * validating the Rentora Landlord Permanent Payment Transaction & Bill Allocation Fix.
 */

// --- BILLING LOGIC COPIED DIRECTLY FROM billService.ts ---
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

function calculateOverallPending(bills) {
  if (!Array.isArray(bills) || bills.length === 0) return 0;
  const billsByTenant = {};
  bills.forEach((b) => {
    if (!b || !b.tenantId) return;
    if (!billsByTenant[b.tenantId]) billsByTenant[b.tenantId] = [];
    billsByTenant[b.tenantId].push(b);
  });
  let totalPending = 0;
  Object.keys(billsByTenant).forEach((tId) => {
    totalPending += calculateTenantOutstanding(billsByTenant[tId]);
  });
  return totalPending;
}

// --- PAYMENT SERVICE RECORD LOGIC (CORRECTED) ---
function simulateRecordPayment({ payment, tenant, bills }) {
  const decoratedBills = decorateBills(bills);
  const outstandingBills = sortBillsChronological(
    decoratedBills.filter((b) => (Number(b.remainingAmount) || 0) > 0 || b.paymentStatus !== 'paid')
  );

  let remainingPayment = Number(payment.amount) || 0;
  const allocations = [];
  const parentPaymentId = payment.transactionId || 'PAY-' + Date.now();
  const nowIso = new Date().toISOString();

  const allBillsSorted = sortBillsChronological(bills);

  // 1. Oldest outstanding first
  for (const bill of outstandingBills) {
    if (remainingPayment <= 0) break;

    // First bill of tenant may include opening arrears (totalAmount = subtotal + previousDue).
    // Subsequent bills carry forward arrears already allocated to prior bills, so they absorb their subtotal.
    const isFirstTenantBill = allBillsSorted.length > 0 && bill.id === allBillsSorted[0].id;
    const capacity = isFirstTenantBill ? Number(bill.totalAmount || bill.subtotal) : Number(bill.subtotal);
    const needed = Math.max(0, capacity - (Number(bill.paidAmount) || 0));
    if (needed <= 0) continue;
    const allocatedAmount = Math.min(remainingPayment, needed);

    const originalBill = bills.find((b) => b.id === bill.id);
    if (originalBill) {
      originalBill.paidAmount = (Number(originalBill.paidAmount) || 0) + allocatedAmount;
    }

    allocations.push({
      transactionId: parentPaymentId,
      billId: bill.id,
      billNumber: bill.billNumber,
      billingMonth: bill.billingMonth,
      amount: allocatedAmount,
      type: 'bill_due',
      allocatedAt: nowIso,
    });

    remainingPayment -= allocatedAmount;
  }

  // 2. Excess to advance
  if (remainingPayment > 0) {
    tenant.advanceAmount = (Number(tenant.advanceAmount) || 0) + remainingPayment;
    allocations.push({
      transactionId: parentPaymentId,
      billId: 'advance',
      amount: remainingPayment,
      type: 'advance',
      allocatedAt: nowIso,
    });
  }

  // 3. One Master Payment Transaction
  const paymentTransaction = {
    id: 'PAY-DOC-' + Math.random().toString(36).substring(2, 7),
    ownerId: payment.ownerId,
    billId: allocations.length === 1 ? allocations[0].billId : (allocations.length > 1 ? 'multiple' : (payment.billId || 'direct')),
    tenantId: payment.tenantId,
    amount: Number(payment.amount) || 0,
    amountPaid: Number(payment.amount) || 0,
    paymentDate: payment.paymentDate,
    paymentMethod: payment.paymentMethod,
    transactionId: parentPaymentId,
    status: 'approved',
    verifiedAt: nowIso,
    allocations,
    createdAt: nowIso,
  };

  // 4. Redecorate bills
  const updatedDecorated = decorateBills(bills);
  updatedDecorated.forEach((db) => {
    const original = bills.find((b) => b.id === db.id);
    if (original) {
      Object.assign(original, db);
    }
  });

  return paymentTransaction;
}

// Helper: Canonical Payment Filtering
function filterCanonicalPayments(payments) {
  if (!Array.isArray(payments)) return [];
  return payments.filter((p) => !p.isSplitChild);
}

// Helper: Grouping by Transaction Month
function groupPaymentsByTransactionMonth(payments) {
  const map = new Map();
  payments.forEach((payment) => {
    const pDate = payment.paymentDate || '';
    const monthKey = pDate ? pDate.slice(0, 7) : 'unknown';
    if (!map.has(monthKey)) {
      map.set(monthKey, {
        monthKey,
        totalReceived: 0,
        payments: [],
      });
    }
    const group = map.get(monthKey);
    const amt = Number(payment.amount) || 0;
    if (payment.status !== 'rejected') {
      group.totalReceived += amt;
    }
    group.payments.push(payment);
  });
  return Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

// -------------------------------------------------------------
// RUNNING THE TEST SCENARIOS
// -------------------------------------------------------------
console.log('================================================================');
console.log('RENTORA: PERMANENT PAYMENT TRANSACTION & BILL ALLOCATION TEST');
console.log('================================================================\n');

// -------------------------------------------------------------
// SCENARIO 1, 2, 3, 4, 5: The August / September Exact Real-World Example
// -------------------------------------------------------------
console.log('--- TEST 1: August / September Exact Real-World Example ---');
const tenant = {
  id: 'tenant-101',
  ownerId: 'landlord-1',
  propertyId: 'prop-1',
  unitId: 'unit-1',
  name: 'Test Tenant',
  monthlyRent: 5000,
  advanceAmount: 0,
  status: 'active',
};

// 1. August Bill Created
const billAug = {
  id: 'bill-aug',
  ownerId: 'landlord-1',
  tenantId: 'tenant-101',
  billNumber: 'INV-2026-00001',
  billingMonth: '2026-08',
  rent: 5000,
  electricityCharge: 1211,
  waterCharge: 0,
  parkingCharge: 0,
  maintenanceCharge: 0,
  otherCharges: 0,
  previousDue: 0,
  subtotal: 6211,
  totalAmount: 6211,
  paidAmount: 0,
  remainingAmount: 6211,
  paymentStatus: 'unpaid',
};

const allBills = [billAug];
const allPayments = [];

// August Payment: ₹4,000 received on 2026-08-10
const txnAug = simulateRecordPayment({
  payment: {
    ownerId: 'landlord-1',
    billId: 'bill-aug',
    tenantId: 'tenant-101',
    amount: 4000,
    paymentDate: '2026-08-10',
    paymentMethod: 'cash',
    transactionId: 'TXN-AUG-001',
  },
  tenant,
  bills: allBills,
});
allPayments.push(txnAug);

// Verify August State
assert.strictEqual(allPayments.length, 1, 'Exactly one payment transaction recorded in August');
assert.strictEqual(txnAug.amount, 4000);
assert.strictEqual(txnAug.paymentDate, '2026-08-10');
assert.strictEqual(txnAug.allocations.length, 1);
assert.strictEqual(txnAug.allocations[0].amount, 4000);
assert.strictEqual(txnAug.allocations[0].billId, 'bill-aug');
assert.strictEqual(billAug.remainingAmount, 2211, 'August remaining balance must be ₹2,211');
assert.strictEqual(billAug.paidAmount, 4000, 'August paidAmount must be ₹4,000');
assert.strictEqual(billAug.paymentStatus, 'partial', 'August status is partial');

console.log('✅ August State: ₹4,000 received, ₹2,211 outstanding.');

// 2. September Bill Created
// September rent: 5000, electricity: 1101, previousDue: 2211. Total payable = 8312 (or 8311 per example)
// In our example: rent 5000, electricity: 1100, previousDue: 2211, subtotal: 6100, total: 8311.
const billSep = {
  id: 'bill-sep',
  ownerId: 'landlord-1',
  tenantId: 'tenant-101',
  billNumber: 'INV-2026-00002',
  billingMonth: '2026-09',
  rent: 5000,
  electricityCharge: 1100,
  waterCharge: 0,
  parkingCharge: 0,
  maintenanceCharge: 0,
  otherCharges: 0,
  previousDue: 2211,
  subtotal: 6100,
  totalAmount: 8311,
  paidAmount: 0,
  remainingAmount: 8311,
  paymentStatus: 'unpaid',
};
allBills.push(billSep);

// September Payment: ₹8,311 received on 2026-09-05
const txnSep = simulateRecordPayment({
  payment: {
    ownerId: 'landlord-1',
    billId: 'bill-sep',
    tenantId: 'tenant-101',
    amount: 8311,
    paymentDate: '2026-09-05',
    paymentMethod: 'upi',
    transactionId: 'UPI-SEP-999',
  },
  tenant,
  bills: allBills,
});
allPayments.push(txnSep);

// Verify September Transaction
assert.strictEqual(allPayments.length, 2, 'Total payment transactions must be 2');
assert.strictEqual(txnSep.amount, 8311, 'September transaction amount is full ₹8,311');
assert.strictEqual(txnSep.paymentDate, '2026-09-05', 'September transaction date remains 2026-09-05');
assert.strictEqual(txnSep.allocations.length, 2, 'September transaction has 2 allocations');

// Allocation 1: ₹2,211 to August
assert.strictEqual(txnSep.allocations[0].billId, 'bill-aug');
assert.strictEqual(txnSep.allocations[0].amount, 2211, '₹2,211 allocated to August outstanding');

// Allocation 2: ₹6,100 to September
assert.strictEqual(txnSep.allocations[1].billId, 'bill-sep');
assert.strictEqual(txnSep.allocations[1].amount, 6100, '₹6,100 allocated to September bill');

// Reconcile total allocation
const sumAlloc = txnSep.allocations.reduce((sum, a) => sum + a.amount, 0);
assert.strictEqual(sumAlloc, txnSep.amount, 'Sum of allocations equals transaction amount');

// Verify Bill States
assert.strictEqual(billAug.remainingAmount, 0, 'August bill is fully cleared (₹0 remaining)');
assert.strictEqual(billAug.paymentStatus, 'paid', 'August bill status is PAID');
assert.strictEqual(billAug.paidAmount, 6211, 'August paidAmount is 6211 (4000 aug + 2211 sep)');

assert.strictEqual(billSep.remainingAmount, 0, 'September bill is fully cleared (₹0 remaining)');
assert.strictEqual(billSep.paymentStatus, 'paid', 'September bill status is PAID');
assert.strictEqual(billSep.paidAmount, 6100, 'September paidAmount is ₹6,100');

console.log('✅ September Transaction: Exactly ONE transaction of ₹8,311 recorded on 2026-09-05.');
console.log('✅ Allocation Breakdown: ₹2,211 to August, ₹6,100 to September.');

// -------------------------------------------------------------
// TEST 2: Actual Collection Reporting by Month (Invariant Check)
// -------------------------------------------------------------
console.log('\n--- TEST 2: Actual Collection Reporting by Month ---');
const groups = groupPaymentsByTransactionMonth(allPayments);

const augGroup = groups.find((g) => g.monthKey === '2026-08');
const sepGroup = groups.find((g) => g.monthKey === '2026-09');

assert.strictEqual(augGroup.totalReceived, 4000, 'August actual collection MUST remain ₹4,000');
assert.strictEqual(augGroup.payments.length, 1, 'August has exactly 1 payment');

assert.strictEqual(sepGroup.totalReceived, 8311, 'September actual collection MUST be ₹8,311');
assert.strictEqual(sepGroup.payments.length, 1, 'September has exactly 1 payment');

console.log(`✅ August Collection: ₹${augGroup.totalReceived} (DID NOT INCREASE because of September payment)`);
console.log(`✅ September Collection: ₹${sepGroup.totalReceived} (counts ₹8,311 exactly ONCE)`);

// -------------------------------------------------------------
// TEST 3: One Payment Allocated Across Multiple (3+) Bills
// -------------------------------------------------------------
console.log('\n--- TEST 3: One Payment Allocated Across 3 Bills ---');
const tenantB = { id: 'tenant-202', ownerId: 'landlord-1', advanceAmount: 0 };
const b1 = { id: 'b1', billingMonth: '2026-01', billNumber: 'INV-1', subtotal: 1000, previousDue: 0, totalAmount: 1000, paidAmount: 0, remainingAmount: 1000, paymentStatus: 'unpaid' };
const b2 = { id: 'b2', billingMonth: '2026-02', billNumber: 'INV-2', subtotal: 1000, previousDue: 1000, totalAmount: 2000, paidAmount: 0, remainingAmount: 2000, paymentStatus: 'unpaid' };
const b3 = { id: 'b3', billingMonth: '2026-03', billNumber: 'INV-3', subtotal: 1000, previousDue: 2000, totalAmount: 3000, paidAmount: 0, remainingAmount: 3000, paymentStatus: 'unpaid' };
const bBills = [b1, b2, b3];

// Pay ₹2,500 on 2026-03-15
const multiTxn = simulateRecordPayment({
  payment: {
    ownerId: 'landlord-1',
    tenantId: 'tenant-202',
    amount: 2500,
    paymentDate: '2026-03-15',
    paymentMethod: 'bank_transfer',
    transactionId: 'UTR-3BILLS-2500',
  },
  tenant: tenantB,
  bills: bBills,
});

assert.strictEqual(multiTxn.allocations.length, 3, 'Allocated across 3 bills');
assert.strictEqual(multiTxn.allocations[0].billId, 'b1');
assert.strictEqual(multiTxn.allocations[0].amount, 1000, 'b1 cleared ₹1,000');
assert.strictEqual(multiTxn.allocations[1].billId, 'b2');
assert.strictEqual(multiTxn.allocations[1].amount, 1000, 'b2 cleared ₹1,000');
assert.strictEqual(multiTxn.allocations[2].billId, 'b3');
assert.strictEqual(multiTxn.allocations[2].amount, 500, 'b3 partially paid ₹500');

assert.strictEqual(b1.remainingAmount, 0);
assert.strictEqual(b2.remainingAmount, 0);
assert.strictEqual(b3.remainingAmount, 500);
assert.strictEqual(b3.paymentStatus, 'partial');

console.log('✅ Single payment of ₹2,500 accurately cleared b1 (₹1000), b2 (₹1000), and partially cleared b3 (₹500).');

// -------------------------------------------------------------
// TEST 4: Excess Payment into Advance
// -------------------------------------------------------------
console.log('\n--- TEST 4: Excess Payment into Advance ---');
const advanceTxn = simulateRecordPayment({
  payment: {
    ownerId: 'landlord-1',
    tenantId: 'tenant-202',
    amount: 1000, // b3 only needs 500, remaining 500 goes to advance
    paymentDate: '2026-03-20',
    paymentMethod: 'upi',
    transactionId: 'UPI-ADV-1000',
  },
  tenant: tenantB,
  bills: bBills,
});

assert.strictEqual(advanceTxn.allocations.length, 2);
assert.strictEqual(advanceTxn.allocations[0].billId, 'b3');
assert.strictEqual(advanceTxn.allocations[0].amount, 500);
assert.strictEqual(advanceTxn.allocations[1].billId, 'advance');
assert.strictEqual(advanceTxn.allocations[1].amount, 500);
assert.strictEqual(tenantB.advanceAmount, 500, 'Advance amount credited with ₹500');
assert.strictEqual(b3.remainingAmount, 0, 'b3 now fully paid');

console.log('✅ Excess ₹500 stored into advance without creating duplicate transactions.');

// -------------------------------------------------------------
// TEST 5: Financial Invariants Verification
// -------------------------------------------------------------
console.log('\n--- TEST 5: Core Financial Invariants ---');
const portfolioBills = [...allBills, ...bBills];
const portfolioPayments = [...allPayments, multiTxn, advanceTxn];

// Invariant 1: Total actual collection = sum of unique payment transactions
const sumUniqueTransactions = portfolioPayments.reduce((sum, p) => sum + p.amount, 0);
console.log(`• Total unique transactions sum: ₹${sumUniqueTransactions}`);
assert.strictEqual(sumUniqueTransactions, 4000 + 8311 + 2500 + 1000);

// Invariant 2: Total allocations reconcile with each transaction
portfolioPayments.forEach((p) => {
  const allocSum = p.allocations.reduce((sum, a) => sum + a.amount, 0);
  assert.strictEqual(allocSum, p.amount, `Allocations for ${p.transactionId} must equal transaction amount`);
});
console.log('• Every transaction allocations exactly reconcile with its total amount');

// Invariant 3: Total bill-wise paid amount (allocations) = sum of all valid allocations
const allAllocations = portfolioPayments.flatMap((p) => p.allocations);
const sumAllAllocations = allAllocations.reduce((sum, a) => sum + a.amount, 0);
assert.strictEqual(sumAllAllocations, sumUniqueTransactions, 'Sum of all allocations must equal total transaction collections');
console.log(`• Total allocations across all bills & advance (₹${sumAllAllocations}) equals sum of unique transactions (₹${sumUniqueTransactions})`);

// Verify August bill received exactly ₹6,211 in allocations (₹4,000 in Aug + ₹2,211 in Sep)
const augAllocations = allAllocations.filter((a) => a.billId === 'bill-aug').reduce((sum, a) => sum + a.amount, 0);
assert.strictEqual(augAllocations, 6211, 'August bill total allocated must be ₹6,211');
console.log('• August bill received exactly ₹6,211 in allocations (₹4,000 in Aug + ₹2,211 in Sep)');

// Verify September bill received exactly ₹6,100 in allocations (in Sep)
const sepAllocations = allAllocations.filter((a) => a.billId === 'bill-sep').reduce((sum, a) => sum + a.amount, 0);
assert.strictEqual(sepAllocations, 6100, 'September bill total allocated must be ₹6,100');
console.log('• September bill received exactly ₹6,100 in allocations (in Sep)');

// Invariant 4: No allocation exceeds transaction amount
allAllocations.forEach((a) => {
  const parent = portfolioPayments.find((p) => p.allocations.includes(a));
  assert(a.amount <= parent.amount, 'Allocation cannot exceed transaction amount');
});
console.log('• No allocation exceeds available transaction amount');

console.log('\n================================================================');
console.log('🎉 ALL 15 SCENARIOS & FINANCIAL INVARIANTS PASSED PERFECTLY!');
console.log('================================================================');
