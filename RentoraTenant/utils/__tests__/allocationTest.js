// Test suite for Rentora Billing and Payment Allocation Logic

const { calculateBillAllocation, decorateTenantBills } = require('../billingAllocation.ts');

let allPassed = true;
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    allPassed = false;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('==================================================');
console.log('RUNNING RENTORA BILLING ALLOCATION VERIFICATION SUITE');
console.log('==================================================\n');

// TEST 1: User's Required Exact Scenario (3000 arrears + 5390 current bill, 5400 paid)
const t1 = calculateBillAllocation({ subtotal: 5390, previousDue: 3000, billingMonth: '2026-09' }, 5400);
assert(t1.totalOutstanding === 2990, `TEST 1: Outstanding = ${t1.totalOutstanding} (expected 2990)`);
assert(t1.previousDuePaid === 3000, `TEST 1: previousDuePaid = ${t1.previousDuePaid} (expected 3000)`);
assert(t1.previousDueRemaining === 0, `TEST 1: previousDueRemaining = ${t1.previousDueRemaining} (expected 0)`);
assert(t1.currentBillPaid === 2400, `TEST 1: currentBillPaid = ${t1.currentBillPaid} (expected 2400)`);
assert(t1.currentBillRemaining === 2990, `TEST 1: currentBillRemaining = ${t1.currentBillRemaining} (expected 2990)`);

// Month-Wise Accounting verification for TEST 1
const m1 = t1.monthWiseAccounting;
assert(m1.hasPreviousDue === true, `TEST 1 (MWA): hasPreviousDue is true`);
assert(m1.previousMonthOriginal === 3000, `TEST 1 (MWA): previousMonthOriginal = ${m1.previousMonthOriginal} (expected 3000)`);
assert(m1.previousMonthPaid === 3000, `TEST 1 (MWA): previousMonthPaid = ${m1.previousMonthPaid} (expected 3000)`);
assert(m1.previousMonthRemaining === 0, `TEST 1 (MWA): previousMonthRemaining = ${m1.previousMonthRemaining} (expected 0)`);
assert(m1.previousMonthStatus === 'paid', `TEST 1 (MWA): previousMonthStatus = ${m1.previousMonthStatus} (expected 'paid')`);
assert(m1.currentMonthOriginal === 5390, `TEST 1 (MWA): currentMonthOriginal = ${m1.currentMonthOriginal} (expected 5390)`);
assert(m1.currentMonthPaid === 2400, `TEST 1 (MWA): currentMonthPaid = ${m1.currentMonthPaid} (expected 2400)`);
assert(m1.currentMonthRemaining === 2990, `TEST 1 (MWA): currentMonthRemaining = ${m1.currentMonthRemaining} (expected 2990)`);
assert(m1.currentMonthStatus === 'partial', `TEST 1 (MWA): currentMonthStatus = ${m1.currentMonthStatus} (expected 'partial')`);
assert(m1.overallTotalPayable === 8390, `TEST 1 (MWA): overallTotalPayable = ${m1.overallTotalPayable} (expected 8390)`);
assert(m1.overallTotalPaid === 5400, `TEST 1 (MWA): overallTotalPaid = ${m1.overallTotalPaid} (expected 5400)`);
assert(m1.overallTotalRemaining === 2990, `TEST 1 (MWA): overallTotalRemaining = ${m1.overallTotalRemaining} (expected 2990)`);

// TEST 2: Exact payment covering only previous due (3000 paid)
const t2 = calculateBillAllocation({ subtotal: 5390, previousDue: 3000 }, 3000);
assert(t2.totalOutstanding === 5390, `TEST 2: Outstanding = ${t2.totalOutstanding} (expected 5390)`);
assert(t2.previousDuePaid === 3000, `TEST 2: previousDuePaid = ${t2.previousDuePaid} (expected 3000)`);
assert(t2.monthWiseAccounting.previousMonthStatus === 'paid', `TEST 2: previousMonthStatus = paid`);
assert(t2.monthWiseAccounting.currentMonthPaid === 0, `TEST 2: currentMonthPaid = 0`);
assert(t2.monthWiseAccounting.currentMonthStatus === 'unpaid', `TEST 2: currentMonthStatus = unpaid`);

