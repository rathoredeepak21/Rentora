const assert = require('assert');

// ---------------------------------------------------------------------------
// RENTORA FINAL SETTLEMENT REFUND & PAYMENT TRACKING TEST SUITE
// Tests all scenarios specified in the Final Settlement implementation prompt
// ---------------------------------------------------------------------------

// 1. Unified Status & Settlement Computation Helper
function computeSettlementStatus(settlement) {
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

    let status = 'refund_pending';
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

  let status = 'payment_pending';
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
}

// 2. Net Settlement Calculation from Move-out inputs
function calculateMoveOutSettlement({ securityDeposit = 0, advanceRent = 0, totalCharges = 0 }) {
  const totalAvailableFunds = Math.round((securityDeposit + advanceRent) * 100) / 100;
  const netDifference = Math.round((totalAvailableFunds - totalCharges) * 100) / 100;

  let finalStatus = 'zero_balance';
  let settlementDirection = 'zero_balance';
  let netFinalAmount = 0;
  let totalRefundableAmount = 0;
  let totalPayableAmount = 0;

  if (netDifference > 0) {
    finalStatus = 'refundable';
    settlementDirection = 'refund_to_tenant';
    netFinalAmount = netDifference;
    totalRefundableAmount = netDifference;
  } else if (netDifference < 0) {
    finalStatus = 'payable';
    settlementDirection = 'payment_by_tenant';
    netFinalAmount = Math.abs(netDifference);
    totalPayableAmount = Math.abs(netDifference);
  }

  const advanceAdjusted = Math.min(advanceRent, totalCharges);
  const remainingCharges = Math.max(0, totalCharges - advanceAdjusted);
  const depositAdjusted = Math.min(securityDeposit, remainingCharges);
  const advanceRemaining = Math.max(0, advanceRent - advanceAdjusted);
  const depositRemaining = Math.max(0, securityDeposit - depositAdjusted);

  const statusInfo = computeSettlementStatus({
    finalStatus,
    finalAmount: netFinalAmount,
    settlementDirection,
    totalRefundableAmount,
    totalPayableAmount,
    transactions: [],
  });

  return {
    totalSecurityDeposit: securityDeposit,
    totalAdvanceRent: advanceRent,
    totalAvailableFunds,
    totalCharges,
    netDifference,
    finalStatus,
    settlementDirection,
    netFinalAmount,
    totalRefundableAmount,
    totalPayableAmount,
    advanceAdjusted,
    depositAdjusted,
    advanceRemaining,
    depositRemaining,
    ...statusInfo,
  };
}

