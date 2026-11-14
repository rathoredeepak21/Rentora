/* =============================================================================
   RENTORA — TENANT-WISE HISTORICAL REPORT ENGINE (ENHANCED)
   Supports BOTH Active Tenants and Vacated Tenants:
   - OPTION 1: Active Tenant Historical Report (Full financial ledger, utilities,
     actual payment records, opening/closing balance, custom date range filtering,
     no settlement required, exports to Excel .xlsx and PDF).
   - OPTION 2: Vacated Tenant Historical Report (Existing 30-day settlement window,
     final settlement breakdown, deposit deductions, refund/payment direction).
   Strictly read-only: does not modify or delete any database records.
   ============================================================================= */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const REPORT_ACCESS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in ms for vacated tenants

  // ── Module State ───────────────────────────────────────────────────────────
  let _currentReportType = 'active'; // 'active' | 'vacated'
  let _currentReportTenantId = null;
  let _currentStartDate = '';
  let _currentEndDate = '';
  let _activePreviewTab = 'summary'; // 'summary' | 'bills' | 'payments' | 'ledger' | 'dues'

  // ── Formatting Helpers ─────────────────────────────────────────────────────
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
      return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return str; }
  }

  function formatMonthReadable(billingMonth) {
    if (!billingMonth) return '—';
    try {
      const parts = String(billingMonth).split('-');
      if (parts.length === 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const d = new Date(year, month, 1);
        return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      }
    } catch (_) {}
    return billingMonth;
  }

  function paymentMethodLabel(method) {
    const map = {
      upi: 'UPI', cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
      neft: 'NEFT', rtgs: 'RTGS', imps: 'IMPS', online: 'Online', other: 'Other'
    };
    return map[(method || '').toLowerCase()] || method || '—';
  }

  function getSettlementStatusLabel(settlement) {
    if (!settlement) return '—';
    const status = settlement.paymentStatus || '';
    if (status === 'refund_pending') return 'REFUND PENDING';
    if (status === 'partially_refunded') return 'PARTIALLY REFUNDED';
    if (status === 'payment_pending') return 'PAYMENT PENDING';
    if (status === 'partially_paid') return 'PARTIALLY PAID';
    if (status === 'fully_settled') return 'FULLY SETTLED';

    const net = Number(settlement.netSettlementAmount != null ? settlement.netSettlementAmount : settlement.finalAmount != null ? settlement.finalAmount : settlement.netAmount) || 0;
    if (settlement.settlementDirection === 'refund_to_tenant' || net < 0) return 'REFUND PENDING';
    if (settlement.settlementDirection === 'payment_by_tenant' || net > 0) return 'PAYMENT PENDING';
    return 'FULLY SETTLED';
  }

  function paymentStatusLabel(bill) {
    if (!bill) return 'UNPAID';
    if (bill.paymentStatus === 'paid') return 'PAID';
    if (bill.paymentStatus === 'partial') return 'PARTIALLY PAID';
    if (bill.paymentStatus === 'unpaid') return 'UNPAID';
    const paid = Number(bill.paidAmount) || 0;
    const remaining = Number(bill.remainingAmount);
    if (!isNaN(remaining) && remaining <= 0 && paid > 0) return 'PAID';
    if (paid > 0) return 'PARTIALLY PAID';
    return 'UNPAID';
  }

  function getBillDate(b) {
    if (!b) return '';
    if (b.createdAt && typeof b.createdAt === 'string') return b.createdAt.split('T')[0];
    if (b.issueDate && typeof b.issueDate === 'string') return b.issueDate.split('T')[0];
    if (b.dueDate && typeof b.dueDate === 'string') return b.dueDate.split('T')[0];
    if (b.billingMonth && typeof b.billingMonth === 'string') return b.billingMonth + '-01';
    return '';
  }

  function getPaymentDate(p) {
    if (!p) return '';
    if (p.paymentDate && typeof p.paymentDate === 'string') return p.paymentDate.split('T')[0];
    if (p.createdAt && typeof p.createdAt === 'string') return p.createdAt.split('T')[0];
    return '';
  }

  function getBillSubtotal(b) {
    if (b.subtotal !== undefined && !isNaN(Number(b.subtotal))) {
      return Number(b.subtotal);
    }
    return (Number(b.rent) || 0) +
      (Number(b.electricityCharge) || 0) +
      (Number(b.waterCharge) || 0) +
      (Number(b.parkingCharge) || 0) +
      (Number(b.maintenanceCharge) || 0) +
      (Number(b.otherCharges) || 0);
  }

  // ── State accessor ─────────────────────────────────────────────────────────
  function getState() {
    if (typeof window.__rentoraStateGetter === 'function') {
      return window.__rentoraStateGetter();
    }
    return window.__rentoraState || null;
  }

  // ── 30-day expiry check (for Vacated Tenants only) ──────────────────────────
  function getExpiryInfo(settlement) {
    if (!settlement || !settlement.createdAt) {
      return { hasSettlement: false, isExpired: false, expiry: null, remaining: null, start: null };
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

  // ── Core Data Assembler ────────────────────────────────────────────────────
  function assembleReportData(tenantId, reportTypeOverride, customStartDate, customEndDate) {
    const st = getState();
    if (!st) return { error: 'no_state', message: 'Application data is loading. Please wait a moment and try again.' };

    const type = reportTypeOverride || _currentReportType;
    const tenant = (st.tenants || []).find(t => t.id === tenantId);
    if (!tenant) return { error: 'not_found', message: 'Tenant record not found in database.' };

    const property = (st.properties || []).find(p => p.id === tenant.propertyId) || {};
    const unit = (st.units || []).find(u => u.id === tenant.unitId) || {};
    const settings = st.settings || {};

    // =========================================================================
    // CASE A: VACATED TENANT HISTORICAL REPORT (PRESERVE EXISTING LOGIC)
    // =========================================================================
    if (type === 'vacated') {
      if (tenant.status !== 'vacated') {
        return { error: 'not_vacated', message: 'This tenant is currently active. Please select "Active Tenant Historical Report" above.' };
      }

      // Find settlement
      const settlement = (st.settlements || []).find(s =>
        s.tenantId === tenantId ||
        (tenant.settlementNum && s.settlementNumber === tenant.settlementNum)
      ) || null;

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

      // All bills for this tenant
      const bills = (st.bills || [])
        .filter(b => b.tenantId === tenantId)
        .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

      // All payments for this tenant
      const payments = (st.payments || [])
        .filter(p => p.tenantId === tenantId)
        .sort((a, b) => (a.paymentDate || a.createdAt || '').localeCompare(b.paymentDate || b.createdAt || ''));

      const paymentsByBill = {};
      payments.forEach(p => {
        const bid = p.billId || '__unallocated__';
        if (!paymentsByBill[bid]) paymentsByBill[bid] = [];
        paymentsByBill[bid].push(p);
      });

      const totalBilled = bills.reduce((s, b) => s + (Number(b.totalAmount) || 0), 0);
      const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || Number(p.amountPaid) || 0), 0);
      const outstandingBills = bills.filter(b => paymentStatusLabel(b) !== 'PAID');
      const totalOutstanding = outstandingBills.reduce((s, b) => s + (Number(b.remainingAmount) || 0), 0);

      return {
        ok: true,
        reportType: 'vacated',
        tenant,
        property,
        unit,
        settlement,
        settings,
        bills,
        payments,
        paymentsByBill,
        expiry,
        startDate: tenant.moveIn || '',
        endDate: tenant.moveOut || '',
        summary: {
          totalBilled,
          totalPaid,
          totalOutstanding,
          billCount: bills.length,
          paymentCount: payments.length
        }
      };
    }

    // =========================================================================
    // CASE B: ACTIVE TENANT HISTORICAL REPORT (NEW)
    // =========================================================================
    if (tenant.status === 'vacated') {
      return { error: 'is_vacated', message: 'This tenant has vacated. Please switch to "Vacated Tenant Historical Report" to access settlement history.' };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const defaultStart = tenant.moveIn || todayStr;
    const startDate = customStartDate || defaultStart;
    const endDate = customEndDate || todayStr;

    // Fetch all tenant bills and sort chronologically
    const allTenantBills = (st.bills || [])
      .filter(b => b.tenantId === tenantId)
      .sort((a, b) => getBillDate(a).localeCompare(getBillDate(b)));

    // Fetch all tenant payments and sort chronologically
    const allTenantPayments = (st.payments || [])
      .filter(p => p.tenantId === tenantId)
      .sort((a, b) => getPaymentDate(a).localeCompare(getPaymentDate(b)));

    // ── Calculate Opening Balance (Prior to startDate) ──────────────────────
    let openingBalance = 0;
    let priorCharges = 0;
    let priorPaid = 0;

    const tenantMoveIn = tenant.moveIn || '';
    const hasHistoryBeforeStart = tenantMoveIn && startDate > tenantMoveIn;

    if (hasHistoryBeforeStart) {
      const priorBills = allTenantBills.filter(b => {
        const d = getBillDate(b);
        return d && d < startDate;
      });
      const priorPayments = allTenantPayments.filter(p => {
        const d = getPaymentDate(p);
        return d && d < startDate;
      });

      // Sum subtotal charges of prior bills
      priorBills.forEach((b, idx) => {
        priorCharges += getBillSubtotal(b);
        if (idx === 0 && Number(b.previousDue) > 0) {
          priorCharges += Number(b.previousDue);
        }
      });

      // Sum actual payment records prior to start
      priorPaid = priorPayments.reduce((s, p) => s + (Number(p.amount) || Number(p.amountPaid) || 0), 0);
      openingBalance = priorCharges - priorPaid;
    } else {
      openingBalance = 0;
    }

    // ── Filter Bills and Payments within [startDate, endDate] ───────────────
    const bills = allTenantBills.filter(b => {
      const d = getBillDate(b);
      return !d || (d >= startDate && d <= endDate);
    });

    const payments = allTenantPayments.filter(p => {
      const d = getPaymentDate(p);
      return !d || (d >= startDate && d <= endDate);
    });

    // Payments lookup by billId
    const paymentsByBill = {};
    payments.forEach(p => {
      const bid = p.billId || '__unallocated__';
      if (!paymentsByBill[bid]) paymentsByBill[bid] = [];
      paymentsByBill[bid].push(p);
    });

    // ── Financial Totals in Period ──────────────────────────────────────────
    let periodBilled = 0;
    bills.forEach((b, idx) => {
      periodBilled += getBillSubtotal(b);
      // If the first tenant bill ever is in this period and was not in prior bills:
      if (!hasHistoryBeforeStart && allTenantBills.length > 0 && b.id === allTenantBills[0].id && Number(b.previousDue) > 0) {
        periodBilled += Number(b.previousDue);
      }
    });

    const periodPaid = payments.reduce((s, p) => s + (Number(p.amount) || Number(p.amountPaid) || 0), 0);
    const closingBalance = openingBalance + periodBilled - periodPaid;

    const outstandingBills = bills.filter(b => paymentStatusLabel(b) !== 'PAID');
    const totalOutstandingInPeriod = outstandingBills.reduce((s, b) => s + (Number(b.remainingAmount) || 0), 0);

    // Utilities aggregation
    const totalElecUnits = bills.reduce((s, b) => s + (Number(b.electricityUnits) || 0), 0);
    const totalElecCharge = bills.reduce((s, b) => s + (Number(b.electricityCharge) || 0), 0);
    const totalWaterCharge = bills.reduce((s, b) => s + (Number(b.waterCharge) || 0), 0);
    const totalParkingCharge = bills.reduce((s, b) => s + (Number(b.parkingCharge) || 0), 0);
    const totalMaintenanceCharge = bills.reduce((s, b) => s + (Number(b.maintenanceCharge) || 0), 0);
    const totalOtherCharges = bills.reduce((s, b) => s + (Number(b.otherCharges) || 0), 0);
    const totalRentBilled = bills.reduce((s, b) => s + (Number(b.rent) || 0), 0);

    // Meter readings
    const initialMeter = tenant.initialMeter ?? (bills.length > 0 ? bills[0].previousMeterReading : '—');
    const latestMeter = bills.length > 0
      ? (bills[bills.length - 1].currentMeterReading ?? bills[bills.length - 1].previousMeterReading ?? '—')
      : (tenant.initialMeter ?? '—');

    // Security deposit and advance rent
    const securityDeposit = Number(tenant.deposit != null ? tenant.deposit : tenant.securityDeposit) || 0;
    const advanceRent = Number(tenant.advance != null ? tenant.advance : tenant.advanceAmount) || 0;

    // ── Build Chronological Date-Wise Ledger (Audit Trail) ───────────────────
    const ledger = [];
    let runningBal = openingBalance;

    if (openingBalance !== 0) {
      ledger.push({
        date: startDate,
        time: '00:00',
        type: 'opening',
        typeLabel: 'Opening Balance',
        reference: 'BAL-FWD',
        description: `Opening balance brought forward as of ${fmtDate(startDate)}`,
        debit: openingBalance > 0 ? openingBalance : 0,
        credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
        balance: runningBal
      });
    }

    const events = [];
    bills.forEach(b => {
      const d = getBillDate(b) || startDate;
      const t = b.createdAt && b.createdAt.includes('T') ? b.createdAt.split('T')[1].slice(0, 5) : '00:00';
      const charge = getBillSubtotal(b) + (!hasHistoryBeforeStart && allTenantBills.length > 0 && b.id === allTenantBills[0].id ? (Number(b.previousDue) || 0) : 0);
      events.push({
        date: d,
        time: t,
        kind: 'bill',
        bill: b,
        charge
      });
    });

    payments.forEach(p => {
      const d = getPaymentDate(p) || startDate;
      const t = p.createdAt && p.createdAt.includes('T') ? p.createdAt.split('T')[1].slice(0, 5) : '12:00';
      const amt = Number(p.amount) || Number(p.amountPaid) || 0;
      events.push({
        date: d,
        time: t,
        kind: 'payment',
        payment: p,
        amount: amt
      });
    });

    // Chronological order: bills first on the same date/time
    events.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.kind !== b.kind) return a.kind === 'bill' ? -1 : 1;
      return a.time.localeCompare(b.time);
    });

    events.forEach(ev => {
      if (ev.kind === 'bill') {
        const b = ev.bill;
        runningBal += ev.charge;
        ledger.push({
          date: ev.date,
          time: ev.time,
          type: 'bill',
          typeLabel: 'Bill Raised',
          reference: b.billNumber || b.billingMonth || 'Bill',
          description: `Bill for ${formatMonthReadable(b.billingMonth)} (Rent: ₹${(Number(b.rent) || 0).toLocaleString('en-IN')}${b.electricityCharge ? ', Elec: ₹' + Number(b.electricityCharge).toLocaleString('en-IN') : ''}${b.waterCharge ? ', Water: ₹' + Number(b.waterCharge).toLocaleString('en-IN') : ''})`,
          debit: ev.charge,
          credit: 0,
          balance: runningBal,
          item: b
        });
      } else {
        const p = ev.payment;
        runningBal -= ev.amount;
        ledger.push({
          date: ev.date,
          time: ev.time,
          type: 'payment',
          typeLabel: 'Payment Received',
          reference: p.transactionId || p.referenceId || 'Payment',
          description: `Payment received via ${paymentMethodLabel(p.paymentMethod || p.mode)}${p.notes ? ' — ' + p.notes : ''}`,
          debit: 0,
          credit: ev.amount,
          balance: runningBal,
          item: p
        });
      }
    });

    return {
      ok: true,
      reportType: 'active',
      tenant,
      property,
      unit,
      settings,
      bills,
      allTenantBills,
      payments,
      allTenantPayments,
      paymentsByBill,
      ledger,
      startDate,
      endDate,
      readings: {
        initialMeter,
        latestMeter,
        meterNumber: unit.meter || tenant.meter || '—'
      },
      summary: {
        openingBalance,
        periodBilled,
        periodPaid,
        closingBalance,
        totalOutstanding: totalOutstandingInPeriod,
        totalRentBilled,
        totalElecUnits,
        totalElecCharge,
        totalWaterCharge,
        totalParkingCharge,
        totalMaintenanceCharge,
        totalOtherCharges,
        securityDeposit,
        advanceRent,
        billCount: bills.length,
        paymentCount: payments.length,
        outstandingBillCount: outstandingBills.length
      }
    };
  }

  // ── UI: Report Type Switching ───────────────────────────────────────────────
  window.setReportType = function (type) {
    if (type !== 'active' && type !== 'vacated') return;
    _currentReportType = type;

    // Toggle selected state on cards
    const cardActive = document.getElementById('rptTypeCardActive');
    const cardVacated = document.getElementById('rptTypeCardVacated');
    if (cardActive) cardActive.classList.toggle('rpt-type-card--selected', type === 'active');
    if (cardVacated) cardVacated.classList.toggle('rpt-type-card--selected', type === 'vacated');

    // Update Step 3 header
    const stepLabel = document.getElementById('rptTenantStepLabel');
    if (stepLabel) {
      stepLabel.textContent = type === 'active' ? '3. Select Active Tenant' : '3. Select Vacated Tenant';
    }

    // Hide preview card and reset selection
    _currentReportTenantId = null;
    const reportCard = document.getElementById('rptTenantCard');
    if (reportCard) reportCard.style.display = 'none';

    const dateCard = document.getElementById('rptDateRangeCard');
    if (dateCard) dateCard.style.display = 'none';

    // Re-render tenant list
    window.renderReportTenantList();
  };

  // ── UI: Render Reports Panel ────────────────────────────────────────────────
  window.renderReportsPanel = function () {
    const st = getState();
    if (!st) return;

    const propSel = document.getElementById('rptPropertySelect');
    if (!propSel) return;

    // Populate property dropdown
    const currentVal = propSel.value || (st.activeProperty ? st.activeProperty.id : '');
    propSel.innerHTML = '<option value="">— Select a property —</option>';
    (st.properties || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === currentVal) opt.selected = true;
      propSel.appendChild(opt);
    });

    window.renderReportTenantList();
  };

  // ── UI: Render Tenant List ──────────────────────────────────────────────────
  window.renderReportTenantList = function () {
    const st = getState();
    const area = document.getElementById('rptTenantListArea');
    const reportCard = document.getElementById('rptTenantCard');
    const dateCard = document.getElementById('rptDateRangeCard');
    if (!area) return;

    if (reportCard) reportCard.style.display = 'none';
    if (dateCard) dateCard.style.display = 'none';

    const propId = document.getElementById('rptPropertySelect')?.value || '';
    if (!propId || !st) {
      const noun = _currentReportType === 'active' ? 'active' : 'vacated';
      area.innerHTML = `<p style="font-size:0.85rem;color:var(--text-muted);padding:12px 0;">Select a property above to see ${noun} tenants.</p>`;
      return;
    }

    const tenants = st.tenants || [];
    let filtered = [];

    if (_currentReportType === 'active') {
      filtered = tenants.filter(t => t.propertyId === propId && t.status !== 'vacated');
      if (filtered.length === 0) {
        area.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);padding:12px 0;">No active tenants found in this property.</p>';
        return;
      }

      let html = '<div style="display:flex;flex-direction:column;gap:10px;">';
      filtered.forEach(t => {
        const isSelected = _currentReportTenantId === t.id;
        const tenantBills = (st.bills || []).filter(b => b.tenantId === t.id);
        const unpaidBills = tenantBills.filter(b => paymentStatusLabel(b) !== 'PAID');
        const dueAmt = unpaidBills.reduce((s, b) => s + (Number(b.remainingAmount) || 0), 0);

        html += `
          <div class="rpt-tenant-row ${isSelected ? 'rpt-tenant-row--selected' : ''}" onclick="selectReportTenant('${t.id}')" data-tenant-id="${t.id}">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;">
                <strong style="color:var(--text-main);font-size:0.95rem;">${t.name}</strong>
                <span style="font-size:0.82rem;color:var(--text-secondary);">— Unit ${t.unitNumber || '—'}</span>
                <span class="rpt-badge rpt-badge--active">ACTIVE</span>
              </div>
              <div style="text-align:right;">
                ${dueAmt > 0
                  ? `<span style="font-size:0.8rem;color:#ef4444;font-weight:700;">Due: ₹${dueAmt.toLocaleString('en-IN')}</span>`
                  : `<span style="font-size:0.8rem;color:#10b981;font-weight:600;">All Bills Cleared</span>`}
              </div>
            </div>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;display:flex;gap:14px;flex-wrap:wrap;">
              <span>Move-In: <strong style="color:var(--text-secondary);">${fmtDate(t.moveIn)}</strong></span>
              <span>Rent: <strong style="color:var(--text-secondary);">${fmt(t.rent || t.monthlyRent)}/mo</strong></span>
              ${Number(t.deposit || t.securityDeposit) > 0 ? `<span>Deposit: <strong style="color:var(--text-secondary);">${fmt(t.deposit || t.securityDeposit)}</strong></span>` : ''}
              ${Number(t.advance || t.advanceAmount) > 0 ? `<span>Advance: <strong style="color:#10b981;">${fmt(t.advance || t.advanceAmount)}</strong></span>` : ''}
              ${t.mobile ? `<span>Mobile: <strong style="color:var(--text-secondary);">${t.mobile}</strong></span>` : ''}
            </div>
          </div>`;
      });
      html += '</div>';
      area.innerHTML = html;

    } else {
      // Vacated tenants
      filtered = tenants.filter(t => t.propertyId === propId && t.status === 'vacated');
      if (filtered.length === 0) {
        area.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);padding:12px 0;">No vacated tenants found in this property.</p>';
        return;
      }

      let html = '<div style="display:flex;flex-direction:column;gap:10px;">';
      filtered.forEach(t => {
        const settlement = (st.settlements || []).find(s => s.tenantId === t.id || (t.settlementNum && s.settlementNumber === t.settlementNum));
        const expiry = getExpiryInfo(settlement);
        let badge = '';
        let disabled = '';
        if (!expiry.hasSettlement) {
          badge = `<span class="rpt-badge" style="background:rgba(245,158,11,0.15);color:#d97706;border:1px solid #d97706;">No Settlement</span>`;
          disabled = 'style="opacity:0.55;cursor:not-allowed;"';
        } else if (expiry.isExpired) {
          badge = `<span class="rpt-badge" style="background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid #ef4444;">Access Expired</span>`;
          disabled = 'style="opacity:0.55;cursor:not-allowed;"';
        } else {
          badge = `<span class="rpt-badge" style="background:rgba(16,185,129,0.12);color:#10b981;border:1px solid #10b981;">${formatRemaining(expiry.remaining)}</span>`;
        }
        const clickable = (!expiry.hasSettlement || expiry.isExpired) ? '' : `onclick="selectReportTenant('${t.id}')"`;
        const isSelected = _currentReportTenantId === t.id;

        html += `
          <div class="rpt-tenant-row ${isSelected ? 'rpt-tenant-row--selected' : ''}" ${clickable} ${disabled} data-tenant-id="${t.id}">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;">
                <strong style="color:var(--text-main);">${t.name}</strong>
                <span style="font-size:0.82rem;color:var(--text-secondary);">— Unit ${t.unitNumber || '—'}</span>
                <span class="rpt-badge rpt-badge--vacated">VACATED</span>
                ${badge}
              </div>
            </div>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">
              Moved in: ${fmtDate(t.moveIn)} &nbsp;|&nbsp; Vacated: ${fmtDate(t.moveOut)}
              ${settlement ? ` &nbsp;|&nbsp; Settlement: <strong style="color:var(--text-secondary);">${settlement.settlementNumber}</strong>` : ''}
            </div>
          </div>`;
      });
      html += '</div>';
      area.innerHTML = html;
    }
  };

  // ── UI: Select Tenant ───────────────────────────────────────────────────────
  window.selectReportTenant = function (tenantId) {
    _currentReportTenantId = tenantId;

    // Highlight selected row in DOM
    document.querySelectorAll('.rpt-tenant-row').forEach(el => {
      el.classList.toggle('rpt-tenant-row--selected', el.dataset.tenantId === tenantId);
    });

    const st = getState();
    const tenant = (st?.tenants || []).find(t => t.id === tenantId);
    if (!tenant) return;

    const dateCard = document.getElementById('rptDateRangeCard');
    const startInput = document.getElementById('rptStartDate');
    const endInput = document.getElementById('rptEndDate');
    const todayStr = new Date().toISOString().split('T')[0];

    if (_currentReportType === 'active') {
      const moveInStr = tenant.moveIn || todayStr;
      _currentStartDate = moveInStr;
      _currentEndDate = todayStr;

      if (startInput) startInput.value = moveInStr;
      if (endInput) endInput.value = todayStr;
      if (dateCard) dateCard.style.display = 'block';

      updateDateRangeInfo();
      window.generateSelectedReport();
    } else {
      if (dateCard) dateCard.style.display = 'none';
      window.generateSelectedReport();
    }
  };

  // ── UI: Quick Date Range Selection ──────────────────────────────────────────
  window.setQuickDateRange = function (preset) {
    const st = getState();
    const tenant = (st?.tenants || []).find(t => t.id === _currentReportTenantId);
    if (!tenant) return;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    let startStr = tenant.moveIn || todayStr;

    if (preset === 'all') {
      startStr = tenant.moveIn || todayStr;
    } else if (preset === 'last3m') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      startStr = d.toISOString().split('T')[0];
    } else if (preset === 'last6m') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      startStr = d.toISOString().split('T')[0];
    } else if (preset === 'currentMonth') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      startStr = d.toISOString().split('T')[0];
    } else if (preset === 'thisYear') {
      const d = new Date(today.getFullYear(), 0, 1);
      startStr = d.toISOString().split('T')[0];
    }

    const startInput = document.getElementById('rptStartDate');
    const endInput = document.getElementById('rptEndDate');
    if (startInput) startInput.value = startStr;
    if (endInput) endInput.value = todayStr;

    _currentStartDate = startStr;
    _currentEndDate = todayStr;

    updateDateRangeInfo();
    window.generateSelectedReport();
  };

  window.handleReportDateInputChange = function () {
    const startInput = document.getElementById('rptStartDate');
    const endInput = document.getElementById('rptEndDate');
    if (startInput) _currentStartDate = startInput.value;
    if (endInput) _currentEndDate = endInput.value;
    updateDateRangeInfo();
  };

  function updateDateRangeInfo() {
    const info = document.getElementById('rptDateRangeInfo');
    if (!info) return;
    if (_currentStartDate && _currentEndDate) {
      info.textContent = `Period: ${fmtDate(_currentStartDate)} → ${fmtDate(_currentEndDate)}`;
    } else {
      info.textContent = '';
    }
  }

  // ── UI: Generate Report ─────────────────────────────────────────────────────
  window.generateSelectedReport = function () {
    if (!_currentReportTenantId) return;

    const loading = document.getElementById('rptLoadingIndicator');
    const card = document.getElementById('rptTenantCard');
    const summary = document.getElementById('rptTenantSummary');
    const expiryBanner = document.getElementById('rptExpiryBanner');
    const statusBadgeArea = document.getElementById('rptStatusBadgeArea');
    const previewArea = document.getElementById('rptDetailedPreview');
    const dlBtns = document.getElementById('rptDownloadBtns');

    if (loading) loading.style.display = 'block';
    if (card) card.style.display = 'none';

    // Read date inputs if active
    if (_currentReportType === 'active') {
      const sVal = document.getElementById('rptStartDate')?.value;
      const eVal = document.getElementById('rptEndDate')?.value;
      if (sVal) _currentStartDate = sVal;
      if (eVal) _currentEndDate = eVal;
    }

    setTimeout(() => {
      const data = assembleReportData(_currentReportTenantId, _currentReportType, _currentStartDate, _currentEndDate);

      if (loading) loading.style.display = 'none';
      if (!card) return;

      card.style.display = 'block';

      if (data.error) {
        if (summary) summary.innerHTML = `<p style="color:var(--danger);font-weight:600;padding:8px 0;">${data.message}</p>`;
        if (expiryBanner) expiryBanner.innerHTML = '';
        if (statusBadgeArea) statusBadgeArea.innerHTML = '';
        if (previewArea) previewArea.innerHTML = '';
        if (dlBtns) dlBtns.style.display = 'none';
        return;
      }

      if (dlBtns) dlBtns.style.display = 'flex';

      // =======================================================================
      // RENDER ACTIVE TENANT REPORT
      // =======================================================================
      if (data.reportType === 'active') {
        const { tenant, property, unit, readings, summary: fin, startDate, endDate, bills, payments, ledger } = data;

        if (statusBadgeArea) {
          statusBadgeArea.innerHTML = `<span class="rpt-badge rpt-badge--active" style="font-size:0.8rem;padding:4px 12px;">ACTIVE TENANT</span>`;
        }

        if (expiryBanner) {
          expiryBanner.innerHTML = `
            <div style="padding:10px 14px;border-radius:var(--radius-sm);background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);color:#10b981;font-size:0.84rem;font-weight:600;display:flex;align-items:center;gap:8px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span>Currently Residing • Audit Period: <strong>${fmtDate(startDate)} → ${fmtDate(endDate)}</strong> (No settlement required)</span>
            </div>`;
        }

        if (summary) {
          summary.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;">
              <div>
                <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Tenant Profile</span>
                <div style="font-weight:700;font-size:1rem;color:var(--text-main);margin-top:2px;">${tenant.name}</div>
                <div style="font-size:0.82rem;color:var(--text-secondary);">${tenant.mobile || '—'}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">${tenant.occupation || 'Occupation N/A'}</div>
              </div>
              <div>
                <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Property & Unit</span>
                <div style="font-weight:600;margin-top:2px;color:var(--text-main);">Unit ${tenant.unitNumber || '—'}</div>
                <div style="font-size:0.82rem;color:var(--text-secondary);">${property.name || '—'}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">Meter: ${readings.meterNumber}</div>
              </div>
              <div>
                <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Tenancy Terms</span>
                <div style="font-size:0.85rem;margin-top:2px;color:var(--text-main);">Move-In: <strong>${fmtDate(tenant.moveIn)}</strong></div>
                <div style="font-size:0.85rem;color:var(--text-secondary);">Monthly Rent: <strong>${fmt(tenant.rent || tenant.monthlyRent)}</strong></div>
                <div style="font-size:0.82rem;color:var(--text-muted);">Security Deposit: ${fmt(fin.securityDeposit)}</div>
              </div>
              <div>
                <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Opening Balance</span>
                <div style="font-weight:700;margin-top:2px;font-size:1.05rem;color:${fin.openingBalance > 0 ? '#ef4444' : fin.openingBalance < 0 ? '#10b981' : 'var(--text-secondary)'};">
                  ${fmt(fin.openingBalance)}
                </div>
                <div style="font-size:0.78rem;color:var(--text-muted);">as of ${fmtDate(startDate)}</div>
              </div>
              <div>
                <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Total Billed in Period</span>
                <div style="font-weight:700;color:var(--primary);margin-top:2px;font-size:1.05rem;">${fmt(fin.periodBilled)}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">${fin.billCount} bills generated</div>
              </div>
              <div>
                <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Total Payments Received</span>
                <div style="font-weight:700;color:#10b981;margin-top:2px;font-size:1.05rem;">${fmt(fin.periodPaid)}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">${fin.paymentCount} actual payment records</div>
              </div>
              <div>
                <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Closing Outstanding Balance</span>
                <div style="font-weight:700;color:${fin.closingBalance > 0 ? '#ef4444' : '#10b981'};margin-top:2px;font-size:1.05rem;">
                  ${fmt(fin.closingBalance)}
                </div>
                <div style="font-size:0.78rem;color:var(--text-muted);">${fin.closingBalance > 0 ? 'Pending Dues' : 'Balance Cleared'}</div>
              </div>
              <div>
                <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Advance Rent Balance</span>
                <div style="font-weight:700;color:#10b981;margin-top:2px;font-size:1.05rem;">${fmt(fin.advanceRent)}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">Available credit</div>
              </div>
            </div>`;
        }

        // Render preview tabs
        renderActiveTenantDetailedPreview(data);

      // =======================================================================
      // RENDER VACATED TENANT REPORT
      // =======================================================================
      } else {
        const { tenant, property, settlement, expiry, summary: fin } = data;

        if (statusBadgeArea) {
          statusBadgeArea.innerHTML = `<span class="rpt-badge rpt-badge--vacated" style="font-size:0.8rem;padding:4px 12px;">VACATED TENANT</span>`;
        }

        if (expiryBanner) {
          const expiryDate = expiry.expiry;
          const remaining = expiry.remaining;
          const daysLeft = Math.ceil(remaining / 86400000);
          const bgColor = daysLeft <= 3 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)';
          const textColor = daysLeft <= 3 ? '#ef4444' : '#10b981';
          expiryBanner.innerHTML = `
            <div style="padding:10px 14px;border-radius:var(--radius-sm);background:${bgColor};border:1px solid ${textColor};color:${textColor};font-size:0.84rem;font-weight:600;">
              ⏳ Report access expires: ${fmtDateTime(expiryDate.toISOString())} &nbsp;|&nbsp; ${formatRemaining(remaining)}
            </div>`;
        }

        if (summary) {
          summary.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
              <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Tenant</span><div style="font-weight:700;margin-top:2px;color:var(--text-main);">${tenant.name}</div><div style="font-size:0.82rem;color:var(--text-secondary);">${tenant.mobile || '—'}</div></div>
              <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Unit</span><div style="font-weight:600;margin-top:2px;color:var(--text-main);">Unit ${tenant.unitNumber}</div><div style="font-size:0.82rem;color:var(--text-secondary);">${property.name || '—'}</div></div>
              <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Tenancy</span><div style="font-size:0.85rem;margin-top:2px;color:var(--text-main);">${fmtDate(tenant.moveIn)} → ${fmtDate(tenant.moveOut)}</div></div>
              <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Settlement</span><div style="font-size:0.85rem;margin-top:2px;color:var(--text-main);">${settlement.settlementNumber}</div><div style="font-size:0.8rem;color:var(--text-secondary);">${fmtDateTime(settlement.createdAt)}</div></div>
              <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Total Billed</span><div style="font-weight:700;color:var(--primary);margin-top:2px;">${fmt(fin.totalBilled)}</div></div>
              <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Total Paid</span><div style="font-weight:700;color:#10b981;margin-top:2px;">${fmt(fin.totalPaid)}</div></div>
              <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Outstanding</span><div style="font-weight:700;color:${fin.totalOutstanding > 0 ? '#ef4444' : '#10b981'};margin-top:2px;">${fmt(fin.totalOutstanding)}</div></div>
              <div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Bills / Payments</span><div style="font-size:0.85rem;margin-top:2px;color:var(--text-main);">${fin.billCount} bills &nbsp;|&nbsp; ${fin.paymentCount} transactions</div></div>
            </div>`;
        }

        if (previewArea) {
          previewArea.innerHTML = '';
        }
      }
    }, 150);
  };

  // ── Render Active Tenant Interactive Preview Tabs ──────────────────────────
  function renderActiveTenantDetailedPreview(data) {
    const previewArea = document.getElementById('rptDetailedPreview');
    if (!previewArea) return;

    const { bills, payments, ledger, summary: fin } = data;

    let contentHtml = '';

    if (_activePreviewTab === 'summary') {
      contentHtml = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:14px;">
          <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);padding:14px;">
            <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Electricity Consumption</div>
            <div style="font-size:1.1rem;font-weight:800;color:var(--text-main);margin-top:4px;">${fin.totalElecUnits} units</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px;">Total Charge: <strong>${fmt(fin.totalElecCharge)}</strong></div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">Readings: ${data.readings.initialMeter} → ${data.readings.latestMeter}</div>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);padding:14px;">
            <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Water Charges</div>
            <div style="font-size:1.1rem;font-weight:800;color:var(--text-main);margin-top:4px;">${fmt(fin.totalWaterCharge)}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px;">Fixed/metered water charges billed in period</div>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);padding:14px;">
            <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Parking & Maintenance</div>
            <div style="font-size:1.1rem;font-weight:800;color:var(--text-main);margin-top:4px;">${fmt(fin.totalParkingCharge + fin.totalMaintenanceCharge)}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px;">Parking: ${fmt(fin.totalParkingCharge)} | Maint: ${fmt(fin.totalMaintenanceCharge)}</div>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);padding:14px;">
            <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Security Deposit Held</div>
            <div style="font-size:1.1rem;font-weight:800;color:#10b981;margin-top:4px;">${fmt(fin.securityDeposit)}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px;">Refundable on move-out settlement</div>
          </div>
        </div>`;
    } else if (_activePreviewTab === 'bills') {
      if (bills.length === 0) {
        contentHtml = '<p style="font-size:0.85rem;color:var(--text-muted);padding:16px 0;">No bills generated within this date range.</p>';
      } else {
        let rows = '';
        bills.forEach((b, i) => {
          const stLabel = paymentStatusLabel(b);
          const badgeClass = stLabel === 'PAID' ? 'badge-paid' : stLabel === 'PARTIALLY PAID' ? 'badge-partial' : 'badge-unpaid';
          rows += `<tr>
            <td>${i + 1}</td>
            <td><strong>${b.billNumber || '—'}</strong></td>
            <td>${formatMonthReadable(b.billingMonth)}</td>
            <td>${fmtDate(getBillDate(b))}</td>
            <td>${fmt(b.rent)}</td>
            <td>${b.electricityUnits || 0} u (${fmt(b.electricityCharge)})</td>
            <td>${fmt(b.waterCharge)}</td>
            <td>${fmt(b.previousDue)}</td>
            <td style="font-weight:700;">${fmt(b.totalAmount)}</td>
            <td style="color:#10b981;font-weight:700;">${fmt(b.paidAmount)}</td>
            <td style="color:${Number(b.remainingAmount) > 0 ? '#ef4444' : '#10b981'};font-weight:700;">${fmt(b.remainingAmount)}</td>
            <td><span class="${badgeClass}">${stLabel}</span></td>
          </tr>`;
        });
        contentHtml = `
          <div style="overflow-x:auto;margin-top:12px;">
            <table class="portal-table" style="width:100%;font-size:0.82rem;">
              <thead>
                <tr>
                  <th>#</th><th>Bill No</th><th>Month</th><th>Date</th><th>Rent</th>
                  <th>Electricity</th><th>Water</th><th>Prev Due</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Status</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      }
    } else if (_activePreviewTab === 'payments') {
      if (payments.length === 0) {
        contentHtml = '<p style="font-size:0.85rem;color:var(--text-muted);padding:16px 0;">No payment transactions recorded within this date range.</p>';
      } else {
        let rows = '';
        payments.forEach((p, i) => {
          rows += `<tr>
            <td>${i + 1}</td>
            <td>${fmtDate(getPaymentDate(p))}</td>
            <td style="font-weight:700;color:#10b981;">${fmt(p.amount || p.amountPaid)}</td>
            <td>${paymentMethodLabel(p.paymentMethod || p.mode)}</td>
            <td style="font-family:monospace;font-size:0.75rem;">${p.transactionId || p.referenceId || '—'}</td>
            <td>${p.notes || p.remarks || '—'}</td>
          </tr>`;
        });
        contentHtml = `
          <div style="overflow-x:auto;margin-top:12px;">
            <table class="portal-table" style="width:100%;font-size:0.82rem;">
              <thead>
                <tr><th>#</th><th>Date</th><th>Amount</th><th>Method</th><th>Txn / Ref ID</th><th>Notes</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      }
    } else if (_activePreviewTab === 'ledger') {
      let rows = '';
      ledger.forEach((entry, i) => {
        rows += `<tr>
          <td>${i + 1}</td>
          <td>${fmtDate(entry.date)}</td>
          <td><span style="font-weight:600;color:${entry.type === 'bill' ? 'var(--primary)' : entry.type === 'payment' ? '#10b981' : 'var(--text-secondary)'};">${entry.typeLabel}</span></td>
          <td style="font-family:monospace;font-size:0.75rem;">${entry.reference}</td>
          <td>${entry.description}</td>
          <td style="color:var(--text-main);font-weight:600;">${entry.debit > 0 ? fmt(entry.debit) : '—'}</td>
          <td style="color:#10b981;font-weight:600;">${entry.credit > 0 ? fmt(entry.credit) : '—'}</td>
          <td style="font-weight:700;color:${entry.balance > 0 ? '#ef4444' : entry.balance < 0 ? '#10b981' : 'var(--text-main)'};">${fmt(entry.balance)}</td>
        </tr>`;
      });
      contentHtml = `
        <div style="overflow-x:auto;margin-top:12px;">
          <table class="portal-table" style="width:100%;font-size:0.82rem;">
            <thead>
              <tr><th>#</th><th>Date</th><th>Type</th><th>Ref</th><th>Description</th><th>Debit (+)</th><th>Credit (-)</th><th>Balance</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    previewArea.innerHTML = `
      <div style="border-top:1px solid var(--border-subtle);margin-top:16px;padding-top:14px;">
        <div style="display:flex;gap:4px;border-bottom:1px solid var(--border-subtle);margin-bottom:12px;overflow-x:auto;">
          <button type="button" class="rpt-preview-tab-btn ${_activePreviewTab === 'summary' ? 'active' : ''}" onclick="switchReportPreviewTab('summary')">Summary & Utilities</button>
          <button type="button" class="rpt-preview-tab-btn ${_activePreviewTab === 'bills' ? 'active' : ''}" onclick="switchReportPreviewTab('bills')">Bills History (${bills.length})</button>
          <button type="button" class="rpt-preview-tab-btn ${_activePreviewTab === 'payments' ? 'active' : ''}" onclick="switchReportPreviewTab('payments')">Payments (${payments.length})</button>
          <button type="button" class="rpt-preview-tab-btn ${_activePreviewTab === 'ledger' ? 'active' : ''}" onclick="switchReportPreviewTab('ledger')">Date-Wise Ledger (${ledger.length})</button>
        </div>
        ${contentHtml}
      </div>`;
  }

  window.switchReportPreviewTab = function (tab) {
    _activePreviewTab = tab;
    const data = assembleReportData(_currentReportTenantId, _currentReportType, _currentStartDate, _currentEndDate);
    if (data.ok && data.reportType === 'active') {
      renderActiveTenantDetailedPreview(data);
    }
  };

  // ── Excel Generation ────────────────────────────────────────────────────────
  window.downloadTenantExcel = function () {
    if (!_currentReportTenantId) { alert('Please select a tenant first.'); return; }

    const data = assembleReportData(_currentReportTenantId, _currentReportType, _currentStartDate, _currentEndDate);
    if (data.error) { alert(data.message); return; }

    if (typeof XLSX === 'undefined') {
      alert('Excel library not loaded. Please check your internet connection and try again.');
      return;
    }

    // =========================================================================
    // EXCEL CASE A: ACTIVE TENANT HISTORICAL REPORT
    // =========================================================================
    if (data.reportType === 'active') {
      const { tenant, property, unit, readings, bills, payments, ledger, summary: fin, startDate, endDate } = data;
      const wb = XLSX.utils.book_new();

      // Sheet 1: Tenant Profile & Summary
      const s1rows = [
        ['RENTORA — ACTIVE TENANT HISTORICAL REPORT'],
        ['Report Generated:', fmtDateTime(new Date().toISOString())],
        ['Audit Period (Date Range):', `${fmtDate(startDate)} → ${fmtDate(endDate)}`],
        ['Tenant Status:', 'ACTIVE (Currently Residing)'],
        [],
        ['TENANT PROFILE & CONTACT INFORMATION'],
        ['Tenant Name', tenant.name],
        ['Tenant ID', tenant.id],
        ['Mobile / Phone', tenant.mobile || '—'],
        ['Gender', tenant.gender || '—'],
        ['Occupation', tenant.occupation || '—'],
        ['Total Family Members', tenant.totalMembers || '—'],
        ['ID Proof Type', tenant.idProofType || '—'],
        ['Document Number', tenant.documentNumber || '—'],
        [],
        ['PROPERTY & ASSIGNED UNIT DETAILS'],
        ['Property Name', property.name || '—'],
        ['Property Address', property.address || '—'],
        ['Unit / Room Number', tenant.unitNumber || '—'],
        ['Electric Meter Number', readings.meterNumber],
        ['Initial Meter Reading', readings.initialMeter],
        ['Latest Meter Reading (in Period)', readings.latestMeter],
        [],
        ['TENANCY TERMS & ADVANCES'],
        ['Actual Move-In Date', fmtDate(tenant.moveIn)],
        ['Monthly Rent (Agreement)', Number(tenant.rent || tenant.monthlyRent) || 0],
        ['Security Deposit Held', fin.securityDeposit],
        ['Advance Rent Balance', fin.advanceRent],
        [],
        ['FINANCIAL LEDGER SUMMARY (AUDIT PERIOD)'],
        ['Opening Balance (as of ' + fmtDate(startDate) + ')', fin.openingBalance],
        ['Total New Charges Billed in Period', fin.periodBilled],
        ['Total Payments Received in Period', fin.periodPaid],
        ['Closing Outstanding Balance (as of ' + fmtDate(endDate) + ')', fin.closingBalance],
        ['Total Generated Bills in Period', fin.billCount],
        ['Unpaid / Partially Paid Bills Count', fin.outstandingBillCount],
        ['Total Actual Payment Records in Period', fin.paymentCount],
        [],
        ['UTILITIES & CHARGES BREAKDOWN (IN PERIOD)'],
        ['Total Monthly Rent Billed', fin.totalRentBilled],
        ['Total Electricity Units Consumed', fin.totalElecUnits],
        ['Total Electricity Charges Billed', fin.totalElecCharge],
        ['Total Water Charges Billed', fin.totalWaterCharge],
        ['Total Parking Charges Billed', fin.totalParkingCharge],
        ['Total Maintenance Charges Billed', fin.totalMaintenanceCharge],
        ['Total Other Charges Billed', fin.totalOtherCharges],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(s1rows);
      ws1['!cols'] = [{ wch: 36 }, { wch: 48 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'Tenant Summary');

      // Sheet 2: Bills History
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
          fmtDate(getBillDate(b)),
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
          getBillSubtotal(b),
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
        '',
        bills.reduce((s, b) => s + (Number(b.electricityCharge) || 0), 0),
        bills.reduce((s, b) => s + (Number(b.waterCharge) || 0), 0),
        bills.reduce((s, b) => s + (Number(b.parkingCharge) || 0), 0),
        bills.reduce((s, b) => s + (Number(b.maintenanceCharge) || 0), 0),
        bills.reduce((s, b) => s + (Number(b.otherCharges) || 0), 0),
        '', fin.periodBilled, '',
        bills.reduce((s, b) => s + (Number(b.paidAmount) || 0), 0),
        fin.totalOutstanding, '',
        '', '', '', ''
      ]);
      const ws2 = XLSX.utils.aoa_to_sheet(s2rows);
      ws2['!cols'] = s2header.map(() => ({ wch: 18 }));
      XLSX.utils.book_append_sheet(wb, ws2, 'Bills History');

      // Sheet 3: Payment History
      const s3header = [
        'Txn #', 'Payment Date', 'Time (Recorded)', 'Amount Received (₹)',
        'Payment Mode', 'Transaction / Ref ID', 'Allocation Breakdown',
        'Verification Status', 'Notes'
      ];
      const s3rows = [s3header];
      payments.forEach((p, i) => {
        const dateStr = getPaymentDate(p);
        const timeStr = p.createdAt && p.createdAt.includes('T') ? p.createdAt.split('T')[1].slice(0, 5) : '—';
        let allocDesc = '—';
        if (Array.isArray(p.allocations) && p.allocations.length > 0) {
          allocDesc = p.allocations.map(a => `${a.type === 'advance' ? 'Advance' : (a.billNumber || a.billId)}: ₹${Number(a.amount).toLocaleString('en-IN')}`).join(', ');
        } else if (p.billId) {
          allocDesc = p.billId === 'advance' ? 'Advance Rent' : `Bill ${p.billId}`;
        }
        s3rows.push([
          i + 1,
          fmtDate(dateStr),
          timeStr,
          Number(p.amount) || Number(p.amountPaid) || 0,
          paymentMethodLabel(p.paymentMethod || p.mode),
          p.transactionId || p.referenceId || '—',
          allocDesc,
          (p.status || 'approved').toUpperCase(),
          p.notes || p.remarks || '—'
        ]);
      });
      s3rows.push(['TOTAL', '', '', fin.periodPaid, '', '', '', '', '']);
      const ws3 = XLSX.utils.aoa_to_sheet(s3rows);
      ws3['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 32 }, { wch: 18 }, { wch: 24 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Payment History');

      // Sheet 4: Date-Wise Ledger (Audit Trail)
      const s4header = ['Entry #', 'Date', 'Time', 'Entry Type', 'Reference', 'Description', 'Debit / Billed (₹)', 'Credit / Paid (₹)', 'Running Balance (₹)'];
      const s4rows = [s4header];
      ledger.forEach((entry, i) => {
        s4rows.push([
          i + 1,
          fmtDate(entry.date),
          entry.time || '—',
          entry.typeLabel,
          entry.reference,
          entry.description,
          entry.debit > 0 ? entry.debit : 0,
          entry.credit > 0 ? entry.credit : 0,
          entry.balance
        ]);
      });
      const ws4 = XLSX.utils.aoa_to_sheet(s4rows);
      ws4['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 42 }, { wch: 18 }, { wch: 18 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws4, 'Date-Wise Ledger');

      // Sheet 5: Outstanding Dues & Pending Bills
      const s5rows = [
        ['OUTSTANDING BILLS & DUES SUMMARY'],
        ['Audit Period:', `${fmtDate(startDate)} → ${fmtDate(endDate)}`],
        ['Current Total Outstanding Dues:', fin.totalOutstanding],
        [],
        ['Bill #', 'Bill Number', 'Billing Month', 'Due Date', 'Total Amount (₹)', 'Paid Amount (₹)', 'Remaining Dues (₹)', 'Status']
      ];
      const outBills = bills.filter(b => paymentStatusLabel(b) !== 'PAID');
      if (outBills.length === 0) {
        s5rows.push(['—', 'All generated bills in this period are fully settled', '', '', 0, 0, 0, 'CLEARED']);
      } else {
        outBills.forEach((b, i) => {
          s5rows.push([
            i + 1,
            b.billNumber || '—',
            formatMonthReadable(b.billingMonth),
            fmtDate(b.dueDate),
            Number(b.totalAmount) || 0,
            Number(b.paidAmount) || 0,
            Number(b.remainingAmount) || 0,
            paymentStatusLabel(b)
          ]);
        });
        s5rows.push(['TOTAL PENDING DUES', '', '', '', '', '', fin.totalOutstanding, '']);
      }
      const ws5 = XLSX.utils.aoa_to_sheet(s5rows);
      ws5['!cols'] = [{ wch: 8 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws5, 'Outstanding Dues');

      const safeTenantName = tenant.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `Rentora_ActiveTenantReport_${safeTenantName}_${tenant.id}.xlsx`;
      XLSX.writeFile(wb, filename);
      return;
    }

    // =========================================================================
    // EXCEL CASE B: VACATED TENANT HISTORICAL REPORT (PRESERVE EXISTING)
    // =========================================================================
    const { tenant, property, unit, settlement, bills, payments, expiry, summary: fin } = data;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Tenant Summary
    const s1rows = [
      ['RENTORA — TENANT-WISE HISTORICAL REPORT (VACATED)'],
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
      ['Final Meter Reading', tenant.finalMeter ?? (settlement.elecUnits != null ? (tenant.initialMeter || 0) + (settlement.elecUnits || 0) : '—')],
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
      ['Settlement Date', fmtDateTime(settlement.createdAt || settlement.settlementDate)],
      ['Period End', fmtDate(settlement.periodEnd || settlement.normalPeriodEndDate)],
      ['Move-Out Date', fmtDate(settlement.moveOutDate)],
      ['Extra Days', settlement.extraDays ?? settlement.eligibleExtraDays ?? 0],
      ['Extra Stay Rent', Number(settlement.extraStayRent != null ? settlement.extraStayRent : settlement.extraStayAmount) || 0],
      ['Electricity Units (Final)', settlement.elecUnits ?? settlement.electricityUnits ?? 0],
      ['Electricity Rate', Number(settlement.elecRate != null ? settlement.elecRate : settlement.electricityRate) || 0],
      ['Final Electricity Charge', Number(settlement.elecCharge != null ? settlement.elecCharge : settlement.electricityCharge) || 0],
      ['Previous Outstanding Dues', Number(settlement.outstandingBillsBalance) || 0],
      ['Other Charges / Deductions', Number(settlement.otherCharges) || 0],
      ['Total Final Charges', Number(settlement.totalCharges) || 0],
      ['Advance Rent Adjusted', Number(settlement.advanceAdjusted != null ? settlement.advanceAdjusted : settlement.advanceRentAdjusted) || 0],
      ['Security Deposit Deducted', Number(settlement.depositDeducted != null ? settlement.depositDeducted : settlement.securityDepositAdjusted) || 0],
      ['Net Settlement Amount', Math.abs(Number(settlement.netSettlementAmount != null ? settlement.netSettlementAmount : settlement.finalAmount != null ? settlement.finalAmount : settlement.netAmount) || 0)],
      ['Payment Direction', settlement.settlementDirection === 'payment_by_tenant' ? 'Payment Payable by Tenant' : settlement.settlementDirection === 'zero_balance' ? 'Fully Settled (Zero Balance)' : 'Refund Payable to Tenant'],
      ['Settlement Payment Status', getSettlementStatusLabel(settlement)],
      ['Amount Settled', Number(settlement.amountSettled) || 0],
      ['Remaining Pending Balance', Number(settlement.amountPending != null ? settlement.amountPending : (Math.abs(Number(settlement.netSettlementAmount != null ? settlement.netSettlementAmount : settlement.finalAmount != null ? settlement.finalAmount : settlement.netAmount) || 0) - (Number(settlement.amountSettled) || 0)))],
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

    // Sheet 2: Bills History
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

    // Sheet 3: Payment History
    const s3header = [
      'Txn #', 'Payment Date', 'Time (Recorded)', 'Payment Amount (₹)',
      'Payment Mode', 'Transaction / Ref ID', 'Payment Received Details',
      'Verification Status', 'Received For Bill(s) & Month(s)', 'Notes'
    ];
    const s3rows = [s3header];
    const billNumMap = {};
    bills.forEach(b => { billNumMap[b.id] = b.billNumber || b.id; });

    payments.forEach((p, i) => {
      const dateStr = p.paymentDate || (p.createdAt ? p.createdAt.split('T')[0] : '');
      const timeStr = p.createdAt ? (p.createdAt.split('T')[1]?.slice(0, 5) || '—') : '—';
      let allocationSummary = '—';
      let allocatedMonths = '—';

      if (Array.isArray(p.allocations) && p.allocations.length > 0) {
        allocationSummary = p.allocations.map((a) => {
          if (a.type === 'advance') return `Advance (₹${Number(a.amount).toLocaleString('en-IN')})`;
          const b = bills.find((tb) => tb.id === a.billId);
          return `${b ? b.billNumber : (billNumMap[a.billId] || a.billId)} (₹${Number(a.amount).toLocaleString('en-IN')})`;
        }).join(', ');

        allocatedMonths = p.allocations.map((a) => {
          if (a.type === 'advance') return `Advance (₹${Number(a.amount).toLocaleString('en-IN')})`;
          const b = bills.find((tb) => tb.id === a.billId);
          const m = b?.billingMonth || a.billingMonth || '';
          const bNum = b ? b.billNumber : (a.billNumber || billNumMap[a.billId] || a.billId);
          return m ? `${m} [${bNum}] (₹${Number(a.amount).toLocaleString('en-IN')})` : `${bNum} (₹${Number(a.amount).toLocaleString('en-IN')})`;
        }).join(', ');
      } else {
        const associatedBill = bills.find((b) => b.id === p.billId);
        allocationSummary = associatedBill ? associatedBill.billNumber : (billNumMap[p.billId] || p.billId || 'Direct Payment');
        allocatedMonths = associatedBill ? `${associatedBill.billingMonth} [${associatedBill.billNumber}]` : (p.billId === 'advance' ? 'Advance Payment' : '—');
      }

      s3rows.push([
        i + 1,
        fmtDate(dateStr),
        timeStr,
        Number(p.amount) || Number(p.amountPaid) || 0,
        paymentMethodLabel(p.paymentMethod || p.mode),
        p.transactionId || p.referenceId || '—',
        allocationSummary,
        (p.status || 'approved').toUpperCase(),
        allocatedMonths,
        p.notes || p.remarks || '—',
      ]);
    });
    s3rows.push(['TOTAL', '', '', fin.totalPaid, '', '', '', '', '', '']);
    const ws3 = XLSX.utils.aoa_to_sheet(s3rows);
    ws3['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 28 }, { wch: 18 }, { wch: 32 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Payment History');

    // Sheet 4: Outstanding & Final Settlement
    const s4rows = [
      ['A. OUTSTANDING BILLS RECORD'],
      ['Bill #', 'Bill Number', 'Billing Month', 'Total Amount (₹)', 'Paid Amount (₹)', 'Remaining Dues (₹)', 'Status'],
    ];
    const outstandingBills = bills.filter(b => paymentStatusLabel(b) !== 'PAID');
    if (outstandingBills.length === 0) {
      s4rows.push(['—', 'All generated bills have been paid in full', '', 0, 0, 0, 'CLEARED']);
    } else {
      outstandingBills.forEach((b, i) => {
        s4rows.push([
          i + 1, b.billNumber || '—', b.billingMonth || '—',
          Number(b.totalAmount) || 0, Number(b.paidAmount) || 0,
          Number(b.remainingAmount) || 0, paymentStatusLabel(b)
        ]);
      });
      s4rows.push(['SUBTOTAL', '', '', '', '', fin.totalOutstanding, '']);
    }
    s4rows.push([]);
    s4rows.push(['B. FINAL SETTLEMENT BREAKDOWN']);
    s4rows.push(['Settlement Document Number', settlement.settlementNumber]);
    s4rows.push(['Settlement Date & Time', fmtDateTime(settlement.createdAt || settlement.settlementDate)]);
    s4rows.push(['Billing Cycle End Date', fmtDate(settlement.periodEnd || settlement.normalPeriodEndDate)]);
    s4rows.push(['Actual Move-Out Date', fmtDate(settlement.moveOutDate)]);
    s4rows.push(['Extra Stay Policy', settlement.policy || settlement.extraStayPolicy || '—']);
    s4rows.push([]);
    s4rows.push(['FINAL CHARGES']);
    s4rows.push(['Extra Stay Days', settlement.extraDays ?? settlement.eligibleExtraDays ?? 0]);
    s4rows.push(['Daily Rent Rate Basis (₹/day)', Number(settlement.dailyRate != null ? settlement.dailyRate : settlement.dailyRateBasis) || 0]);
    s4rows.push(['Extra Stay Rent (₹)', Number(settlement.extraStayRent != null ? settlement.extraStayRent : settlement.extraStayAmount) || 0]);
    s4rows.push(['Final Electricity Units', settlement.elecUnits ?? settlement.electricityUnits ?? 0]);
    s4rows.push(['Final Electricity Rate (₹/unit)', Number(settlement.elecRate != null ? settlement.elecRate : settlement.electricityRate) || 0]);
    s4rows.push(['Final Electricity Charge (₹)', Number(settlement.elecCharge != null ? settlement.elecCharge : settlement.electricityCharge) || 0]);
    s4rows.push(['Previous Outstanding Bills Balance (at move-out) (₹)', Number(settlement.outstandingBillsBalance) || 0]);
    s4rows.push(['Other Charges / Deductions (₹)', Number(settlement.otherCharges) || 0]);
    if (settlement.otherChargesNotes) {
      s4rows.push(['Other Charges Notes', settlement.otherChargesNotes]);
    }
    s4rows.push(['TOTAL FINAL CHARGES (A) (₹)', Number(settlement.totalCharges) || 0]);
    s4rows.push([]);
    s4rows.push(['AVAILABLE FUNDS & DEDUCTIONS']);
    s4rows.push(['Security Deposit (Total) (₹)', Number(settlement.deposit != null ? settlement.deposit : settlement.securityDepositOriginal) || 0]);
    s4rows.push(['Refundable Advance Rent (Total) (₹)', Number(settlement.advance != null ? settlement.advance : settlement.advanceRentOriginal) || 0]);
    s4rows.push(['Advance Rent Adjusted (₹)', Number(settlement.advanceAdjusted != null ? settlement.advanceAdjusted : settlement.advanceRentAdjusted) || 0]);
    s4rows.push(['Security Deposit Deducted (₹)', Number(settlement.depositDeducted != null ? settlement.depositDeducted : settlement.securityDepositAdjusted) || 0]);
    s4rows.push(['TOTAL DEDUCTIONS APPLIED (B) (₹)', (Number(settlement.advanceAdjusted != null ? settlement.advanceAdjusted : settlement.advanceRentAdjusted) || 0) + (Number(settlement.depositDeducted != null ? settlement.depositDeducted : settlement.securityDepositAdjusted) || 0)]);
    s4rows.push([]);

    const netAmtVal = Math.abs(Number(settlement.netSettlementAmount != null ? settlement.netSettlementAmount : settlement.finalAmount != null ? settlement.finalAmount : settlement.netAmount) || 0);
    const dirVal = settlement.settlementDirection === 'payment_by_tenant' ? 'Payment Payable by Tenant' : settlement.settlementDirection === 'zero_balance' ? 'Fully Settled (Zero Balance)' : 'Refund Payable to Tenant';
    const stLabel = getSettlementStatusLabel(settlement);
    const amtSettled = Number(settlement.amountSettled) || 0;
    const amtPending = Number(settlement.amountPending != null ? settlement.amountPending : Math.max(0, netAmtVal - amtSettled));

    s4rows.push(['C. FINAL SETTLEMENT SUMMARY']);
    s4rows.push(['Net Settlement Amount (₹)', netAmtVal]);
    s4rows.push(['Payment Direction', dirVal]);
    s4rows.push(['Settlement Payment Status', stLabel]);
    s4rows.push(['Total Settled (Refunded / Paid) (₹)', amtSettled]);
    s4rows.push(['Remaining Balance Pending (₹)', amtPending]);

    if (Array.isArray(settlement.transactions) && settlement.transactions.length > 0) {
      s4rows.push([]);
      s4rows.push(['D. SETTLEMENT TRANSACTION HISTORY']);
      s4rows.push(['Txn #', 'Date & Time', 'Transaction Type', 'Amount (₹)', 'Payment Method', 'Reference / Txn ID', 'Notes']);
      settlement.transactions.forEach((tx, idx) => {
        s4rows.push([
          idx + 1,
          fmtDateTime(tx.date || tx.createdAt),
          tx.type === 'refund' ? 'Refund Paid to Tenant' : 'Payment Received from Tenant',
          Number(tx.amount) || 0,
          paymentMethodLabel(tx.paymentMethod),
          tx.referenceId || '—',
          tx.notes || '—'
        ]);
      });
    }

    const ws4 = XLSX.utils.aoa_to_sheet(s4rows);
    ws4['!cols'] = [{ wch: 44 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Outstanding & Settlement');

    const safeTenantName = tenant.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Rentora_TenantReport_${safeTenantName}_${tenant.id}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // ── PDF Generation ──────────────────────────────────────────────────────────
  window.downloadTenantPDF = function () {
    if (!_currentReportTenantId) { alert('Please select a tenant first.'); return; }

    const data = assembleReportData(_currentReportTenantId, _currentReportType, _currentStartDate, _currentEndDate);
    if (data.error) { alert(data.message); return; }

    if (typeof html2pdf === 'undefined') {
      alert('PDF library not loaded. Please check your internet connection and try again.');
      return;
    }

    const { tenant, property, unit, settings } = data;
    const ownerName = settings.ownerName || settings.businessName || property.name || 'Landlord';
    const businessName = settings.businessName || property.name || 'RENTORA PROPERTIES';
    const address = settings.address || property.address || '';

    const commonCss = `
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
      .kpi-card { background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px; }
      .kpi-card label { font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;display:block; }
      .kpi-card val { font-size:12px;font-weight:800;display:block;margin-top:2px; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    `;

    // =========================================================================
    // PDF CASE A: ACTIVE TENANT HISTORICAL REPORT
    // =========================================================================
    if (data.reportType === 'active') {
      const { readings, bills, payments, ledger, summary: fin, startDate, endDate } = data;

      let billsTableRows = '';
      bills.forEach((b, i) => {
        const stLabel = paymentStatusLabel(b);
        const badgeClass = stLabel === 'PAID' ? 'badge-paid' : stLabel === 'PARTIALLY PAID' ? 'badge-partial' : 'badge-unpaid';
        billsTableRows += `<tr>
          <td>${i + 1}</td>
          <td>${b.billNumber || '—'}</td>
          <td>${formatMonthReadable(b.billingMonth)}</td>
          <td>${fmtDate(getBillDate(b))}</td>
          <td>${fmtDate(b.dueDate)}</td>
          <td>${fmt(b.rent)}</td>
          <td>${b.electricityUnits || 0} u (${fmt(b.electricityCharge)})</td>
          <td>${fmt(b.waterCharge)}</td>
          <td>${fmt(b.previousDue)}</td>
          <td>${fmt(b.totalAmount)}</td>
          <td style="color:#059669;font-weight:700;">${fmt(b.paidAmount)}</td>
          <td style="color:${Number(b.remainingAmount) > 0 ? '#dc2626' : '#059669'};font-weight:700;">${fmt(b.remainingAmount)}</td>
          <td><span class="${badgeClass}">${stLabel}</span></td>
        </tr>`;
      });

      let paymentsTableRows = '';
      payments.forEach((p, i) => {
        const dateStr = getPaymentDate(p);
        const timeStr = p.createdAt && p.createdAt.includes('T') ? p.createdAt.split('T')[1].slice(0, 5) : '—';
        let allocDesc = '—';
        if (Array.isArray(p.allocations) && p.allocations.length > 0) {
          allocDesc = p.allocations.map(a => `${a.type === 'advance' ? 'Advance' : (a.billNumber || a.billId)} (${fmt(a.amount)})`).join(', ');
        } else if (p.billId) {
          allocDesc = p.billId === 'advance' ? 'Advance Rent' : `Bill ${p.billId}`;
        }
        paymentsTableRows += `<tr>
          <td>${i + 1}</td>
          <td>${fmtDate(dateStr)}</td>
          <td>${timeStr}</td>
          <td style="font-weight:700;color:#059669;">${fmt(p.amount || p.amountPaid)}</td>
          <td>${paymentMethodLabel(p.paymentMethod || p.mode)}</td>
          <td style="font-family:monospace;font-size:8px;">${p.transactionId || p.referenceId || '—'}</td>
          <td>${allocDesc}</td>
          <td>${p.notes || '—'}</td>
        </tr>`;
      });

      let ledgerRows = '';
      ledger.forEach((entry, i) => {
        ledgerRows += `<tr>
          <td>${i + 1}</td>
          <td>${fmtDate(entry.date)}</td>
          <td><strong style="color:${entry.type === 'bill' ? '#4F46E5' : entry.type === 'payment' ? '#059669' : '#6b7280'}">${entry.typeLabel}</strong></td>
          <td style="font-family:monospace;font-size:8px;">${entry.reference}</td>
          <td>${entry.description}</td>
          <td>${entry.debit > 0 ? fmt(entry.debit) : '—'}</td>
          <td style="color:#059669;font-weight:700;">${entry.credit > 0 ? fmt(entry.credit) : '—'}</td>
          <td style="font-weight:800;color:${entry.balance > 0 ? '#dc2626' : entry.balance < 0 ? '#059669' : '#111827'};">${fmt(entry.balance)}</td>
        </tr>`;
      });

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${commonCss}</style></head><body>
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
            <div class="report-title">Active Tenant Historical Report</div>
            <div style="font-size:9px;color:#6b7280;margin-top:3px;">Period: ${fmtDate(startDate)} → ${fmtDate(endDate)}</div>
            <div style="font-size:9px;color:#6b7280;">Generated: ${fmtDateTime(new Date().toISOString())}</div>
            <div style="margin-top:4px;"><span style="background:#d1fae5;color:#065f46;border:1px solid #10b981;padding:2px 8px;border-radius:999px;font-weight:800;font-size:8.5px;">ACTIVE TENANCY</span></div>
          </div>
        </div>

        <!-- Section 1: Tenant Information -->
        <div class="section-title">1. Tenant Profile &amp; Tenancy Details</div>
        <div class="info-grid">
          <div class="info-item"><label>Tenant Name</label><span>${tenant.name}</span></div>
          <div class="info-item"><label>Tenant ID</label><span style="font-family:monospace;font-size:9px;">${tenant.id}</span></div>
          <div class="info-item"><label>Phone / Mobile</label><span>${tenant.mobile || '—'}</span></div>
          <div class="info-item"><label>Property</label><span>${property.name || '—'}</span></div>
          <div class="info-item"><label>Unit Number</label><span>Unit ${tenant.unitNumber || '—'}</span></div>
          <div class="info-item"><label>Electric Meter</label><span>${readings.meterNumber}</span></div>
          <div class="info-item"><label>Move-In Date</label><span>${fmtDate(tenant.moveIn)}</span></div>
          <div class="info-item"><label>Monthly Rent</label><span>${fmt(tenant.rent || tenant.monthlyRent)}</span></div>
          <div class="info-item"><label>Security Deposit Held</label><span>${fmt(fin.securityDeposit)}</span></div>
          <div class="info-item"><label>Advance Rent Balance</label><span style="color:#059669;font-weight:700;">${fmt(fin.advanceRent)}</span></div>
          <div class="info-item"><label>Initial Meter Reading</label><span>${readings.initialMeter}</span></div>
          <div class="info-item"><label>Latest Meter Reading</label><span>${readings.latestMeter}</span></div>
        </div>

        <!-- Section 2: Financial Ledger Overview -->
        <div class="section-title">2. Financial Ledger Overview</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;">
          <div class="kpi-card">
            <label>Opening Balance</label>
            <val style="color:${fin.openingBalance > 0 ? '#dc2626' : fin.openingBalance < 0 ? '#059669' : '#111827'};">${fmt(fin.openingBalance)}</val>
            <span style="font-size:7.5px;color:#9ca3af;">as of ${fmtDate(startDate)}</span>
          </div>
          <div class="kpi-card">
            <label>Total Billed in Period</label>
            <val style="color:#4F46E5;">${fmt(fin.periodBilled)}</val>
            <span style="font-size:7.5px;color:#9ca3af;">${fin.billCount} bills raised</span>
          </div>
          <div class="kpi-card">
            <label>Total Payments Received</label>
            <val style="color:#059669;">${fmt(fin.periodPaid)}</val>
            <span style="font-size:7.5px;color:#9ca3af;">${fin.paymentCount} actual payments</span>
          </div>
          <div class="kpi-card">
            <label>Closing Balance / Due</label>
            <val style="color:${fin.closingBalance > 0 ? '#dc2626' : '#059669'};">${fmt(fin.closingBalance)}</val>
            <span style="font-size:7.5px;color:#9ca3af;">as of ${fmtDate(endDate)}</span>
          </div>
        </div>

        <!-- Section 3: Bills & Utilities History -->
        <div class="section-title">3. Generated Bills &amp; Utilities History (${bills.length} bill${bills.length !== 1 ? 's' : ''})</div>
        ${bills.length === 0 ? '<p style="color:#6b7280;padding:6px 0;">No bills generated in this date range.</p>' : `
        <table>
          <thead><tr>
            <th>#</th><th>Bill No.</th><th>Month</th><th>Issue Date</th><th>Due Date</th>
            <th>Rent</th><th>Electricity</th><th>Water</th><th>Prev Due</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Status</th>
          </tr></thead>
          <tbody>${billsTableRows}</tbody>
          <tfoot><tr class="total-row">
            <td colspan="5" style="text-align:right;">PERIOD TOTALS →</td>
            <td>${fmt(fin.totalRentBilled)}</td>
            <td>${fmt(fin.totalElecCharge)}</td>
            <td>${fmt(fin.totalWaterCharge)}</td>
            <td>—</td>
            <td>${fmt(fin.periodBilled)}</td>
            <td>${fmt(bills.reduce((s,b)=>s+(Number(b.paidAmount)||0),0))}</td>
            <td>${fmt(fin.totalOutstanding)}</td>
            <td></td>
          </tr></tfoot>
        </table>`}

        <!-- Section 4: Payments History -->
        <div class="section-title">4. Actual Payment Transactions Received (${payments.length} transaction${payments.length !== 1 ? 's' : ''})</div>
        ${payments.length === 0 ? '<p style="color:#6b7280;padding:6px 0;">No payments recorded in this date range.</p>' : `
        <table>
          <thead><tr>
            <th>#</th><th>Date</th><th>Time</th><th>Amount</th><th>Method</th><th>Txn / Ref ID</th><th>Allocation</th><th>Notes</th>
          </tr></thead>
          <tbody>${paymentsTableRows}</tbody>
          <tfoot><tr class="total-row">
            <td colspan="3" style="text-align:right;">TOTAL RECEIVED IN PERIOD →</td>
            <td>${fmt(fin.periodPaid)}</td>
            <td colspan="4"></td>
          </tr></tfoot>
        </table>`}

        <!-- Section 5: Date-Wise Ledger -->
        <div class="section-title">5. Date-Wise Account Ledger (Running Audit Trail)</div>
        <table>
          <thead><tr>
            <th>#</th><th>Date</th><th>Type</th><th>Ref</th><th>Description</th><th>Debit (+)</th><th>Credit (-)</th><th>Balance</th>
          </tr></thead>
          <tbody>${ledgerRows}</tbody>
        </table>

        <!-- Footer -->
        <div style="margin-top:20px;border-top:1px solid #e5e7eb;padding-top:10px;font-size:8.5px;color:#9ca3af;text-align:center;">
          Generated by Rentora Cloud Platform &nbsp;|&nbsp; Landlord: ${ownerName} &nbsp;|&nbsp; ${fmtDateTime(new Date().toISOString())}
          <br>This report reflects actual financial ledger entries for an active tenant currently residing at the property. No settlement has been performed.
        </div>
      </div>
      </body></html>`;

      const safeTenantName = tenant.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `Rentora_ActiveTenantReport_${safeTenantName}_${tenant.id}.pdf`;
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
      return;
    }

    // =========================================================================
    // PDF CASE B: VACATED TENANT HISTORICAL REPORT (PRESERVE EXISTING)
    // =========================================================================
    const { settlement, bills, payments, expiry, summary: fin } = data;

    const css = commonCss + `
      .settlement-box { background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px; }
      .expiry-box { background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;padding:8px 12px;font-size:9px;margin-bottom:12px; }
    `;

    const statusBadge = (b) => {
      const s = paymentStatusLabel(b);
      if (s === 'PAID') return '<span class="badge-paid">PAID</span>';
      if (s === 'PARTIALLY PAID') return '<span class="badge-partial">PARTIAL</span>';
      return '<span class="badge-unpaid">UNPAID</span>';
    };

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
      let allocationSummary = '—';
      if (Array.isArray(p.allocations) && p.allocations.length > 0) {
        allocationSummary = p.allocations.map((a) => {
          if (a.type === 'advance') return `Advance (${fmt(a.amount)})`;
          const b = bills.find((tb) => tb.id === a.billId);
          const bNum = b ? b.billNumber : (a.billNumber || a.billId);
          const m = b?.billingMonth || a.billingMonth || '';
          return `${m ? m + ' ' : ''}${bNum} (${fmt(a.amount)})`;
        }).join(', ');
      } else {
        const associatedBill = bills.find(b => b.id === p.billId);
        allocationSummary = associatedBill ? `${associatedBill.billingMonth || ''} ${associatedBill.billNumber}` : (p.billId === 'advance' ? 'Advance Payment' : p.billId || 'Direct Payment');
      }

      paymentsTableRows += `<tr>
        <td>${i + 1}</td>
        <td>${fmtDate(dateStr)}</td>
        <td>${timeStr}</td>
        <td style="font-weight:700;">${fmt(Number(p.amount) || Number(p.amountPaid) || 0)}</td>
        <td>${paymentMethodLabel(p.paymentMethod || p.mode)}</td>
        <td style="font-family:monospace;font-size:8px;">${p.transactionId || p.referenceId || '—'}</td>
        <td>${allocationSummary}</td>
      </tr>`;
    });

    const totalDeposit = Number(settlement.deposit != null ? settlement.deposit : settlement.securityDepositOriginal) || 0;
    const totalAdvance = Number(settlement.advance != null ? settlement.advance : settlement.advanceRentOriginal) || 0;
    const totalCharges = Number(settlement.totalCharges) || 0;
    const netSettlement = Math.abs(Number(settlement.netSettlementAmount != null ? settlement.netSettlementAmount : settlement.finalAmount != null ? settlement.finalAmount : settlement.netAmount) || 0);
    const statusLabel = getSettlementStatusLabel(settlement);
    const direction = settlement.settlementDirection || (Number(settlement.netAmount) <= 0 ? 'refund_to_tenant' : 'payment_by_tenant');
    const directionText = direction === 'payment_by_tenant' ? 'PAYMENT PAYABLE BY TENANT' : direction === 'zero_balance' ? 'FULLY SETTLED' : 'REFUND PAYABLE TO TENANT';
    const directionMsg = direction === 'payment_by_tenant' ? 'The tenant must pay this amount to the landlord.' : direction === 'zero_balance' ? 'No amount is payable by either party.' : 'The landlord must refund this amount to the tenant.';
    const amtSettled = Number(settlement.amountSettled) || 0;
    const amtPending = Number(settlement.amountPending != null ? settlement.amountPending : Math.max(0, netSettlement - amtSettled));

    let txTableHtml = '';
    if (Array.isArray(settlement.transactions) && settlement.transactions.length > 0) {
      let txRows = '';
      settlement.transactions.forEach((tx, idx) => {
        txRows += `<tr>
          <td>${idx + 1}</td>
          <td>${fmtDateTime(tx.date || tx.createdAt)}</td>
          <td><strong style="color:${tx.type === 'refund' ? '#059669' : '#2563eb'}">${tx.type === 'refund' ? 'Refund Paid' : 'Payment Received'}</strong></td>
          <td style="font-weight:700;">${fmt(tx.amount)}</td>
          <td>${paymentMethodLabel(tx.paymentMethod)}</td>
          <td style="font-family:monospace;font-size:8px;">${tx.referenceId || '—'}</td>
          <td>${tx.notes || '—'}</td>
        </tr>`;
      });
      txTableHtml = `
        <div style="font-size:10px;font-weight:800;color:#1e40af;margin:12px 0 6px;text-transform:uppercase;">Settlement Transaction History</div>
        <table>
          <thead><tr><th>#</th><th>Date &amp; Time</th><th>Type</th><th>Amount</th><th>Method</th><th>Reference ID</th><th>Notes</th></tr></thead>
          <tbody>${txRows}</tbody>
        </table>`;
    }

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
          <th>#</th><th>Date</th><th>Time</th><th>Amount</th><th>Mode</th><th>Transaction ID</th><th>Payment Received Details</th>
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
      <div style="background:#f8fafc;border:2px solid #3b82f6;border-radius:8px;padding:12px 16px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:800;color:#1e40af;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">
          FINAL SETTLEMENT SUMMARY
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px 12px;margin-bottom:10px;">
          <div class="info-item"><label>Total Security Deposit</label><span>${fmt(totalDeposit)}</span></div>
          <div class="info-item"><label>Refundable Advance Rent</label><span>${fmt(totalAdvance)}</span></div>
          <div class="info-item"><label>Total Final Charges</label><span>${fmt(totalCharges)}</span></div>
          <div class="info-item"><label>Net Amount</label><span style="font-weight:800;">${fmt(netSettlement)}</span></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid #cbd5e1;padding:8px 12px;border-radius:6px;">
          <div>
            <div style="font-size:8px;text-transform:uppercase;color:#64748b;font-weight:700;">Direction</div>
            <div style="font-size:12px;font-weight:800;color:${direction === 'payment_by_tenant' ? '#dc2626' : '#059669'};">${directionText} • ${fmt(netSettlement)}</div>
            <div style="font-size:8.5px;color:#475569;margin-top:2px;">${directionMsg}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:8px;text-transform:uppercase;color:#64748b;font-weight:700;">Payment Status</div>
            <div style="font-size:11px;font-weight:800;color:#1e293b;">${statusLabel}</div>
            <div style="font-size:8.5px;color:#64748b;margin-top:2px;">Settled: ${fmt(amtSettled)} &nbsp;|&nbsp; Pending: <strong style="color:${amtPending > 0 ? '#dc2626' : '#059669'}">${fmt(amtPending)}</strong></div>
          </div>
        </div>
      </div>

      <div class="settlement-box">
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px 24px;">
          <div class="info-item"><label>Settlement Number</label><span>${settlement.settlementNumber}</span></div>
          <div class="info-item"><label>Generated On</label><span>${fmtDateTime(settlement.createdAt || settlement.settlementDate)}</span></div>
          <div class="info-item"><label>Period End</label><span>${fmtDate(settlement.periodEnd || settlement.normalPeriodEndDate)}</span></div>
          <div class="info-item"><label>Move-Out Date</label><span>${fmtDate(settlement.moveOutDate)}</span></div>
          <div class="info-item"><label>Policy</label><span>${settlement.policy || settlement.extraStayPolicy || '—'}</span></div>
          <div class="info-item"><label>Extra Days</label><span>${settlement.extraDays ?? settlement.eligibleExtraDays ?? 0}</span></div>
          <div class="info-item"><label>Daily Rate</label><span>${fmt(settlement.dailyRate != null ? settlement.dailyRate : settlement.dailyRateBasis)}</span></div>
          <div class="info-item"><label>Extra Stay Rent</label><span>${fmt(settlement.extraStayRent != null ? settlement.extraStayRent : settlement.extraStayAmount)}</span></div>
          <div class="info-item"><label>Final Elec Units</label><span>${settlement.elecUnits ?? settlement.electricityUnits ?? 0} units @ ${fmt(settlement.elecRate != null ? settlement.elecRate : settlement.electricityRate)}/unit</span></div>
          <div class="info-item"><label>Final Elec Charge</label><span>${fmt(settlement.elecCharge != null ? settlement.elecCharge : settlement.electricityCharge)}</span></div>
          <div class="info-item"><label>Previous Outstanding Dues</label><span>${fmt(settlement.outstandingBillsBalance)}</span></div>
          <div class="info-item"><label>Other Charges</label><span>${fmt(settlement.otherCharges)} ${settlement.otherChargesNotes ? '(' + settlement.otherChargesNotes + ')' : ''}</span></div>
          <div class="info-item"><label>Total Charges (A)</label><span style="font-weight:800;">${fmt(settlement.totalCharges)}</span></div>
        </div>
        <div style="border-top:1px solid #86efac;margin:10px 0;"></div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px 24px;">
          <div class="info-item"><label>Advance Adjusted (B1)</label><span>${fmt(settlement.advanceAdjusted != null ? settlement.advanceAdjusted : settlement.advanceRentAdjusted)}</span></div>
          <div class="info-item"><label>Deposit Deducted (B2)</label><span>${fmt(settlement.depositDeducted != null ? settlement.depositDeducted : settlement.securityDepositAdjusted)}</span></div>
        </div>
      </div>

      ${txTableHtml}

      <!-- Footer -->
      <div style="margin-top:20px;border-top:1px solid #e5e7eb;padding-top:10px;font-size:8.5px;color:#9ca3af;text-align:center;">
        Generated by Rentora Cloud Platform &nbsp;|&nbsp; Landlord: ${ownerName} &nbsp;|&nbsp; ${fmtDateTime(new Date().toISOString())}
        <br>This report is generated for landlord use only. Tenant financial data is protected by a 30-day access window from settlement date.
      </div>
    </div>
    </body></html>`;

    const safeTenantName = tenant.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Rentora_TenantReport_${safeTenantName}_${tenant.id}.pdf`;
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

  // ── Testing / API Hook ─────────────────────────────────────────────────────
  window._testAssemble = assembleReportData;

  // ── State bridge ───────────────────────────────────────────────────────────
  function installStateBridge() {
    const original = window.renderAllPortalData;
    if (typeof original === 'function') {
      window.renderAllPortalData = function () {
        original.apply(this, arguments);
        if (window.__rentoraStateGetter) {
          window.__rentoraState = window.__rentoraStateGetter();
        }
        const panel = document.getElementById('panel-reports');
        if (panel && panel.classList.contains('active') && typeof renderReportTenantList === 'function') {
          renderReportTenantList();
        }
      };
    } else {
      setTimeout(installStateBridge, 200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installStateBridge);
  } else {
    installStateBridge();
  }

})();
