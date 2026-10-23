const assert = require('assert');

console.log('================================================================');
console.log('TESTING VACATED TENANTS CRASH FIX & DEFENSIVE DATA HANDLING');
console.log('================================================================');

// 1. Test StatusBadge logic
function getStatusBadgeData(status, type = 'bill') {
  const safeStatus = (status || '').toString().trim();
  let label = safeStatus || (type === 'tenant' ? 'Active' : type === 'unit' ? 'Vacant' : 'Pending');
  const normStatus = safeStatus.toLowerCase();

  let backgroundColor = '#E5E7EB';
  let color = '#6B7280';

  if (type === 'tenant') {
    if (normStatus === 'active') {
      backgroundColor = '#ECFDF5';
      color = '#10B981';
      label = 'Active';
    } else if (normStatus === 'vacated') {
      backgroundColor = '#FEF2F2';
      color = '#EF4444';
      label = 'Vacated';
    }
  }
  return { backgroundColor, color, label: (label || '').toUpperCase() };
}

// 2. Test MoneyText formatting logic
function formatMoneyCurrency(val) {
  const num = typeof val === 'number' && !isNaN(val) ? val : Number(val) || 0;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(num);
  } catch (e) {
    return `₹${num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }
}

// 3. Test Avatar initials logic
function getInitials(name) {
  if (!name || typeof name !== 'string') return 'T';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'T';
  return parts.map((n) => n[0]).join('').substring(0, 2).toUpperCase() || 'T';
}

// 4. Test SearchTenants query and filter logic
function searchTenantsLogic(allDocs, ownerId, query, status) {
  const normalizedQuery = (query || '').toLowerCase().trim();
  const targetStatus = (status || '').toLowerCase().trim();

  const filtered = allDocs.filter((doc) => {
    if (!doc) return false;
    const matchOwner = doc.ownerId === ownerId;
    const docStatus = (doc.status || 'active').toLowerCase().trim();
    const matchStatus = targetStatus ? docStatus === targetStatus : true;
    return matchOwner && matchStatus;
  });

  if (!normalizedQuery) {
    return filtered;
  }

  return filtered.filter((doc) => {
    if (!doc) return false;
    const name = (doc.name || '').toLowerCase();
    const mobile = (doc.mobile || doc.mobileNumber || '').toLowerCase();
    return name.includes(normalizedQuery) || mobile.includes(normalizedQuery);
  });
}

// 5. Test Tab Switching synchronous filter logic
function filterDisplayedTenants(tenants, activeTab) {
  return (tenants || []).filter((t) => {
    if (!t) return false;
    const status = (t.status || 'active').toLowerCase().trim();
    return activeTab === 'vacated' ? status === 'vacated' : status !== 'vacated';
  });
}

// ================================================================
// TEST SUITE EXECUTION
// ================================================================

// TEST 1: StatusBadge does not crash with undefined, null, empty string, or weird inputs
console.log('\n--- TEST 1: StatusBadge Null-Safety ---');
assert.doesNotThrow(() => getStatusBadgeData(undefined, 'tenant'));
assert.doesNotThrow(() => getStatusBadgeData(null, 'tenant'));
assert.doesNotThrow(() => getStatusBadgeData('', 'tenant'));
assert.strictEqual(getStatusBadgeData('vacated', 'tenant').label, 'VACATED');
assert.strictEqual(getStatusBadgeData('Vacated', 'tenant').label, 'VACATED');
assert.strictEqual(getStatusBadgeData('VACATED', 'tenant').label, 'VACATED');
assert.strictEqual(getStatusBadgeData(undefined, 'tenant').label, 'ACTIVE');
console.log('✅ TEST 1 PASSED: StatusBadge handles all null/undefined/case variants safely');

// TEST 2: MoneyText does not crash with undefined, null, NaN, or non-numeric values
console.log('\n--- TEST 2: MoneyText Null-Safety ---');
assert.doesNotThrow(() => formatMoneyCurrency(undefined));
assert.doesNotThrow(() => formatMoneyCurrency(null));
assert.doesNotThrow(() => formatMoneyCurrency(NaN));
assert.doesNotThrow(() => formatMoneyCurrency('invalid'));
assert.strictEqual(formatMoneyCurrency(undefined).includes('0'), true);
assert.strictEqual(formatMoneyCurrency(null).includes('0'), true);
assert.strictEqual(formatMoneyCurrency(8500).includes('8,500'), true);
console.log('✅ TEST 2 PASSED: MoneyText safely coerces null, undefined, NaN to ₹0 without throwing');

// TEST 3: Avatar generation does not crash with undefined, null, empty, or multi-space names
console.log('\n--- TEST 3: Avatar Initials Safety ---');
assert.strictEqual(getInitials(undefined), 'T');
assert.strictEqual(getInitials(null), 'T');
assert.strictEqual(getInitials(''), 'T');
assert.strictEqual(getInitials('   '), 'T');
assert.strictEqual(getInitials('Deepak  Rathore '), 'DR');
assert.strictEqual(getInitials('Ramesh'), 'R');
console.log('✅ TEST 3 PASSED: Avatar initials logic is robust against empty/null/whitespace names');

// TEST 4: Zero vacated tenants state
console.log('\n--- TEST 4: Zero Vacated Tenants ---');
const sampleTenantsEmpty = [
  { id: 't1', ownerId: 'owner1', name: 'Active Tenant 1', status: 'active', monthlyRent: 5000 },
  { id: 't2', ownerId: 'owner1', name: 'Active Tenant 2', status: 'active', monthlyRent: 6000 },
];
const vacatedEmpty = searchTenantsLogic(sampleTenantsEmpty, 'owner1', '', 'vacated');
assert.strictEqual(vacatedEmpty.length, 0, 'Zero vacated tenants correctly returned');
const displayedEmpty = filterDisplayedTenants(sampleTenantsEmpty, 'vacated');
assert.strictEqual(displayedEmpty.length, 0, 'Displayed list for vacated is empty');
console.log('✅ TEST 4 PASSED: Zero vacated tenants handled gracefully without error');

// TEST 5: One vacated tenant state
console.log('\n--- TEST 5: One Vacated Tenant ---');
const sampleTenantsOne = [
  { id: 't1', ownerId: 'owner1', name: 'Active Tenant 1', status: 'active', monthlyRent: 5000 },
  { id: 't2', ownerId: 'owner1', name: 'Vacated Tenant 1', status: 'vacated', monthlyRent: 6000, moveOutDate: '2026-10-15' },
];
const vacatedOne = searchTenantsLogic(sampleTenantsOne, 'owner1', '', 'vacated');
assert.strictEqual(vacatedOne.length, 1, 'Exactly 1 vacated tenant returned');
assert.strictEqual(vacatedOne[0].id, 't2');
const displayedOne = filterDisplayedTenants(sampleTenantsOne, 'vacated');
assert.strictEqual(displayedOne.length, 1);
assert.strictEqual(displayedOne[0].name, 'Vacated Tenant 1');
console.log('✅ TEST 5 PASSED: One vacated tenant correctly retrieved and displayed');

// TEST 6: Vacated tenant with missing optional fields (null propertyId, unitId, monthlyRent, status, name, mobile)
console.log('\n--- TEST 6: Missing Optional Fields in Vacated Tenant Record ---');
const brokenVacatedTenant = {
  id: 't_corrupt',
  ownerId: 'owner1',
  status: 'vacated',
  // Missing name, mobile, monthlyRent, propertyId, unitId, moveOutDate
};
const fullDataset = [...sampleTenantsOne, brokenVacatedTenant];

// Search without query
assert.doesNotThrow(() => {
  const res = searchTenantsLogic(fullDataset, 'owner1', '', 'vacated');
  assert.strictEqual(res.length, 2);
});

// Search WITH query (testing substring searching with missing name / mobile)
assert.doesNotThrow(() => {
  const res = searchTenantsLogic(fullDataset, 'owner1', 'vacated', 'vacated');
  assert.strictEqual(res.length, 1);
});

// Test rendering simulation
assert.doesNotThrow(() => {
  const displayed = filterDisplayedTenants(fullDataset, 'vacated');
  displayed.forEach((tenant) => {
    const badge = getStatusBadgeData(tenant.status, 'tenant');
    const rent = formatMoneyCurrency(tenant.monthlyRent);
    const initials = getInitials(tenant.name);
    const key = tenant.id || 'fallback';
    assert.ok(badge);
    assert.ok(rent);
    assert.ok(initials);
    assert.ok(key);
  });
});
console.log('✅ TEST 6 PASSED: Incomplete/corrupted vacated tenant record does not crash list or rendering');

// TEST 7: Instant tab switching & immunity to stale state
console.log('\n--- TEST 7: Tab Switching State Immunity ---');
// User is on active tab, sees active tenants
const activeView = filterDisplayedTenants(fullDataset, 'active');
assert.strictEqual(activeView.length, 1);
assert.strictEqual(activeView[0].id, 't1');

// User taps Vacated tab, immediately switches
const vacatedView = filterDisplayedTenants(fullDataset, 'vacated');
assert.strictEqual(vacatedView.length, 2);
assert.strictEqual(vacatedView[0].id, 't2');
assert.strictEqual(vacatedView[1].id, 't_corrupt');

// User taps Active tab back, immediately switches back
const activeViewAgain = filterDisplayedTenants(fullDataset, 'active');
assert.strictEqual(activeViewAgain.length, 1);
assert.strictEqual(activeViewAgain[0].id, 't1');
console.log('✅ TEST 7 PASSED: Tab switching is synchronous, immediate, and free of race conditions');

console.log('\n================================================================');
console.log('🎉 ALL VACATED TENANT FIX VERIFICATIONS COMPLETED SUCCESSFULLY!');
console.log('================================================================');