// TEST 3: Partial payment of 1000 (Prompt Partial Payment Example)
const t3 = calculateBillAllocation({ subtotal: 5390, previousDue: 3000 }, 1000);
assert(t3.totalOutstanding === 7390, `TEST 3: Outstanding = ${t3.totalOutstanding} (expected 7390)`);
assert(t3.previousDuePaid === 1000, `TEST 3: previousDuePaid = ${t3.previousDuePaid} (expected 1000)`);
assert(t3.previousDueRemaining === 2000, `TEST 3: previousDueRemaining = ${t3.previousDueRemaining} (expected 2000)`);
assert(t3.monthWiseAccounting.previousMonthStatus === 'partial', `TEST 3: previousMonthStatus = partial`);
assert(t3.currentBillPaid === 0, `TEST 3: currentBillPaid = ${t3.currentBillPaid} (expected 0)`);
assert(t3.monthWiseAccounting.currentMonthStatus === 'unpaid', `TEST 3: currentMonthStatus = unpaid`);

// TEST 4: Full payment of 8390 (Prompt Full Payment Example)
const t4 = calculateBillAllocation({ subtotal: 5390, previousDue: 3000 }, 8390);
assert(t4.totalOutstanding === 0, `TEST 4: Outstanding = ${t4.totalOutstanding} (expected 0)`);
assert(t4.paymentStatus === 'paid', `TEST 4: paymentStatus = ${t4.paymentStatus} (expected 'paid')`);
assert(t4.monthWiseAccounting.previousMonthStatus === 'paid', `TEST 4: previousMonthStatus = paid`);
assert(t4.monthWiseAccounting.currentMonthStatus === 'paid', `TEST 4: currentMonthStatus = paid`);
assert(t4.previousDueRemaining === 0, `TEST 4: previousDueRemaining = 0`);
assert(t4.currentBillRemaining === 0, `TEST 4: currentBillRemaining = 0`);

// TEST 5: Prompt Multiple Older Bills Example
// Jan remaining = 1000, Feb remaining = 2000, March current = 5000. Tenant pays 4000.
const billsT5 = [
  { id: 'b1', billingMonth: '2026-01', subtotal: 1000, previousDue: 0, rent: 1000 },
  { id: 'b2', billingMonth: '2026-02', subtotal: 2000, previousDue: 0, rent: 2000 },
  { id: 'b3', billingMonth: '2026-03', subtotal: 5000, previousDue: 0, rent: 5000 },
];
// Total approved payment pool: 4000
const paymentsT5 = [
  { id: 'p-pool', billId: 'b3', amount: 4000, status: 'approved' },
];
const decoratedT5 = decorateTenantBills(billsT5, paymentsT5);
const b1Result = decoratedT5.find(b => b.id === 'b1');
const b2Result = decoratedT5.find(b => b.id === 'b2');
const b3Result = decoratedT5.find(b => b.id === 'b3');

assert(b1Result.paidAmount === 1000 && b1Result.remainingAmount === 0 && b1Result.paymentStatus === 'paid',
  `TEST 5: Jan Paid = 1000, Rem = 0, Status = PAID`);
assert(b2Result.paidAmount === 2000 && b2Result.remainingAmount === 0 && b2Result.paymentStatus === 'paid',
  `TEST 5: Feb Paid = 2000, Rem = 0, Status = PAID`);
assert(b3Result.currentBillPaid === 1000 && b3Result.remainingAmount === 4000 && b3Result.paymentStatus === 'partial',
  `TEST 5: March Paid = 1000, Rem = 4000, Status = PARTIAL`);

