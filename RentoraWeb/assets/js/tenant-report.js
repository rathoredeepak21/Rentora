/* =============================================================================
   RENTORA — TENANT-WISE HISTORICAL REPORT ENGINE
   Generates Excel (.xlsx) + PDF for a vacated tenant's complete financial history.
   30-day access window enforced from settlement.createdAt timestamp.
   Does NOT modify any existing billing, payment, or settlement logic.
   ============================================================================= */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const REPORT_ACCESS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

  // ── Helpers ────────────────────────────────────────────────────────────────
  function fmt(val) {
    const n = Number(val);
    if (isNaN(n)) return '—';
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtNum(val) {
    const n = Number(val);
    return isNaN(n) ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(str) {
    if (!str) return '—';
    try {
      return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) { return str; }
  }
  function fmtDateTime(str) {
    if (!str) return '—';
    try {
      return new Date(str).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return str; }
  }
  function paymentMethodLabel(method) {
    const map = {
      upi: 'UPI', cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
      neft: 'NEFT', rtgs: 'RTGS', imps: 'IMPS', online: 'Online', other: 'Other'
    };
    return map[(method || '').toLowerCase()] || method || '—';
  }
  function paymentStatusLabel(bill) {
    if (bill.paymentStatus === 'paid') return 'PAID';
    if (bill.paymentStatus === 'partial') return 'PARTIALLY PAID';
    if (bill.paymentStatus === 'unpaid') return 'UNPAID';
    // fallback from amounts
    const paid = Number(bill.paidAmount) || 0;
    const remaining = Number(bill.remainingAmount);
    if (!isNaN(remaining) && remaining <= 0 && paid > 0) return 'PAID';
    if (paid > 0) return 'PARTIALLY PAID';
    return 'UNPAID';
  }

  // ── State accessor (live reference to parent app state) ────────────────────
  function getState() {
    // Access the app's closure-scoped state through exposed globals
    // The parent app.js exposes nothing directly, but all data is in DOM / window
    // We rely on window.__rentoraState if available; fallback to app-generated globals.
    // The simplest safe approach: app.js keeps state in closure but renders from it.
    // tenant-report.js reads directly from the same in-memory arrays via
    // the globally-accessible renderAllPortalData world — so we need a bridge.
    // The app already exposes everything needed via calls we make below.
    return window.__rentoraState || null;
  }

  // ── State bridge: app.js needs to expose state to us ──────────────────────
  // We inject a getter into window so tenant-report.js can read live state
  // without modifying the app's closure. This is set by the modified app.js
  // via renderAllPortalData callback — see bottom of this file for the patch.

  // ── 30-day expiry check ────────────────────────────────────────────────────
  function getExpiryInfo(settlement) {
    if (!settlement || !settlement.createdAt) {
      return { hasSettlement: false, isExpired: false, expiry: null, remaining: null };
    }
    const start = new Date(settlement.createdAt).getTime();
    const expiry = start + REPORT_ACCESS_MS;
    const now = Date.now();
    const remaining = expiry - now;
    return {
      hasSettlement: true,
      isExpired: now > expiry,
      expiry: new Date(expiry),
      remaining,
      start: new Date(start)
    };
  }

  function formatRemaining(ms) {
    if (ms <= 0) return 'Expired';
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${mins}m remaining`;
    return `${mins} minutes remaining`;
  }

  // ── Core data assembler ────────────────────────────────────────────────────
  function assembleReportData(tenantId) {
    const st = window.__rentoraState;
    if (!st) return { error: 'no_state', message: 'App data not ready. Please wait.' };

    const tenant = st.tenants.find(t => t.id === tenantId);
    if (!tenant) return { error: 'not_found', message: 'Tenant not found.' };
    if (tenant.status !== 'vacated') return { error: 'not_vacated', message: 'Only vacated tenants are eligible for this report.' };

    const property = st.properties.find(p => p.id === tenant.propertyId) || {};
    const unit = st.units.find(u => u.id === tenant.unitId) || {};
    const settings = st.settings || {};

    // Find settlement — match by tenantId (most reliable) or settlementNumber
    const settlement = st.settlements.find(s =>
      s.tenantId === tenantId ||
      (tenant.settlementNum && s.settlementNumber === tenant.settlementNum)
    ) || null;

    // 30-day expiry check
    const expiry = getExpiryInfo(settlement);
    if (expiry.hasSettlement && expiry.isExpired) {
      return {
        error: 'expired',
        message: 'Report access has expired. The 30-day window from settlement generation has closed.',
        tenant, settlement, expiry
      };
    }
    if (!expiry.hasSettlement) {
      return {
        error: 'no_settlement',
        message: 'No Final Settlement found for this tenant. Generate a Final Settlement first to unlock the 30-day report access window.',
        tenant
      };
    }

    // Bills — filter strictly by tenantId (not name, not unit)
    const bills = st.bills
      .filter(b => b.tenantId === tenantId)
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

    // Payments — filter strictly by tenantId
    const payments = st.payments
      .filter(p => p.tenantId === tenantId)
      .sort((a, b) => (a.paymentDate || a.createdAt || '').localeCompare(b.paymentDate || b.createdAt || ''));

    // Build payment lookup by billId for per-bill breakdowns
    const paymentsByBill = {};
    payments.forEach(p => {
      const bid = p.billId || '__unallocated__';
      if (!paymentsByBill[bid]) paymentsByBill[bid] = [];
      paymentsByBill[bid].push(p);
    });

    // Financial summary
    const totalBilled = bills.reduce((s, b) => s + (Number(b.totalAmount) || 0), 0);
    const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || Number(p.amountPaid) || 0), 0);
    const outstandingBills = bills.filter(b => paymentStatusLabel(b) !== 'PAID');
    const totalOutstanding = outstandingBills.reduce((s, b) => s + (Number(b.remainingAmount) || 0), 0);

    return {
      ok: true,
      tenant,
      property,
      unit,
      settlement,
      settings,
      bills,
      payments,
      paymentsByBill,
      expiry,
      summary: {
        totalBilled,
        totalPaid,
        totalOutstanding,
        billCount: bills.length,
        paymentCount: payments.length
      }
    };
  }

  // ── UI: Render Reports Panel ────────────────────────────────────────────────
  window.renderReportsPanel = function () {
    const st = window.__rentoraState;
    if (!st) return;

    const propSel = document.getElementById('rptPropertySelect');
    if (!propSel) return;

    // Populate property dropdown
    const currentVal = propSel.value;
    propSel.innerHTML = '<option value="">— Select a property —</option>';
    (st.properties || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === currentVal) opt.selected = true;
      propSel.appendChild(opt);
    });

    renderReportTenantList();
  };

  window.renderReportTenantList = function () {
    const st = window.__rentoraState;
    const area = document.getElementById('rptTenantListArea');
    const card = document.getElementById('rptTenantCard');
    if (!area || !card) return;

    card.style.display = 'none';

    const propId = document.getElementById('rptPropertySelect')?.value || '';
    if (!propId || !st) {
      area.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);padding:12px 0;">Select a property above to see vacated tenants.</p>';
      return;
    }

    const vacated = (st.tenants || []).filter(t => t.propertyId === propId && t.status === 'vacated');
    if (vacated.length === 0) {
      area.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);padding:12px 0;">No vacated tenants found in this property.</p>';
      return;
    }

    let html = '<div style="display:flex;flex-direction:column;gap:10px;">';
    vacated.forEach(t => {
      const settlement = (st.settlements || []).find(s => s.tenantId === t.id || (t.settlementNum && s.settlementNumber === t.settlementNum));
      const expiry = getExpiryInfo(settlement);
      let badge = '';
      let disabled = '';
      if (!expiry.hasSettlement) {
        badge = `<span style="font-size:0.72rem;background:rgba(245,158,11,0.15);color:#d97706;border:1px solid #d97706;padding:2px 8px;border-radius:999px;margin-left:8px;">No Settlement</span>`;
        disabled = 'style="opacity:0.5;cursor:not-allowed;"';
      } else if (expiry.isExpired) {
        badge = `<span style="font-size:0.72rem;background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid #ef4444;padding:2px 8px;border-radius:999px;margin-left:8px;">Access Expired</span>`;
        disabled = 'style="opacity:0.5;cursor:not-allowed;"';
      } else {
        badge = `<span style="font-size:0.72rem;background:rgba(16,185,129,0.12);color:#10b981;border:1px solid #10b981;padding:2px 8px;border-radius:999px;margin-left:8px;">${formatRemaining(expiry.remaining)}</span>`;
      }
      const clickable = (!expiry.hasSettlement || expiry.isExpired) ? '' : `onclick="selectReportTenant('${t.id}')"`;
      html += `
        <div class="rpt-tenant-row" ${clickable} ${disabled} data-tenant-id="${t.id}">
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
            <strong>${t.name}</strong>
            <span style="font-size:0.8rem;color:var(--text-secondary);">— Unit ${t.unitNumber}</span>
            ${badge}
          </div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">
            Moved in: ${fmtDate(t.moveIn)} &nbsp;|&nbsp; Vacated: ${fmtDate(t.moveOut)}
            ${settlement ? ` &nbsp;|&nbsp; Settlement: ${settlement.settlementNumber}` : ''}
          </div>
        </div>`;
    });
    html += '</div>';
    area.innerHTML = html;
  };

  // Current selected report tenant ID
  let _currentReportTenantId = null;

  window.selectReportTenant = function (tenantId) {
    _currentReportTenantId = tenantId;

    // Highlight selected row
    document.querySelectorAll('.rpt-tenant-row').forEach(el => {
      el.classList.toggle('rpt-tenant-row--selected', el.dataset.tenantId === tenantId);
    });

    const card = document.getElementById('rptTenantCard');
    const summary = document.getElementById('rptTenantSummary');
    const expiryBanner = document.getElementById('rptExpiryBanner');
    const dlBtns = document.getElementById('rptDownloadBtns');
    if (!card || !summary) return;

    const data = assembleReportData(tenantId);

    if (data.error) {
      card.style.display = 'block';
      summary.innerHTML = `<p style="color:var(--danger);">${data.message}</p>`;
      expiryBanner.innerHTML = '';
      dlBtns.style.display = 'none';
      return;
    }

    const { tenant, property, settlement, expiry, summary: fin } = data;
    summary.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
        <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Tenant</span><div style="font-weight:700;margin-top:2px;">${tenant.name}</div><div style="font-size:0.82rem;color:var(--text-secondary);">${tenant.mobile || '—'}</div></div>
        <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Unit</span><div style="font-weight:600;margin-top:2px;">Unit ${tenant.unitNumber}</div><div style="font-size:0.82rem;color:var(--text-secondary);">${property.name || '—'}</div></div>
        <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Tenancy</span><div style="font-size:0.85rem;margin-top:2px;">${fmtDate(tenant.moveIn)} → ${fmtDate(tenant.moveOut)}</div></div>
        <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Settlement</span><div style="font-size:0.85rem;margin-top:2px;">${settlement.settlementNumber}</div><div style="font-size:0.8rem;color:var(--text-secondary);">${fmtDateTime(settlement.createdAt)}</div></div>
        <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Total Billed</span><div style="font-weight:700;color:var(--primary);margin-top:2px;">${fmt(fin.totalBilled)}</div></div>
        <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Total Paid</span><div style="font-weight:700;color:#10b981;margin-top:2px;">${fmt(fin.totalPaid)}</div></div>
        <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Outstanding</span><div style="font-weight:700;color:${fin.totalOutstanding > 0 ? '#ef4444' : '#10b981'};margin-top:2px;">${fmt(fin.totalOutstanding)}</div></div>
        <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Bills / Payments</span><div style="font-size:0.85rem;margin-top:2px;">${fin.billCount} bills &nbsp;|&nbsp; ${fin.paymentCount} transactions</div></div>
      </div>`;

    // Expiry banner
    const expiryDate = expiry.expiry;
    const remaining = expiry.remaining;
    const daysLeft = Math.ceil(remaining / 86400000);
    const bgColor = daysLeft <= 3 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)';
    const textColor = daysLeft <= 3 ? '#ef4444' : '#10b981';
    expiryBanner.innerHTML = `
      <div style="padding:10px 14px;border-radius:var(--radius-sm);background:${bgColor};border:1px solid ${textColor};color:${textColor};font-size:0.84rem;font-weight:600;">
        ⏳ Report access expires: ${fmtDateTime(expiryDate.toISOString())} &nbsp;|&nbsp; ${formatRemaining(remaining)}
      </div>`;

    dlBtns.style.display = 'flex';
    card.style.display = 'block';
  };

  // ── Excel Generation ────────────────────────────────────────────────────────
  window.downloadTenantExcel = function () {
    if (!_currentReportTenantId) { alert('Please select a tenant first.'); return; }

    const data = assembleReportData(_currentReportTenantId);
    if (data.error) { alert(data.message); return; }

    if (typeof XLSX === 'undefined') {
      alert('Excel library not loaded. Please check your internet connection and try again.');
      return;
    }

    const { tenant, property, unit, settlement, bills, payments, paymentsByBill, settings, expiry, summary: fin } = data;

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Tenant Summary ─────────────────────────────────────────────
    const s1rows = [
      ['RENTORA — TENANT-WISE HISTORICAL REPORT'],
      ['Generated:', fmtDateTime(new Date().toISOString())],
      ['Report Access Expires:', fmtDateTime(expiry.expiry.toISOString())],
      [],
      ['TENANT INFORMATION'],
      ['Tenant Name', tenant.name],
      ['Tenant ID', tenant.id],
      ['Phone / Mobile', tenant.mobile || '—'],
      ['Gender', tenant.gender || '—'],
      ['Occupation', tenant.occupation || '—'],
      ['Family Members', tenant.totalMembers || '—'],
      ['ID Proof Type', tenant.idProofType || '—'],
      [],
      ['PROPERTY & UNIT'],
      ['Property Name', property.name || '—'],
      ['Property Address', property.address || '—'],
      ['Unit / Room Number', tenant.unitNumber || '—'],
      ['Meter Number', unit.meter || '—'],
      ['Initial Meter Reading', tenant.initialMeter ?? '—'],
      ['Final Meter Reading', tenant.finalMeter ?? settlement.elecUnits != null ? (tenant.initialMeter || 0) + (settlement.elecUnits || 0) : '—'],
      [],
      ['TENANCY TIMELINE'],
      ['Move-In Date', fmtDate(tenant.moveIn)],
      ['Vacate Date', fmtDate(tenant.moveOut)],
      ['Monthly Rent', Number(tenant.rent) || Number(tenant.monthlyRent) || 0],
      ['Security Deposit', Number(tenant.deposit) || Number(tenant.securityDeposit) || 0],
      ['Advance Rent', Number(tenant.advance) || Number(tenant.advanceAmount) || 0],
      [],
      ['SETTLEMENT'],
      ['Settlement Number', settlement.settlementNumber],
      ['Settlement Date', fmtDateTime(settlement.createdAt)],
      ['Period End', fmtDate(settlement.periodEnd)],
      ['Extra Days', settlement.extraDays ?? 0],
      ['Extra Stay Rent', Number(settlement.extraStayRent) || 0],
      ['Electricity Units (Final)', settlement.elecUnits ?? 0],
      ['Electricity Rate', Number(settlement.elecRate) || 0],
      ['Final Electricity Charge', Number(settlement.elecCharge) || 0],
      ['Total Charges', Number(settlement.totalCharges) || 0],
      ['Advance Adjusted', Number(settlement.advanceAdjusted) || 0],
      ['Deposit Deducted', Number(settlement.depositDeducted) || 0],
      ['Net Amount', Number(settlement.netAmount) || 0],
      ['Settlement Status', Number(settlement.netAmount) <= 0 ? 'Refundable to Tenant' : 'Payable by Tenant'],
      [],
      ['FINANCIAL SUMMARY'],
      ['Total Bills Raised', fin.billCount],
      ['Total Payment Transactions', fin.paymentCount],
      ['Total Amount Billed', fin.totalBilled],
      ['Total Amount Paid', fin.totalPaid],
      ['Outstanding Amount', fin.totalOutstanding],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(s1rows);
    ws1['!cols'] = [{ wch: 32 }, { wch: 48 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Tenant Summary');

    // ── Sheet 2: Bills History ──────────────────────────────────────────────
    const s2header = [
      'Bill #', 'Bill Number', 'Billing Month', 'Issue Date', 'Due Date',
      'Monthly Rent', 'Electricity Units', 'Electricity Rate', 'Electricity Charge',
      'Water Charge', 'Parking Charge', 'Maintenance Charge', 'Other Charges',
      'Previous Due', 'Subtotal', 'Total Amount',
      'Paid Amount', 'Remaining Amount', 'Payment Status',
      'Prev Meter Reading', 'Curr Meter Reading',
      'Prev Reading Date', 'Curr Reading Date'
    ];
    const s2rows = [s2header];
    bills.forEach((b, i) => {
      s2rows.push([
        i + 1,
        b.billNumber || '—',
        b.billingMonth || '—',
        fmtDate(b.createdAt),
        fmtDate(b.dueDate),
        Number(b.rent) || 0,
        Number(b.electricityUnits) || 0,
        Number(b.electricityRate) || 0,
        Number(b.electricityCharge) || 0,
        Number(b.waterCharge) || 0,
        Number(b.parkingCharge) || 0,
        Number(b.maintenanceCharge) || 0,
        Number(b.otherCharges) || 0,
        Number(b.previousDue) || 0,
        Number(b.subtotal) || 0,
        Number(b.totalAmount) || 0,
        Number(b.paidAmount) || 0,
        Number(b.remainingAmount) || 0,
        paymentStatusLabel(b),
        Number(b.previousMeterReading) || '—',
        Number(b.currentMeterReading) || '—',
        fmtDate(b.previousMeterReadingDate),
        fmtDate(b.currentMeterReadingDate),
      ]);
    });
    // Totals row
    s2rows.push([
      'TOTAL', '', '', '', '',
      bills.reduce((s, b) => s + (Number(b.rent) || 0), 0),
      bills.reduce((s, b) => s + (Number(b.electricityUnits) || 0), 0),
      '', bills.reduce((s, b) => s + (Number(b.electricityCharge) || 0), 0),
      bills.reduce((s, b) => s + (Number(b.waterCharge) || 0), 0),
      bills.reduce((s, b) => s + (Number(b.parkingCharge) || 0), 0),
      bills.reduce((s, b) => s + (Number(b.maintenanceCharge) || 0), 0),
      bills.reduce((s, b) => s + (Number(b.otherCharges) || 0), 0),
      '', '', fin.totalBilled,
      fin.totalPaid, fin.totalOutstanding, '',
      '', '', '', ''
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet(s2rows);
    ws2['!cols'] = s2header.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Bills History');

    // ── Sheet 3: Payment History ────────────────────────────────────────────
    const s3header = [
      'Txn #', 'Payment Date', 'Payment Time', 'Amount', 'Payment Mode',
      'Transaction / Ref ID', 'Associated Bill #', 'Bill Number', 'Notes'
    ];
    const s3rows = [s3header];
    // Map bill IDs to bill numbers for display
    const billNumMap = {};
    bills.forEach(b => { billNumMap[b.id] = b.billNumber || b.id; });

    payments.forEach((p, i) => {
      const dateStr = p.paymentDate || (p.createdAt ? p.createdAt.split('T')[0] : '');
      const timeStr = p.createdAt ? p.createdAt.split('T')[1]?.slice(0, 5) || '—' : '—';
      s3rows.push([
        i + 1,
        fmtDate(dateStr),
        timeStr,
        Number(p.amount) || Number(p.amountPaid) || 0,
        paymentMethodLabel(p.paymentMethod || p.mode),
        p.transactionId || p.referenceId || '—',
        p.billId || '—',
        billNumMap[p.billId] || '—',
        p.notes || p.remarks || '—',
      ]);
    });
    // Total row
    s3rows.push(['TOTAL', '', '', fin.totalPaid, '', '', '', '', '']);
    const ws3 = XLSX.utils.aoa_to_sheet(s3rows);
    ws3['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 20 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Payment History');

    // ── Sheet 4: Outstanding & Final Settlement ─────────────────────────────
    const s4rows = [
      ['OUTSTANDING BILLS'],
      ['Bill #', 'Bill Number', 'Billing Month', 'Total Amount', 'Paid Amount', 'Outstanding', 'Status'],
    ];
    const outstandingBills = bills.filter(b => paymentStatusLabel(b) !== 'PAID');
    if (outstandingBills.length === 0) {
      s4rows.push(['—', 'No outstanding bills', '', '', '', '', '']);
    } else {
      outstandingBills.forEach((b, i) => {
        s4rows.push([
          i + 1, b.billNumber || '—', b.billingMonth || '—',
          Number(b.totalAmount) || 0, Number(b.paidAmount) || 0,
          Number(b.remainingAmount) || 0, paymentStatusLabel(b)
        ]);
      });
      s4rows.push(['TOTAL', '', '', '', '', fin.totalOutstanding, '']);
    }
    s4rows.push([]);
    s4rows.push(['FINAL SETTLEMENT DETAILS']);
    s4rows.push(['Settlement Number', settlement.settlementNumber]);
    s4rows.push(['Generated On', fmtDateTime(settlement.createdAt)]);
    s4rows.push(['Period End Date', fmtDate(settlement.periodEnd)]);
    s4rows.push(['Move-Out Date', fmtDate(settlement.moveOutDate)]);
    s4rows.push(['Policy Applied', settlement.policy || '—']);
    s4rows.push([]);
    s4rows.push(['CHARGES']);
    s4rows.push(['Extra Stay Days', settlement.extraDays ?? 0]);
    s4rows.push(['Daily Rent Rate', Number(settlement.dailyRate) || 0]);
    s4rows.push(['Extra Stay Rent', Number(settlement.extraStayRent) || 0]);
    s4rows.push(['Final Electricity Units', settlement.elecUnits ?? 0]);
    s4rows.push(['Electricity Rate per Unit', Number(settlement.elecRate) || 0]);
    s4rows.push(['Final Electricity Charge', Number(settlement.elecCharge) || 0]);
    s4rows.push(['Total Charges (A)', Number(settlement.totalCharges) || 0]);
    s4rows.push([]);
    s4rows.push(['DEDUCTIONS']);
    s4rows.push(['Advance Rent Adjusted', Number(settlement.advanceAdjusted) || 0]);
    s4rows.push(['Security Deposit Deducted', Number(settlement.depositDeducted) || 0]);
    s4rows.push(['Total Deductions (B)', (Number(settlement.advanceAdjusted) || 0) + (Number(settlement.depositDeducted) || 0)]);
    s4rows.push([]);
    const netAmt = Number(settlement.netAmount) || 0;
    s4rows.push(['NET AMOUNT (A - B)', netAmt]);
    s4rows.push([netAmt < 0 ? 'STATUS: REFUNDABLE TO TENANT' : netAmt > 0 ? 'STATUS: PAYABLE BY TENANT' : 'STATUS: FULLY SETTLED (ZERO BALANCE)', Math.abs(netAmt)]);

    const ws4 = XLSX.utils.aoa_to_sheet(s4rows);
    ws4['!cols'] = [{ wch: 36 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Outstanding & Settlement');

    // Download
    const filename = `Rentora_TenantReport_${tenant.name.replace(/\s+/g, '_')}_${tenant.id}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // ── PDF Generation ──────────────────────────────────────────────────────────
  window.downloadTenantPDF = function () {
    if (!_currentReportTenantId) { alert('Please select a tenant first.'); return; }

    const data = assembleReportData(_currentReportTenantId);
    if (data.error) { alert(data.message); return; }

    if (typeof html2pdf === 'undefined') {
      alert('PDF library not loaded. Please check your internet connection and try again.');
      return;
    }

    const { tenant, property, unit, settlement, bills, payments, paymentsByBill, settings, expiry, summary: fin } = data;

    const ownerName = settings.ownerName || settings.businessName || property.name || 'Landlord';
    const businessName = settings.businessName || property.name || 'RENTORA PROPERTIES';
    const address = settings.address || property.address || '';

    const css = `
      *, *::before, *::after { box-sizing: border-box; }
      body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f2937; font-size: 10px; line-height: 1.5; margin: 0; padding: 0; }
      .page { padding: 20px 24px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4F46E5; padding-bottom: 12px; margin-bottom: 16px; }
      .brand { font-size: 20px; font-weight: 800; color: #4F46E5; }
      .brand-sub { font-size: 10px; color: #6b7280; }
      .report-title { font-size: 14px; font-weight: 800; color: #111827; text-transform: uppercase; }
      .section-title { font-size: 11px; font-weight: 800; color: #4F46E5; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 16px 0 8px; }
      .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 16px; margin-bottom: 12px; }
      .info-item label { font-size: 8px; text-transform: uppercase; color: #9ca3af; font-weight: 700; display: block; }
      .info-item span { font-weight: 600; font-size: 10px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9px; }
      th { background: #4F46E5; color: #fff; padding: 5px 7px; text-align: left; font-weight: 700; font-size: 8.5px; }
      td { padding: 4px 7px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
      tr:nth-child(even) td { background: #f9fafb; }
      .total-row td { font-weight: 800; background: #eff6ff; border-top: 2px solid #4F46E5; }
      .badge-paid { background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:4px;font-weight:700; }
      .badge-partial { background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-weight:700; }
      .badge-unpaid { background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:4px;font-weight:700; }
      .settlement-box { background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px; }
      .expiry-box { background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;padding:8px 12px;font-size:9px;margin-bottom:12px; }
      .net-positive { color:#ef4444;font-weight:800; }
      .net-negative { color:#10b981;font-weight:800; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    `;

    const statusBadge = (b) => {
      const s = paymentStatusLabel(b);
      if (s === 'PAID') return '<span class="badge-paid">PAID</span>';
      if (s === 'PARTIALLY PAID') return '<span class="badge-partial">PARTIAL</span>';
      return '<span class="badge-unpaid">UNPAID</span>';
    };

    const netAmt = Number(settlement.netAmount) || 0;

    let billsTableRows = '';
    bills.forEach((b, i) => {
      billsTableRows += `<tr>
        <td>${i + 1}</td>
        <td>${b.billNumber || '—'}</td>
        <td>${b.billingMonth || '—'}</td>
        <td>${fmtDate(b.createdAt)}</td>
        <td>${fmtDate(b.dueDate)}</td>
        <td>${fmt(b.rent)}</td>
        <td>${b.electricityUnits || 0} u × ${fmt(b.electricityRate)}</td>
        <td>${fmt(b.electricityCharge)}</td>
        <td>${fmt(b.waterCharge)}</td>
        <td>${fmt(b.parkingCharge)}</td>
        <td>${fmt(b.previousDue)}</td>
        <td>${fmt(b.totalAmount)}</td>
        <td>${fmt(b.paidAmount)}</td>
        <td>${fmt(b.remainingAmount)}</td>
        <td>${statusBadge(b)}</td>
      </tr>`;
    });

    let paymentsTableRows = '';
    payments.forEach((p, i) => {
      const dateStr = p.paymentDate || (p.createdAt ? p.createdAt.split('T')[0] : '');
      const timeStr = p.createdAt ? (p.createdAt.split('T')[1]?.slice(0, 5) || '—') : '—';
      const billNum = bills.find(b => b.id === p.billId)?.billNumber || p.billId || '—';
      paymentsTableRows += `<tr>
        <td>${i + 1}</td>
        <td>${fmtDate(dateStr)}</td>
        <td>${timeStr}</td>
        <td style="font-weight:700;">${fmt(Number(p.amount) || Number(p.amountPaid) || 0)}</td>
        <td>${paymentMethodLabel(p.paymentMethod || p.mode)}</td>
        <td style="font-family:monospace;">${p.transactionId || p.referenceId || '—'}</td>
        <td>${billNum}</td>
      </tr>`;
    });

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${css}</style></head><body>
    <div class="page">

      <!-- Header -->
      <div class="header">
        <div>
          <div class="brand">Rentora</div>
          <div class="brand-sub">${businessName}</div>
          ${address ? `<div class="brand-sub">${address}</div>` : ''}
          <div class="brand-sub">Landlord: ${ownerName}</div>
        </div>
        <div style="text-align:right;">
          <div class="report-title">Tenant-Wise Historical Report</div>
          <div style="font-size:9px;color:#6b7280;margin-top:4px;">Generated: ${fmtDateTime(new Date().toISOString())}</div>
          <div style="font-size:9px;color:#6b7280;">Settlement: ${settlement.settlementNumber}</div>
        </div>
      </div>

      <!-- Expiry notice -->
      <div class="expiry-box">
        ⏳ Report Access Window: ${fmtDateTime(expiry.start.toISOString())} → ${fmtDateTime(expiry.expiry.toISOString())} &nbsp;|&nbsp; ${formatRemaining(expiry.remaining)}
      </div>

      <!-- Section 1: Tenant Info -->
      <div class="section-title">1. Tenant Information</div>
      <div class="info-grid">
        <div class="info-item"><label>Tenant Name</label><span>${tenant.name}</span></div>
        <div class="info-item"><label>Tenant ID</label><span style="font-family:monospace;font-size:9px;">${tenant.id}</span></div>
        <div class="info-item"><label>Phone</label><span>${tenant.mobile || '—'}</span></div>
        <div class="info-item"><label>Occupation</label><span>${tenant.occupation || '—'}</span></div>
        <div class="info-item"><label>Gender</label><span>${tenant.gender || '—'}</span></div>
        <div class="info-item"><label>Family Members</label><span>${tenant.totalMembers || '—'}</span></div>
        <div class="info-item"><label>ID Proof</label><span>${tenant.idProofType || '—'}</span></div>
        <div class="info-item"><label>Property</label><span>${property.name || '—'}</span></div>
        <div class="info-item"><label>Unit</label><span>Unit ${tenant.unitNumber}</span></div>
        <div class="info-item"><label>Move-In Date</label><span>${fmtDate(tenant.moveIn)}</span></div>
        <div class="info-item"><label>Vacate Date</label><span>${fmtDate(tenant.moveOut)}</span></div>
        <div class="info-item"><label>Monthly Rent</label><span>${fmt(tenant.rent || tenant.monthlyRent)}</span></div>
        <div class="info-item"><label>Security Deposit</label><span>${fmt(tenant.deposit || tenant.securityDeposit)}</span></div>
        <div class="info-item"><label>Advance Rent</label><span>${fmt(tenant.advance || tenant.advanceAmount)}</span></div>
        <div class="info-item"><label>Initial Meter</label><span>${tenant.initialMeter ?? '—'}</span></div>
      </div>

      <!-- Section 2: Bills History -->
      <div class="section-title">2. Complete Bills History (${bills.length} bill${bills.length !== 1 ? 's' : ''})</div>
      <table>
        <thead><tr>
          <th>#</th><th>Bill No.</th><th>Month</th><th>Issue Date</th><th>Due Date</th>
          <th>Rent</th><th>Electricity</th><th>Elec Charge</th><th>Water</th><th>Parking</th>
          <th>Prev Due</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Status</th>
        </tr></thead>
        <tbody>${billsTableRows}</tbody>
        <tfoot><tr class="total-row">
          <td colspan="11" style="text-align:right;">TOTALS →</td>
          <td>${fmt(fin.totalBilled)}</td>
          <td>${fmt(fin.totalPaid)}</td>
          <td>${fmt(fin.totalOutstanding)}</td>
          <td></td>
        </tr></tfoot>
      </table>

      <!-- Section 3: Payment History -->
      <div class="section-title">3. Complete Payment Transactions (${payments.length} transaction${payments.length !== 1 ? 's' : ''})</div>
      <table>
        <thead><tr>
          <th>#</th><th>Date</th><th>Time</th><th>Amount</th><th>Mode</th><th>Transaction ID</th><th>Bill No.</th>
        </tr></thead>
        <tbody>${paymentsTableRows}</tbody>
        <tfoot><tr class="total-row">
          <td colspan="3" style="text-align:right;">TOTAL RECEIVED →</td>
          <td>${fmt(fin.totalPaid)}</td>
          <td colspan="3"></td>
        </tr></tfoot>
      </table>

      <!-- Section 4: Final Settlement -->
      <div class="section-title">4. Outstanding &amp; Final Settlement</div>
      <div class="settlement-box">
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px 24px;">
          <div class="info-item"><label>Settlement Number</label><span>${settlement.settlementNumber}</span></div>
          <div class="info-item"><label>Generated On</label><span>${fmtDateTime(settlement.createdAt)}</span></div>
          <div class="info-item"><label>Period End</label><span>${fmtDate(settlement.periodEnd)}</span></div>
          <div class="info-item"><label>Move-Out Date</label><span>${fmtDate(settlement.moveOutDate)}</span></div>
          <div class="info-item"><label>Policy</label><span>${settlement.policy || '—'}</span></div>
          <div class="info-item"><label>Extra Days</label><span>${settlement.extraDays ?? 0}</span></div>
          <div class="info-item"><label>Daily Rate</label><span>${fmt(settlement.dailyRate)}</span></div>
          <div class="info-item"><label>Extra Stay Rent</label><span>${fmt(settlement.extraStayRent)}</span></div>
          <div class="info-item"><label>Final Elec Units</label><span>${settlement.elecUnits ?? 0} units @ ${fmt(settlement.elecRate)}/unit</span></div>
          <div class="info-item"><label>Final Elec Charge</label><span>${fmt(settlement.elecCharge)}</span></div>
          <div class="info-item"><label>Total Charges (A)</label><span style="font-weight:800;">${fmt(settlement.totalCharges)}</span></div>
        </div>
        <div style="border-top:1px solid #86efac;margin:10px 0;"></div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px 24px;">
          <div class="info-item"><label>Advance Adjusted (B1)</label><span>${fmt(settlement.advanceAdjusted)}</span></div>
          <div class="info-item"><label>Deposit Deducted (B2)</label><span>${fmt(settlement.depositDeducted)}</span></div>
        </div>
        <div style="border-top:1px solid #86efac;margin:10px 0;"></div>
        <div style="font-size:13px;font-weight:800;">
          Net Amount (A − B1 − B2):
          <span class="${netAmt > 0 ? 'net-positive' : 'net-negative'}">
            ${netAmt < 0 ? '(REFUND) ' : '(PAYABLE) '}${fmt(Math.abs(netAmt))}
          </span>
        </div>
        ${netAmt < 0 ? '<div style="font-size:9px;color:#065f46;margin-top:4px;">← Landlord refunds this amount to tenant</div>' : netAmt > 0 ? '<div style="font-size:9px;color:#991b1b;margin-top:4px;">← Tenant pays this amount to landlord</div>' : '<div style="font-size:9px;color:#065f46;margin-top:4px;">✓ Fully settled — zero balance</div>'}
      </div>

      <!-- Footer -->
      <div style="margin-top:20px;border-top:1px solid #e5e7eb;padding-top:10px;font-size:8.5px;color:#9ca3af;text-align:center;">
        Generated by Rentora Cloud Platform &nbsp;|&nbsp; Landlord: ${ownerName} &nbsp;|&nbsp; ${fmtDateTime(new Date().toISOString())}
        <br>This report is generated for landlord use only. Tenant financial data is protected by a 30-day access window from settlement date.
      </div>
    </div>
    </body></html>`;

    const filename = `Rentora_TenantReport_${tenant.name.replace(/\s+/g, '_')}_${tenant.id}.pdf`;
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    html2pdf().set({
      margin: [8, 7, 8, 7],
      filename,
      image: { type: 'jpeg', quality: 0.97 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    }).from(container.firstChild).save().then(() => {
      document.body.removeChild(container);
    }).catch(err => {
      document.body.removeChild(container);
      console.error('PDF generation error:', err);
      alert('PDF generation failed. Please try again.');
    });
  };

  // ── State bridge: expose app state to this module ──────────────────────────
  // Monkey-patch renderAllPortalData once app.js is loaded to keep our
  // __rentoraState reference fresh on every Firestore update.
  function installStateBridge() {
    // We need access to the closure-scoped `state` in app.js.
    // Safe approach: app.js calls renderAllPortalData() after every update.
    // We wrap it to also update window.__rentoraState.
    // The app exposes state indirectly via the DOM — we extract it here
    // by hooking into the global renderAllPortalData that app.js sets on window.

    const original = window.renderAllPortalData;
    if (typeof original === 'function') {
      window.renderAllPortalData = function () {
        original.apply(this, arguments);
        // After render, sync state via the global the app sets
        if (window.__rentoraStateGetter) {
          window.__rentoraState = window.__rentoraStateGetter();
        }
        // If reports panel is active, refresh tenant list (property filter stays)
        const panel = document.getElementById('panel-reports');
        if (panel && panel.classList.contains('active') && typeof renderReportTenantList === 'function') {
          renderReportTenantList();
        }
      };
    } else {
      // app.js not loaded yet — retry
      setTimeout(installStateBridge, 200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installStateBridge);
  } else {
    installStateBridge();
  }

})();