// 3. Simulated Transaction Recorder
function recordTransaction(settlement, { type, amount, date = '2026-11-14', paymentMethod = 'upi', ref = '' }) {
  const statusBefore = computeSettlementStatus(settlement);

  if (amount <= 0) {
    throw new Error('Transaction amount must be greater than zero.');
  }
  if (amount > statusBefore.amountPending + 0.01) {
    throw new Error(`Amount ₹${amount} exceeds remaining pending balance of ₹${statusBefore.amountPending}`);
  }

  const newTx = {
    id: `stx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    type,
    amount: Math.round(amount * 100) / 100,
    date,
    paymentMethod,
    transactionReference: ref,
    createdAt: new Date().toISOString(),
  };

  const updatedTxs = [...(settlement.transactions || []), newTx];
  const newStatus = computeSettlementStatus({
    ...settlement,
    transactions: updatedTxs,
  });

  return {
    ...settlement,
    transactions: updatedTxs,
    amountSettled: newStatus.amountSettled,
    amountPending: newStatus.amountPending,
    paymentStatus: newStatus.status,
  };
}

// ---------------------------------------------------------------------------
// TEST RUNNER
// ---------------------------------------------------------------------------
console.log('Running Rentora Final Settlement Test Suite...\n');

// SCENARIO 1: Deposit ₹10,000, charges ₹510 → Refund ₹9,490
console.log('TEST 1: Deposit ₹10,000, charges ₹510 → Refund ₹9,490');
{
  const res = calculateMoveOutSettlement({ securityDeposit: 10000, advanceRent: 0, totalCharges: 510 });
  assert.strictEqual(res.netDifference, 9490, 'Net difference must be +₹9,490');
  assert.strictEqual(res.direction, 'refund_to_tenant', 'Direction must be refund_to_tenant');
  assert.strictEqual(res.directionTitle, 'REFUND PAYABLE TO TENANT', 'Direction title must be REFUND PAYABLE TO TENANT');
  assert.strictEqual(res.status, 'refund_pending', 'Initial status must be refund_pending');
  assert.strictEqual(res.statusLabel, 'REFUND PENDING', 'Status label must be REFUND PENDING');
  assert.strictEqual(res.targetTotal, 9490, 'Target total must be 9490');
  assert.strictEqual(res.amountSettled, 0, 'Amount settled must be 0');
  assert.strictEqual(res.amountPending, 9490, 'Amount pending must be 9490');
  assert.strictEqual(res.depositAdjusted, 510, 'Deposit adjusted against dues must be ₹510');
  assert.strictEqual(res.depositRemaining, 9490, 'Deposit remaining to refund must be ₹9,490');
  assert.ok(res.partyMessage.includes('refund ₹9,490'), 'Party message must clearly state landlord refunds ₹9,490');
  console.log('  ✓ Test 1 Passed: Correctly identified REFUND PAYABLE TO TENANT ₹9,490 with status REFUND PENDING');
}

// SCENARIO 2: Deposit ₹5,000, charges ₹6,500 → Tenant pays ₹1,500
console.log('\nTEST 2: Deposit ₹5,000, charges ₹6,500 → Tenant pays ₹1,500');
{
  const res = calculateMoveOutSettlement({ securityDeposit: 5000, advanceRent: 0, totalCharges: 6500 });
  assert.strictEqual(res.netDifference, -1500, 'Net difference must be -₹1,500');
  assert.strictEqual(res.direction, 'payment_by_tenant', 'Direction must be payment_by_tenant');
  assert.strictEqual(res.directionTitle, 'PAYMENT PAYABLE BY TENANT', 'Direction title must be PAYMENT PAYABLE BY TENANT');
  assert.strictEqual(res.status, 'payment_pending', 'Initial status must be payment_pending');
  assert.strictEqual(res.statusLabel, 'PAYMENT PENDING', 'Status label must be PAYMENT PENDING');
  assert.strictEqual(res.targetTotal, 1500, 'Target total must be 1500');
  assert.strictEqual(res.amountPending, 1500, 'Amount pending must be 1500');
  assert.strictEqual(res.depositAdjusted, 5000, 'Deposit adjusted must absorb all ₹5,000 deposit');
  assert.strictEqual(res.depositRemaining, 0, 'Deposit remaining must be ₹0');
  assert.ok(res.partyMessage.includes('pay ₹1,500'), 'Party message must state tenant must pay ₹1,500');
  console.log('  ✓ Test 2 Passed: Correctly identified PAYMENT PAYABLE BY TENANT ₹1,500 with status PAYMENT PENDING');
}

// SCENARIO 3: Deposit ₹5,000, charges ₹5,000 → Zero balance
console.log('\nTEST 3: Deposit ₹5,000, charges ₹5,000 → Zero balance');
{
  const res = calculateMoveOutSettlement({ securityDeposit: 5000, advanceRent: 0, totalCharges: 5000 });
  assert.strictEqual(res.netDifference, 0, 'Net difference must be ₹0');
  assert.strictEqual(res.direction, 'zero_balance', 'Direction must be zero_balance');
  assert.strictEqual(res.directionTitle, 'FULLY SETTLED', 'Title must be FULLY SETTLED');
  assert.strictEqual(res.status, 'fully_settled', 'Status must be fully_settled');
  assert.strictEqual(res.amountPending, 0, 'Amount pending must be 0');
  assert.strictEqual(res.partyMessage, 'No amount is payable by either party.', 'Message must confirm zero balance');
  console.log('  ✓ Test 3 Passed: Correctly identified zero balance FULLY SETTLED');
}

// SCENARIO 4: Refund ₹4,000 out of ₹9,490 → Partially Refunded
console.log('\nTEST 4: Refund ₹4,000 out of ₹9,490 → Partially Refunded');
let settlementCaseA;
{
  const initial = calculateMoveOutSettlement({ securityDeposit: 10000, advanceRent: 0, totalCharges: 510 });
  settlementCaseA = recordTransaction(initial, { type: 'refund', amount: 4000, paymentMethod: 'upi', ref: 'UPI-REF-001' });

  const status = computeSettlementStatus(settlementCaseA);
  assert.strictEqual(status.status, 'partially_refunded', 'Status must be partially_refunded');
  assert.strictEqual(status.statusLabel, 'PARTIALLY REFUNDED', 'Status label must be PARTIALLY REFUNDED');
  assert.strictEqual(status.targetTotal, 9490, 'Total refundable must remain 9490');
  assert.strictEqual(status.amountSettled, 4000, 'Amount settled must be 4000');
  assert.strictEqual(status.amountPending, 5490, 'Remaining pending refund must be 5490');
  assert.ok(status.partyMessage.includes('refund ₹5,490'), 'Party message must indicate ₹5,490 remaining');
  console.log('  ✓ Test 4 Passed: Status is PARTIALLY REFUNDED, remaining ₹5,490');
}

// SCENARIO 5: Refund remaining ₹5,490 → Fully Settled
console.log('\nTEST 5: Refund remaining ₹5,490 → Fully Settled');
{
  const completed = recordTransaction(settlementCaseA, { type: 'refund', amount: 5490, paymentMethod: 'bank_transfer', ref: 'IMPS-REF-002' });

  const status = computeSettlementStatus(completed);
  assert.strictEqual(status.status, 'fully_settled', 'Status must become fully_settled');
  assert.strictEqual(status.statusLabel, 'FULLY SETTLED', 'Status label must be FULLY SETTLED');
  assert.strictEqual(status.amountSettled, 9490, 'Total refunded must equal 9490');
  assert.strictEqual(status.amountPending, 0, 'Remaining pending must be 0');
  assert.ok(status.partyMessage.includes('fully refunded ₹9,490'), 'Party message must confirm full refund');
  assert.strictEqual(completed.transactions.length, 2, 'Must have exactly 2 transaction records');
  console.log('  ✓ Test 5 Passed: Status transitioned to FULLY SETTLED upon clearing remaining refund');
}

// SCENARIO 6: Receive ₹500 out of ₹1,500 → Partially Paid
console.log('\nTEST 6: Receive ₹500 out of ₹1,500 → Partially Paid');
let settlementCaseB;
{
  const initial = calculateMoveOutSettlement({ securityDeposit: 5000, advanceRent: 0, totalCharges: 6500 });
  settlementCaseB = recordTransaction(initial, { type: 'payment_received', amount: 500, paymentMethod: 'cash' });

  const status = computeSettlementStatus(settlementCaseB);
  assert.strictEqual(status.status, 'partially_paid', 'Status must be partially_paid');
  assert.strictEqual(status.statusLabel, 'PARTIALLY PAID', 'Status label must be PARTIALLY PAID');
  assert.strictEqual(status.targetTotal, 1500, 'Target payable must be 1500');
  assert.strictEqual(status.amountSettled, 500, 'Amount settled must be 500');
  assert.strictEqual(status.amountPending, 1000, 'Remaining pending must be 1000');
  assert.ok(status.partyMessage.includes('pay ₹1,000'), 'Party message must indicate tenant owes ₹1,000');
  console.log('  ✓ Test 6 Passed: Status is PARTIALLY PAID, remaining ₹1,000');
}

// SCENARIO 7: Receive remaining ₹1,000 → Fully Settled
console.log('\nTEST 7: Receive remaining ₹1,000 → Fully Settled');
{
  const completed = recordTransaction(settlementCaseB, { type: 'payment_received', amount: 1000, paymentMethod: 'upi', ref: 'UPI-PAY-003' });

  const status = computeSettlementStatus(completed);
  assert.strictEqual(status.status, 'fully_settled', 'Status must become fully_settled');
  assert.strictEqual(status.statusLabel, 'FULLY SETTLED', 'Status label must be FULLY SETTLED');
  assert.strictEqual(status.amountSettled, 1500, 'Total paid must be 1500');
  assert.strictEqual(status.amountPending, 0, 'Remaining pending must be 0');
  assert.ok(status.partyMessage.includes('fully paid ₹1,500'), 'Party message must confirm full payment');
  assert.strictEqual(completed.transactions.length, 2, 'Must have 2 transaction records');
  console.log('  ✓ Test 7 Passed: Status transitioned to FULLY SETTLED upon clearing remaining payment');
}

// SCENARIO 8: Over-payment and Over-refund prevention
console.log('\nTEST 8: Over-payment and Over-refund prevention');
{
  // Over refund test
  assert.throws(() => {
    recordTransaction(settlementCaseA, { type: 'refund', amount: 6000 });
  }, /exceeds remaining pending balance/, 'Must prevent refund greater than pending ₹5,490');

  // Over payment test
  assert.throws(() => {
    recordTransaction(settlementCaseB, { type: 'payment_received', amount: 1200 });
  }, /exceeds remaining pending balance/, 'Must prevent payment greater than pending ₹1,000');

  // Zero / Negative amount test
  assert.throws(() => {
    recordTransaction(settlementCaseA, { type: 'refund', amount: 0 });
  }, /greater than zero/, 'Must reject zero amount');

  console.log('  ✓ Test 8 Passed: Validation strictly prevents over-refund, over-payment, and zero amounts');
}

// SCENARIO 9: Backward Compatibility with Historical Settlements
console.log('\nTEST 9: Backward Compatibility with Historical Settlements');
{
  // Historical legacy settlement with only finalStatus: 'refundable', finalAmount: -9490 and no transactions
  const legacyRefundable = {
    finalStatus: 'refundable',
    finalAmount: -9490,
  };
  const legacyStatus1 = computeSettlementStatus(legacyRefundable);
  assert.strictEqual(legacyStatus1.direction, 'refund_to_tenant');
  assert.strictEqual(legacyStatus1.targetTotal, 9490);
  assert.strictEqual(legacyStatus1.amountPending, 9490);
  assert.strictEqual(legacyStatus1.status, 'refund_pending');

  // Historical legacy settlement with only finalStatus: 'payable', finalAmount: 1500
  const legacyPayable = {
    finalStatus: 'payable',
    finalAmount: 1500,
  };
  const legacyStatus2 = computeSettlementStatus(legacyPayable);
  assert.strictEqual(legacyStatus2.direction, 'payment_by_tenant');
  assert.strictEqual(legacyStatus2.targetTotal, 1500);
  assert.strictEqual(legacyStatus2.amountPending, 1500);
  assert.strictEqual(legacyStatus2.status, 'payment_pending');

  console.log('  ✓ Test 9 Passed: Historical settlements without transaction records map perfectly to modern status');
}

console.log('\n======================================================');
console.log('ALL 9 FINAL SETTLEMENT TEST SUITE SCENARIOS PASSED! ✓');
console.log('======================================================\n');