// TEST 6: Multiple partial payments totaling 5400 for 8390
const billsT6 = [{ id: 'b-main', billingMonth: '2026-04', subtotal: 5390, previousDue: 3000, rent: 4500, electricityCharge: 890 }];
const paymentsT6 = [
  { id: 'p6-1', billId: 'b-main', amount: 2000, status: 'approved' },
  { id: 'p6-2', billId: 'b-main', amount: 3400, status: 'approved' },
];
const decoratedT6 = decorateTenantBills(billsT6, paymentsT6);
assert(decoratedT6[0].remainingAmount === 2990, `TEST 6: Outstanding = ${decoratedT6[0].remainingAmount} (expected 2990)`);
assert(decoratedT6[0].paidAmount === 5400, `TEST 6: paidAmount = ${decoratedT6[0].paidAmount} (expected 5400)`);
assert(decoratedT6[0].previousDuePaid === 3000, `TEST 6: previousDuePaid = ${decoratedT6[0].previousDuePaid} (expected 3000)`);
assert(decoratedT6[0].currentBillPaid === 2400, `TEST 6: currentBillPaid = ${decoratedT6[0].currentBillPaid} (expected 2400)`);

// TEST 7: Rejected payment must NOT reduce outstanding
const paymentsT7 = [
  { id: 'p7-1', billId: 'b-main', amount: 5400, status: 'rejected' },
];
const decoratedT7 = decorateTenantBills(billsT6, paymentsT7);
assert(decoratedT7[0].remainingAmount === 8390, `TEST 7: Outstanding = ${decoratedT7[0].remainingAmount} (expected 8390)`);
assert(decoratedT7[0].paidAmount === 0, `TEST 7: paidAmount = ${decoratedT7[0].paidAmount} (expected 0)`);

// TEST 8: Pending payment must NOT permanently reduce outstanding
const paymentsT8 = [
  { id: 'p8-1', billId: 'b-main', amount: 5400, status: 'pending' },
];
const decoratedT8 = decorateTenantBills(billsT6, paymentsT8);
assert(decoratedT8[0].remainingAmount === 8390, `TEST 8: Outstanding = ${decoratedT8[0].remainingAmount} (expected 8390)`);
assert(decoratedT8[0].paidAmount === 0, `TEST 8: paidAmount = ${decoratedT8[0].paidAmount} (expected 0)`);

// TEST 9: Landlord App & Tenant App produce identical output
const landlordBill = {
  id: 'b-shared',
  billingMonth: '2026-05',
  subtotal: 5390,
  previousDue: 3000,
  paidAmount: 5400,
  totalAmount: 8390,
};
const tenantAlloc = calculateBillAllocation(landlordBill, 5400);
const totalAmountL = landlordBill.subtotal + landlordBill.previousDue;
const paidAmountL = 5400;
const remainingL = Math.max(0, totalAmountL - paidAmountL);
assert(tenantAlloc.totalOutstanding === remainingL, `TEST 9: Tenant (${tenantAlloc.totalOutstanding}) == Landlord (${remainingL})`);
assert(tenantAlloc.totalOutstanding === 2990, `TEST 9: Value is 2990`);

// TEST 10: PDF remaining balance calculation
const pdfAlloc = calculateBillAllocation({ subtotal: 5390, previousDue: 3000, paidAmount: 5400 });
assert(pdfAlloc.totalOutstanding === 2990, `TEST 10: PDF Remaining Balance = ${pdfAlloc.totalOutstanding} (expected 2990)`);
assert(pdfAlloc.previousDuePaid === 3000, `TEST 10: PDF previousDuePaid = ${pdfAlloc.previousDuePaid} (expected 3000)`);
assert(pdfAlloc.currentBillPaid === 2400, `TEST 10: PDF currentBillPaid = ${pdfAlloc.currentBillPaid} (expected 2400)`);

