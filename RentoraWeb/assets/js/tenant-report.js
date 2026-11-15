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
  let _currentReportType = 'active'; // 'property' | 'active' | 'vacated'
  let _currentReportPropertyId = 'all'; // 'all' or specific propertyId
  let _currentReportTenantId = null;
  let _currentStartDate = '';
  let _currentEndDate = '';
  let _currentPropMonth = '';
  let _currentPropStartDate = '';
  let _currentPropEndDate = '';
  let _activePreviewTab = 'summary'; // 'summary' | 'bills' | 'payments' | 'ledger' | 'units' | 'utilities' | 'dues'

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

  function formatExcelDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
    } catch (_) {
      return dateStr;
    }
  }

  function getPropertyMonthOptions() {
    const options = [];
    const currentDate = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const value = `${year}-${month}`;
      options.push({ label, value });
    }
    return options;
  }

  function filterCanonicalPayments(payments) {
    if (!Array.isArray(payments)) return [];
    const withoutExplicitChild = payments.filter(p => !p.isSplitChild);
    const seenParentIds = new Set();
    const result = [];

    for (const p of withoutExplicitChild) {
      if (p.allocations && p.allocations.length > 0) {
        result.push(p);
      } else if (p.parentPaymentId && withoutExplicitChild.filter(x => x.parentPaymentId === p.parentPaymentId).length > 1) {
        if (!seenParentIds.has(p.parentPaymentId)) {
          seenParentIds.add(p.parentPaymentId);
          const siblings = withoutExplicitChild.filter(x => x.parentPaymentId === p.parentPaymentId);
          const totalAmount = siblings.reduce((sum, s) => sum + (Number(s.amount) || Number(s.amountPaid) || 0), 0);
          const combinedAllocations = siblings.map(s => ({
            billId: s.billId,
            amount: Number(s.amount) || Number(s.amountPaid) || 0,
            type: s.billId === 'advance' ? 'advance' : 'bill_due'
          }));
          result.push({
            ...p,
            amount: totalAmount,
            allocations: combinedAllocations
          });
        }
      } else {
        result.push(p);
      }
    }
    return result;
  }

  function allocatePaymentProportional(payment, allBills) {
    if (Array.isArray(payment.allocations) && payment.allocations.length > 0) {
      const result = {
        rent: 0, electricity: 0, water: 0, parking: 0, maintenance: 0, other: 0, previousDue: 0
      };
      for (const alloc of payment.allocations) {
        if (alloc.type === 'advance') {
          result.rent += Number(alloc.amount) || 0;
          continue;
        }
        const bill = (allBills || []).find(b => b.id === alloc.billId);
        if (!bill || !bill.totalAmount) {
          result.rent += Number(alloc.amount) || 0;
          continue;
        }
        const ratio = (Number(alloc.amount) || 0) / (Number(bill.totalAmount) || 1);
        result.rent += (Number(bill.rent) || 0) * ratio;
        result.electricity += (Number(bill.electricityCharge) || 0) * ratio;
        result.water += (Number(bill.waterCharge) || 0) * ratio;
        result.parking += (Number(bill.parkingCharge) || 0) * ratio;
        result.maintenance += (Number(bill.maintenanceCharge) || 0) * ratio;
        result.other += (Number(bill.otherCharges) || 0) * ratio;
        result.previousDue += (Number(bill.previousDue) || 0) * ratio;
      }
      return result;
    }

    const bill = (allBills || []).find(b => b.id === payment.billId);
    if (!bill) {
      return {
        rent: Number(payment.amount) || Number(payment.amountPaid) || 0,
        electricity: 0, water: 0, parking: 0, maintenance: 0, other: 0, previousDue: 0
      };
    }
    const ratio = (Number(bill.totalAmount) > 0) ? ((Number(payment.amount) || Number(payment.amountPaid) || 0) / Number(bill.totalAmount)) : 0;
    return {
      rent: (Number(bill.rent) || 0) * ratio,
      electricity: (Number(bill.electricityCharge) || 0) * ratio,
      water: (Number(bill.waterCharge) || 0) * ratio,
      parking: (Number(bill.parkingCharge) || 0) * ratio,
      maintenance: (Number(bill.maintenanceCharge) || 0) * ratio,
      other: (Number(bill.otherCharges) || 0) * ratio,
      previousDue: (Number(bill.previousDue) || 0) * ratio
    };
  }

  function getDaysOverdue(dueDateStr) {
    if (!dueDateStr) return 0;
    try {
      const due = new Date(dueDateStr);
      const today = new Date();
      due.setHours(0,0,0,0);
      today.setHours(0,0,0,0);
      const diffTime = today.getTime() - due.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 0;
    } catch (_) {
      return 0;
    }
  }

  // ── Date & Meter Reading Helpers ───────────────────────────────────────────
  function formatDDMMYYYY(val) {
    if (!val) return '';
    try {
      const s = String(val).trim();
      if (!s || s === '—' || s === 'N/A' || s === 'null' || s === 'undefined') return '';
      // Matches YYYY-MM-DD
      const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (isoMatch) {
        const y = isoMatch[1];
        const m = isoMatch[2].padStart(2, '0');
        const d = isoMatch[3].padStart(2, '0');
        return `${d}-${m}-${y}`;
      }
      // Matches DD/MM/YYYY or DD-MM-YYYY
      const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (dmyMatch) {
        const d = dmyMatch[1].padStart(2, '0');
        const m = dmyMatch[2].padStart(2, '0');
        const y = dmyMatch[3];
        return `${d}-${m}-${y}`;
      }
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime())) {
        const d = String(parsed.getDate()).padStart(2, '0');
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const y = parsed.getFullYear();
        return `${d}-${m}-${y}`;
      }
      return '';
    } catch (_) {
      return '';
    }
  }

  function getMeterReadingDates(bill, allBills, tenant) {
    if (!bill) return { prevDate: '', currDate: '' };

    // 1. Current Reading Date: check direct database fields
    let currDate = bill.currentMeterReadingDate ||
                   bill.currMeterReadingDate ||
                   bill.currentReadingDate ||
                   bill.currReadingDate ||
                   bill.meterReadingDate ||
                   bill.readingDate ||
                   '';

    // 2. Previous Reading Date: check direct database fields
    let prevDate = bill.previousMeterReadingDate ||
                   bill.prevMeterReadingDate ||
                   bill.previousReadingDate ||
                   bill.prevReadingDate ||
                   '';

    // 3. Fallbacks if dates are missing on historical bill records:
    if (!currDate && (bill.currentMeterReading !== undefined || Number(bill.electricityUnits) > 0)) {
      if (bill.createdAt && typeof bill.createdAt === 'string') {
        currDate = bill.createdAt.split('T')[0];
      } else if (bill.billDate && typeof bill.billDate === 'string') {
        currDate = bill.billDate.split('T')[0];
      } else if (bill.issueDate && typeof bill.issueDate === 'string') {
        currDate = bill.issueDate.split('T')[0];
      }
    }

    if (!prevDate && (bill.previousMeterReading !== undefined || Number(bill.electricityUnits) > 0)) {
      if (Array.isArray(allBills) && allBills.length > 0) {
        const sorted = [...allBills].sort((a, b) => getBillDate(a).localeCompare(getBillDate(b)));
        const currIndex = sorted.findIndex(item => item.id === bill.id);
        if (currIndex > 0) {
          const priorBill = sorted[currIndex - 1];
          prevDate = priorBill.currentMeterReadingDate ||
                     priorBill.currMeterReadingDate ||
                     priorBill.currentReadingDate ||
                     priorBill.meterReadingDate ||
                     priorBill.readingDate ||
                     (priorBill.createdAt ? priorBill.createdAt.split('T')[0] : '');
        } else if (currIndex === 0 && tenant) {
          prevDate = tenant.moveInDate || tenant.moveIn || '';
        }
      } else if (tenant && (tenant.moveInDate || tenant.moveIn)) {
        prevDate = tenant.moveInDate || tenant.moveIn || '';
      }
    }

    return { prevDate, currDate };
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
      const s = window.__rentoraStateGetter();
      if (s) return s;
    }
    return window.__rentoraState || window.state || null;
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

  // ── Core Property Report Data Assembler ────────────────────────────────────
  function assemblePropertyReportData(propertyId, monthStr, customStartDate, customEndDate) {
    const st = getState();
    if (!st) return { error: 'no_state', message: 'Application data is loading. Please wait a moment and try again.' };

    const allProperties = Array.isArray(st.properties) ? [...st.properties] : [];
    if (allProperties.length === 0) {
      return { error: 'no_properties', message: 'No properties found in your account.' };
    }

    const selectedProperties = (!propertyId || propertyId === 'all')
      ? allProperties
      : allProperties.filter(p => p.id === propertyId);

    const propIds = selectedProperties.map(p => p.id);
    const selectedPropertyNames = (!propertyId || propertyId === 'all')
      ? 'All Properties'
      : (selectedProperties[0]?.name || 'Property');

    // 1. Determine period
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    let startPeriod = '';
    let endPeriod = '';
    let periodLabel = '';
    let activeMonthStr = monthStr || '';

    if (customStartDate && customEndDate) {
      startPeriod = customStartDate;
      endPeriod = customEndDate;
      periodLabel = `${fmtDate(customStartDate)} → ${fmtDate(customEndDate)}`;
    } else if (monthStr) {
      startPeriod = `${monthStr}-01`;
      endPeriod = `${monthStr}-31`;
      const parts = monthStr.split('-');
      if (parts.length === 2) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
        periodLabel = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      } else {
        periodLabel = monthStr;
      }
    } else {
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      activeMonthStr = `${year}-${month}`;
      startPeriod = `${activeMonthStr}-01`;
      endPeriod = `${activeMonthStr}-31`;
      periodLabel = today.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }

    // 2. Filter units
    const allUnits = Array.isArray(st.units) ? st.units : [];
    const filteredUnits = allUnits.filter(u => propIds.includes(u.propertyId));

    // 3. Filter tenants (active or residing during this period)
    const allTenants = Array.isArray(st.tenants) ? st.tenants : [];
    const filteredTenants = allTenants.filter(t => {
      if (!propIds.includes(t.propertyId)) return false;
      const moveIn = t.moveIn || t.moveInDate || '';
      const moveOut = t.moveOut || t.moveOutDate || '';
      return (!moveIn || moveIn <= endPeriod) && (t.status === 'active' || !moveOut || moveOut >= startPeriod);
    });

    // 4. Bills: decorate bills chronologically per tenant
    const rawBills = Array.isArray(st.bills) ? st.bills : [];
    const filteredBills = rawBills.filter(b => {
      if (!propIds.includes(b.propertyId)) return false;
      if (activeMonthStr && b.billingMonth === activeMonthStr) return true;
      const bDate = getBillDate(b);
      if (bDate && bDate >= startPeriod && bDate <= endPeriod) return true;
      if (b.billingMonth && b.billingMonth >= startPeriod.slice(0, 7) && b.billingMonth <= endPeriod.slice(0, 7)) return true;
      return false;
    });

    // 5. Canonical Payments
    const rawPayments = Array.isArray(st.payments) ? st.payments : [];
    const canonicalPayments = filterCanonicalPayments(rawPayments);
    const filteredPayments = canonicalPayments.filter(p => {
      if (p.status === 'rejected' || p.status === 'pending') return false;
      const pDate = getPaymentDate(p);
      if (!pDate) return false;

      // Date check
      if (activeMonthStr && !pDate.startsWith(activeMonthStr) && !(pDate >= startPeriod && pDate <= endPeriod)) {
        return false;
      }
      if (!activeMonthStr && (pDate < startPeriod || pDate > endPeriod)) {
        return false;
      }

      // Property check
      let pPropId = p.propertyId;
      if (!pPropId && p.billId && p.billId !== 'advance') {
        pPropId = rawBills.find(b => b.id === p.billId)?.propertyId;
      }
      if (!pPropId && Array.isArray(p.allocations) && p.allocations.length > 0) {
        const firstBillAlloc = p.allocations.find(a => a.billId !== 'advance');
        if (firstBillAlloc) {
          pPropId = rawBills.find(b => b.id === firstBillAlloc.billId)?.propertyId;
        }
      }
      if (!pPropId && p.tenantId) {
        pPropId = allTenants.find(t => t.id === p.tenantId)?.propertyId;
      }

      return pPropId ? propIds.includes(pPropId) : false;
    });

    // 6. Proportional payment allocations
    let collRent = 0;
    let collElec = 0;
    let collWater = 0;
    let collParking = 0;
    let collMaint = 0;
    let collOther = 0;
    let collPrevDue = 0;

    filteredPayments.forEach(p => {
      const allocation = allocatePaymentProportional(p, rawBills);
      collRent += allocation.rent;
      collElec += allocation.electricity;
      collWater += allocation.water;
      collParking += allocation.parking;
      collMaint += allocation.maintenance;
      collOther += allocation.other;
      collPrevDue += allocation.previousDue;
    });

    const collTotal = collRent + collElec + collWater + collParking + collMaint + collOther + collPrevDue;

    // 7. Overall financial aggregates
    const expectedRent = filteredBills.reduce((sum, b) => sum + (Number(b.rent) || 0), 0);
    const rentCollected = collRent;
    const rentOutstanding = Math.max(0, expectedRent - collRent);
    const totalBilled = filteredBills.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
    const totalCollected = filteredPayments.reduce((sum, p) => sum + (Number(p.amount) || Number(p.amountPaid) || 0), 0);
    const totalOutstanding = filteredBills.reduce((sum, b) => sum + (Number(b.remainingAmount) || 0), 0);
    const previousDueTotal = filteredBills.reduce((sum, b) => sum + (Number(b.previousDue) || 0), 0);

    const totalRooms = (!propertyId || propertyId === 'all')
      ? selectedProperties.reduce((sum, p) => sum + (p.totalUnits || filteredUnits.filter(u => u.propertyId === p.id).length), 0)
      : (selectedProperties[0]?.totalUnits || filteredUnits.length);

    const occupiedRooms = filteredUnits.filter(u => u.status === 'occupied').length;
    const vacantRooms = Math.max(0, totalRooms - occupiedRooms);
    const occupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;
    const vacancyRate = totalRooms > 0 ? (vacantRooms / totalRooms) * 100 : 0;

    const paidBillsCount = filteredBills.filter(b => b.paymentStatus === 'paid' || Number(b.remainingAmount) <= 0).length;
    const partialBillsCount = filteredBills.filter(b => b.paymentStatus === 'partial' || (Number(b.paidAmount) > 0 && Number(b.remainingAmount) > 0)).length;
    const unpaidBillsCount = filteredBills.filter(b => (b.paymentStatus === 'unpaid' || !b.paymentStatus) && Number(b.paidAmount) === 0).length;

    const newTenantsList = filteredTenants.filter(t => {
      const mi = t.moveIn || t.moveInDate;
      return mi && mi >= startPeriod && mi <= endPeriod;
    });
    const vacatedTenantsList = filteredTenants.filter(t => {
      const mo = t.moveOut || t.moveOutDate;
      return t.status === 'vacated' && mo && mo >= startPeriod && mo <= endPeriod;
    });

    const outstandingBills = filteredBills.filter(b => Number(b.remainingAmount) > 0);
    const settings = (st.settings && typeof st.settings === 'object') ? st.settings : {};

    return {
      ok: true,
      reportType: 'property',
      propertyId: propertyId || 'all',
      propertyNames: selectedPropertyNames,
      properties: selectedProperties,
      periodLabel,
      monthStr: activeMonthStr,
      startDate: startPeriod,
      endDate: endPeriod,
      units: filteredUnits,
      tenants: filteredTenants,
      bills: filteredBills,
      payments: filteredPayments,
      newTenants: newTenantsList,
      vacatedTenants: vacatedTenantsList,
      outstandingBills,
      settings,
      summary: {
        expectedRent,
        rentCollected,
        rentOutstanding,
        totalBilled,
        totalCollected,
        totalOutstanding,
        previousDueTotal,
        collRent,
        collElec,
        collWater,
        collParking,
        collMaint,
        collOther,
        collPrevDue,
        collTotal,
        totalRooms,
        occupiedRooms,
        vacantRooms,
        occupancyRate,
        vacancyRate,
        paidBillsCount,
        partialBillsCount,
        unpaidBillsCount,
        newTenantsCount: newTenantsList.length,
        vacatedTenantsCount: vacatedTenantsList.length,
        totalTenantsCount: filteredTenants.length,
        totalBillsCount: filteredBills.length,
        totalPaymentsCount: filteredPayments.length
      }
    };
  }

  // ── UI: Report Type Switching ───────────────────────────────────────────────
  window.setReportType = function (type) {
    if (type !== 'property' && type !== 'active' && type !== 'vacated') return;
    _currentReportType = type;

    // Toggle selected state on cards
    const cardProperty = document.getElementById('rptTypeCardProperty');
    const cardActive = document.getElementById('rptTypeCardActive');
    const cardVacated = document.getElementById('rptTypeCardVacated');
    if (cardProperty) cardProperty.classList.toggle('rpt-type-card--selected', type === 'property');
    if (cardActive) cardActive.classList.toggle('rpt-type-card--selected', type === 'active');
    if (cardVacated) cardVacated.classList.toggle('rpt-type-card--selected', type === 'vacated');

    // Show/hide Tenant selection section (hidden in Property-Wise Report)
    const tenantSection = document.getElementById('rptTenantSectionCard');
    if (tenantSection) {
      tenantSection.style.display = (type === 'property') ? 'none' : 'block';
    }

    // Update Step 3 header if in tenant mode
    const stepLabel = document.getElementById('rptTenantStepLabel');
    if (stepLabel) {
      stepLabel.textContent = type === 'active' ? '3. Select Active Tenant' : '3. Select Vacated Tenant';
    }

    // Period cards
    const propPeriodCard = document.getElementById('rptPropertyPeriodCard');
    const dateCard = document.getElementById('rptDateRangeCard');
    const vacatedAction = document.getElementById('rptVacatedActionArea');

    if (propPeriodCard) propPeriodCard.style.display = (type === 'property') ? 'block' : 'none';
    if (dateCard) dateCard.style.display = (type === 'active' && _currentReportTenantId) ? 'block' : 'none';
    if (vacatedAction) vacatedAction.style.display = (type === 'vacated' && _currentReportTenantId) ? 'block' : 'none';

    // Reset selection and clear loaded report
    _currentReportTenantId = null;
    const reportCard = document.getElementById('rptTenantCard');
    if (reportCard) reportCard.style.display = 'none';

    const genBtn = document.getElementById('rptGenerateBtn');
    if (genBtn) genBtn.disabled = true;

    const vacatedBtn = document.getElementById('rptVacatedGenerateBtn');
    if (vacatedBtn) vacatedBtn.disabled = true;

    // Refresh properties options according to new report type
    window.renderReportsPanel();
  };

  // ── UI: Render Reports Panel & Populate Properties ─────────────────────────
  window.renderReportsPanel = async function () {
    const propSel = document.getElementById('rptPropertySelect');
    if (!propSel) return;

    let st = getState();

    // 1. Gather properties from state or topbar dropdown
    let properties = (st && Array.isArray(st.properties) && st.properties.length > 0) ? [...st.properties] : [];
    if (properties.length === 0 && window.state && Array.isArray(window.state.properties) && window.state.properties.length > 0) {
      properties = [...window.state.properties];
    }
    if (properties.length === 0 && window.__rentoraState && Array.isArray(window.__rentoraState.properties) && window.__rentoraState.properties.length > 0) {
      properties = [...window.__rentoraState.properties];
    }

    // 2. Direct Firestore fallback if properties still empty
    const db = window.fbDb || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
    const auth = window.fbAuth || (typeof firebase !== 'undefined' && firebase.auth ? firebase.auth() : null);
    const currentUid = (st && st.currentUser && st.currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid);

    if (properties.length === 0 && db && currentUid) {
      try {
        const snapshot = await db.collection('properties')
          .where('ownerId', '==', currentUid)
          .get();
        const fetched = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(p => !p.isDeleted);
        if (fetched.length > 0) {
          properties = fetched;
          if (st) st.properties = fetched;
          if (window.state) window.state.properties = fetched;
        }
      } catch (fetchErr) {
        console.warn('Notice: Firestore property fetch in reports:', fetchErr);
      }
    }

    // 3. Fallback: inspect topbar property select dropdown
    if (properties.length === 0) {
      const topbarSel = document.getElementById('propertySelectDropdown');
      if (topbarSel && topbarSel.options) {
        for (let i = 0; i < topbarSel.options.length; i++) {
          const opt = topbarSel.options[i];
          if (opt.value && !properties.some(p => p.id === opt.value)) {
            properties.push({ id: opt.value, name: opt.textContent.trim() });
          }
        }
      }
    }

    const prevSelected = propSel.value;
    const defaultVal = prevSelected || (st && st.activeProperty ? st.activeProperty.id : '');

    // Never permanently disable the property selector
    propSel.disabled = false;

    if (properties.length === 0) {
      propSel.innerHTML = '<option value="">— Select a property —</option>';
      const propHelper = document.getElementById('rptPropertyHelperText');
      if (propHelper) {
        propHelper.innerHTML = '<span style="font-size:0.8rem;color:var(--text-muted);">No properties found yet. Click to reload.</span>';
      }
      return;
    }

    let propOptions = '';
    let foundSelected = false;

    if (_currentReportType === 'property') {
      const isAllSel = (!_currentReportPropertyId || _currentReportPropertyId === 'all');
      propOptions += `<option value="all" ${isAllSel ? 'selected' : ''}>All Properties (Portfolio Overview)</option>`;
      if (isAllSel) foundSelected = true;

      properties.forEach(p => {
        const isSel = (p.id === _currentReportPropertyId);
        if (isSel) foundSelected = true;
        const typeLabel = p.type ? ` (${p.type})` : '';
        propOptions += `<option value="${p.id}" ${isSel ? 'selected' : ''}>${p.name}${typeLabel}</option>`;
      });
    } else {
      propOptions = '<option value="">— Select a property —</option>';
      properties.forEach(p => {
        const isSel = (p.id === defaultVal);
        if (isSel) foundSelected = true;
        const typeLabel = p.type ? ` (${p.type})` : '';
        propOptions += `<option value="${p.id}" ${isSel ? 'selected' : ''}>${p.name}${typeLabel}</option>`;
      });
    }

    propSel.innerHTML = propOptions;

    const propHelper = document.getElementById('rptPropertyHelperText');
    if (propHelper) {
      if (_currentReportType === 'property') {
        propHelper.innerHTML = `<span style="font-size:0.8rem;color:var(--text-secondary);">${properties.length} propert${properties.length === 1 ? 'y' : 'ies'} in portfolio. Select specific or all.</span>`;
      } else {
        propHelper.innerHTML = `<span style="font-size:0.8rem;color:var(--text-secondary);">${properties.length} propert${properties.length === 1 ? 'y' : 'ies'} available</span>`;
      }
    }

    if (_currentReportType === 'property') {
      // Populate month options if needed
      const monthSel = document.getElementById('rptPropertyMonthSelect');
      if (monthSel) {
        if (!monthSel.options || monthSel.options.length === 0) {
          const months = getPropertyMonthOptions();
          let mHtml = '';
          months.forEach((m, idx) => {
            mHtml += `<option value="${m.value}" ${idx === 0 ? 'selected' : ''}>${m.label}</option>`;
          });
          monthSel.innerHTML = mHtml;
          if (!_currentPropMonth && months.length > 0) {
            _currentPropMonth = months[0].value;
          }
        }
      }
      updatePropertyPeriodInfo();
      window.generateSelectedReport();
    } else {
      // If a property was selected or default is available, trigger tenant loading
      const activeVal = foundSelected ? defaultVal : propSel.value;
      if (activeVal) {
        window.handleReportPropertyChange(activeVal);
      }
    }
  };

  // ── UI: Handle Property Change (Cascading Tenant Dropdown) ──────────────────
  window.handleReportPropertyChange = async function (propertyId) {
    _currentReportPropertyId = propertyId;
    _currentReportTenantId = null;

    // Reset report cards & previews
    const reportCard = document.getElementById('rptTenantCard');
    if (reportCard) reportCard.style.display = 'none';

    if (_currentReportType === 'property') {
      updatePropertyPeriodInfo();
      window.generateSelectedReport();
      return;
    }

    const dateCard = document.getElementById('rptDateRangeCard');
    if (dateCard) dateCard.style.display = 'none';

    const vacatedAction = document.getElementById('rptVacatedActionArea');
    if (vacatedAction) vacatedAction.style.display = 'none';

    const genBtn = document.getElementById('rptGenerateBtn');
    if (genBtn) genBtn.disabled = true;

    const vacatedBtn = document.getElementById('rptVacatedGenerateBtn');
    if (vacatedBtn) vacatedBtn.disabled = true;

    const tenantSelect = document.getElementById('rptTenantSelect');
    const helper = document.getElementById('rptTenantHelperText');
    const area = document.getElementById('rptTenantListArea');

    if (!tenantSelect) return;

    if (!propertyId) {
      tenantSelect.disabled = true;
      tenantSelect.innerHTML = '<option value="">— Select a property first —</option>';
      if (helper) helper.innerHTML = '';
      if (area) area.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);padding:12px 0;">Select a property above to see tenants.</p>';
      return;
    }

    let st = getState();

    // If tenants array is empty, attempt direct Firestore fetch
    const db = window.fbDb || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
    const auth = window.fbAuth || (typeof firebase !== 'undefined' && firebase.auth ? firebase.auth() : null);
    const currentUid = (st && st.currentUser && st.currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid);

    if ((!st || !st.tenants || st.tenants.length === 0) && db && currentUid) {
      try {
        tenantSelect.disabled = true;
        tenantSelect.innerHTML = '<option value="">Loading tenants...</option>';
        const snapshot = await db.collection('tenants')
          .where('ownerId', '==', currentUid)
          .get();
        const fetchedTenants = snapshot.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            ...d,
            ownerId: d.ownerId,
            propertyId: d.propertyId,
            unitId: d.unitId,
            unitNumber: d.unitNumber || 'Unit',
            name: d.name,
            mobile: d.mobile || d.mobileNumber || '',
            rent: d.monthlyRent !== undefined ? d.monthlyRent : (d.rent || 0),
            status: d.status || 'active',
            moveIn: d.moveInDate || d.moveIn,
            moveOut: d.moveOutDate || d.moveOut || null,
            initialMeter: d.initialMeterReading !== undefined ? d.initialMeterReading : (d.initialMeter || 0),
            deposit: d.securityDeposit !== undefined ? d.securityDeposit : (d.deposit || 0),
            advance: d.advanceAmount !== undefined ? d.advanceAmount : (d.advance || 0),
            settlementNum: d.settlementNumber || d.settlementNum || null
          };
        });
        if (st) st.tenants = fetchedTenants;
        if (window.state) window.state.tenants = fetchedTenants;
      } catch (tErr) {
        console.error('Error fetching tenants for reports:', tErr);
      }
    }

    st = getState();
    const allTenants = (st && st.tenants) || [];
    const propertyTenants = allTenants.filter(t => t.propertyId === propertyId);

    const isVacatedReport = (_currentReportType === 'vacated');
    const noun = isVacatedReport ? 'vacated' : 'active';
    const matchingTenants = propertyTenants.filter(t => isVacatedReport ? t.status === 'vacated' : t.status !== 'vacated');

    if (matchingTenants.length === 0) {
      tenantSelect.disabled = true;
      tenantSelect.innerHTML = `<option value="">No ${noun} tenants in this property</option>`;
      if (helper) {
        helper.innerHTML = `<p style="font-size:0.82rem;color:var(--text-muted);margin-top:6px;">No ${noun} tenants found for the selected property.</p>`;
      }
      if (area) {
        area.innerHTML = `<p style="font-size:0.85rem;color:var(--text-muted);padding:12px 0;">No ${noun} tenants found in this property.</p>`;
      }
      return;
    }

    tenantSelect.disabled = false;
    let options = `<option value="">— Select a ${noun} tenant (${matchingTenants.length} available) —</option>`;

    matchingTenants.forEach(t => {
      const unitLabel = t.unitNumber ? ` — Unit ${t.unitNumber}` : '';
      if (!isVacatedReport) {
        options += `<option value="${t.id}">${t.name}${unitLabel} [Active]</option>`;
      } else {
        const settlement = (st.settlements || []).find(s => s.tenantId === t.id || (t.settlementNum && s.settlementNumber === t.settlementNum));
        const expiry = getExpiryInfo(settlement);
        let tag = '';
        let disabledAttr = '';
        if (!expiry.hasSettlement) {
          tag = ' [No Settlement]';
          disabledAttr = 'disabled';
        } else if (expiry.isExpired) {
          tag = ' [Access Expired]';
          disabledAttr = 'disabled';
        } else {
          tag = ` [${formatRemaining(expiry.remaining)}]`;
        }
        options += `<option value="${t.id}" ${disabledAttr}>${t.name}${unitLabel}${tag}</option>`;
      }
    });

    tenantSelect.innerHTML = options;

    if (helper) {
      helper.innerHTML = `<p style="font-size:0.82rem;color:var(--text-secondary);margin-top:6px;">${matchingTenants.length} ${noun} tenant${matchingTenants.length !== 1 ? 's' : ''} available. Select one to proceed.</p>`;
    }

    // Maintain backward-compatibility for rptTenantListArea if referenced anywhere
    if (area) {
      let legacyHtml = '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">';
      matchingTenants.forEach(t => {
        legacyHtml += `
          <div class="rpt-tenant-row" onclick="selectReportTenant('${t.id}')" data-tenant-id="${t.id}">
            <strong>${t.name}</strong> — Unit ${t.unitNumber || '—'}
          </div>`;
      });
      legacyHtml += '</div>';
      area.innerHTML = legacyHtml;
    }
  };

  // ── UI: Handle Tenant Dropdown Change ───────────────────────────────────────
  window.handleReportTenantSelectChange = function (tenantId) {
    if (!tenantId) {
      _currentReportTenantId = null;
      const reportCard = document.getElementById('rptTenantCard');
      if (reportCard) reportCard.style.display = 'none';

      const dateCard = document.getElementById('rptDateRangeCard');
      if (dateCard) dateCard.style.display = 'none';

      const vacatedAction = document.getElementById('rptVacatedActionArea');
      if (vacatedAction) vacatedAction.style.display = 'none';

      const genBtn = document.getElementById('rptGenerateBtn');
      if (genBtn) genBtn.disabled = true;

      const vacatedBtn = document.getElementById('rptVacatedGenerateBtn');
      if (vacatedBtn) vacatedBtn.disabled = true;

      const helper = document.getElementById('rptTenantHelperText');
      if (helper) helper.innerHTML = '';
      return;
    }

    _currentReportTenantId = tenantId;

    // Enable generate report buttons
    const genBtn = document.getElementById('rptGenerateBtn');
    if (genBtn) genBtn.disabled = false;

    const vacatedBtn = document.getElementById('rptVacatedGenerateBtn');
    if (vacatedBtn) vacatedBtn.disabled = false;

    // Keep tenant select value in sync
    const tenantSelect = document.getElementById('rptTenantSelect');
    if (tenantSelect && tenantSelect.value !== tenantId) {
      tenantSelect.value = tenantId;
    }

    // Highlight legacy row if present
    document.querySelectorAll('.rpt-tenant-row').forEach(el => {
      el.classList.toggle('rpt-tenant-row--selected', el.dataset.tenantId === tenantId);
    });

    const st = getState();
    const tenant = (st?.tenants || []).find(t => t.id === tenantId);
    if (!tenant) return;

    // Render detailed tenant preview pill in helper area
    const helper = document.getElementById('rptTenantHelperText');
    if (helper) {
      const isVacated = tenant.status === 'vacated';
      helper.innerHTML = `
        <div style="background:var(--bg-surface-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);padding:10px 14px;margin-top:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <strong style="color:var(--text-main);font-size:0.95rem;">${tenant.name}</strong>
              <span style="font-size:0.82rem;color:var(--text-secondary);margin-left:6px;">— Unit ${tenant.unitNumber || '—'}</span>
            </div>
            <div>
              <span class="rpt-badge ${isVacated ? 'rpt-badge--vacated' : 'rpt-badge--active'}">${isVacated ? 'VACATED' : 'ACTIVE'}</span>
            </div>
          </div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;display:flex;gap:14px;flex-wrap:wrap;">
            <span>Move-In: <strong style="color:var(--text-secondary);">${fmtDate(tenant.moveIn)}</strong></span>
            ${tenant.moveOut ? `<span>Vacated: <strong style="color:var(--text-secondary);">${fmtDate(tenant.moveOut)}</strong></span>` : ''}
            <span>Rent: <strong style="color:var(--text-secondary);">${fmt(tenant.rent || tenant.monthlyRent)}/mo</strong></span>
            ${Number(tenant.deposit || tenant.securityDeposit) > 0 ? `<span>Deposit: <strong style="color:var(--text-secondary);">${fmt(tenant.deposit || tenant.securityDeposit)}</strong></span>` : ''}
            ${Number(tenant.advance || tenant.advanceAmount) > 0 ? `<span>Advance: <strong style="color:#10b981;">${fmt(tenant.advance || tenant.advanceAmount)}</strong></span>` : ''}
          </div>
        </div>`;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const dateCard = document.getElementById('rptDateRangeCard');
    const vacatedAction = document.getElementById('rptVacatedActionArea');
    const startInput = document.getElementById('rptStartDate');
    const endInput = document.getElementById('rptEndDate');

    if (_currentReportType === 'active') {
      const moveInStr = tenant.moveIn || todayStr;
      _currentStartDate = moveInStr;
      _currentEndDate = todayStr;

      if (startInput) startInput.value = moveInStr;
      if (endInput) endInput.value = todayStr;
      if (dateCard) dateCard.style.display = 'block';
      if (vacatedAction) vacatedAction.style.display = 'none';

      updateDateRangeInfo();
      window.generateSelectedReport();
    } else {
      if (dateCard) dateCard.style.display = 'none';
      if (vacatedAction) vacatedAction.style.display = 'block';
      window.generateSelectedReport();
    }
  };

  // Backward-compatibility alias
  window.selectReportTenant = function (tenantId) {
    window.handleReportTenantSelectChange(tenantId);
  };

  // Backward-compatibility alias
  window.renderReportTenantList = function () {
    const propId = document.getElementById('rptPropertySelect')?.value || '';
    window.handleReportPropertyChange(propId);
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

  // ── UI: Property Report Period Controls ───────────────────────────────────
  window.handlePropertyMonthChange = function (val) {
    _currentPropMonth = val;
    _currentPropStartDate = '';
    _currentPropEndDate = '';
    const sInput = document.getElementById('rptPropStartDate');
    const eInput = document.getElementById('rptPropEndDate');
    if (sInput) sInput.value = '';
    if (eInput) eInput.value = '';
    updatePropertyPeriodInfo();
    window.generateSelectedReport();
  };

  window.handlePropertyCustomDateChange = function () {
    const sInput = document.getElementById('rptPropStartDate');
    const eInput = document.getElementById('rptPropEndDate');
    _currentPropStartDate = sInput ? sInput.value : '';
    _currentPropEndDate = eInput ? eInput.value : '';
    if (_currentPropStartDate || _currentPropEndDate) {
      _currentPropMonth = '';
    }
    updatePropertyPeriodInfo();
  };

  window.setPropertyQuickRange = function (preset) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    let startStr = '';
    let endStr = todayStr;
    let mVal = '';

    if (preset === 'currentMonth') {
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      mVal = `${y}-${m}`;
      startStr = `${mVal}-01`;
      endStr = todayStr;
    } else if (preset === 'lastMonth') {
      const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      mVal = `${y}-${m}`;
      startStr = `${mVal}-01`;
      const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
      endStr = `${mVal}-${String(lastDay).padStart(2, '0')}`;
    } else if (preset === 'last3m') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      startStr = d.toISOString().split('T')[0];
      endStr = todayStr;
    } else if (preset === 'last6m') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      startStr = d.toISOString().split('T')[0];
      endStr = todayStr;
    } else if (preset === 'thisYear') {
      startStr = `${today.getFullYear()}-01-01`;
      endStr = todayStr;
    } else if (preset === 'all') {
      startStr = '2020-01-01';
      endStr = todayStr;
    }

    _currentPropMonth = mVal;
    _currentPropStartDate = startStr;
    _currentPropEndDate = endStr;

    const mSel = document.getElementById('rptPropertyMonthSelect');
    if (mSel && mVal) mSel.value = mVal;
    const sInput = document.getElementById('rptPropStartDate');
    if (sInput) sInput.value = startStr;
    const eInput = document.getElementById('rptPropEndDate');
    if (eInput) eInput.value = endStr;

    updatePropertyPeriodInfo();
    window.generateSelectedReport();
  };

  function updatePropertyPeriodInfo() {
    const info = document.getElementById('rptPropertyPeriodInfo');
    if (!info) return;
    if (_currentPropStartDate && _currentPropEndDate) {
      info.textContent = `Period: ${fmtDate(_currentPropStartDate)} → ${fmtDate(_currentPropEndDate)}`;
    } else if (_currentPropMonth) {
      info.textContent = `Month: ${formatMonthReadable(_currentPropMonth)}`;
    } else {
      info.textContent = '';
    }
  }

  // ── UI: Generate Report ─────────────────────────────────────────────────────
  window.generateSelectedReport = function () {
    if (_currentReportType === 'property') {
      generatePropertyReport();
      return;
    }

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

  // ── UI: Generate Property Report ───────────────────────────────────────────
  function generatePropertyReport() {
    const loading = document.getElementById('rptLoadingIndicator');
    const loadingTitle = document.getElementById('rptLoadingTitle');
    const loadingSub = document.getElementById('rptLoadingSubtitle');
    const card = document.getElementById('rptTenantCard');
    const summary = document.getElementById('rptTenantSummary');
    const expiryBanner = document.getElementById('rptExpiryBanner');
    const statusBadgeArea = document.getElementById('rptStatusBadgeArea');
    const previewArea = document.getElementById('rptDetailedPreview');
    const dlBtns = document.getElementById('rptDownloadBtns');
    const propSel = document.getElementById('rptPropertySelect');

    const selectedPropId = propSel ? propSel.value : (_currentReportPropertyId || 'all');
    _currentReportPropertyId = selectedPropId;

    if (loading) {
      loading.style.display = 'block';
      if (loadingTitle) loadingTitle.textContent = 'Generating Property-Wise Business Report...';
      if (loadingSub) loadingSub.textContent = 'Computing unit occupancy, billing history, payment collections, and utility meter readings.';
    }
    if (card) card.style.display = 'none';

    setTimeout(() => {
      const data = assemblePropertyReportData(selectedPropId, _currentPropMonth, _currentPropStartDate, _currentPropEndDate);

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

      const excelBtnText = document.getElementById('rptExcelBtnText');
      if (excelBtnText) excelBtnText.textContent = 'Download Property Excel (.xlsx)';
      const pdfBtnText = document.getElementById('rptPdfBtnText');
      if (pdfBtnText) pdfBtnText.textContent = 'Download Property PDF';

      if (statusBadgeArea) {
        statusBadgeArea.innerHTML = `<span class="rpt-badge rpt-badge--property" style="font-size:0.8rem;padding:4px 12px;">PROPERTY REPORT</span>`;
      }

      if (expiryBanner) {
        expiryBanner.innerHTML = `
          <div style="padding:10px 14px;border-radius:var(--radius-sm);background:rgba(79,70,229,0.08);border:1px solid rgba(79,70,229,0.3);color:var(--primary);font-size:0.84rem;font-weight:600;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></svg>
              <span>Scope: <strong>${data.propertyNames}</strong> &nbsp;|&nbsp; Period: <strong>${data.periodLabel}</strong></span>
            </div>
            <span style="font-size:0.78rem;color:var(--text-muted);">Generated: ${fmtDate(new Date().toISOString())}</span>
          </div>`;
      }

      const fin = data.summary;

      if (summary) {
        summary.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;">
            <div>
              <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Property / Scope</span>
              <div style="font-weight:700;font-size:1.05rem;color:var(--text-main);margin-top:2px;">${data.propertyNames}</div>
              <div style="font-size:0.82rem;color:var(--text-secondary);">${data.properties.length} propert${data.properties.length === 1 ? 'y' : 'ies'} in scope</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">${data.periodLabel}</div>
            </div>
            <div>
              <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Occupancy Health</span>
              <div style="font-weight:700;margin-top:2px;color:var(--text-main);font-size:1.05rem;">
                ${fin.occupiedRooms} / ${fin.totalRooms} Rooms <span style="font-size:0.85rem;color:#10b981;">(${Math.round(fin.occupancyRate)}%)</span>
              </div>
              <div style="font-size:0.82rem;color:${fin.vacantRooms > 0 ? '#f59e0b' : '#10b981'};">${fin.vacantRooms} vacant unit${fin.vacantRooms !== 1 ? 's' : ''}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">${fin.totalTenantsCount} active tenants</div>
            </div>
            <div>
              <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Expected Rent</span>
              <div style="font-weight:700;margin-top:2px;color:var(--text-main);font-size:1.05rem;">${fmt(fin.expectedRent)}</div>
              <div style="font-size:0.82rem;color:var(--text-secondary);">Rent Received: <strong style="color:#10b981;">${fmt(fin.rentCollected)}</strong></div>
              <div style="font-size:0.78rem;color:${fin.rentOutstanding > 0 ? '#ef4444' : '#10b981'};">Rent Due: ${fmt(fin.rentOutstanding)}</div>
            </div>
            <div>
              <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Total Collections (All)</span>
              <div style="font-weight:700;margin-top:2px;color:#10b981;font-size:1.1rem;">${fmt(fin.totalCollected)}</div>
              <div style="font-size:0.82rem;color:var(--text-secondary);">${fin.totalPaymentsCount} transactions recorded</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">In selected period</div>
            </div>
            <div>
              <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Total Billed (All Items)</span>
              <div style="font-weight:700;color:var(--primary);margin-top:2px;font-size:1.05rem;">${fmt(fin.totalBilled)}</div>
              <div style="font-size:0.82rem;color:var(--text-secondary);">${fin.totalBillsCount} bills generated</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Rent, Utilities &amp; Dues</div>
            </div>
            <div>
              <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Total Outstanding Dues</span>
              <div style="font-weight:700;color:${fin.totalOutstanding > 0 ? '#ef4444' : '#10b981'};margin-top:2px;font-size:1.1rem;">
                ${fmt(fin.totalOutstanding)}
              </div>
              <div style="font-size:0.82rem;color:var(--text-secondary);">${data.outstandingBills.length} unpaid / partial bills</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Prev Dues: ${fmt(fin.previousDueTotal)}</div>
            </div>
            <div>
              <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Bill Clearance Rate</span>
              <div style="font-weight:700;color:var(--text-main);margin-top:2px;font-size:1.05rem;">
                ${fin.paidBillsCount} Paid &nbsp;|&nbsp; ${fin.partialBillsCount} Partial
              </div>
              <div style="font-size:0.82rem;color:${fin.unpaidBillsCount > 0 ? '#ef4444' : '#10b981'};">${fin.unpaidBillsCount} fully unpaid</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Out of ${fin.totalBillsCount} total bills</div>
            </div>
            <div>
              <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Tenant Movement</span>
              <div style="font-weight:700;color:var(--text-main);margin-top:2px;font-size:1.05rem;">
                +${fin.newTenantsCount} New &nbsp;|&nbsp; -${fin.vacatedTenantsCount} Vacated
              </div>
              <div style="font-size:0.82rem;color:var(--text-secondary);">In reporting period</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">${fin.totalTenantsCount} current residents</div>
            </div>
          </div>`;
      }

      renderPropertyDetailedPreview(data);
    }, 150);
  }

  // ── Render Property Detailed Preview Tabs ──────────────────────────────────
  function renderPropertyDetailedPreview(data) {
    const previewArea = document.getElementById('rptDetailedPreview');
    if (!previewArea) return;

    const { properties, units, tenants, bills, payments, outstandingBills, summary: fin, periodLabel } = data;

    let contentHtml = '';

    if (_activePreviewTab === 'summary') {
      contentHtml = `
        <div style="margin-top:14px;">
          <!-- Occupancy Progress Bar -->
          <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);padding:14px;margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:0.82rem;font-weight:700;color:var(--text-main);text-transform:uppercase;">Unit Occupancy Status</span>
              <span style="font-size:0.85rem;font-weight:700;color:var(--primary);">${fin.occupiedRooms} / ${fin.totalRooms} Units (${Math.round(fin.occupancyRate)}%)</span>
            </div>
            <div style="height:10px;background:rgba(239,68,68,0.2);border-radius:999px;overflow:hidden;position:relative;">
              <div style="height:100%;width:${fin.occupancyRate}%;background:#10b981;border-radius:999px;transition:width 0.3s ease;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);margin-top:6px;">
              <span style="color:#10b981;">Occupied: ${fin.occupiedRooms} (${Math.round(fin.occupancyRate)}%)</span>
              <span style="color:#ef4444;">Vacant: ${fin.vacantRooms} (${Math.round(fin.vacancyRate)}%)</span>
            </div>
          </div>

          <!-- Collection Categories Table -->
          <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);padding:14px;">
            <div style="font-size:0.82rem;font-weight:700;color:var(--text-main);text-transform:uppercase;margin-bottom:10px;">
              Collections by Category (Actual Money Received)
            </div>
            <div style="overflow-x:auto;">
              <table class="portal-table" style="width:100%;font-size:0.82rem;">
                <thead>
                  <tr><th>Category</th><th>Amount Collected</th><th>Share of Total</th></tr>
                </thead>
                <tbody>
                  <tr><td>Rent Collection</td><td style="font-weight:700;color:#10b981;">${fmt(fin.collRent)}</td><td>${fin.collTotal > 0 ? Math.round((fin.collRent / fin.collTotal) * 100) : 0}%</td></tr>
                  <tr><td>Electricity Collection</td><td style="font-weight:600;">${fmt(fin.collElec)}</td><td>${fin.collTotal > 0 ? Math.round((fin.collElec / fin.collTotal) * 100) : 0}%</td></tr>
                  <tr><td>Water Collection</td><td style="font-weight:600;">${fmt(fin.collWater)}</td><td>${fin.collTotal > 0 ? Math.round((fin.collWater / fin.collTotal) * 100) : 0}%</td></tr>
                  <tr><td>Parking Collection</td><td style="font-weight:600;">${fmt(fin.collParking)}</td><td>${fin.collTotal > 0 ? Math.round((fin.collParking / fin.collTotal) * 100) : 0}%</td></tr>
                  <tr><td>Maintenance Collection</td><td style="font-weight:600;">${fmt(fin.collMaint)}</td><td>${fin.collTotal > 0 ? Math.round((fin.collMaint / fin.collTotal) * 100) : 0}%</td></tr>
                  <tr><td>Other Charges</td><td style="font-weight:600;">${fmt(fin.collOther)}</td><td>${fin.collTotal > 0 ? Math.round((fin.collOther / fin.collTotal) * 100) : 0}%</td></tr>
                  <tr><td>Previous Dues Cleared</td><td style="font-weight:600;">${fmt(fin.collPrevDue)}</td><td>${fin.collTotal > 0 ? Math.round((fin.collPrevDue / fin.collTotal) * 100) : 0}%</td></tr>
                  <tr style="font-weight:800;background:var(--bg-surface-elevated);"><td>Total Collections</td><td style="color:#10b981;font-size:0.95rem;">${fmt(fin.collTotal)}</td><td>100%</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
    } else if (_activePreviewTab === 'units') {
      if (units.length === 0) {
        contentHtml = '<p style="font-size:0.85rem;color:var(--text-muted);padding:16px 0;">No units found in the selected property.</p>';
      } else {
        let rows = '';
        units.forEach((u, i) => {
          const tenant = tenants.find(t => t.unitId === u.id || t.unitNumber === u.unitNumber);
          const isOccupied = u.status === 'occupied' || Boolean(tenant);
          rows += `<tr>
            <td>${i + 1}</td>
            <td><strong>${u.unitNumber || 'Unit'}</strong></td>
            <td>${u.floor || '—'} / ${u.type || 'Standard'}</td>
            <td><span class="${isOccupied ? 'badge-paid' : 'badge-unpaid'}">${isOccupied ? 'OCCUPIED' : 'VACANT'}</span></td>
            <td><strong>${tenant ? tenant.name : '—'}</strong></td>
            <td>${tenant ? (tenant.mobile || tenant.mobileNumber || '—') : '—'}</td>
            <td>${tenant ? fmt(tenant.rent || tenant.monthlyRent) : fmt(u.rent || u.monthlyRent)}</td>
            <td>${tenant ? fmtDate(tenant.moveIn || tenant.moveInDate) : '—'}</td>
          </tr>`;
        });
        contentHtml = `
          <div style="overflow-x:auto;margin-top:12px;">
            <table class="portal-table" style="width:100%;font-size:0.82rem;">
              <thead>
                <tr><th>#</th><th>Unit No</th><th>Floor / Type</th><th>Status</th><th>Current Tenant</th><th>Mobile</th><th>Monthly Rent</th><th>Move-in</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      }
    } else if (_activePreviewTab === 'bills') {
      if (bills.length === 0) {
        contentHtml = '<p style="font-size:0.85rem;color:var(--text-muted);padding:16px 0;">No bills generated for the selected property in this period.</p>';
      } else {
        let rows = '';
        bills.forEach((b, i) => {
          const tenant = tenants.find(t => t.id === b.tenantId);
          const tenantName = tenant ? tenant.name : (b.tenantName || 'Tenant');
          const unitNo = b.unitNumber || (units.find(u => u.id === b.unitId)?.unitNumber) || '—';
          const stLabel = paymentStatusLabel(b);
          const badgeClass = stLabel === 'PAID' ? 'badge-paid' : stLabel === 'PARTIALLY PAID' ? 'badge-partial' : 'badge-unpaid';
          rows += `<tr>
            <td>${i + 1}</td>
            <td><strong>${b.billNumber || '—'}</strong></td>
            <td>${tenantName}</td>
            <td>${unitNo}</td>
            <td>${formatMonthReadable(b.billingMonth)}</td>
            <td>${fmtDate(b.dueDate || getBillDate(b))}</td>
            <td>${fmt(b.rent)}</td>
            <td>${fmt(b.electricityCharge)}</td>
            <td>${fmt(b.waterCharge)}</td>
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
                <tr><th>#</th><th>Bill No</th><th>Tenant</th><th>Unit</th><th>Month</th><th>Due Date</th><th>Rent</th><th>Electricity</th><th>Water</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      }
    } else if (_activePreviewTab === 'payments') {
      if (payments.length === 0) {
        contentHtml = '<p style="font-size:0.85rem;color:var(--text-muted);padding:16px 0;">No payment transactions recorded in this period.</p>';
      } else {
        let rows = '';
        payments.forEach((p, i) => {
          const tenant = tenants.find(t => t.id === p.tenantId);
          const tenantName = tenant ? tenant.name : (p.tenantName || 'Tenant');
          let billInfo = '—';
          if (Array.isArray(p.allocations) && p.allocations.length > 0) {
            billInfo = p.allocations.map(a => `${a.type === 'advance' ? 'Advance' : 'Bill'} (₹${a.amount})`).join(', ');
          } else if (p.billId) {
            billInfo = p.billId === 'advance' ? 'Advance' : 'Direct Bill';
          }
          rows += `<tr>
            <td>${i + 1}</td>
            <td>${fmtDate(getPaymentDate(p))}</td>
            <td><strong>${tenantName}</strong></td>
            <td>${billInfo}</td>
            <td style="font-weight:700;color:#10b981;">${fmt(p.amount || p.amountPaid)}</td>
            <td>${paymentMethodLabel(p.paymentMethod || p.mode)}</td>
            <td style="font-family:monospace;font-size:0.75rem;">${p.transactionId || p.referenceId || '—'}</td>
            <td><span class="badge-paid">${(p.status || 'approved').toUpperCase()}</span></td>
          </tr>`;
        });
        contentHtml = `
          <div style="overflow-x:auto;margin-top:12px;">
            <table class="portal-table" style="width:100%;font-size:0.82rem;">
              <thead>
                <tr><th>#</th><th>Date</th><th>Tenant</th><th>Allocation</th><th>Amount</th><th>Method</th><th>Txn / Ref ID</th><th>Status</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      }
    } else if (_activePreviewTab === 'utilities') {
      let rows = '';
      bills.forEach((b, i) => {
        const tenant = tenants.find(t => t.id === b.tenantId);
        const tenantName = tenant ? tenant.name : (b.tenantName || 'Tenant');
        const unitNo = b.unitNumber || (units.find(u => u.id === b.unitId)?.unitNumber) || '—';
        const eDates = getMeterReadingDates(b, bills, tenant);
        rows += `<tr>
          <td>${i + 1}</td>
          <td>${tenantName} (Unit ${unitNo})</td>
          <td>Electricity</td>
          <td>${b.previousMeterReading != null ? b.previousMeterReading : '—'}</td>
          <td>${formatDDMMYYYY(eDates.prevDate) || '—'}</td>
          <td>${b.currentMeterReading != null ? b.currentMeterReading : '—'}</td>
          <td>${formatDDMMYYYY(eDates.currDate) || '—'}</td>
          <td style="font-weight:600;">${b.electricityUnits || 0} u</td>
          <td>${b.electricityRate ? `₹${b.electricityRate}/u` : (b.electricityFixedAmount ? `Fixed ₹${b.electricityFixedAmount}` : '—')}</td>
          <td style="font-weight:700;color:var(--text-main);">${fmt(b.electricityCharge)}</td>
        </tr>`;
      });
      contentHtml = bills.length === 0
        ? '<p style="font-size:0.85rem;color:var(--text-muted);padding:16px 0;">No utility records in this period.</p>'
        : `<div style="overflow-x:auto;margin-top:12px;">
            <table class="portal-table" style="width:100%;font-size:0.82rem;">
              <thead>
                <tr><th>#</th><th>Tenant & Unit</th><th>Utility</th><th>Prev Reading</th><th>Prev Date</th><th>Curr Reading</th><th>Curr Date</th><th>Units</th><th>Rate / Plan</th><th>Total Charge</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
    } else if (_activePreviewTab === 'dues') {
      if (outstandingBills.length === 0) {
        contentHtml = '<p style="font-size:0.85rem;color:#10b981;font-weight:600;padding:16px 0;">✓ Outstanding balance zero! All bills are fully paid in this period.</p>';
      } else {
        let rows = '';
        outstandingBills.forEach((b, i) => {
          const tenant = tenants.find(t => t.id === b.tenantId);
          const tenantName = tenant ? tenant.name : (b.tenantName || 'Tenant');
          const unitNo = b.unitNumber || (units.find(u => u.id === b.unitId)?.unitNumber) || '—';
          const overdue = getDaysOverdue(b.dueDate);
          rows += `<tr>
            <td>${i + 1}</td>
            <td><strong>${tenantName}</strong></td>
            <td>Unit ${unitNo}</td>
            <td>${b.billNumber || '—'}</td>
            <td>${formatMonthReadable(b.billingMonth)}</td>
            <td>${fmtDate(b.dueDate)}</td>
            <td style="color:${overdue > 0 ? '#ef4444' : 'var(--text-secondary)'};font-weight:600;">${overdue > 0 ? `${overdue} days` : 'Not overdue'}</td>
            <td>${fmt(b.totalAmount)}</td>
            <td style="color:#10b981;">${fmt(b.paidAmount)}</td>
            <td style="color:#ef4444;font-weight:700;">${fmt(b.remainingAmount)}</td>
          </tr>`;
        });
        contentHtml = `
          <div style="overflow-x:auto;margin-top:12px;">
            <table class="portal-table" style="width:100%;font-size:0.82rem;">
              <thead>
                <tr><th>#</th><th>Tenant</th><th>Unit</th><th>Bill No</th><th>Month</th><th>Due Date</th><th>Overdue</th><th>Total Bill</th><th>Paid</th><th>Remaining Due</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      }
    }

    previewArea.innerHTML = `
      <div style="border-top:1px solid var(--border-subtle);margin-top:16px;padding-top:14px;">
        <div style="display:flex;gap:4px;border-bottom:1px solid var(--border-subtle);margin-bottom:12px;overflow-x:auto;">
          <button type="button" class="rpt-preview-tab-btn ${_activePreviewTab === 'summary' ? 'active' : ''}" onclick="switchReportPreviewTab('summary')">Summary &amp; Metrics</button>
          <button type="button" class="rpt-preview-tab-btn ${_activePreviewTab === 'units' ? 'active' : ''}" onclick="switchReportPreviewTab('units')">Unit Roster (${units.length})</button>
          <button type="button" class="rpt-preview-tab-btn ${_activePreviewTab === 'bills' ? 'active' : ''}" onclick="switchReportPreviewTab('bills')">Bills History (${bills.length})</button>
          <button type="button" class="rpt-preview-tab-btn ${_activePreviewTab === 'payments' ? 'active' : ''}" onclick="switchReportPreviewTab('payments')">Payments (${payments.length})</button>
          <button type="button" class="rpt-preview-tab-btn ${_activePreviewTab === 'utilities' ? 'active' : ''}" onclick="switchReportPreviewTab('utilities')">Electricity &amp; Water</button>
          <button type="button" class="rpt-preview-tab-btn ${_activePreviewTab === 'dues' ? 'active' : ''}" onclick="switchReportPreviewTab('dues')">Outstanding Dues (${outstandingBills.length})</button>
        </div>
        ${contentHtml}
      </div>`;
  }

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
    if (_currentReportType === 'property') {
      const data = assemblePropertyReportData(_currentReportPropertyId, _currentPropMonth, _currentPropStartDate, _currentPropEndDate);
      if (data.ok) {
        renderPropertyDetailedPreview(data);
      }
      return;
    }
    const data = assembleReportData(_currentReportTenantId, _currentReportType, _currentStartDate, _currentEndDate);
    if (data.ok && data.reportType === 'active') {
      renderActiveTenantDetailedPreview(data);
    }
  };

  // ── Property Excel Generation ───────────────────────────────────────────────
  window.downloadPropertyExcel = function () {
    const data = assemblePropertyReportData(_currentReportPropertyId, _currentPropMonth, _currentPropStartDate, _currentPropEndDate);
    if (data.error) { alert(data.message); return; }

    if (typeof XLSX === 'undefined') {
      alert('Excel library not loaded. Please check your internet connection and try again.');
      return;
    }

    const exportBtn = document.getElementById('rptExcelBtn');
    const origHtml = exportBtn ? exportBtn.innerHTML : '';
    if (exportBtn) {
      exportBtn.disabled = true;
      exportBtn.innerHTML = `<span>Exporting Excel...</span>`;
    }

    try {
      const properties = data.properties;
      const units = data.units;
      const tenants = data.tenants;
      const filteredBills = data.bills;
      const filteredPayments = data.payments;
      const filteredTenants = data.tenants;
      const newTenantsList = data.newTenants;
      const vacatedTenantsList = data.vacatedTenants;
      const outstandingBills = data.outstandingBills;
      const fin = data.summary;
      const monthStr = data.monthStr || '';
      const monthLabel = data.periodLabel;
      const selectedPropertyNames = data.propertyNames;
      const propertyId = data.propertyId;

      // Helper cell functions matching mobile app
      const currencyCell = (v) => ({ v: Number(v) || 0, t: 'n', z: '"₹"#,##,##0' });
      const percentCell = (v) => ({ v: (Number(v) || 0) / 100, t: 'n', z: '0%' });
      const numCell = (v) => ({ v: Number(v) || 0, t: 'n' });
      const strCell = (v) => ({ v: String(v == null ? '' : v), t: 's' });
      const dateCell = (dStr) => ({ v: formatExcelDate(dStr), t: 's' });

      // ── 1. Summary Sheet ──
      const summaryRows = [
        [strCell('RENTORA — MONTHLY PROPERTY REPORT'), strCell('')],
        [],
        [strCell('Property:'), strCell(selectedPropertyNames)],
        [strCell('Report Month / Period:'), strCell(monthLabel)],
        [strCell('Report Generated Date:'), strCell(formatExcelDate(new Date().toISOString().split('T')[0]))],
        [],
        [strCell('OVERALL SUMMARY'), strCell('')],
        [strCell('Expected Rent:'), currencyCell(fin.expectedRent)],
        [strCell('Collected:'), currencyCell(fin.totalCollected)],
        [strCell('Outstanding:'), currencyCell(fin.totalOutstanding)],
        [strCell('New Tenants:'), numCell(fin.newTenantsCount)],
        [strCell('Vacated Tenants:'), numCell(fin.vacatedTenantsCount)],
        [strCell('Occupied Rooms:'), strCell(`${fin.occupiedRooms} / ${fin.totalRooms}`)],
        [strCell('Vacant Rooms:'), strCell(`${fin.vacantRooms} / ${fin.totalRooms}`)],
        [strCell('Occupancy:'), percentCell(fin.occupancyRate)],
        [strCell('Vacancy:'), percentCell(fin.vacancyRate)],
        [],
        [strCell('RENT DETAILS'), strCell('')],
        [strCell('Total Expected Rent:'), currencyCell(fin.expectedRent)],
        [strCell('Total Rent Received:'), currencyCell(fin.rentCollected)],
        [strCell('Total Rent Due:'), currencyCell(fin.rentOutstanding)],
        [strCell('Previous Due:'), currencyCell(fin.previousDueTotal)],
        [strCell('Current Month Due:'), currencyCell(fin.totalOutstanding)],
        [strCell('Total Amount Collected:'), currencyCell(fin.totalCollected)],
        [strCell('Total Outstanding:'), currencyCell(fin.totalOutstanding)],
        [],
        [strCell('BILL STATUS SUMMARY'), strCell('')],
        [strCell('Paid Bills:'), numCell(fin.paidBillsCount)],
        [strCell('Partially Paid Bills:'), numCell(fin.partialBillsCount)],
        [strCell('Unpaid Bills:'), numCell(fin.unpaidBillsCount)],
        [],
        [strCell('PROPERTY SUMMARY DETAILS'), strCell('')]
      ];

      if (propertyId === 'all') {
        summaryRows.push([
          strCell('Property Name'), strCell('Type'), strCell('Address'), strCell('Total Units'), strCell('Occupied'), strCell('Vacant'), strCell('Active Tenants'), strCell('Vacated')
        ]);
        properties.forEach(p => {
          const pUnits = units.filter(u => u.propertyId === p.id);
          const pTotal = p.totalUnits || pUnits.length;
          const pOccupied = pUnits.filter(u => u.status === 'occupied').length;
          const pVacant = Math.max(0, pTotal - pOccupied);
          const pActiveTenants = tenants.filter(t => t.propertyId === p.id && t.status === 'active').length;
          const pVacatedTenants = tenants.filter(t => t.propertyId === p.id && t.status === 'vacated').length;
          summaryRows.push([
            strCell(p.name), strCell(p.type || 'Property'), strCell(p.address || ''), numCell(pTotal), numCell(pOccupied), numCell(pVacant), numCell(pActiveTenants), numCell(pVacatedTenants)
          ]);
        });
      } else {
        const p = properties[0];
        if (p) {
          const pUnits = units.filter(u => u.propertyId === p.id);
          const pTotal = p.totalUnits || pUnits.length;
          const pOccupied = pUnits.filter(u => u.status === 'occupied').length;
          const pVacant = Math.max(0, pTotal - pOccupied);
          const pActiveTenants = tenants.filter(t => t.propertyId === p.id && t.status === 'active').length;
          const pVacatedTenants = tenants.filter(t => t.propertyId === p.id && t.status === 'vacated').length;
          summaryRows.push([strCell('Property Name:'), strCell(p.name)]);
          summaryRows.push([strCell('Property Type:'), strCell(p.type || 'Property')]);
          summaryRows.push([strCell('Property Address:'), strCell(p.address || '')]);
          summaryRows.push([strCell('Total Rooms/Units:'), numCell(pTotal)]);
          summaryRows.push([strCell('Occupied Rooms:'), numCell(pOccupied)]);
          summaryRows.push([strCell('Vacant Rooms:'), numCell(pVacant)]);
          summaryRows.push([strCell('Active Tenants:'), numCell(pActiveTenants)]);
          summaryRows.push([strCell('Vacated Tenants:'), numCell(pVacatedTenants)]);
        }
      }
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);

      // ── 2. Tenant Details Sheet ──
      const tenantRows = [
        [strCell('Tenant Name'), strCell('Mobile Number'), strCell('Property'), strCell('Monthly Rent'), strCell('Move-in Date')]
      ];
      filteredTenants.forEach(t => {
        const propName = properties.find(p => p.id === t.propertyId)?.name || selectedPropertyNames;
        tenantRows.push([
          strCell(t.name),
          strCell(t.mobile || t.mobileNumber || ''),
          strCell(propName),
          currencyCell(t.rent || t.monthlyRent || 0),
          dateCell(t.moveIn || t.moveInDate)
        ]);
      });
      const wsTenantDetails = XLSX.utils.aoa_to_sheet(tenantRows);

      // ── 3. Bills Sheet ──
      const billRows = [
        [strCell('Bill Number'), strCell('Tenant Name'), strCell('Rent'), strCell('Previous Due'), strCell('Total Payable'), strCell('Paid Amount'), strCell('Remaining Due'), strCell('Payment Status')]
      ];
      filteredBills.forEach(b => {
        const tenantName = tenants.find(t => t.id === b.tenantId)?.name || b.tenantName || 'Tenant';
        billRows.push([
          strCell(b.billNumber || '—'),
          strCell(tenantName),
          currencyCell(b.rent || 0),
          currencyCell(b.previousDue || 0),
          currencyCell(b.totalAmount || 0),
          currencyCell(b.paidAmount || 0),
          currencyCell(b.remainingAmount || 0),
          strCell(paymentStatusLabel(b))
        ]);
      });
      const wsBills = XLSX.utils.aoa_to_sheet(billRows);

      // ── 4. Payments Sheet ──
      const paymentRows = [
        [strCell('Payment Date'), strCell('Tenant Name'), strCell('Bill Number'), strCell('Amount Paid'), strCell('Payment Method'), strCell('Transaction ID'), strCell('Payment Status')]
      ];
      filteredPayments.forEach(p => {
        const tenantName = tenants.find(t => t.id === p.tenantId)?.name || p.tenantName || 'Tenant';
        let billNo = '-';
        let billStatus = (p.status || 'approved').toUpperCase();

        if (Array.isArray(p.allocations) && p.allocations.length > 0) {
          billNo = p.allocations.map(a => {
            if (a.type === 'advance') return `Advance (₹${a.amount})`;
            const b = filteredBills.find(tb => tb.id === a.billId);
            return `${b ? b.billNumber : a.billId} (₹${a.amount})`;
          }).join(', ');
        } else {
          const bill = filteredBills.find(b => b.id === p.billId);
          billNo = bill ? bill.billNumber : (p.billId === 'advance' ? 'Advance Payment' : '-');
          if (bill) billStatus = paymentStatusLabel(bill);
        }

        paymentRows.push([
          dateCell(getPaymentDate(p)),
          strCell(tenantName),
          strCell(billNo),
          currencyCell(Number(p.amount) || Number(p.amountPaid) || 0),
          strCell(paymentMethodLabel(p.paymentMethod || p.mode)),
          strCell(p.transactionId || p.referenceId || ''),
          strCell(billStatus)
        ]);
      });
      const wsPayments = XLSX.utils.aoa_to_sheet(paymentRows);

      // ── 5. New Tenants Sheet ──
      const newTenantRows = [
        [strCell('Total New Tenants:'), numCell(newTenantsList.length)],
        [],
        [strCell('Tenant Name'), strCell('Room'), strCell('Move-in Date'), strCell('Monthly Rent')]
      ];
      newTenantsList.forEach(t => {
        const unitNo = units.find(u => u.id === t.unitId)?.unitNumber || t.unitNumber || '-';
        newTenantRows.push([
          strCell(t.name),
          strCell(unitNo),
          dateCell(t.moveIn || t.moveInDate),
          currencyCell(t.rent || t.monthlyRent || 0)
        ]);
      });
      const wsNewTenants = XLSX.utils.aoa_to_sheet(newTenantRows);

      // ── 6. Vacated Tenants Sheet ──
      const vacatedTenantRows = [
        [strCell('Total Vacated Tenants:'), numCell(vacatedTenantsList.length)],
        [],
        [strCell('Tenant Name'), strCell('Room'), strCell('Move-in Date'), strCell('Move-out Date'), strCell('Rent')]
      ];
      vacatedTenantsList.forEach(t => {
        const unitNo = units.find(u => u.id === t.unitId)?.unitNumber || t.unitNumber || '-';
        vacatedTenantRows.push([
          strCell(t.name),
          strCell(unitNo),
          dateCell(t.moveIn || t.moveInDate),
          dateCell(t.moveOut || t.moveOutDate),
          currencyCell(t.rent || t.monthlyRent || 0)
        ]);
      });
      const wsVacatedTenants = XLSX.utils.aoa_to_sheet(vacatedTenantRows);

      // ── 7. Outstanding Sheet ──
      const outstandingRows = [
        [strCell('Tenant'), strCell('Room'), strCell('Total Bill'), strCell('Paid'), strCell('Due'), strCell('Due Since'), strCell('Due Date'), strCell('Days Overdue'), strCell('Status')]
      ];
      outstandingBills.forEach(b => {
        const tenant = tenants.find(t => t.id === b.tenantId);
        const tenantName = tenant ? tenant.name : (b.tenantName || 'Tenant');
        const unitNo = units.find(u => u.id === b.unitId)?.unitNumber || b.unitNumber || '-';
        outstandingRows.push([
          strCell(tenantName),
          strCell(unitNo),
          currencyCell(b.totalAmount || 0),
          currencyCell(b.paidAmount || 0),
          currencyCell(b.remainingAmount || 0),
          strCell(formatMonthReadable(b.billingMonth)),
          dateCell(b.dueDate),
          numCell(getDaysOverdue(b.dueDate)),
          strCell(paymentStatusLabel(b))
        ]);
      });
      const wsOutstanding = XLSX.utils.aoa_to_sheet(outstandingRows);

      // ── 8. Electricity Sheet ──
      const electricityRows = [
        [strCell('Tenant Name'), strCell('Property'), strCell('Billing Type'), strCell('Previous Reading'), strCell('Prev Reading Date'), strCell('Current Reading'), strCell('Curr Reading Date'), strCell('Total Units'), strCell('Total Days'), strCell('Rate Per Unit'), strCell('Fixed Monthly Amount'), strCell('Electricity Amount')]
      ];
      filteredBills.forEach(b => {
        const tenant = tenants.find(t => t.id === b.tenantId);
        const tenantName = tenant ? tenant.name : (b.tenantName || 'Tenant');
        const propName = properties.find(p => p.id === b.propertyId)?.name || selectedPropertyNames;
        const eType = b.electricityBillType || (b.electricityCharge > 0 ? (b.electricityUnits ? 'perUnit' : 'fixed') : 'none');

        if (eType === 'fixed') {
          electricityRows.push([
            strCell(tenantName), strCell(propName), strCell('Fixed'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), currencyCell(b.electricityFixedAmount || b.electricityCharge || 0), currencyCell(b.electricityCharge || 0)
          ]);
        } else if (eType === 'none') {
          electricityRows.push([
            strCell(tenantName), strCell(propName), strCell('None'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), currencyCell(0)
          ]);
        } else {
          const eDates = getMeterReadingDates(b, filteredBills, tenant);
          let daysText = '-';
          if (eDates.currDate && eDates.prevDate) {
            const start = new Date(eDates.prevDate);
            const end = new Date(eDates.currDate);
            const diff = end.getTime() - start.getTime();
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
            if (days >= 0) daysText = String(days);
          }
          electricityRows.push([
            strCell(tenantName),
            strCell(propName),
            strCell('Per Unit'),
            numCell(b.previousMeterReading || 0),
            dateCell(eDates.prevDate),
            numCell(b.currentMeterReading || 0),
            dateCell(eDates.currDate),
            numCell(b.electricityUnits || 0),
            strCell(daysText),
            currencyCell(b.electricityRate || 0),
            strCell('-'),
            currencyCell(b.electricityCharge || 0)
          ]);
        }
      });
      const wsElectricity = XLSX.utils.aoa_to_sheet(electricityRows);

      // ── 9. Water Sheet ──
      const waterRows = [
        [strCell('Tenant Name'), strCell('Property'), strCell('Billing Type'), strCell('Previous Reading'), strCell('Prev Reading Date'), strCell('Current Reading'), strCell('Curr Reading Date'), strCell('Total Units'), strCell('Total Days'), strCell('Rate Per Unit'), strCell('Fixed Monthly Amount'), strCell('Water Amount')]
      ];
      filteredBills.forEach(b => {
        const tenant = tenants.find(t => t.id === b.tenantId);
        const tenantName = tenant ? tenant.name : (b.tenantName || 'Tenant');
        const propName = properties.find(p => p.id === b.propertyId)?.name || selectedPropertyNames;
        const wType = b.waterBillType || (b.waterCharge > 0 ? 'fixed' : 'none');

        if (wType === 'fixed') {
          waterRows.push([
            strCell(tenantName), strCell(propName), strCell('Fixed'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), currencyCell(b.waterFixedAmount || b.waterCharge || 0), currencyCell(b.waterCharge || 0)
          ]);
        } else if (wType === 'none') {
          waterRows.push([
            strCell(tenantName), strCell(propName), strCell('None'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), strCell('-'), currencyCell(0)
          ]);
        } else {
          waterRows.push([
            strCell(tenantName), strCell(propName), strCell('Per Unit'), numCell(b.previousWaterReading || 0), dateCell(b.previousMeterReadingDate), numCell(b.currentWaterReading || 0), dateCell(b.currentMeterReadingDate), numCell(b.waterUnits || 0), strCell('-'), currencyCell(b.waterRatePerUnit || 0), strCell('-'), currencyCell(b.waterCharge || 0)
          ]);
        }
      });
      const wsWater = XLSX.utils.aoa_to_sheet(waterRows);

      // ── 10. Occupancy Sheet ──
      const occupancyRows = [
        [strCell('Occupancy Metrics'), strCell('Value')],
        [strCell('Total Units:'), numCell(fin.totalRooms)],
        [strCell('Occupied Units:'), numCell(fin.occupiedRooms)],
        [strCell('Vacant Units:'), numCell(fin.vacantRooms)],
        [strCell('Occupancy Rate:'), percentCell(fin.occupancyRate)],
        [strCell('Vacancy Rate:'), percentCell(fin.vacancyRate)]
      ];
      const wsOccupancy = XLSX.utils.aoa_to_sheet(occupancyRows);

      // ── 11. Date-wise Collection Sheet ──
      const dateMap = {};
      filteredPayments.forEach(p => {
        const dExcel = formatExcelDate(getPaymentDate(p));
        dateMap[dExcel] = (dateMap[dExcel] || 0) + (Number(p.amount) || Number(p.amountPaid) || 0);
      });
      const dateWiseRows = [
        [strCell('Date'), strCell('Amount Collected')]
      ];
      const sortedDates = Object.keys(dateMap).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      sortedDates.forEach(d => {
        dateWiseRows.push([strCell(d), currencyCell(dateMap[d])]);
      });
      const wsDateWise = XLSX.utils.aoa_to_sheet(dateWiseRows);

      // ── 12. Collection Summary Sheet ──
      const collectionSummaryRows = [
        [strCell('Category'), strCell('Amount Collected')],
        [strCell('Rent Collection'), currencyCell(fin.collRent)],
        [strCell('Electricity Collection'), currencyCell(fin.collElec)],
        [strCell('Water Collection'), currencyCell(fin.collWater)],
        [strCell('Parking Collection'), currencyCell(fin.collParking)],
        [strCell('Maintenance'), currencyCell(fin.collMaint)],
        [strCell('Other Charges'), currencyCell(fin.collOther)],
        [strCell('Previous Due Collection'), currencyCell(fin.collPrevDue)],
        [],
        [strCell('Total Collection'), currencyCell(fin.collTotal)]
      ];
      const wsCollectionSummary = XLSX.utils.aoa_to_sheet(collectionSummaryRows);

      // Build Workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
      XLSX.utils.book_append_sheet(wb, wsTenantDetails, 'Tenant Details');
      XLSX.utils.book_append_sheet(wb, wsBills, 'Bills');
      XLSX.utils.book_append_sheet(wb, wsPayments, 'Payments');
      XLSX.utils.book_append_sheet(wb, wsNewTenants, 'New Tenants');
      XLSX.utils.book_append_sheet(wb, wsVacatedTenants, 'Vacated Tenants');
      XLSX.utils.book_append_sheet(wb, wsOutstanding, 'Outstanding');
      XLSX.utils.book_append_sheet(wb, wsElectricity, 'Electricity');
      XLSX.utils.book_append_sheet(wb, wsWater, 'Water');
      XLSX.utils.book_append_sheet(wb, wsOccupancy, 'Occupancy');
      XLSX.utils.book_append_sheet(wb, wsDateWise, 'Date-wise Collection');
      XLSX.utils.book_append_sheet(wb, wsCollectionSummary, 'Collection Summary');

      const safeName = String(selectedPropertyNames).replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeMonth = String(monthLabel).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `Rentora_PropertyReport_${safeName}_${safeMonth}.xlsx`;

      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error('Property Excel generation error:', err);
      alert('Excel export failed: ' + (err.message || 'Please try again.'));
    } finally {
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.innerHTML = origHtml;
      }
    }
  };

  // ── Smart Content-Aware PDF Paginator ──────────────────────────────────────
  function buildContentAwarePages(pageBudget, miniHeaderFn) {
    const pages = [[]];
    let currentY = 0;

    function newPage() {
      pages.push([]);
      currentY = 0;
    }

    function addBlock(height, html) {
      if (!html) return;
      if (currentY > 0 && (currentY + height > pageBudget)) {
        newPage();
      }
      pages[pages.length - 1].push(html);
      currentY += height;
    }

    function addTable(config) {
      const {
        titleHtml,
        tableHeaderHtml,
        colgroupHtml = '',
        rows = [],
        renderRow,
        footerHtml = '',
        titleHeight = 24,
        headerHeight = 22,
        rowHeight = 18,
        footerHeight = 20,
        emptyHtml = ''
      } = config;

      if (!rows || rows.length === 0) {
        if (emptyHtml) {
          addBlock(titleHeight + 35, `<div>${titleHtml}${emptyHtml}</div>`);
        }
        return;
      }

      let remainingRows = [...rows];
      let chunkIdx = 0;

      while (remainingRows.length > 0) {
        const isFirstChunk = chunkIdx === 0;
        const availSpace = pageBudget - currentY;
        const overhead = titleHeight + headerHeight + (isFirstChunk ? 0 : 28);
        const minRowsNeeded = 2;
        const minNeededForChunk = overhead + (minRowsNeeded * rowHeight);

        // If not enough room on this page for overhead + min rows, start new page
        if (currentY > 0 && availSpace < minNeededForChunk) {
          newPage();
        }

        const availForThisPage = pageBudget - currentY;
        const currentOverhead = titleHeight + headerHeight + (pages.length > 1 && currentY === 0 ? 28 : 0);

        let maxRowsCanFit = Math.floor((availForThisPage - currentOverhead - (remainingRows.length <= 15 ? footerHeight : 0)) / rowHeight);
        if (maxRowsCanFit < 1) maxRowsCanFit = 1;

        const chunkRows = remainingRows.slice(0, maxRowsCanFit);
        remainingRows = remainingRows.slice(maxRowsCanFit);
        const isLastChunk = remainingRows.length === 0;

        let chunkBodyHtml = '';
        chunkRows.forEach((r, idx) => {
          chunkBodyHtml += renderRow(r, chunkIdx * maxRowsCanFit + idx, chunkIdx);
        });

        const rawTitleText = titleHtml.replace(/<[^>]*>/g, '').trim();
        const chunkTitle = isFirstChunk
          ? titleHtml
          : `<div class="pdf-section-title">${rawTitleText} &nbsp;—&nbsp; Continued (Page ${pages.length})</div>`;

        const chunkFooter = (isLastChunk && footerHtml) ? footerHtml : '';

        const tableHtml = `
          <div>
            ${chunkTitle}
            <table class="pdf-table">
              ${colgroupHtml}
              <thead>${tableHeaderHtml}</thead>
              <tbody>${chunkBodyHtml}</tbody>
              ${chunkFooter}
            </table>
          </div>
        `;

        pages[pages.length - 1].push(tableHtml);
        const chunkHeight = currentOverhead + (chunkRows.length * rowHeight) + (isLastChunk ? footerHeight : 0);
        currentY += chunkHeight;
        chunkIdx++;

        if (remainingRows.length > 0) {
          newPage();
        }
      }
    }

    function compileHtml() {
      let fullHtml = '';
      pages.forEach((pageBlocks, pageIdx) => {
        if (pageBlocks.length === 0) return;
        if (pageIdx > 0) {
          fullHtml += `<div class="pdf-page-break"></div>\n`;
          if (typeof miniHeaderFn === 'function') {
            fullHtml += miniHeaderFn(pageIdx + 1) + '\n';
          }
        }
        fullHtml += pageBlocks.join('\n') + '\n';
      });
      return fullHtml;
    }

    return { addBlock, addTable, compileHtml, getPageCount: () => pages.length };
  }

  // ── Property PDF Generation ─────────────────────────────────────────────────
  window.downloadPropertyPDF = async function () {
    const data = assemblePropertyReportData(_currentReportPropertyId, _currentPropMonth, _currentPropStartDate, _currentPropEndDate);
    if (data.error) { alert(data.message); return; }

    if (typeof html2pdf === 'undefined') {
      alert('PDF library not loaded. Please check your internet connection and try again.');
      return;
    }

    const exportBtn = document.getElementById('rptPdfBtn');
    const origBtnHtml = exportBtn ? exportBtn.innerHTML : '';
    if (exportBtn) {
      exportBtn.disabled = true;
      exportBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; margin-right: 6px;"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg><span>Generating PDF...</span>`;
    }

    const { properties, units, tenants, bills, payments, outstandingBills, summary: fin, periodLabel, propertyNames, settings } = data;
    const ownerName = settings.ownerName || settings.businessName || 'Landlord';
    const businessName = settings.businessName || propertyNames || 'RENTORA PROPERTIES';
    const address = settings.address || (properties[0]?.address) || '';
    const phone = settings.phone || '';

    const commonCss = `
      *, *::before, *::after { box-sizing: border-box !important; }
      .pdf-content-wrapper {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        color: #111827 !important;
        font-size: 8.8px !important;
        line-height: 1.38 !important;
        background: #ffffff !important;
        width: 1040px !important;
        max-width: 1040px !important;
        margin: 0 !important;
        padding: 4px 6px !important;
        box-sizing: border-box !important;
      }
      .pdf-header {
        border-bottom: 2px solid #4F46E5 !important;
        padding-bottom: 8px !important;
        margin-bottom: 10px !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .pdf-header-table {
        width: 100% !important;
        border-collapse: collapse !important;
      }
      .pdf-header-table td {
        border: none !important;
        padding: 0 !important;
        vertical-align: top !important;
      }
      .pdf-mini-header {
        width: 100% !important;
        border-bottom: 1.5px solid #4F46E5 !important;
        padding-bottom: 4px !important;
        margin-bottom: 8px !important;
        box-sizing: border-box !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .pdf-title {
        font-size: 15px !important;
        font-weight: 800 !important;
        color: #1e1b4b !important;
        letter-spacing: -0.2px !important;
        margin: 0 !important;
      }
      .pdf-subtitle {
        font-size: 8.5px !important;
        color: #4b5563 !important;
        margin-top: 2px !important;
      }
      .pdf-badge {
        display: inline-block !important;
        padding: 2px 7px !important;
        border-radius: 9999px !important;
        font-size: 7.5px !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.4px !important;
        border: 1px solid #c7d2fe !important;
        background: #eef2ff !important;
        color: #3730a3 !important;
      }
      .pdf-section-title {
        font-size: 10px !important;
        font-weight: 800 !important;
        color: #1f2937 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.4px !important;
        border-left: 3px solid #4F46E5 !important;
        padding-left: 6px !important;
        margin: 10px 0 6px 0 !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .pdf-grid-table {
        width: 100% !important;
        border-collapse: collapse !important;
        margin-bottom: 10px !important;
        border: 1px solid #d1d5db !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .pdf-grid-table th, .pdf-grid-table td {
        border: 1px solid #d1d5db !important;
        padding: 4px 6px !important;
        font-size: 8.5px !important;
      }
      .pdf-grid-table th {
        background: #f3f4f6 !important;
        font-weight: 700 !important;
        color: #374151 !important;
        text-align: left !important;
        width: 25% !important;
      }
      .pdf-grid-table td {
        color: #111827 !important;
        width: 25% !important;
      }
      .pdf-table {
        width: 100% !important;
        border-collapse: collapse !important;
        margin-bottom: 8px !important;
        font-size: 8px !important;
        table-layout: fixed !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
      }
      .pdf-table thead {
        display: table-header-group !important;
      }
      .pdf-table tfoot {
        display: table-footer-group !important;
      }
      .pdf-table th {
        background: #1e1b4b !important;
        color: #ffffff !important;
        font-weight: 700 !important;
        padding: 4px 5px !important;
        text-align: left !important;
        border: 1px solid #1e1b4b !important;
        font-size: 7.8px !important;
        white-space: normal !important;
        word-wrap: break-word !important;
      }
      .pdf-table td {
        border: 1px solid #e5e7eb !important;
        padding: 3.5px 5px !important;
        color: #1f2937 !important;
        font-size: 7.8px !important;
        white-space: normal !important;
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
      }
      .pdf-table tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .pdf-table tr:nth-child(even) td {
        background: #f9fafb !important;
      }
      .pdf-page-break {
        page-break-before: always !important;
        break-before: page !important;
        clear: both !important;
        display: block !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
      }
      .badge-paid {
        background: #dcfce7 !important;
        color: #15803d !important;
        font-weight: 700 !important;
        padding: 1px 4px !important;
        border-radius: 3px !important;
        font-size: 7px !important;
      }
      .badge-partial {
        background: #fef3c7 !important;
        color: #b45309 !important;
        font-weight: 700 !important;
        padding: 1px 4px !important;
        border-radius: 3px !important;
        font-size: 7px !important;
      }
      .badge-unpaid {
        background: #fee2e2 !important;
        color: #b91c1c !important;
        font-weight: 700 !important;
        padding: 1px 4px !important;
        border-radius: 3px !important;
        font-size: 7px !important;
      }
    `;

    function miniHeader(pageNo) {
      return `
        <div class="pdf-mini-header">
          <table style="width:100%;border-collapse:collapse;border:none;">
            <tr>
              <td style="text-align:left;border:none;padding:0;">
                <span style="font-weight:800;color:#1e1b4b;font-size:10px;">RENTORA &bull; ${propertyNames}</span>
                <span style="font-size:8px;color:#6b7280;">&nbsp;|&nbsp; Landlord: ${ownerName}</span>
              </td>
              <td style="text-align:right;border:none;padding:0;font-size:8px;color:#4b5563;">
                Period: <strong>${periodLabel}</strong> &bull; <span style="color:#4338ca;">Page ${pageNo}</span>
              </td>
            </tr>
          </table>
        </div>
      `;
    }

    const safeName = String(propertyNames).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeMonth = String(periodLabel).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Rentora_PropertyReport_${safeName}_${safeMonth}.pdf`;

    const paginator = buildContentAwarePages(680, miniHeader);

    // ── Block 1: Main Header, Executive Overview & Occupancy Statistics ──
    const headerAndExecutiveHtml = `
      <div class="pdf-header">
        <table class="pdf-header-table">
          <tr>
            <td style="width:65%;">
              <div class="pdf-title">RENTORA &mdash; PROPERTY PERFORMANCE &amp; BUSINESS REPORT</div>
              <div class="pdf-subtitle">
                <strong>${businessName}</strong> &bull; Landlord: ${ownerName} ${phone ? `&bull; ${phone}` : ''}
                ${address ? `<br>${address}` : ''}
              </div>
            </td>
            <td style="width:35%;text-align:right;">
              <span class="pdf-badge">PORTFOLIO BUSINESS REPORT</span>
              <div style="font-size:8px;color:#6b7280;margin-top:4px;">
                Scope: <strong>${propertyNames}</strong><br>
                Period: <strong>${periodLabel}</strong><br>
                Generated: <strong>${fmtDate(new Date().toISOString())}</strong>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <div class="pdf-section-title">1. Executive Overview &amp; Occupancy Statistics</div>
      <table class="pdf-grid-table">
        <tr>
          <th>Scope of Report</th>
          <td><strong>${propertyNames}</strong> (${properties.length} propert${properties.length === 1 ? 'y' : 'ies'})</td>
          <th>Audit Period</th>
          <td><strong>${periodLabel}</strong></td>
        </tr>
        <tr>
          <th>Total Units / Rooms</th>
          <td><strong>${fin.totalRooms} Units</strong></td>
          <th>Occupied Units</th>
          <td><strong style="color:#15803d;">${fin.occupiedRooms} Units (${Math.round(fin.occupancyRate)}%)</strong></td>
        </tr>
        <tr>
          <th>Vacant Units</th>
          <td><strong style="color:${fin.vacantRooms > 0 ? '#b91c1c' : '#15803d'};">${fin.vacantRooms} Units (${Math.round(fin.vacancyRate)}%)</strong></td>
          <th>Active Tenants Residing</th>
          <td><strong>${fin.totalTenantsCount} Tenants</strong></td>
        </tr>
        <tr>
          <th>New Move-Ins in Period</th>
          <td><strong style="color:#15803d;">+${fin.newTenantsCount} Tenants</strong></td>
          <th>Vacated in Period</th>
          <td><strong style="color:#b45309;">-${fin.vacatedTenantsCount} Tenants</strong></td>
        </tr>
      </table>

      <div class="pdf-section-title">2. Financial Performance &amp; Collection Summary</div>
      <table class="pdf-grid-table">
        <tr>
          <th>Total Expected Rent</th>
          <td><strong style="color:#1e1b4b;">${fmt(fin.expectedRent)}</strong></td>
          <th>Total Rent Collected</th>
          <td><strong style="color:#15803d;">${fmt(fin.rentCollected)}</strong></td>
        </tr>
        <tr>
          <th>Rent Outstanding</th>
          <td><strong style="color:${fin.rentOutstanding > 0 ? '#b91c1c' : '#15803d'};">${fmt(fin.rentOutstanding)}</strong></td>
          <th>Total Collections (All Items)</th>
          <td><strong style="color:#15803d;font-size:9.5px;">${fmt(fin.totalCollected)}</strong></td>
        </tr>
        <tr>
          <th>Total Amount Billed</th>
          <td><strong>${fmt(fin.totalBilled)}</strong></td>
          <th>Total Outstanding Dues</th>
          <td><strong style="color:${fin.totalOutstanding > 0 ? '#b91c1c' : '#15803d'};font-size:9.5px;">${fmt(fin.totalOutstanding)}</strong></td>
        </tr>
        <tr>
          <th>Previous Dues Brought Forward</th>
          <td><strong>${fmt(fin.previousDueTotal)}</strong></td>
          <th>Bill Clearance Health</th>
          <td><strong>${fin.paidBillsCount} Paid &bull; ${fin.partialBillsCount} Partial &bull; ${fin.unpaidBillsCount} Unpaid</strong></td>
        </tr>
      </table>
    `;
    paginator.addBlock(240, headerAndExecutiveHtml);

    // ── Table 3: Collections by Revenue Component ──
    const collRows = [
      { name: 'Rent Collections', amt: fin.collRent, isStrong: true },
      { name: 'Electricity Collections', amt: fin.collElec },
      { name: 'Water Collections', amt: fin.collWater },
      { name: 'Parking Charges', amt: fin.collParking },
      { name: 'Maintenance Collections', amt: fin.collMaint },
      { name: 'Other Charges', amt: fin.collOther },
      { name: 'Previous Dues Cleared', amt: fin.collPrevDue }
    ];
    paginator.addTable({
      titleHtml: '<div class="pdf-section-title">3. Collections by Revenue Component</div>',
      tableHeaderHtml: '<tr><th>Category</th><th>Amount Collected</th><th>Share of Total</th></tr>',
      colgroupHtml: '<colgroup><col style="width:40%;"><col style="width:35%;"><col style="width:25%;"></colgroup>',
      rows: collRows,
      renderRow: (c) => `<tr>
        <td>${c.name}</td>
        <td style="${c.isStrong ? 'font-weight:700;color:#15803d;' : 'font-weight:600;'}">${fmt(c.amt)}</td>
        <td>${fin.collTotal > 0 ? Math.round((c.amt / fin.collTotal) * 100) : 0}%</td>
      </tr>`,
      footerHtml: `<tfoot><tr style="font-weight:800;background:#f3f4f6;"><td>Total Received Ledger</td><td style="color:#15803d;font-size:9.5px;">${fmt(fin.collTotal)}</td><td>100%</td></tr></tfoot>`,
      titleHeight: 22,
      headerHeight: 20,
      rowHeight: 18,
      footerHeight: 20
    });

    // ── Table 4: Property Units & Occupancy Roster ──
    paginator.addTable({
      titleHtml: `<div class="pdf-section-title">4. Property Units &amp; Occupancy Roster (${units.length} units)</div>`,
      tableHeaderHtml: '<tr><th>#</th><th>Unit No</th><th>Floor / Type</th><th>Status</th><th>Current Tenant</th><th>Mobile</th><th>Monthly Rent</th><th>Move-in</th></tr>',
      colgroupHtml: '<colgroup><col style="width:4%;"><col style="width:12%;"><col style="width:14%;"><col style="width:12%;"><col style="width:20%;"><col style="width:14%;"><col style="width:12%;"><col style="width:12%;"></colgroup>',
      rows: units,
      renderRow: (u, i) => {
        const tenant = tenants.find(t => t.unitId === u.id || t.unitNumber === u.unitNumber);
        const isOccupied = u.status === 'occupied' || Boolean(tenant);
        return `<tr>
          <td>${i + 1}</td>
          <td><strong>${u.unitNumber || 'Unit'}</strong></td>
          <td>${u.floor || '—'} / ${u.type || 'Standard'}</td>
          <td><span class="${isOccupied ? 'badge-paid' : 'badge-unpaid'}">${isOccupied ? 'OCCUPIED' : 'VACANT'}</span></td>
          <td><strong>${tenant ? tenant.name : '—'}</strong></td>
          <td>${tenant ? (tenant.mobile || tenant.mobileNumber || '—') : '—'}</td>
          <td>${tenant ? fmt(tenant.rent || tenant.monthlyRent) : fmt(u.rent || u.monthlyRent)}</td>
          <td>${tenant ? fmtDate(tenant.moveIn || tenant.moveInDate) : '—'}</td>
        </tr>`;
      },
      emptyHtml: '<p style="font-size:8.5px;color:#6b7280;padding:8px 0;">No units configured for this property.</p>',
      titleHeight: 22,
      headerHeight: 20,
      rowHeight: 18
    });

    // ── Table 5: Billing History in Period ──
    paginator.addTable({
      titleHtml: `<div class="pdf-section-title">5. Billing History in Period (${bills.length} bills)</div>`,
      tableHeaderHtml: '<tr><th>#</th><th>Bill No.</th><th>Tenant</th><th>Unit</th><th>Month</th><th>Due Date</th><th>Rent</th><th>Electricity</th><th>Water</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr>',
      colgroupHtml: '<colgroup><col style="width:3%;"><col style="width:11%;"><col style="width:13%;"><col style="width:7%;"><col style="width:8%;"><col style="width:8%;"><col style="width:9%;"><col style="width:8%;"><col style="width:7%;"><col style="width:9%;"><col style="width:8%;"><col style="width:9%;"></colgroup>',
      rows: bills,
      renderRow: (b, i) => {
        const tenant = tenants.find(t => t.id === b.tenantId);
        const tenantName = tenant ? tenant.name : (b.tenantName || 'Tenant');
        const unitNo = b.unitNumber || (units.find(u => u.id === b.unitId)?.unitNumber) || '—';
        const stLabel = paymentStatusLabel(b);
        const badgeClass = stLabel === 'PAID' ? 'badge-paid' : stLabel === 'PARTIALLY PAID' ? 'badge-partial' : 'badge-unpaid';
        return `<tr>
          <td>${i + 1}</td>
          <td><strong>${b.billNumber || '—'}</strong></td>
          <td>${tenantName}</td>
          <td>${unitNo}</td>
          <td>${formatMonthReadable(b.billingMonth)}</td>
          <td>${fmtDate(b.dueDate || getBillDate(b))}</td>
          <td>${fmt(b.rent)}</td>
          <td>${fmt(b.electricityCharge)}</td>
          <td>${fmt(b.waterCharge)}</td>
          <td style="font-weight:700;">${fmt(b.totalAmount)}</td>
          <td style="color:#15803d;font-weight:700;">${fmt(b.paidAmount)}</td>
          <td style="color:${Number(b.remainingAmount) > 0 ? '#b91c1c' : '#15803d'};font-weight:700;">${fmt(b.remainingAmount)}</td>
          <td><span class="${badgeClass}">${stLabel}</span></td>
        </tr>`;
      },
      emptyHtml: '<p style="font-size:8.5px;color:#6b7280;padding:8px 0;">No bills generated for the selected property in this period.</p>',
      titleHeight: 22,
      headerHeight: 20,
      rowHeight: 18
    });

    // ── Table 6: Actual Money Collections in Period ──
    paginator.addTable({
      titleHtml: `<div class="pdf-section-title">6. Actual Money Collections in Period (${payments.length} transaction${payments.length !== 1 ? 's' : ''})</div>`,
      tableHeaderHtml: '<tr><th>#</th><th>Payment Date</th><th>Tenant</th><th>Payment Received Against</th><th>Amount</th><th>Method</th><th>Txn / Ref ID</th><th>Status</th></tr>',
      colgroupHtml: '<colgroup><col style="width:4%;"><col style="width:11%;"><col style="width:16%;"><col style="width:23%;"><col style="width:12%;"><col style="width:11%;"><col style="width:13%;"><col style="width:10%;"></colgroup>',
      rows: payments,
      renderRow: (p, i) => {
        const tenant = tenants.find(t => t.id === p.tenantId);
        const tenantName = tenant ? tenant.name : (p.tenantName || 'Tenant');
        let billInfo = '—';
        if (Array.isArray(p.allocations) && p.allocations.length > 0) {
          billInfo = p.allocations.map(a => `${a.type === 'advance' ? 'Advance' : 'Bill'} (₹${a.amount})`).join(', ');
        } else if (p.billId) {
          billInfo = p.billId === 'advance' ? 'Advance Payment' : 'Direct Bill Payment';
        }
        return `<tr>
          <td>${i + 1}</td>
          <td>${fmtDate(getPaymentDate(p))}</td>
          <td><strong>${tenantName}</strong></td>
          <td>${billInfo}</td>
          <td style="font-weight:700;color:#15803d;">${fmt(p.amount || p.amountPaid)}</td>
          <td>${paymentMethodLabel(p.paymentMethod || p.mode)}</td>
          <td style="font-family:monospace;font-size:7px;">${p.transactionId || p.referenceId || '—'}</td>
          <td><span class="badge-paid">${(p.status || 'approved').toUpperCase()}</span></td>
        </tr>`;
      },
      emptyHtml: '<p style="font-size:8.5px;color:#6b7280;padding:8px 0;">No payments recorded in this period.</p>',
      titleHeight: 22,
      headerHeight: 20,
      rowHeight: 18
    });

    // ── Table 7: Electricity & Utility Consumption Breakdown ──
    paginator.addTable({
      titleHtml: '<div class="pdf-section-title">7. Electricity &amp; Utility Consumption Breakdown</div>',
      tableHeaderHtml: '<tr><th>#</th><th>Tenant &amp; Unit</th><th>Utility</th><th>Prev Reading</th><th>Prev Date</th><th>Curr Reading</th><th>Curr Date</th><th>Units</th><th>Rate / Plan</th><th>Total Charge</th></tr>',
      colgroupHtml: '<colgroup><col style="width:3%;"><col style="width:18%;"><col style="width:9%;"><col style="width:10%;"><col style="width:10%;"><col style="width:10%;"><col style="width:10%;"><col style="width:9%;"><col style="width:10%;"><col style="width:11%;"></colgroup>',
      rows: bills,
      renderRow: (b, i) => {
        const tenant = tenants.find(t => t.id === b.tenantId);
        const tenantName = tenant ? tenant.name : (b.tenantName || 'Tenant');
        const unitNo = b.unitNumber || (units.find(u => u.id === b.unitId)?.unitNumber) || '—';
        const eDates = getMeterReadingDates(b, bills, tenant);
        return `<tr>
          <td>${i + 1}</td>
          <td><strong>${tenantName}</strong> (Unit ${unitNo})</td>
          <td>Electricity</td>
          <td>${b.previousMeterReading != null ? b.previousMeterReading : '—'}</td>
          <td>${formatDDMMYYYY(eDates.prevDate) || '—'}</td>
          <td>${b.currentMeterReading != null ? b.currentMeterReading : '—'}</td>
          <td>${formatDDMMYYYY(eDates.currDate) || '—'}</td>
          <td style="font-weight:600;">${b.electricityUnits || 0} u</td>
          <td>${b.electricityRate ? `₹${b.electricityRate}/u` : (b.electricityFixedAmount ? `Fixed ₹${b.electricityFixedAmount}` : '—')}</td>
          <td style="font-weight:700;color:#1e1b4b;">${fmt(b.electricityCharge)}</td>
        </tr>`;
      },
      emptyHtml: '<p style="font-size:8.5px;color:#6b7280;padding:8px 0;">No utility charges recorded in this period.</p>',
      titleHeight: 22,
      headerHeight: 20,
      rowHeight: 18
    });

    // ── Table 8: Outstanding Dues & Overdue Invoices ──
    paginator.addTable({
      titleHtml: `<div class="pdf-section-title">8. Outstanding Dues &amp; Overdue Invoices (${outstandingBills.length} invoice${outstandingBills.length !== 1 ? 's' : ''})</div>`,
      tableHeaderHtml: '<tr><th>#</th><th>Tenant</th><th>Unit</th><th>Bill No.</th><th>Month</th><th>Due Date</th><th>Overdue</th><th>Total Bill</th><th>Paid</th><th>Remaining</th></tr>',
      colgroupHtml: '<colgroup><col style="width:4%;"><col style="width:18%;"><col style="width:8%;"><col style="width:13%;"><col style="width:11%;"><col style="width:11%;"><col style="width:10%;"><col style="width:9%;"><col style="width:8%;"><col style="width:8%;"></colgroup>',
      rows: outstandingBills,
      renderRow: (b, i) => {
        const tenant = tenants.find(t => t.id === b.tenantId);
        const tenantName = tenant ? tenant.name : (b.tenantName || 'Tenant');
        const unitNo = b.unitNumber || (units.find(u => u.id === b.unitId)?.unitNumber) || '—';
        const overdue = getDaysOverdue(b.dueDate);
        return `<tr>
          <td>${i + 1}</td>
          <td><strong>${tenantName}</strong></td>
          <td>Unit ${unitNo}</td>
          <td>${b.billNumber || '—'}</td>
          <td>${formatMonthReadable(b.billingMonth)}</td>
          <td>${fmtDate(b.dueDate)}</td>
          <td style="color:${overdue > 0 ? '#b91c1c' : '#4b5563'};font-weight:600;">${overdue > 0 ? `${overdue} days` : 'Current'}</td>
          <td>${fmt(b.totalAmount)}</td>
          <td style="color:#15803d;">${fmt(b.paidAmount)}</td>
          <td style="color:#b91c1c;font-weight:700;">${fmt(b.remainingAmount)}</td>
        </tr>`;
      },
      emptyHtml: '<p style="font-size:8.5px;color:#15803d;font-weight:700;padding:8px 0;">✓ Outstanding balance zero! All bills are fully paid in this period.</p>',
      titleHeight: 22,
      headerHeight: 20,
      rowHeight: 18
    });

    // ── Block 9: Footer ──
    const footerHtml = `
      <div style="margin-top:14px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:8px;color:#9ca3af;text-align:center;">
        Generated automatically by Rentora Cloud Platform &bull; Landlord: ${ownerName} &bull; ${fmtDateTime(new Date().toISOString())}
        <br>This business report contains consolidated property operational and financial data. Preserved securely for tax and landlord accounting.
      </div>
    `;
    paginator.addBlock(35, footerHtml);

    const fullPdfHtml = paginator.compileHtml();

    // Create temporary offscreen container for html2pdf
    const container = document.createElement('div');
    container.id = 'rentora-pdf-temp-container';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '1060px';
    container.style.height = 'auto';
    container.style.minHeight = '0';
    container.style.zIndex = '-99999';
    container.style.backgroundColor = '#ffffff';
    container.style.opacity = '1';
    container.style.visibility = 'visible';
    container.style.pointerEvents = 'none';
    container.style.boxSizing = 'border-box';
    container.style.margin = '0';
    container.style.padding = '0';

    container.innerHTML = `
      <div class="pdf-content-wrapper">
        <style>${commonCss}</style>
        ${fullPdfHtml}
      </div>
    `;

    document.body.appendChild(container);

    try {
      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (_) {}
      }
      await new Promise(r => setTimeout(r, 250));

      const targetEl = container.querySelector('.pdf-content-wrapper') || container;
      const opt = {
        margin: [8, 8, 8, 8],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          scrollX: 0,
          scrollY: 0
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: {
          mode: ['css'],
          avoid: ['tr', '.pdf-grid-table', '.pdf-header', '.pdf-mini-header', '.pdf-section-title']
        }
      };

      await html2pdf().set(opt).from(targetEl).save();
    } catch (err) {
      console.error('Property PDF generation error:', err);
      alert('PDF generation failed: ' + (err.message || 'Please try again.'));
    } finally {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.innerHTML = origBtnHtml;
      }
    }
  };

  // ── Unified Export Dispatchers ──────────────────────────────────────────────
  window.downloadSelectedExcel = function () {
    if (_currentReportType === 'property') {
      return window.downloadPropertyExcel();
    }
    return window.downloadTenantExcel();
  };

  window.downloadSelectedPDF = function () {
    if (_currentReportType === 'property') {
      return window.downloadPropertyPDF();
    }
    return window.downloadTenantPDF();
  };

  // ── Excel Generation (Tenant Historical) ────────────────────────────────────
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
        const mtrDates = getMeterReadingDates(b, bills, tenant);
        s2rows.push([
          i + 1,
          b.billNumber || '—',
          b.billingMonth || '—',
          formatDDMMYYYY(getBillDate(b)),
          formatDDMMYYYY(b.dueDate),
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
          b.previousMeterReading !== undefined && b.previousMeterReading !== null ? Number(b.previousMeterReading) : '—',
          b.currentMeterReading !== undefined && b.currentMeterReading !== null ? Number(b.currentMeterReading) : '—',
          formatDDMMYYYY(mtrDates.prevDate),
          formatDDMMYYYY(mtrDates.currDate),
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
        'Payment Mode', 'Transaction / Ref ID', 'Payment Received Against',
        'Verification Status', 'Notes'
      ];
      const s3rows = [s3header];
      payments.forEach((p, i) => {
        const dateStr = getPaymentDate(p);
        const timeStr = p.createdAt && p.createdAt.includes('T') ? p.createdAt.split('T')[1].slice(0, 5) : '—';
        let allocDesc = '—';
        if (Array.isArray(p.allocations) && p.allocations.length > 0) {
          allocDesc = p.allocations.map(a => `${a.type === 'advance' ? 'Advance Rent' : (a.billNumber || a.billId)}: ₹${Number(a.amount).toLocaleString('en-IN')}`).join(', ');
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
      const mtrDates = getMeterReadingDates(b, bills, tenant);
      s2rows.push([
        i + 1,
        b.billNumber || '—',
        b.billingMonth || '—',
        formatDDMMYYYY(b.createdAt || getBillDate(b)),
        formatDDMMYYYY(b.dueDate),
        Number(b.rent) || 0,
        Number(b.electricityUnits) || 0,
        Number(b.electricityRate) || 0,
        Number(b.electricityCharge) || 0,
        Number(b.waterCharge) || 0,
        Number(b.parkingCharge) || 0,
        Number(b.maintenanceCharge) || 0,
        Number(b.otherCharges) || 0,
        Number(b.previousDue) || 0,
        Number(b.subtotal) || getBillSubtotal(b),
        Number(b.totalAmount) || 0,
        Number(b.paidAmount) || 0,
        Number(b.remainingAmount) || 0,
        paymentStatusLabel(b),
        b.previousMeterReading !== undefined && b.previousMeterReading !== null ? Number(b.previousMeterReading) : '—',
        b.currentMeterReading !== undefined && b.currentMeterReading !== null ? Number(b.currentMeterReading) : '—',
        formatDDMMYYYY(mtrDates.prevDate),
        formatDDMMYYYY(mtrDates.currDate),
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
      'Payment Mode', 'Transaction / Ref ID', 'Payment Received Against',
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
  window.downloadTenantPDF = async function () {
    if (!_currentReportTenantId) { alert('Please select a tenant first.'); return; }

    const data = assembleReportData(_currentReportTenantId, _currentReportType, _currentStartDate, _currentEndDate);
    if (data.error) { alert(data.message); return; }

    if (typeof html2pdf === 'undefined') {
      alert('PDF library not loaded. Please check your internet connection and try again.');
      return;
    }

    const exportBtn = document.getElementById('rptExportPdfBtn');
    const origBtnHtml = exportBtn ? exportBtn.innerHTML : '';
    if (exportBtn) {
      exportBtn.disabled = true;
      exportBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; margin-right: 6px;"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg><span>Generating PDF...</span>`;
    }

    const { tenant, property, unit, settings } = data;
    const ownerName = settings.ownerName || settings.businessName || property.name || 'Landlord';
    const businessName = settings.businessName || property.name || 'RENTORA PROPERTIES';
    const address = settings.address || property.address || '';

    const commonCss = `
      *, *::before, *::after { box-sizing: border-box !important; }
      .pdf-content-wrapper {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        color: #111827 !important;
        font-size: 8.8px !important;
        line-height: 1.38 !important;
        background: #ffffff !important;
        width: 1040px !important;
        max-width: 1040px !important;
        margin: 0 auto !important;
        padding: 4px 6px !important;
        box-sizing: border-box !important;
      }
      .pdf-header {
        border-bottom: 2px solid #4F46E5 !important;
        padding-bottom: 8px !important;
        margin-bottom: 10px !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .pdf-header-table {
        width: 100% !important;
        border-collapse: collapse !important;
      }
      .pdf-header-table td {
        border: none !important;
        padding: 0 !important;
        vertical-align: top !important;
      }
      .pdf-mini-header {
        width: 100% !important;
        border-bottom: 1.5px solid #4F46E5 !important;
        padding-bottom: 5px !important;
        margin-bottom: 8px !important;
        box-sizing: border-box !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .pdf-mini-header-table {
        width: 100% !important;
        border-collapse: collapse !important;
        border: none !important;
      }
      .pdf-mini-header-table td {
        border: none !important;
        padding: 0 !important;
        vertical-align: middle !important;
      }
      .pdf-mini-brand {
        font-size: 13px !important;
        font-weight: 800 !important;
        color: #4F46E5 !important;
        letter-spacing: -0.3px !important;
      }
      .pdf-mini-sub {
        font-size: 8px !important;
        color: #6b7280 !important;
      }
      .pdf-mini-header-cell-right {
        text-align: right !important;
        font-size: 8.2px !important;
        color: #4b5563 !important;
        font-weight: 600 !important;
      }
      .pdf-brand {
        font-size: 20px !important;
        font-weight: 800 !important;
        color: #4F46E5 !important;
        letter-spacing: -0.5px !important;
      }
      .pdf-brand-sub {
        font-size: 9px !important;
        color: #4b5563 !important;
        line-height: 1.35 !important;
      }
      .pdf-report-title {
        font-size: 14px !important;
        font-weight: 800 !important;
        color: #111827 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
      }
      .pdf-section-title {
        font-size: 10.5px !important;
        font-weight: 800 !important;
        color: #4F46E5 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        border-bottom: 1px solid #e5e7eb !important;
        padding-bottom: 3px !important;
        margin: 8px 0 5px !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .pdf-table {
        width: 100% !important;
        table-layout: fixed !important;
        border-collapse: collapse !important;
        margin-bottom: 8px !important;
        font-size: 8.2px !important;
        box-sizing: border-box !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
      }
      .pdf-table thead {
        display: table-header-group !important;
      }
      .pdf-table tfoot {
        display: table-footer-group !important;
      }
      .pdf-table th {
        background: #4F46E5 !important;
        color: #ffffff !important;
        padding: 4.5px 4px !important;
        text-align: left !important;
        font-weight: 700 !important;
        font-size: 7.8px !important;
        border: 1px solid #4338ca !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        box-sizing: border-box !important;
      }
      .pdf-table td {
        padding: 3.5px 4px !important;
        border: 1px solid #e5e7eb !important;
        vertical-align: middle !important;
        color: #1f2937 !important;
        overflow-wrap: break-word !important;
        word-break: break-word !important;
        box-sizing: border-box !important;
      }
      .pdf-table tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .pdf-table tr:nth-child(even) td {
        background: #f9fafb !important;
      }
      .pdf-total-row td {
        font-weight: 800 !important;
        background: #e0e7ff !important;
        border-top: 2px solid #4F46E5 !important;
        color: #1e1b4b !important;
      }
      .pdf-grid-table {
        width: 100% !important;
        border-collapse: collapse !important;
        table-layout: fixed !important;
        margin-bottom: 8px !important;
        box-sizing: border-box !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .pdf-grid-table td {
        padding: 4px 6px !important;
        border: 1px solid #e5e7eb !important;
        vertical-align: top !important;
        background: #ffffff !important;
        box-sizing: border-box !important;
      }
      .pdf-label {
        font-size: 7.2px !important;
        text-transform: uppercase !important;
        color: #6b7280 !important;
        font-weight: 700 !important;
        display: block !important;
        margin-bottom: 1.5px !important;
      }
      .pdf-val {
        font-size: 9.5px !important;
        font-weight: 700 !important;
        color: #111827 !important;
        display: block !important;
      }
      .badge-paid {
        background: #d1fae5 !important;
        color: #065f46 !important;
        padding: 1.5px 5px !important;
        border-radius: 3px !important;
        font-weight: 700 !important;
        font-size: 7.2px !important;
        display: inline-block !important;
      }
      .badge-partial {
        background: #fef3c7 !important;
        color: #92400e !important;
        padding: 1.5px 5px !important;
        border-radius: 3px !important;
        font-weight: 700 !important;
        font-size: 7.2px !important;
        display: inline-block !important;
      }
      .badge-unpaid {
        background: #fee2e2 !important;
        color: #991b1b !important;
        padding: 1.5px 5px !important;
        border-radius: 3px !important;
        font-weight: 700 !important;
        font-size: 7.2px !important;
        display: inline-block !important;
      }
      .pdf-page-break {
        page-break-before: always !important;
        break-before: page !important;
        clear: both !important;
        display: block !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
      }
    `;

    function miniHeader(pageNo) {
      return `
        <div class="pdf-mini-header">
          <table class="pdf-mini-header-table">
            <tr>
              <td style="text-align:left;">
                <span class="pdf-mini-brand">Rentora</span>
                <span class="pdf-mini-sub">&nbsp;|&nbsp; ${businessName} &nbsp;|&nbsp; Landlord: ${ownerName}</span>
              </td>
              <td class="pdf-mini-header-cell-right">
                ${data.reportType === 'active' ? 'Active Tenant Historical Report' : 'Vacated Tenant Historical Report'}
                &nbsp;•&nbsp; <strong>${tenant.name}</strong> (Unit ${tenant.unitNumber || '—'})
                &nbsp;•&nbsp; <span style="color:#4F46E5;">Page ${pageNo}</span>
              </td>
            </tr>
          </table>
        </div>
      `;
    }

    const safeTenantName = tenant.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Rentora_${data.reportType === 'active' ? 'ActiveTenantReport' : 'TenantReport'}_${safeTenantName}_${tenant.id}.pdf`;

    const paginator = buildContentAwarePages(680, miniHeader);

    // =========================================================================
    // PDF CASE A: ACTIVE TENANT HISTORICAL REPORT
    // =========================================================================
    if (data.reportType === 'active') {
      const { readings, bills, payments, ledger, summary: fin, startDate, endDate } = data;

      // Block 1: Main Header, Tenant Profile & Financial Overview
      const topSectionHtml = `
        <div class="pdf-header">
          <table class="pdf-header-table">
            <tr>
              <td>
                <div class="pdf-brand">Rentora</div>
                <div class="pdf-brand-sub" style="font-weight:700;font-size:10px;color:#111827;">${businessName}</div>
                ${address ? `<div class="pdf-brand-sub">${address}</div>` : ''}
                <div class="pdf-brand-sub">Landlord: ${ownerName}</div>
              </td>
              <td style="text-align:right;">
                <div class="pdf-report-title">Active Tenant Historical Report</div>
                <div style="font-size:9px;color:#4b5563;margin-top:2px;">Audit Period: <strong>${formatDDMMYYYY(startDate)} → ${formatDDMMYYYY(endDate)}</strong></div>
                <div style="font-size:8px;color:#6b7280;">Generated: ${fmtDateTime(new Date().toISOString())}</div>
                <div style="margin-top:4px;"><span style="background:#d1fae5;color:#065f46;border:1px solid #10b981;padding:2px 8px;border-radius:999px;font-weight:800;font-size:7.5px;">ACTIVE TENANCY</span></div>
              </td>
            </tr>
          </table>
        </div>

        <div>
          <div class="pdf-section-title">1. Tenant Profile &amp; Tenancy Details</div>
          <table class="pdf-grid-table">
            <tr>
              <td><span class="pdf-label">Tenant Name</span><span class="pdf-val">${tenant.name}</span></td>
              <td><span class="pdf-label">Tenant ID</span><span class="pdf-val" style="font-family:monospace;font-size:8.8px;">${tenant.id}</span></td>
              <td><span class="pdf-label">Phone / Mobile</span><span class="pdf-val">${tenant.mobile || '—'}</span></td>
            </tr>
            <tr>
              <td><span class="pdf-label">Property</span><span class="pdf-val">${property.name || '—'}</span></td>
              <td><span class="pdf-label">Unit Number</span><span class="pdf-val">Unit ${tenant.unitNumber || '—'}</span></td>
              <td><span class="pdf-label">Electric Meter</span><span class="pdf-val">${readings.meterNumber}</span></td>
            </tr>
            <tr>
              <td><span class="pdf-label">Move-In Date</span><span class="pdf-val">${formatDDMMYYYY(tenant.moveIn)}</span></td>
              <td><span class="pdf-label">Monthly Rent</span><span class="pdf-val">${fmt(tenant.rent || tenant.monthlyRent)}/mo</span></td>
              <td><span class="pdf-label">Security Deposit Held</span><span class="pdf-val">${fmt(fin.securityDeposit)}</span></td>
            </tr>
            <tr>
              <td><span class="pdf-label">Advance Rent Balance</span><span class="pdf-val" style="color:#059669;">${fmt(fin.advanceRent)}</span></td>
              <td><span class="pdf-label">Initial Meter Reading</span><span class="pdf-val">${readings.initialMeter}</span></td>
              <td><span class="pdf-label">Latest Meter Reading</span><span class="pdf-val">${readings.latestMeter}</span></td>
            </tr>
          </table>
        </div>

        <div>
          <div class="pdf-section-title">2. Financial Ledger Overview (Period: ${formatDDMMYYYY(startDate)} → ${formatDDMMYYYY(endDate)})</div>
          <table class="pdf-grid-table" style="margin-bottom:8px;">
            <tr>
              <td style="background:#f9fafb;">
                <span class="pdf-label">Opening Balance (as of ${formatDDMMYYYY(startDate)})</span>
                <span class="pdf-val" style="font-size:11px;color:${fin.openingBalance > 0 ? '#dc2626' : fin.openingBalance < 0 ? '#059669' : '#111827'};">${fmt(fin.openingBalance)}</span>
              </td>
              <td style="background:#f9fafb;">
                <span class="pdf-label">Total Billed in Period (${fin.billCount} bills)</span>
                <span class="pdf-val" style="font-size:11px;color:#4F46E5;">${fmt(fin.periodBilled)}</span>
              </td>
              <td style="background:#f9fafb;">
                <span class="pdf-label">Total Payments Received (${fin.paymentCount} payments)</span>
                <span class="pdf-val" style="font-size:11px;color:#059669;">${fmt(fin.periodPaid)}</span>
              </td>
              <td style="background:#f9fafb;">
                <span class="pdf-label">Closing Balance / Due (as of ${formatDDMMYYYY(endDate)})</span>
                <span class="pdf-val" style="font-size:11px;color:${fin.closingBalance > 0 ? '#dc2626' : '#059669'};">${fmt(fin.closingBalance)}</span>
              </td>
            </tr>
          </table>
        </div>
      `;
      paginator.addBlock(250, topSectionHtml);

      // Section 3: Electricity Meter Reading & Utilities History Table
      paginator.addTable({
        titleHtml: '<div class="pdf-section-title">3. Electricity Meter Reading &amp; Utilities History</div>',
        colgroupHtml: '<colgroup><col style="width:3%;"><col style="width:9%;"><col style="width:10%;"><col style="width:8%;"><col style="width:11%;"><col style="width:8%;"><col style="width:11%;"><col style="width:8%;"><col style="width:6%;"><col style="width:13%;"><col style="width:13%;"></colgroup>',
        tableHeaderHtml: '<tr><th>#</th><th>Month</th><th>Bill No</th><th>Prev Reading</th><th>Prev Reading Date</th><th>Curr Reading</th><th>Curr Reading Date</th><th>Units</th><th>Rate (₹)</th><th>Elec Charge</th><th>Water Charge</th></tr>',
        rows: bills,
        renderRow: (b, i) => {
          const mtrDates = getMeterReadingDates(b, bills, tenant);
          return `<tr>
            <td>${i + 1}</td>
            <td>${formatMonthReadable(b.billingMonth)}</td>
            <td>${b.billNumber || '—'}</td>
            <td>${b.previousMeterReading !== undefined && b.previousMeterReading !== null ? b.previousMeterReading : '—'}</td>
            <td>${formatDDMMYYYY(mtrDates.prevDate) || '—'}</td>
            <td>${b.currentMeterReading !== undefined && b.currentMeterReading !== null ? b.currentMeterReading : '—'}</td>
            <td>${formatDDMMYYYY(mtrDates.currDate) || '—'}</td>
            <td style="font-weight:700;">${b.electricityUnits || 0} u</td>
            <td>₹${b.electricityRate || 0}</td>
            <td style="font-weight:700;color:#4F46E5;">${fmt(b.electricityCharge)}</td>
            <td>${fmt(b.waterCharge)}</td>
          </tr>`;
        },
        footerHtml: `<tfoot><tr class="pdf-total-row"><td colspan="7" style="text-align:right;">TOTAL CONSUMPTION &amp; CHARGES →</td><td>${fin.totalElecUnits} units</td><td>—</td><td>${fmt(fin.totalElecCharge)}</td><td>${fmt(fin.totalWaterCharge)}</td></tr></tfoot>`,
        emptyHtml: '<p style="color:#6b7280;padding:4px 0;font-size:8px;">No electricity meter readings in this period.</p>',
        titleHeight: 22,
        headerHeight: 20,
        rowHeight: 18,
        footerHeight: 20
      });

      // Section 4: Generated Bills & Dues History Table
      paginator.addTable({
        titleHtml: `<div class="pdf-section-title">4. Generated Bills &amp; Dues History (${bills.length} bills)</div>`,
        colgroupHtml: '<colgroup><col style="width:3%;"><col style="width:10%;"><col style="width:8%;"><col style="width:8%;"><col style="width:8%;"><col style="width:8%;"><col style="width:9%;"><col style="width:6%;"><col style="width:7%;"><col style="width:9%;"><col style="width:8%;"><col style="width:8%;"><col style="width:8%;"></colgroup>',
        tableHeaderHtml: '<tr><th>#</th><th>Bill No.</th><th>Month</th><th>Issue Date</th><th>Due Date</th><th>Rent</th><th>Electricity</th><th>Water</th><th>Prev Due</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Status</th></tr>',
        rows: bills,
        renderRow: (b, i) => {
          const stLabel = paymentStatusLabel(b);
          const badgeClass = stLabel === 'PAID' ? 'badge-paid' : stLabel === 'PARTIALLY PAID' ? 'badge-partial' : 'badge-unpaid';
          return `<tr>
            <td>${i + 1}</td>
            <td>${b.billNumber || '—'}</td>
            <td>${formatMonthReadable(b.billingMonth)}</td>
            <td>${formatDDMMYYYY(getBillDate(b))}</td>
            <td>${formatDDMMYYYY(b.dueDate)}</td>
            <td>${fmt(b.rent)}</td>
            <td>${b.electricityUnits || 0} u (${fmt(b.electricityCharge)})</td>
            <td>${fmt(b.waterCharge)}</td>
            <td>${fmt(b.previousDue)}</td>
            <td>${fmt(b.totalAmount)}</td>
            <td style="color:#059669;font-weight:700;">${fmt(b.paidAmount)}</td>
            <td style="color:${Number(b.remainingAmount) > 0 ? '#dc2626' : '#059669'};font-weight:700;">${fmt(b.remainingAmount)}</td>
            <td><span class="${badgeClass}">${stLabel}</span></td>
          </tr>`;
        },
        footerHtml: `<tfoot><tr class="pdf-total-row"><td colspan="5" style="text-align:right;">PERIOD TOTALS →</td><td>${fmt(fin.totalRentBilled)}</td><td>${fmt(fin.totalElecCharge)}</td><td>${fmt(fin.totalWaterCharge)}</td><td>—</td><td>${fmt(fin.periodBilled)}</td><td>${fmt(bills.reduce((s,b)=>s+(Number(b.paidAmount)||0),0))}</td><td>${fmt(fin.totalOutstanding)}</td><td></td></tr></tfoot>`,
        emptyHtml: '<p style="color:#6b7280;padding:6px 0;font-size:8.5px;">No bills generated in this date range.</p>',
        titleHeight: 22,
        headerHeight: 20,
        rowHeight: 18,
        footerHeight: 20
      });

      // Section 5: Actual Payment Transactions Received Table
      paginator.addTable({
        titleHtml: `<div class="pdf-section-title">5. Actual Payment Transactions Received (${payments.length} transaction${payments.length !== 1 ? 's' : ''})</div>`,
        colgroupHtml: '<colgroup><col style="width:3%;"><col style="width:9%;"><col style="width:6%;"><col style="width:10%;"><col style="width:10%;"><col style="width:14%;"><col style="width:32%;"><col style="width:16%;"></colgroup>',
        tableHeaderHtml: '<tr><th>#</th><th>Date</th><th>Time</th><th>Amount</th><th>Method</th><th>Txn / Ref ID</th><th>Payment Received Against</th><th>Notes</th></tr>',
        rows: payments,
        renderRow: (p, i) => {
          const dateStr = getPaymentDate(p);
          const timeStr = p.createdAt && p.createdAt.includes('T') ? p.createdAt.split('T')[1].slice(0, 5) : '—';
          let allocDesc = '—';
          if (Array.isArray(p.allocations) && p.allocations.length > 0) {
            allocDesc = p.allocations.map(a => `${a.type === 'advance' ? 'Advance Rent' : (a.billNumber || a.billId)} (${fmt(a.amount)})`).join(', ');
          } else if (p.billId) {
            allocDesc = p.billId === 'advance' ? 'Advance Rent' : `Bill ${p.billId}`;
          }
          return `<tr>
            <td>${i + 1}</td>
            <td>${formatDDMMYYYY(dateStr)}</td>
            <td>${timeStr}</td>
            <td style="font-weight:700;color:#059669;">${fmt(p.amount || p.amountPaid)}</td>
            <td>${paymentMethodLabel(p.paymentMethod || p.mode)}</td>
            <td style="font-family:monospace;font-size:7.5px;">${p.transactionId || p.referenceId || '—'}</td>
            <td>${allocDesc}</td>
            <td>${p.notes || '—'}</td>
          </tr>`;
        },
        footerHtml: `<tfoot><tr class="pdf-total-row"><td colspan="3" style="text-align:right;">TOTAL RECEIVED IN PERIOD →</td><td>${fmt(fin.periodPaid)}</td><td colspan="4"></td></tr></tfoot>`,
        emptyHtml: '<p style="color:#6b7280;padding:6px 0;font-size:8.5px;">No payments recorded in this date range.</p>',
        titleHeight: 22,
        headerHeight: 20,
        rowHeight: 18,
        footerHeight: 20
      });

      // Section 6: Date-Wise Account Ledger Table
      paginator.addTable({
        titleHtml: `<div class="pdf-section-title">6. Date-Wise Account Ledger (Running Audit Trail) (${ledger.length} entries)</div>`,
        colgroupHtml: '<colgroup><col style="width:3%;"><col style="width:9%;"><col style="width:8%;"><col style="width:11%;"><col style="width:37%;"><col style="width:10%;"><col style="width:10%;"><col style="width:12%;"></colgroup>',
        tableHeaderHtml: '<tr><th>#</th><th>Date</th><th>Type</th><th>Ref</th><th>Description</th><th>Debit (+)</th><th>Credit (-)</th><th>Balance</th></tr>',
        rows: ledger,
        renderRow: (entry, i) => `<tr>
          <td>${i + 1}</td>
          <td>${formatDDMMYYYY(entry.date)}</td>
          <td><strong style="color:${entry.type === 'bill' ? '#4F46E5' : entry.type === 'payment' ? '#059669' : '#6b7280'}">${entry.typeLabel}</strong></td>
          <td style="font-family:monospace;font-size:7.5px;">${entry.reference}</td>
          <td>${entry.description}</td>
          <td>${entry.debit > 0 ? fmt(entry.debit) : '—'}</td>
          <td style="color:#059669;font-weight:700;">${entry.credit > 0 ? fmt(entry.credit) : '—'}</td>
          <td style="font-weight:800;color:${entry.balance > 0 ? '#dc2626' : entry.balance < 0 ? '#059669' : '#111827'};">${fmt(entry.balance)}</td>
        </tr>`,
        emptyHtml: '<p style="color:#6b7280;padding:6px 0;font-size:8.5px;">No ledger transactions available.</p>',
        titleHeight: 22,
        headerHeight: 20,
        rowHeight: 18
      });

      // Footer
      paginator.addBlock(35, `
        <div style="margin-top:14px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:8px;color:#9ca3af;text-align:center;">
          Generated by Rentora Cloud Platform &nbsp;|&nbsp; Landlord: ${ownerName} &nbsp;|&nbsp; ${fmtDateTime(new Date().toISOString())}
          <br>This report reflects actual financial ledger entries for an active tenant residing at the property. No final settlement has been generated.
        </div>
      `);
    }

    // =========================================================================
    // PDF CASE B: VACATED TENANT HISTORICAL REPORT
    // =========================================================================
    if (data.reportType === 'vacated') {
      const { settlement, bills, payments, expiry, summary: fin } = data;

      const statusBadge = (b) => {
        const s = paymentStatusLabel(b);
        if (s === 'PAID') return '<span class="badge-paid">PAID</span>';
        if (s === 'PARTIALLY PAID') return '<span class="badge-partial">PARTIAL</span>';
        return '<span class="badge-unpaid">UNPAID</span>';
      };

      const totalCharges = Number(settlement.totalCharges) || 0;
      const netSettlement = Math.abs(Number(settlement.netSettlementAmount != null ? settlement.netSettlementAmount : settlement.finalAmount != null ? settlement.finalAmount : settlement.netAmount) || 0);
      const statusLabel = getSettlementStatusLabel(settlement);
      const direction = settlement.settlementDirection || (Number(settlement.netAmount) <= 0 ? 'refund_to_tenant' : 'payment_by_tenant');
      const directionText = direction === 'payment_by_tenant' ? 'PAYMENT PAYABLE BY TENANT' : direction === 'zero_balance' ? 'FULLY SETTLED' : 'REFUND PAYABLE TO TENANT';
      const directionMsg = direction === 'payment_by_tenant' ? 'The tenant must pay this amount to the landlord.' : direction === 'zero_balance' ? 'No amount is payable by either party.' : 'The landlord must refund this amount to the tenant.';
      const amtSettled = Number(settlement.amountSettled) || 0;
      const amtPending = Number(settlement.amountPending != null ? settlement.amountPending : Math.max(0, netSettlement - amtSettled));

      // Block 1: Main Header, Expiry notice, Tenant Profile & Final Settlement Summary
      const vacatedTopHtml = `
        <div class="pdf-header">
          <table class="pdf-header-table">
            <tr>
              <td>
                <div class="pdf-brand">Rentora</div>
                <div class="pdf-brand-sub" style="font-weight:700;font-size:10px;color:#111827;">${businessName}</div>
                ${address ? `<div class="pdf-brand-sub">${address}</div>` : ''}
                <div class="pdf-brand-sub">Landlord: ${ownerName}</div>
              </td>
              <td style="text-align:right;">
                <div class="pdf-report-title">Vacated Tenant Historical Report</div>
                <div style="font-size:9px;color:#4b5563;margin-top:2px;">Tenancy Period: <strong>${formatDDMMYYYY(tenant.moveIn)} → ${formatDDMMYYYY(tenant.moveOut)}</strong></div>
                <div style="font-size:8px;color:#6b7280;">Settlement: ${settlement.settlementNumber} &nbsp;|&nbsp; ${fmtDateTime(settlement.createdAt || settlement.settlementDate)}</div>
                <div style="margin-top:4px;"><span style="background:#fee2e2;color:#991b1b;border:1px solid #ef4444;padding:2px 8px;border-radius:999px;font-weight:800;font-size:7.5px;">VACATED TENANT</span></div>
              </td>
            </tr>
          </table>
        </div>

        <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:4px;padding:5px 8px;font-size:8px;color:#1e40af;margin-bottom:8px;">
          ⏳ Report Access Window: ${fmtDateTime(expiry.start.toISOString())} → ${fmtDateTime(expiry.expiry.toISOString())} &nbsp;|&nbsp; ${formatRemaining(expiry.remaining)}
        </div>

        <div>
          <div class="pdf-section-title">1. Tenant Profile &amp; Tenancy Details</div>
          <table class="pdf-grid-table">
            <tr>
              <td><span class="pdf-label">Tenant Name</span><span class="pdf-val">${tenant.name}</span></td>
              <td><span class="pdf-label">Tenant ID</span><span class="pdf-val" style="font-family:monospace;font-size:8.8px;">${tenant.id}</span></td>
              <td><span class="pdf-label">Phone / Mobile</span><span class="pdf-val">${tenant.mobile || '—'}</span></td>
            </tr>
            <tr>
              <td><span class="pdf-label">Property</span><span class="pdf-val">${property.name || '—'}</span></td>
              <td><span class="pdf-label">Unit Number</span><span class="pdf-val">Unit ${tenant.unitNumber}</span></td>
              <td><span class="pdf-label">Electric Meter</span><span class="pdf-val">${unit.meter || '—'}</span></td>
            </tr>
            <tr>
              <td><span class="pdf-label">Move-In Date</span><span class="pdf-val">${formatDDMMYYYY(tenant.moveIn)}</span></td>
              <td><span class="pdf-label">Vacate Date</span><span class="pdf-val">${formatDDMMYYYY(tenant.moveOut)}</span></td>
              <td><span class="pdf-label">Monthly Rent</span><span class="pdf-val">${fmt(tenant.rent || tenant.monthlyRent)}/mo</span></td>
            </tr>
            <tr>
              <td><span class="pdf-label">Security Deposit</span><span class="pdf-val">${fmt(tenant.deposit || tenant.securityDeposit)}</span></td>
              <td><span class="pdf-label">Advance Rent</span><span class="pdf-val">${fmt(tenant.advance || tenant.advanceAmount)}</span></td>
              <td><span class="pdf-label">Initial Meter Reading</span><span class="pdf-val">${tenant.initialMeter ?? '—'}</span></td>
            </tr>
          </table>
        </div>

        <div>
          <div class="pdf-section-title">2. Final Settlement Summary</div>
          <table class="pdf-grid-table" style="margin-bottom:8px;">
            <tr>
              <td><span class="pdf-label">Settlement Number</span><span class="pdf-val">${settlement.settlementNumber}</span></td>
              <td><span class="pdf-label">Settlement Date</span><span class="pdf-val">${fmtDateTime(settlement.createdAt || settlement.settlementDate)}</span></td>
              <td><span class="pdf-label">Final Charges (A)</span><span class="pdf-val" style="color:#4F46E5;">${fmt(totalCharges)}</span></td>
            </tr>
            <tr>
              <td><span class="pdf-label">Advance Adjusted (B1)</span><span class="pdf-val">${fmt(settlement.advanceAdjusted != null ? settlement.advanceAdjusted : settlement.advanceRentAdjusted)}</span></td>
              <td><span class="pdf-label">Deposit Deducted (B2)</span><span class="pdf-val">${fmt(settlement.depositDeducted != null ? settlement.depositDeducted : settlement.securityDepositAdjusted)}</span></td>
              <td><span class="pdf-label">Net Settlement Amount</span><span class="pdf-val" style="font-size:10px;color:${direction === 'payment_by_tenant' ? '#dc2626' : '#059669'};">${fmt(netSettlement)}</span></td>
            </tr>
            <tr>
              <td colspan="2">
                <span class="pdf-label">Payment Direction</span>
                <span class="pdf-val" style="color:${direction === 'payment_by_tenant' ? '#dc2626' : '#059669'};">${directionText}</span>
                <div style="font-size:7.5px;color:#6b7280;margin-top:1.5px;">${directionMsg}</div>
              </td>
              <td>
                <span class="pdf-label">Settlement Status</span>
                <span class="pdf-val">${statusLabel}</span>
                <div style="font-size:7.5px;color:#6b7280;margin-top:1.5px;">Settled: ${fmt(amtSettled)} | Pending: <strong>${fmt(amtPending)}</strong></div>
              </td>
            </tr>
          </table>
        </div>
      `;
      paginator.addBlock(270, vacatedTopHtml);

      // Section 3: Electricity Meter Reading & Utilities History Table
      paginator.addTable({
        titleHtml: '<div class="pdf-section-title">3. Electricity Meter Reading &amp; Utilities History</div>',
        colgroupHtml: '<colgroup><col style="width:3%;"><col style="width:9%;"><col style="width:10%;"><col style="width:8%;"><col style="width:11%;"><col style="width:8%;"><col style="width:11%;"><col style="width:8%;"><col style="width:6%;"><col style="width:13%;"><col style="width:13%;"></colgroup>',
        tableHeaderHtml: '<tr><th>#</th><th>Month</th><th>Bill No</th><th>Prev Reading</th><th>Prev Reading Date</th><th>Curr Reading</th><th>Curr Reading Date</th><th>Units</th><th>Rate (₹)</th><th>Elec Charge</th><th>Water Charge</th></tr>',
        rows: bills,
        renderRow: (b, i) => {
          const mtrDates = getMeterReadingDates(b, bills, tenant);
          return `<tr>
            <td>${i + 1}</td>
            <td>${formatMonthReadable(b.billingMonth)}</td>
            <td>${b.billNumber || '—'}</td>
            <td>${b.previousMeterReading !== undefined && b.previousMeterReading !== null ? b.previousMeterReading : '—'}</td>
            <td>${formatDDMMYYYY(mtrDates.prevDate) || '—'}</td>
            <td>${b.currentMeterReading !== undefined && b.currentMeterReading !== null ? b.currentMeterReading : '—'}</td>
            <td>${formatDDMMYYYY(mtrDates.currDate) || '—'}</td>
            <td style="font-weight:700;">${b.electricityUnits || 0} u</td>
            <td>₹${b.electricityRate || 0}</td>
            <td style="font-weight:700;color:#4F46E5;">${fmt(b.electricityCharge)}</td>
            <td>${fmt(b.waterCharge)}</td>
          </tr>`;
        },
        footerHtml: `<tfoot><tr class="pdf-total-row"><td colspan="7" style="text-align:right;">TOTAL CONSUMPTION &amp; CHARGES →</td><td>${bills.reduce((s,b)=>s+(Number(b.electricityUnits)||0),0)} units</td><td>—</td><td>${fmt(bills.reduce((s,b)=>s+(Number(b.electricityCharge)||0),0))}</td><td>${fmt(bills.reduce((s,b)=>s+(Number(b.waterCharge)||0),0))}</td></tr></tfoot>`,
        emptyHtml: '<p style="color:#6b7280;padding:4px 0;font-size:8px;">No electricity meter readings found.</p>',
        titleHeight: 22,
        headerHeight: 20,
        rowHeight: 18,
        footerHeight: 20
      });

      // Section 4: Complete Bills History Table
      paginator.addTable({
        titleHtml: `<div class="pdf-section-title">4. Complete Bills History (${bills.length} bills)</div>`,
        colgroupHtml: '<colgroup><col style="width:3%;"><col style="width:9%;"><col style="width:7%;"><col style="width:7%;"><col style="width:7%;"><col style="width:7%;"><col style="width:8%;"><col style="width:8%;"><col style="width:6%;"><col style="width:6%;"><col style="width:7%;"><col style="width:7%;"><col style="width:7%;"><col style="width:7%;"><col style="width:6%;"></colgroup>',
        tableHeaderHtml: '<tr><th>#</th><th>Bill No.</th><th>Month</th><th>Issue Date</th><th>Due Date</th><th>Rent</th><th>Electricity</th><th>Elec Charge</th><th>Water</th><th>Parking</th><th>Prev Due</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Status</th></tr>',
        rows: bills,
        renderRow: (b, i) => `<tr>
          <td>${i + 1}</td>
          <td>${b.billNumber || '—'}</td>
          <td>${b.billingMonth || '—'}</td>
          <td>${formatDDMMYYYY(b.createdAt || getBillDate(b))}</td>
          <td>${formatDDMMYYYY(b.dueDate)}</td>
          <td>${fmt(b.rent)}</td>
          <td>${b.electricityUnits || 0} u</td>
          <td>${fmt(b.electricityCharge)}</td>
          <td>${fmt(b.waterCharge)}</td>
          <td>${fmt(b.parkingCharge)}</td>
          <td>${fmt(b.previousDue)}</td>
          <td>${fmt(b.totalAmount)}</td>
          <td>${fmt(b.paidAmount)}</td>
          <td>${fmt(b.remainingAmount)}</td>
          <td>${statusBadge(b)}</td>
        </tr>`,
        footerHtml: `<tfoot><tr class="pdf-total-row"><td colspan="11" style="text-align:right;">TOTALS →</td><td>${fmt(fin.totalBilled)}</td><td>${fmt(fin.totalPaid)}</td><td>${fmt(fin.totalOutstanding)}</td><td></td></tr></tfoot>`,
        emptyHtml: '<p style="color:#6b7280;padding:6px 0;font-size:8.5px;">No bills on record for this tenancy.</p>',
        titleHeight: 22,
        headerHeight: 20,
        rowHeight: 18,
        footerHeight: 20
      });

      // Section 5: Complete Payment Transactions Table
      paginator.addTable({
        titleHtml: `<div class="pdf-section-title">5. Complete Payment Transactions (${payments.length} transaction${payments.length !== 1 ? 's' : ''})</div>`,
        colgroupHtml: '<colgroup><col style="width:3%;"><col style="width:9%;"><col style="width:6%;"><col style="width:11%;"><col style="width:10%;"><col style="width:17%;"><col style="width:44%;"></colgroup>',
        tableHeaderHtml: '<tr><th>#</th><th>Date</th><th>Time</th><th>Amount</th><th>Mode</th><th>Transaction ID</th><th>Payment Received Against</th></tr>',
        rows: payments,
        renderRow: (p, i) => {
          const dateStr = p.paymentDate || (p.createdAt ? p.createdAt.split('T')[0] : '');
          const timeStr = p.createdAt ? (p.createdAt.split('T')[1]?.slice(0, 5) || '—') : '—';
          let allocationSummary = '—';
          if (Array.isArray(p.allocations) && p.allocations.length > 0) {
            allocationSummary = p.allocations.map((a) => {
              if (a.type === 'advance') return `Advance Rent (${fmt(a.amount)})`;
              const b = bills.find((tb) => tb.id === a.billId);
              const bNum = b ? b.billNumber : (a.billNumber || a.billId);
              const m = b?.billingMonth || a.billingMonth || '';
              return `${m ? m + ' ' : ''}${bNum} (${fmt(a.amount)})`;
            }).join(', ');
          } else {
            const associatedBill = bills.find(b => b.id === p.billId);
            allocationSummary = associatedBill ? `${associatedBill.billingMonth || ''} ${associatedBill.billNumber}` : (p.billId === 'advance' ? 'Advance Rent' : p.billId || 'Direct Payment');
          }
          return `<tr>
            <td>${i + 1}</td>
            <td>${formatDDMMYYYY(dateStr)}</td>
            <td>${timeStr}</td>
            <td style="font-weight:700;">${fmt(Number(p.amount) || Number(p.amountPaid) || 0)}</td>
            <td>${paymentMethodLabel(p.paymentMethod || p.mode)}</td>
            <td style="font-family:monospace;font-size:7.5px;">${p.transactionId || p.referenceId || '—'}</td>
            <td>${allocationSummary}</td>
          </tr>`;
        },
        footerHtml: `<tfoot><tr class="pdf-total-row"><td colspan="3" style="text-align:right;">TOTAL RECEIVED →</td><td>${fmt(fin.totalPaid)}</td><td colspan="3"></td></tr></tfoot>`,
        emptyHtml: '<p style="color:#6b7280;padding:6px 0;font-size:8.5px;">No payments recorded for this tenant.</p>',
        titleHeight: 22,
        headerHeight: 20,
        rowHeight: 18,
        footerHeight: 20
      });

      // Section 6: Settlement Transaction History (if any)
      if (Array.isArray(settlement.transactions) && settlement.transactions.length > 0) {
        paginator.addTable({
          titleHtml: `<div class="pdf-section-title">6. Settlement Transaction History (${settlement.transactions.length} entries)</div>`,
          colgroupHtml: '<colgroup><col style="width:3%;"><col style="width:14%;"><col style="width:12%;"><col style="width:11%;"><col style="width:11%;"><col style="width:19%;"><col style="width:30%;"></colgroup>',
          tableHeaderHtml: '<tr><th>#</th><th>Date &amp; Time</th><th>Type</th><th>Amount</th><th>Method</th><th>Reference ID</th><th>Notes</th></tr>',
          rows: settlement.transactions,
          renderRow: (tx, idx) => `<tr>
            <td>${idx + 1}</td>
            <td>${fmtDateTime(tx.date || tx.createdAt)}</td>
            <td><strong style="color:${tx.type === 'refund' ? '#059669' : '#2563eb'}">${tx.type === 'refund' ? 'Refund Paid' : 'Payment Received'}</strong></td>
            <td style="font-weight:700;">${fmt(tx.amount)}</td>
            <td>${paymentMethodLabel(tx.paymentMethod)}</td>
            <td style="font-family:monospace;font-size:7.5px;">${tx.referenceId || '—'}</td>
            <td>${tx.notes || '—'}</td>
          </tr>`,
          titleHeight: 22,
          headerHeight: 20,
          rowHeight: 18
        });
      }

      // Footer
      paginator.addBlock(35, `
        <div style="margin-top:14px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:8px;color:#9ca3af;text-align:center;">
          Generated by Rentora Cloud Platform &nbsp;|&nbsp; Landlord: ${ownerName} &nbsp;|&nbsp; ${fmtDateTime(new Date().toISOString())}
          <br>This report is generated for landlord use only. Tenant financial data is protected by a 30-day access window from settlement date.
        </div>
      `);
    }

    const contentHtml = paginator.compileHtml();

    // Create temporary offscreen container for html2pdf
    const container = document.createElement('div');
    container.id = 'rentora-pdf-temp-container';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '1060px';
    container.style.height = 'auto';
    container.style.minHeight = '0';
    container.style.zIndex = '-99999';
    container.style.backgroundColor = '#ffffff';
    container.style.opacity = '1';
    container.style.visibility = 'visible';
    container.style.pointerEvents = 'none';
    container.style.boxSizing = 'border-box';
    container.style.margin = '0';
    container.style.padding = '0';

    container.innerHTML = `
      <div class="pdf-content-wrapper">
        <style>
          ${commonCss}
        </style>
        ${contentHtml}
      </div>
    `;

    document.body.appendChild(container);

    try {
      // Wait for fonts if ready
      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (_) {}
      }

      // Allow browser to perform layout and render typography
      await new Promise(r => setTimeout(r, 250));

      const targetEl = container.querySelector('.pdf-content-wrapper') || container;
      const opt = {
        margin: [8, 8, 8, 8],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          scrollX: 0,
          scrollY: 0
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: {
          mode: ['css'],
          avoid: ['tr', '.pdf-grid-table', '.pdf-header', '.pdf-mini-header', '.pdf-section-title']
        }
      };

      await html2pdf().set(opt).from(targetEl).save();
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('PDF generation failed: ' + (err.message || 'Please try again.'));
    } finally {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.innerHTML = origBtnHtml;
      }
    }
  };

  // ── Testing / API Hook ─────────────────────────────────────────────────────
  window._testAssemble = assembleReportData;
  window._testAssembleProperty = assemblePropertyReportData;

  // ── State bridge & Auto-Initializer ────────────────────────────────────────
  function installStateBridge() {
    // Immediate render attempt
    if (typeof window.renderReportsPanel === 'function') {
      window.renderReportsPanel();
    }

    const original = window.renderAllPortalData;
    if (typeof original === 'function') {
      window.renderAllPortalData = function () {
        original.apply(this, arguments);
        if (window.__rentoraStateGetter) {
          window.__rentoraState = window.__rentoraStateGetter();
        }
        if (typeof window.renderReportsPanel === 'function') {
          window.renderReportsPanel();
        }
      };
    } else {
      setTimeout(installStateBridge, 200);
    }
  }

  function setupReportDropdownListeners() {
    const propSel = document.getElementById('rptPropertySelect');
    if (propSel && typeof propSel.addEventListener === 'function') {
      propSel.addEventListener('focus', () => {
        if (typeof window.renderReportsPanel === 'function') window.renderReportsPanel();
      });
      propSel.addEventListener('mousedown', () => {
        if (typeof window.renderReportsPanel === 'function') window.renderReportsPanel();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      installStateBridge();
      setupReportDropdownListeners();
    });
  } else {
    installStateBridge();
    setupReportDropdownListeners();
  }

  // Also hook window load
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('load', () => {
      if (typeof window.renderReportsPanel === 'function') {
        window.renderReportsPanel();
      }
    });
  }

})();
