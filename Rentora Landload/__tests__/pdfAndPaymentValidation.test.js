const assert = require('assert');

// 1. Test getBillPDFFilename logic
const sanitizeForFilename = (str, fallback = '') => {
  if (!str || typeof str !== 'string') return fallback;
  const cleaned = str
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
};

const getBillPDFFilename = (tenantName, invoiceNumber) => {
  const cleanTenant = sanitizeForFilename(tenantName, 'Unknown_Tenant');
  const cleanInvoice = sanitizeForFilename(invoiceNumber, 'INV');
  return `Rentora_Bill_${cleanTenant}_${cleanInvoice}.pdf`;
};

console.log('==================================================');
console.log('TEST SUITE: PDF FILENAME FORMAT');
console.log('==================================================');

// Test 1: Example 1 - Mahesh Jatav
const file1 = getBillPDFFilename('Mahesh Jatav', 'INV-2026-00003');
assert.strictEqual(file1, 'Rentora_Bill_Mahesh_Jatav_INV-2026-00003.pdf');
console.log(`✅ TEST 1: ${file1} matches expected.`);

// Test 2: Example 2 - Rahul Sharma
const file2 = getBillPDFFilename('Rahul Sharma', 'INV-2026-00004');
assert.strictEqual(file2, 'Rentora_Bill_Rahul_Sharma_INV-2026-00004.pdf');
console.log(`✅ TEST 2: ${file2} matches expected.`);

// Test 3: Multiple bills for same tenant have distinct invoice numbers
const file3a = getBillPDFFilename('Mahesh Jatav', 'INV-2026-00003');
const file3b = getBillPDFFilename('Mahesh Jatav', 'INV-2026-00010');
assert.notStrictEqual(file3a, file3b);
assert.strictEqual(file3b, 'Rentora_Bill_Mahesh_Jatav_INV-2026-00010.pdf');
console.log(`✅ TEST 3: Distinguishable bills for same tenant: ${file3a} vs ${file3b}`);

// Test 4: Missing or unavailable tenant name defaults to Unknown_Tenant
const file4a = getBillPDFFilename(null, 'INV-2026-00005');
const file4b = getBillPDFFilename(undefined, 'INV-2026-00005');
const file4c = getBillPDFFilename('', 'INV-2026-00005');
const file4d = getBillPDFFilename('   ', 'INV-2026-00005');
assert.strictEqual(file4a, 'Rentora_Bill_Unknown_Tenant_INV-2026-00005.pdf');
assert.strictEqual(file4b, 'Rentora_Bill_Unknown_Tenant_INV-2026-00005.pdf');
assert.strictEqual(file4c, 'Rentora_Bill_Unknown_Tenant_INV-2026-00005.pdf');
assert.strictEqual(file4d, 'Rentora_Bill_Unknown_Tenant_INV-2026-00005.pdf');
console.log(`✅ TEST 4: Missing tenant correctly defaults to Unknown_Tenant (${file4a})`);

// Test 5: Sanitization of special characters & slashes
const file5 = getBillPDFFilename('Suresh / Kumar <Room #2>', 'INV/2026/00007');
assert.strictEqual(file5, 'Rentora_Bill_Suresh_Kumar_Room_2_INV202600007.pdf');
console.log(`✅ TEST 5: Sanitization produces valid safe filename: ${file5}`);

console.log('\n==================================================');
console.log('TEST SUITE: PAYMENT VALIDATION LOGIC');
console.log('==================================================');