// =========================================================================
// USER SPECIFICATION TEST CASES: HISTORICAL PAID BILLS MUST NEVER BE MODIFIED
// =========================================================================

// TEST 11: USER PRIMARY SCENARIO (Old bill PAID 3000/3000 + Current bill PARTIAL 2400/5390 + 1000 payment)
const oldBillUser = {
  id: 'b-old',
  billingMonth: '2026-01',
  subtotal: 3000,
  totalAmount: 3000,
  paidAmount: 3000,
  remainingAmount: 0,
  paymentStatus: 'paid',
};
const currentBillUser = {
  id: 'b-current',
  billingMonth: '2026-02',
  subtotal: 5390,
  totalAmount: 5390,
  paidAmount: 2400,
  remainingAmount: 2990,
  paymentStatus: 'partial',
};
// Total approved payment pool: 3000 (old) + 2400 (cur partial) + 1000 (new) = 6400
const paymentsUser1000 = [
  { id: 'p-1', billId: 'b-old', amount: 3000, status: 'approved' },
  { id: 'p-2', billId: 'b-current', amount: 2400, status: 'approved' },
  { id: 'p-3', billId: 'b-current', amount: 1000, status: 'approved' },
];
const decoratedUser = decorateTenantBills([oldBillUser, currentBillUser], paymentsUser1000);
const oldDecorated = decoratedUser.find(b => b.id === 'b-old');
const curDecorated = decoratedUser.find(b => b.id === 'b-current');

assert(oldDecorated.paidAmount === 3000, `TEST 11 (User Scenario): Old Bill Paid = ${oldDecorated.paidAmount} (expected 3000, MUST NOT BE 4000)`);
assert(oldDecorated.remainingAmount === 0, `TEST 11 (User Scenario): Old Bill Remaining = ${oldDecorated.remainingAmount} (expected 0)`);
assert(oldDecorated.paymentStatus === 'paid', `TEST 11 (User Scenario): Old Bill Status = ${oldDecorated.paymentStatus} (expected 'paid')`);
assert(curDecorated.paidAmount === 3400, `TEST 11 (User Scenario): Current Bill Paid = ${curDecorated.paidAmount} (expected 3400)`);
assert(curDecorated.remainingAmount === 1990, `TEST 11 (User Scenario): Current Bill Remaining = ${curDecorated.remainingAmount} (expected 1990)`);
assert(curDecorated.paymentStatus === 'partial', `TEST 11 (User Scenario): Current Bill Status = ${curDecorated.paymentStatus} (expected 'partial')`);

// TEST 12: USER SCENARIO 2 (Tenant pays 2990 clearing the current bill)
const paymentsUser2990 = [
  { id: 'p-1', billId: 'b-old', amount: 3000, status: 'approved' },
  { id: 'p-2', billId: 'b-current', amount: 2400, status: 'approved' },
  { id: 'p-3', billId: 'b-current', amount: 2990, status: 'approved' },
];
const decoratedUser2 = decorateTenantBills([oldBillUser, currentBillUser], paymentsUser2990);
const oldDec2 = decoratedUser2.find(b => b.id === 'b-old');
const curDec2 = decoratedUser2.find(b => b.id === 'b-current');
assert(oldDec2.paidAmount === 3000 && oldDec2.remainingAmount === 0 && oldDec2.paymentStatus === 'paid',
  `TEST 12: Old Bill completely untouched at 3000 paid / 0 rem / paid`);
assert(curDec2.paidAmount === 5390 && curDec2.remainingAmount === 0 && curDec2.paymentStatus === 'paid',
  `TEST 12: Current Bill fully cleared at 5390 paid / 0 rem / paid`);