// Simulate the Record Payment screen validate function
function simulateValidate({ amount, paymentDate, paymentMethod, transactionId }) {
  const newErrors = {};
  const amt = parseFloat(amount);
  
  if (isNaN(amt) || amt <= 0) {
    newErrors.amount = 'Amount must be greater than zero';
  }

  if (!paymentDate || !paymentDate.trim()) {
    newErrors.paymentDate = 'Payment date is required';
  }

  if (paymentMethod === 'upi') {
    if (!transactionId || !transactionId.trim()) {
      newErrors.transactionId = 'Please enter the UPI transaction/reference ID.';
    }
  } else if (paymentMethod === 'bank_transfer') {
    if (!transactionId || !transactionId.trim()) {
      newErrors.transactionId = 'Please enter the bank transfer reference/UTR.';
    }
  }

  return {
    isValid: Object.keys(newErrors).length === 0,
    errors: newErrors
  };
}

// Test 6: UPI without transaction ID is rejected
const res6a = simulateValidate({ amount: '5000', paymentDate: '2026-10-19', paymentMethod: 'upi', transactionId: '' });
assert.strictEqual(res6a.isValid, false);
assert.strictEqual(res6a.errors.transactionId, 'Please enter the UPI transaction/reference ID.');
const res6b = simulateValidate({ amount: '5000', paymentDate: '2026-10-19', paymentMethod: 'upi', transactionId: '   ' });
assert.strictEqual(res6b.isValid, false);
assert.strictEqual(res6b.errors.transactionId, 'Please enter the UPI transaction/reference ID.');
console.log('✅ TEST 6: UPI without ID rejected with exact required error message.');

// Test 7: UPI with valid transaction ID is accepted
const res7 = simulateValidate({ amount: '5000', paymentDate: '2026-10-19', paymentMethod: 'upi', transactionId: 'UPI-123456789012' });
assert.strictEqual(res7.isValid, true);
assert.strictEqual(res7.errors.transactionId, undefined);
console.log('✅ TEST 7: UPI with valid ID passes validation.');

// Test 8: Bank Transfer without reference/UTR is rejected
const res8a = simulateValidate({ amount: '5000', paymentDate: '2026-10-19', paymentMethod: 'bank_transfer', transactionId: '' });
assert.strictEqual(res8a.isValid, false);
assert.strictEqual(res8a.errors.transactionId, 'Please enter the bank transfer reference/UTR.');
const res8b = simulateValidate({ amount: '5000', paymentDate: '2026-10-19', paymentMethod: 'bank_transfer', transactionId: '  \t  ' });
assert.strictEqual(res8b.isValid, false);
assert.strictEqual(res8b.errors.transactionId, 'Please enter the bank transfer reference/UTR.');
console.log('✅ TEST 8: Bank Transfer without UTR rejected with exact required error message.');

// Test 9: Bank Transfer with valid reference/UTR is accepted
const res9 = simulateValidate({ amount: '5000', paymentDate: '2026-10-19', paymentMethod: 'bank_transfer', transactionId: 'SBIN0029384729' });
assert.strictEqual(res9.isValid, true);
assert.strictEqual(res9.errors.transactionId, undefined);
console.log('✅ TEST 9: Bank Transfer with valid UTR passes validation.');

// Test 10: Cash without transaction ID is accepted
const res10 = simulateValidate({ amount: '5000', paymentDate: '2026-10-19', paymentMethod: 'cash', transactionId: '' });
assert.strictEqual(res10.isValid, true);
assert.strictEqual(res10.errors.transactionId, undefined);
console.log('✅ TEST 10: Cash without ID passes validation cleanly.');

// Test 11: Other without transaction ID is accepted (optional by default)
const res11a = simulateValidate({ amount: '5000', paymentDate: '2026-10-19', paymentMethod: 'other', transactionId: '' });
assert.strictEqual(res11a.isValid, true);
const res11b = simulateValidate({ amount: '5000', paymentDate: '2026-10-19', paymentMethod: 'other', transactionId: 'CHQ-893021' });
assert.strictEqual(res11b.isValid, true);
console.log('✅ TEST 11: Other payment method works both with and without reference ID.');

console.log('\n==================================================');
console.log('🎉 ALL PDF & PAYMENT VALIDATION TESTS PASSED!');
console.log('==================================================\n');