// TEST 13: USER MULTIPLE BILL SCENARIO (Jan PAID 4000, Feb PARTIAL 2000/4500, Mar UNPAID 5000 + 3500 payment)
const billJan = { id: 'b-jan', billingMonth: '2026-01', subtotal: 4000, totalAmount: 4000, paidAmount: 4000, remainingAmount: 0, paymentStatus: 'paid' };
const billFeb = { id: 'b-feb', billingMonth: '2026-02', subtotal: 4500, totalAmount: 4500, paidAmount: 2000, remainingAmount: 2500, paymentStatus: 'partial' };
const billMar = { id: 'b-mar', billingMonth: '2026-03', subtotal: 5000, totalAmount: 5000, paidAmount: 0, remainingAmount: 5000, paymentStatus: 'unpaid' };
const paymentsMulti = [
  { id: 'p-jan', billId: 'b-jan', amount: 4000, status: 'approved' },
  { id: 'p-feb', billId: 'b-feb', amount: 2000, status: 'approved' },
  { id: 'p-new', billId: 'b-feb', amount: 3500, status: 'approved' },
];
const decoratedMulti = decorateTenantBills([billJan, billFeb, billMar], paymentsMulti);
const janDec = decoratedMulti.find(b => b.id === 'b-jan');
const febDec = decoratedMulti.find(b => b.id === 'b-feb');
const marDec = decoratedMulti.find(b => b.id === 'b-mar');

assert(janDec.paidAmount === 4000 && janDec.remainingAmount === 0 && janDec.paymentStatus === 'paid',
  `TEST 13: January UNCHANGED (4000 paid / 0 rem / paid)`);
assert(febDec.paidAmount === 4500 && febDec.remainingAmount === 0 && febDec.paymentStatus === 'paid',
  `TEST 13: February PAID (4500 paid / 0 rem / paid)`);
assert(marDec.paidAmount === 1000 && marDec.remainingAmount === 4000 && marDec.paymentStatus === 'partial',
  `TEST 13: March PARTIAL (1000 paid / 4000 rem / partial)`);

// =========================================================================
// USER PROMPT TEST CASES: PRESERVE PREVIOUS DUE & MULTI-BILL ISOLATION
// =========================================================================

// USER PROMPT TEST 1: Previous due 3000 + Current bill 5300 => Total payable = 8300
const promptBill1 = { id: 'inv-1', billNumber: 'INV-2026-00001', billingMonth: '2026-09', subtotal: 5300, previousDue: 3000 };
const promptDec1 = decorateTenantBills([promptBill1]);
assert(promptDec1[0].totalAmount === 8300, `PROMPT TEST 1: Total payable = ${promptDec1[0].totalAmount} (expected 8300)`);
assert(promptDec1[0].previousDue === 3000, `PROMPT TEST 1: previousDue = ${promptDec1[0].previousDue} (expected 3000)`);
assert(promptDec1[0].subtotal === 5300, `PROMPT TEST 1: subtotal = ${promptDec1[0].subtotal} (expected 5300)`);

// USER PROMPT TEST 2: Previous due 3000, Current bill 5300, Payment 4000
// Expected: Previous = PAID (3000 paid, 0 rem), Current = PARTIAL (1000 paid, 4300 rem), Overall remaining = 4300
const prevBillTest2 = { id: 'inv-prev-2', billNumber: 'INV-2026-00001', billingMonth: '2026-08', subtotal: 3000, previousDue: 0 };
const curBillTest2 = { id: 'inv-cur-2', billNumber: 'INV-2026-00002', billingMonth: '2026-09', subtotal: 5300, previousDue: 3000 };
const paymentsTest2 = [{ id: 'pay-t2', billId: 'inv-cur-2', amount: 4000, status: 'approved' }];
const decTest2 = decorateTenantBills([prevBillTest2, curBillTest2], paymentsTest2);
const prevDecTest2 = decTest2.find(b => b.id === 'inv-prev-2');
const curDecTest2 = decTest2.find(b => b.id === 'inv-cur-2');
assert(prevDecTest2.paidAmount === 3000 && prevDecTest2.remainingAmount === 0 && prevDecTest2.paymentStatus === 'paid',
  `PROMPT TEST 2: Previous bill PAID (3000 paid, 0 rem, paid)`);
assert(curDecTest2.paidAmount === 1000 && curDecTest2.remainingAmount === 4300 && curDecTest2.paymentStatus === 'partial',
  `PROMPT TEST 2: Current bill PARTIAL (1000 paid, 4300 rem, partial)`);
assert(prevDecTest2.remainingAmount + curDecTest2.remainingAmount === 4300,
  `PROMPT TEST 2: Overall remaining = 4300`);

// USER PROMPT TEST 3: Previous due 3000, Current bill 5300, Payment 8300
// Expected: Previous = PAID, Current = PAID, Overall remaining = 0
const paymentsTest3 = [{ id: 'pay-t3', billId: 'inv-cur-2', amount: 8300, status: 'approved' }];
const decTest3 = decorateTenantBills([prevBillTest2, curBillTest2], paymentsTest3);
const prevDecTest3 = decTest3.find(b => b.id === 'inv-prev-2');
const curDecTest3 = decTest3.find(b => b.id === 'inv-cur-2');
assert(prevDecTest3.paidAmount === 3000 && prevDecTest3.remainingAmount === 0 && prevDecTest3.paymentStatus === 'paid',
  `PROMPT TEST 3: Previous bill PAID (3000 paid, 0 rem, paid)`);
assert(curDecTest3.paidAmount === 5300 && curDecTest3.remainingAmount === 0 && curDecTest3.paymentStatus === 'paid',
  `PROMPT TEST 3: Current bill PAID (5300 paid, 0 rem, paid)`);
assert(prevDecTest3.remainingAmount + curDecTest3.remainingAmount === 0,
  `PROMPT TEST 3: Overall remaining = 0`);

// USER PROMPT TEST 4: Previous due 0, Current bill 5300 => Total payable = 5300
const promptBill4 = { id: 'inv-4', billNumber: 'INV-2026-00004', billingMonth: '2026-09', subtotal: 5300, previousDue: 0 };
const promptDec4 = decorateTenantBills([promptBill4]);
assert(promptDec4[0].totalAmount === 5300, `PROMPT TEST 4: Total payable = ${promptDec4[0].totalAmount} (expected 5300)`);

// USER PROMPT TEST 5: Current bill 5300 (with previousDue 3000, total 8300), Later/future bill 5200
// Expected: Current bill's total must NOT become 10,500 merely because another bill exists
const curBill5 = { id: 'inv-2', billNumber: 'INV-2026-00002', billingMonth: '2026-09', subtotal: 5300, previousDue: 3000 };
const futureBill5 = { id: 'inv-3', billNumber: 'INV-2026-00003', billingMonth: '2026-09', subtotal: 5200, previousDue: 0 };
const decTest5 = decorateTenantBills([curBill5, futureBill5]);
const inv2Result = decTest5.find(b => b.id === 'inv-2');
const inv3Result = decTest5.find(b => b.id === 'inv-3');
assert(inv2Result.totalAmount === 8300, `PROMPT TEST 5: INV-00002 total = ${inv2Result.totalAmount} (expected 8300, MUST NOT BE 10500)`);
assert(inv3Result.totalAmount === 5200, `PROMPT TEST 5: INV-00003 total = ${inv3Result.totalAmount} (expected 5200)`);

// USER PROMPT TEST 6: Previous due 3000, Current bill 5300, App refresh/restart => Total payable remains 8300
const decTest6First = decorateTenantBills([curBill5]);
const decTest6Second = decorateTenantBills([curBill5]);
assert(decTest6First[0].totalAmount === 8300 && decTest6Second[0].totalAmount === 8300,
  `PROMPT TEST 6: Total payable remains stable at 8300 after refresh (no double counting)`);

console.log('\n==================================================');
if (allPassed) {
  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
} else {
  console.error('💥 SOME TESTS FAILED!');
  process.exit(1);
}
console.log('==================================================');
