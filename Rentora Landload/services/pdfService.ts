import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { Bill, Tenant, Property, Unit, BillSettings, Payment, Settlement } from '../types';
import { formatBillDate, formatShortBillDate, parseDateSafely } from '../utils/date';
import { rentoraLogoBase64 } from './logoData';
import { paymentService } from './paymentService';

// Helper function to fetch remote Cloudinary images and convert to Base64 data URLs
const getBase64Image = async (url: string): Promise<string | null> => {
  if (!url) return null;
  try {
    if (url.startsWith('file://')) {
      const base64Content = await FileSystem.readAsStringAsync(url, {
        encoding: FileSystem.EncodingType.Base64
      });
      const extension = url.split('.').pop()?.split('?')[0] || 'jpg';
      const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
      return `data:${mimeType};base64,${base64Content}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second timeout for slower connections
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn(`Failed to fetch image ${url} for PDF:`, e);
    return null;
  }
};

const calculateMeterDays = (startVal?: any, endVal?: any): number | null => {
  if (!startVal || !endVal) return null;
  try {
    const start = parseDateSafely(startVal);
    const end = parseDateSafely(endVal);
    if (!start || !end) return null;
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays : null;
  } catch (e) {
    return null;
  }
};

/**
 * Sanitizes a string for use in a file name by:
 * - Trimming whitespace
 * - Replacing spaces with underscores
 * - Removing invalid filesystem characters (/ \ ? % * : | " < >)
 * - Retaining alphanumeric, underscores, hyphens
 * - Collapsing multiple underscores into a single underscore
 * - Trimming leading and trailing underscores
 */
export const sanitizeForFilename = (str?: string | null, fallback = ''): string => {
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

/**
 * Standard bill PDF filename generator:
 * Rentora_Bill_TenantName_InvoiceNumber.pdf
 * e.g. Rentora_Bill_Mahesh_Jatav_INV-2026-00003.pdf
 * If tenant name unavailable: Rentora_Bill_Unknown_Tenant_INV-2026-00003.pdf
 */
export const getBillPDFFilename = (tenantName?: string | null, invoiceNumber?: string | null): string => {
  const cleanTenant = sanitizeForFilename(tenantName, 'Unknown_Tenant');
  const cleanInvoice = sanitizeForFilename(invoiceNumber, 'INV');
  return `Rentora_Bill_${cleanTenant}_${cleanInvoice}.pdf`;
};

/**
 * Dynamic month-year extractor from payment date strings (e.g. "2026-10-15" -> "October 2026")
 * Dynamically resolves month and year from actual payment records without hardcoding.
 */
export const formatPaymentMonthYear = (dateStr?: string): { monthKey: string; monthLabel: string } => {
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
    const d = parseDateSafely(trimmed);
    if (d && !isNaN(d.getTime())) {
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return {
        monthKey,
        monthLabel: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      };
    }
  } catch {}
  return { monthKey: String(dateStr), monthLabel: String(dateStr) };
};

export const pdfService = {
  sanitizeForFilename,
  getBillPDFFilename,
  formatPaymentMonthYear,
  async generateBillPDF(
    bill: Bill,
    tenant: Tenant,
    property: Property,
    unit: Unit,
    settings: BillSettings | null,
    passedPayments?: Payment[]
  ): Promise<string> {
    const ownerName = settings?.ownerName || settings?.businessName || property.name || 'Property Owner';
    const businessName = settings?.businessName || property.name;
    const phone = settings?.phone || '';
    const address = settings?.address || property.address || '';
    const upiId = settings?.upiId || '';
    const instructions = settings?.paymentInstructions || 'Please pay by the due date to avoid any late fees. Kindly send a payment screenshot for verification.';

    // Month formatting helper (e.g. "2026-08" -> "August 2026")
    const formatMonth = (monthStr: string) => {
      try {
        const [year, month] = monthStr.split('-');
        const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
        return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      } catch (e) {
        return monthStr;
      }
    };

    const formattedBillingMonth = formatMonth(bill.billingMonth);
    const formattedDueDate = formatBillDate(bill.dueDate);
    const formattedCreatedDate = formatBillDate(bill.createdAt || new Date().toISOString());

    // Calculate days between readings
    const meterDays = calculateMeterDays(bill.previousMeterReadingDate, bill.currentMeterReadingDate);

    // Calculate billing period dates representation
    let billingPeriodText = '';
    if (bill.previousMeterReadingDate && bill.currentMeterReadingDate) {
      billingPeriodText = `${formatBillDate(bill.previousMeterReadingDate)} to ${formatBillDate(bill.currentMeterReadingDate)}`;
    } else {
      // Fallback
      billingPeriodText = `01 ${formattedBillingMonth} to 28/30/31 ${formattedBillingMonth}`;
    }

    // 1. Resolve payments associated with this bill
    let paymentsList: Payment[] = [];
    if (Array.isArray(passedPayments)) {
      paymentsList = passedPayments;
    } else if (bill.id) {
      try {
        paymentsList = await paymentService.getPaymentsForBill(bill.id);
      } catch (e) {
        paymentsList = [];
      }
    }

    // 2. Filter approved / confirmed payments only (pending or rejected do NOT reduce balance or count as received)
    const approvedPayments = paymentsList.filter(p => {
      if (p.status === 'rejected' || p.status === 'pending') return false;
      return p.status === 'approved' || (!p.status && (Number(p.amount) || Number(p.amountPaid) || 0) > 0);
    });
    approvedPayments.sort((a, b) => (a.paymentDate || '').localeCompare(b.paymentDate || ''));

    // 3. Group approved payments dynamically by payment month
    const paymentsByMonth = new Map<string, { monthKey: string; monthLabel: string; totalReceived: number; payments: Payment[] }>();
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
      const group = paymentsByMonth.get(monthKey)!;
      group.totalReceived += amt;
      group.payments.push(p);
    });
    const monthGroups = Array.from(paymentsByMonth.values());

    // 4. Financial amounts calculation
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

    // Sum of approved payments (fallback to bill.paidAmount if individual payment documents are not present)
    const approvedSum = approvedPayments.reduce((sum, p) => sum + (Number(p.amount) || Number(p.amountPaid) || 0), 0);
    const totalReceived = approvedSum > 0 ? approvedSum : Math.max(0, Number(bill.paidAmount) || 0);

    // Oldest-outstanding-first allocation between previous dues and current bill
    let previousDuePaid = 0;
    let currentBillPaid = 0;
    if (bill.previousDuePaid !== undefined && bill.currentBillPaid !== undefined) {
      previousDuePaid = Math.max(0, Number(bill.previousDuePaid));
      currentBillPaid = Math.max(0, Number(bill.currentBillPaid));
    } else {
      previousDuePaid = Math.min(previousDue, totalReceived);
      currentBillPaid = Math.min(currentBillTotal, Math.max(0, totalReceived - previousDuePaid));
    }

    // Remaining due
    const isPaid = bill.paymentStatus === 'paid' || (bill.remainingAmount !== undefined && Number(bill.remainingAmount) <= 0 && (totalPayable > 0 || totalReceived > 0));
    let remainingAmountDue = 0;
    if (isPaid) {
      remainingAmountDue = 0;
    } else if (bill.remainingAmount !== undefined) {
      remainingAmountDue = Math.max(0, Number(bill.remainingAmount));
    } else {
      remainingAmountDue = Math.max(0, totalPayable - (previousDuePaid + currentBillPaid));
    }

    const isPartial = !isPaid && totalReceived > 0 && remainingAmountDue > 0;
    const statusLabel = isPaid ? 'PAID' : isPartial ? 'PARTIALLY PAID' : 'UNPAID';
    const statusColor = isPaid ? '#059669' : isPartial ? '#d97706' : '#dc2626';

    // Dynamic label for payment received section
    let dynamicPaymentReceivedHeading = '';
    if (monthGroups.length === 1) {
      dynamicPaymentReceivedHeading = `Payment Received in ${monthGroups[0].monthLabel}`;
    } else if (monthGroups.length > 1) {
      const labels = monthGroups.map(g => g.monthLabel).join(', ');
      dynamicPaymentReceivedHeading = `Payment Received (${labels})`;
    } else {
      dynamicPaymentReceivedHeading = `Payment Received in ${formattedBillingMonth}`;
    }

    // Generate QR code URL
    const qrUrl = upiId
      ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent('upi://pay?pa=' + upiId + '&pn=' + encodeURIComponent(ownerName) + '&am=' + (remainingAmountDue > 0 ? remainingAmountDue : totalPayable) + '&cu=INR')}`
      : '';

    // Fetch logo and QR in Base64 format to bypass WebView network requests
    const logoBase64 = settings?.logoUrl ? await getBase64Image(settings.logoUrl) : null;
    const qrBase64 = qrUrl ? await getBase64Image(qrUrl) : null;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Rent Bill - ${bill.billNumber}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1f2937;
            margin: 0;
            padding: 10px;
            font-size: 11px;
            line-height: 15px;
            background-color: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .invoice-wrapper {
            max-width: 800px;
            margin: auto;
            background: #ffffff;
          }
          .top-header {
            display: flex;
            align-items: center;
            margin-bottom: 12px;
            position: relative;
          }
          .logo-box {
            width: 80px;
            height: 80px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .logo-img {
            max-width: 80px;
            max-height: 80px;
            object-fit: contain;
          }
          .center-business-info {
            flex: 1;
            text-align: center;
            margin-left: -80px; /* Offset the logo width to keep name perfectly centered */
          }
          .business-title {
            font-size: 26px;
            font-weight: 800;
            color: #3b49df; /* Exact matching purple-blue shade */
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .business-address {
            font-size: 11px;
            color: #8e9aa8; /* Light grey/blue color */
            margin: 3px 0 0 0;
            text-transform: lowercase;
            font-weight: 600;
          }
          .doc-title-block {
            text-align: center;
            margin-top: 15px;
            margin-bottom: 15px;
          }
          .doc-title {
            font-size: 15px;
            font-weight: 800;
            color: #111827;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .doc-subtitle {
            font-size: 11px;
            color: #6b7280;
            font-weight: 700;
            margin: 3px 0 0 0;
          }
          .purple-line {
            height: 1.5px;
            background-color: #3b49df;
            width: 100%;
            margin-bottom: 8px;
          }
          .due-date-row {
            text-align: right;
            margin-bottom: 8px;
          }
          .due-date-text {
            font-size: 11px;
            font-weight: 800;
            color: #dc2626; /* Crimson Red */
            margin: 0;
          }
          .tenant-details-box {
            border: 1px solid #9ca3af;
            border-radius: 4px;
            padding: 10px 15px;
            margin-bottom: 6px;
            background: #ffffff;
          }
          .tenant-grid-table {
            width: 100%;
            border-collapse: collapse;
          }
          .tenant-grid-td {
            padding: 3px 0;
            vertical-align: top;
            font-size: 11px;
            color: #1f2937;
          }
          .tenant-grid-label {
            font-weight: 500;
            color: #374151;
          }
          .tenant-grid-value {
            font-weight: 700;
            color: #111827;
          }
          .period-row {
            display: flex;
            justify-content: space-between;
            font-size: 10.5px;
            font-weight: 700;
            color: #374151;
            margin-bottom: 15px;
            padding: 0 4px;
          }
          .main-charges-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
            border: 1px solid #111827;
          }
          .main-charges-table th {
            background: #3b49df; /* Exact matching header background color */
            color: #ffffff;
            font-size: 10.5px;
            font-weight: 800;
            padding: 6px 8px;
            border: 1px solid #111827;
            text-transform: capitalize;
          }
          .main-charges-table td {
            border: 1px solid #111827;
            padding: 8px;
            font-size: 11px;
            color: #111827;
            vertical-align: middle;
          }
          .center-text {
            text-align: center;
          }
          .right-text {
            text-align: right;
          }
          .total-amount-row {
            background-color: #eff6ff; /* Light blue highlight */
            font-weight: 800;
          }
          .total-amount-row td {
            font-weight: 800;
            font-size: 11px;
          }
          .notes-header {
            font-size: 11.5px;
            font-weight: 800;
            color: #1f2937;
            margin: 10px 0 3px 0;
            text-transform: capitalize;
          }
          .notes-body {
            font-size: 10.5px;
            color: #374151;
            margin: 0 0 15px 0;
            line-height: 14px;
            font-weight: 500;
          }
          .payment-scan-container {
            text-align: center;
            margin-top: 15px;
            margin-bottom: 15px;
          }
          .payment-scan-title {
            font-size: 13px;
            font-weight: 800;
            color: #3b49df;
            margin: 0 0 10px 0;
            letter-spacing: 0.2px;
          }
          .qr-image-wrapper {
            margin: 0 auto 8px auto;
            width: 120px;
            height: 120px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .qr-image {
            width: 120px;
            height: 120px;
          }
          .upi-id-bold {
            font-size: 18px;
            font-weight: 800;
            color: #4b5563;
            margin: 8px 0;
            letter-spacing: 0.5px;
          }
          .payment-logos-strip {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 12px;
            margin-top: 12px;
            flex-wrap: wrap;
          }
          .brand-logo-text {
            font-size: 10px;
            font-weight: 800;
            padding: 3px 6px;
            border-radius: 4px;
            border: 1px solid #e5e7eb;
          }
          .phonepe-brand { color: #5f259f; border-color: #5f259f; background: #f5f0ff; }
          .paytm-brand { color: #00baf2; border-color: #00baf2; background: #e0f7fe; }
          .gpay-brand { color: #1a73e8; border-color: #34a853; background: #f1f3f4; }
          .bhim-brand { color: #f47b20; border-color: #0b51a0; background: #fff5eb; }
          .amazon-brand { color: #ff9900; border-color: #111827; background: #fff8eb; }
          .mobikwik-brand { color: #00539c; border-color: #00539c; background: #f0f7ff; }
          .freecharge-brand { color: #ff3f1a; border-color: #ff3f1a; background: #fff1f0; }

          .signature-bottom-container {
            display: flex;
            justify-content: flex-end;
            margin-top: 25px;
            padding-right: 5px;
          }
          .signature-inner-box {
            text-align: center;
            width: 160px;
          }
          .signature-graphic {
            max-height: 45px;
            max-width: 110px;
            margin-bottom: 2px;
            display: block;
            margin-left: auto;
            margin-right: auto;
            object-fit: contain;
          }
          .signature-blank {
            height: 35px;
          }
          .signature-label {
            font-size: 11px;
            font-weight: 800;
            color: #4b5563;
            margin: 0;
          }
          .signature-name {
            font-size: 10.5px;
            color: #111827;
            font-weight: 700;
            margin: 2px 0 0 0;
          }
        </style>
      </head>
      <body>
        <div class="invoice-wrapper">
          <!-- Header Area -->
          <div class="top-header" style="display: flex; flex-direction: column; align-items: stretch;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
              <!-- Left Side: Rentora App Branding -->
              <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                <img src="${rentoraLogoBase64}" style="width: 48px; height: 48px; border-radius: 8px; object-fit: contain;" />
                <span style="font-size: 13px; font-weight: 900; color: #1e3a8a; letter-spacing: 0.5px; line-height: 14px;">Rentora</span>
              </div>
              
              <!-- Right Side: Owner Business Logo -->
              <div style="display: flex; align-items: flex-start; justify-content: flex-end;">
                ${logoBase64 ? `
                  <img src="${logoBase64}" style="max-height: 55px; max-width: 110px; object-fit: contain;" />
                ` : ''}
              </div>
            </div>
            
            <!-- Centered Owner/Business Information -->
            <div class="center-business-info" style="margin-top: 10px; margin-left: 0; text-align: center; width: 100%;">
              <h1 class="business-title">${businessName}</h1>
              <p class="business-address">${address}</p>
            </div>
          </div>

          <!-- Document Invoice Title -->
          <div class="doc-title-block">
            <h2 class="doc-title">RENT SUMMARY INVOICE</h2>
            <p class="doc-subtitle">Month: ${formattedBillingMonth}</p>
          </div>

          <!-- Divider Line -->
          <div class="purple-line"></div>

          <!-- Right Aligned Due Date -->
          <div class="due-date-row">
            <p class="due-date-text">Due Date: ${formattedDueDate}</p>
          </div>

          <!-- Bordered Tenant Box -->
          <div class="tenant-details-box">
            <table class="tenant-grid-table">
              <tr>
                <td class="tenant-grid-td" style="width: 50%;">
                  <span class="tenant-grid-label">Flat No. :</span>
                  <span class="tenant-grid-value">${unit.unitNumber}</span>
                </td>
                <td class="tenant-grid-td" style="width: 50%;">
                  <span class="tenant-grid-label">Maintenance :</span>
                  <span class="tenant-grid-value">${bill.maintenanceCharge > 0 ? `₹${bill.maintenanceCharge}` : 'Nil'}</span>
                </td>
              </tr>
              <tr>
                <td class="tenant-grid-td" style="width: 50%;">
                  <span class="tenant-grid-label">Name :</span>
                  <span class="tenant-grid-value">${tenant.name}</span>
                </td>
                <td class="tenant-grid-td" style="width: 50%;">
                  <span class="tenant-grid-label">Security :</span>
                  <span class="tenant-grid-value">${tenant.advanceAmount && tenant.advanceAmount > 0 ? `₹${tenant.advanceAmount}` : 'Nil'}</span>
                </td>
              </tr>
              <tr>
                <td class="tenant-grid-td" style="width: 50%;">
                  <span class="tenant-grid-label">Phone No. :</span>
                  <span class="tenant-grid-value">${tenant.mobile || 'N/A'}</span>
                </td>
                <td class="tenant-grid-td" style="width: 50%;">
                  <span class="tenant-grid-label">Monthly Rent :</span>
                  <span class="tenant-grid-value">₹${bill.rent}</span>
                </td>
              </tr>
              <tr>
                <td class="tenant-grid-td" style="width: 50%;">
                  <span class="tenant-grid-label">Id:</span>
                  <span class="tenant-grid-value">${tenant.idProofType !== 'none' ? `${tenant.idProofType} ${tenant.documentNumber || ''}`.trim() : 'None'}</span>
                </td>
                <td class="tenant-grid-td" style="width: 50%;">
                  <span class="tenant-grid-label">Payment Status :</span>
                  <span class="tenant-grid-value" style="color: ${statusColor}; text-transform: uppercase;">
                    ${statusLabel}
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <!-- Underbox Period Line -->
          <div class="period-row">
            <div>${billingPeriodText}</div>
            <div>Bill Issued Date:${formattedCreatedDate}</div>
          </div>

          <!-- Main Boxed Charges Table -->
          <table class="main-charges-table">
            <thead>
              <tr>
                <th colspan="7">Description</th>
                <th style="width: 15%; text-align: right;">Amount (₹)</th>
              </tr>
              <tr>
                <th style="width: 25%;">Bill Type</th>
                <th class="center-text" style="width: 15%;">Current Month<br>(Reading/Date)</th>
                <th class="center-text" style="width: 15%;">Last Month<br>(Reading/Date)</th>
                <th class="center-text" style="width: 13%;">Total Unit</th>
                <th class="center-text" style="width: 10%;">Rate (₹)</th>
                <th class="center-text" style="width: 11%;">Fixed (₹)</th>
                <th class="center-text" style="width: 11%;">Govt.<br>(Bill/Date)</th>
                <th style="width: 15%; text-align: right;">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <!-- Electricity Row -->
              ${(() => {
                const eType = bill.electricityBillType || 'perUnit';
                
                if (eType === 'fixed') {
                  return `
                    <tr class="charges-tr">
                      <td>Electricity Bill<br><span style="font-size: 8.5px; color: #4b5563; font-weight: 700;">Fixed</span></td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">₹${bill.electricityCharge}</td>
                      <td class="center-text">-</td>
                      <td class="right-text">${bill.electricityCharge}</td>
                    </tr>
                  `;
                } else if (eType === 'none') {
                  return `
                    <tr class="charges-tr">
                      <td>Electricity Bill<br><span style="font-size: 8.5px; color: #4b5563; font-weight: 700;">Included / Self</span></td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="right-text">0</td>
                    </tr>
                  `;
                } else {
                  // perUnit
                  return `
                    <tr class="charges-tr">
                      <td>Electricity Bill<br><span style="font-size: 8.5px; color: #4b5563; font-weight: 700;">${bill.electricityUnits} Units x ₹${bill.electricityRate}</span></td>
                      <td class="center-text">
                        ${bill.currentMeterReading}<br>
                        <span style="font-size: 8px; color: #4b5563;">
                          ${bill.currentMeterReadingDate ? formatShortBillDate(bill.currentMeterReadingDate) : 'N/A'}
                        </span>
                      </td>
                      <td class="center-text">
                        ${bill.previousMeterReading}<br>
                        <span style="font-size: 8px; color: #4b5563;">
                          ${bill.previousMeterReadingDate ? formatShortBillDate(bill.previousMeterReadingDate) : 'N/A'}
                        </span>
                      </td>
                      <td class="center-text">
                        ${bill.electricityUnits} Units<br>
                        <span style="font-size: 8px; color: #4b5563;">
                          ${meterDays !== null ? `(${meterDays} Days)` : ''}
                        </span>
                      </td>
                      <td class="center-text">${bill.electricityRate}</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="right-text">${bill.electricityCharge}</td>
                    </tr>
                  `;
                }
              })()}

              <!-- Water Row -->
              ${(() => {
                const wType = bill.waterBillType || (bill.waterCharge > 0 ? 'fixed' : 'none');
                
                if (wType === 'fixed') {
                  return `
                    <tr class="charges-tr">
                      <td>Water Bill<br><span style="font-size: 8.5px; color: #4b5563; font-weight: 700;">Fixed</span></td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">₹${bill.waterCharge}</td>
                      <td class="center-text">-</td>
                      <td class="right-text">${bill.waterCharge}</td>
                    </tr>
                  `;
                } else if (wType === 'none') {
                  return `
                    <tr class="charges-tr">
                      <td>Water Bill<br><span style="font-size: 8.5px; color: #4b5563; font-weight: 700;">Included / Self</span></td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="right-text">0</td>
                    </tr>
                  `;
                } else {
                  // perUnit
                  const wRate = bill.waterRatePerUnit || 0;
                  return `
                    <tr class="charges-tr">
                      <td>Water Bill<br><span style="font-size: 8.5px; color: #4b5563; font-weight: 700;">${bill.electricityUnits} Units x ₹${wRate}</span></td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="center-text">${wRate}</td>
                      <td class="center-text">-</td>
                      <td class="center-text">-</td>
                      <td class="right-text">${bill.waterCharge}</td>
                    </tr>
                  `;
                }
              })()}

              <!-- Parking Row -->
              <tr class="charges-tr">
                <td colspan="7">Parking</td>
                <td class="right-text">${bill.parkingCharge || 0}</td>
              </tr>

              <!-- Maintenance Row -->
              <tr class="charges-tr">
                <td colspan="7">Maintenance</td>
                <td class="right-text">${bill.maintenanceCharge}</td>
              </tr>

              <!-- Monthly Rent Row -->
              <tr class="charges-tr">
                <td colspan="7">Rent</td>
                <td class="right-text">${bill.rent}</td>
              </tr>

              <!-- Other Charges Row -->
              <tr class="charges-tr">
                <td colspan="7">Other Charges</td>
                <td class="right-text">${bill.otherCharges}</td>
              </tr>

              <!-- Totals & Payment Balance Breakdown -->
              ${(() => {
                let html = '';

                if (hasPrevDue) {
                  html += `
                    <tr class="charges-tr" style="font-weight: 700;">
                      <td colspan="7">Current Bill Total</td>
                      <td class="right-text">₹ ${currentBillTotal.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr class="charges-tr" style="color: #dc2626; font-weight: 700;">
                      <td colspan="7">Previous Due</td>
                      <td class="right-text">₹ ${previousDue.toLocaleString('en-IN')}</td>
                    </tr>
                  `;

                  if (totalReceived > 0) {
                    html += `
                      <tr class="charges-tr" style="font-weight: 800; background-color: #f9fafb;">
                        <td colspan="7">Total Payable</td>
                        <td class="right-text">₹ ${totalPayable.toLocaleString('en-IN')}</td>
                      </tr>
                      <tr class="charges-tr" style="color: #059669; font-weight: 700;">
                        <td colspan="7">${dynamicPaymentReceivedHeading}</td>
                        <td class="right-text">₹ ${totalReceived.toLocaleString('en-IN')}</td>
                      </tr>
                      <tr class="charges-tr" style="color: #4b5563; font-size: 9.5px;">
                        <td colspan="7" style="padding-left: 20px;">• Previous Due Cleared</td>
                        <td class="right-text">₹ ${previousDuePaid.toLocaleString('en-IN')}</td>
                      </tr>
                      <tr class="charges-tr" style="color: #4b5563; font-size: 9.5px;">
                        <td colspan="7" style="padding-left: 20px;">• Current Month Paid</td>
                        <td class="right-text">₹ ${currentBillPaid.toLocaleString('en-IN')}</td>
                      </tr>
                      <tr class="total-amount-row">
                        <td colspan="7">Remaining Due</td>
                        <td class="right-text" style="color: ${remainingAmountDue > 0 ? '#dc2626' : '#059669'};">₹ ${remainingAmountDue.toLocaleString('en-IN')}</td>
                      </tr>
                    `;
                  } else {
                    html += `
                      <tr class="charges-tr" style="color: #6b7280; font-size: 9.5px;">
                        <td colspan="7">${dynamicPaymentReceivedHeading}</td>
                        <td class="right-text">₹ 0</td>
                      </tr>
                      <tr class="total-amount-row">
                        <td colspan="7">Total Payable</td>
                        <td class="right-text">₹ ${totalPayable.toLocaleString('en-IN')}</td>
                      </tr>
                    `;
                  }
                } else {
                  if (totalReceived > 0) {
                    html += `
                      <tr class="charges-tr" style="font-weight: 800; background-color: #f9fafb;">
                        <td colspan="7">Total Amount</td>
                        <td class="right-text">₹ ${totalPayable.toLocaleString('en-IN')}</td>
                      </tr>
                      <tr class="charges-tr" style="color: #059669; font-weight: 700;">
                        <td colspan="7">${dynamicPaymentReceivedHeading}</td>
                        <td class="right-text">₹ ${totalReceived.toLocaleString('en-IN')}</td>
                      </tr>
                      <tr class="total-amount-row">
                        <td colspan="7">Remaining Due</td>
                        <td class="right-text" style="color: ${remainingAmountDue > 0 ? '#dc2626' : '#059669'};">₹ ${remainingAmountDue.toLocaleString('en-IN')}</td>
                      </tr>
                    `;
                  } else {
                    html += `
                      <tr class="charges-tr" style="color: #6b7280; font-size: 9.5px;">
                        <td colspan="7">${dynamicPaymentReceivedHeading}</td>
                        <td class="right-text">₹ 0</td>
                      </tr>
                      <tr class="total-amount-row">
                        <td colspan="7">Total Amount</td>
                        <td class="right-text">₹ ${totalPayable.toLocaleString('en-IN')}</td>
                      </tr>
                    `;
                  }
                }

                return html;
              })()}
            </tbody>
          </table>

          <!-- Payment Details & Month-Wise Allocation Section -->
          ${(() => {
            let paymentBreakdownHtml = '';
            if (monthGroups.length > 0) {
              paymentBreakdownHtml = monthGroups.map(group => `
                <div style="margin-bottom: 5px;">
                  <div style="font-weight: 800; font-size: 10.5px; color: #111827;">
                    Payment Received in ${group.monthLabel}: <span style="color: #059669; font-weight: 800;">₹ ${group.totalReceived.toLocaleString('en-IN')}</span>
                  </div>
                  ${group.payments.map(p => {
                    const pAmt = (Number(p.amount) || Number(p.amountPaid) || 0).toLocaleString('en-IN');
                    const pMethod = (p.paymentMethod || 'Payment').toUpperCase();
                    const pDate = p.paymentDate ? formatShortBillDate(p.paymentDate) : 'N/A';
                    const txn = p.transactionId ? ` (Txn: ${p.transactionId})` : '';
                    return `
                      <div style="font-size: 9.5px; color: #4b5563; padding-left: 10px; margin-top: 1px;">
                        • ${pDate} — ${pMethod}${txn}: <span style="font-weight: 700; color: #111827;">₹ ${pAmt}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              `).join('');
            } else if (totalReceived > 0) {
              paymentBreakdownHtml = `
                <div style="margin-bottom: 5px; font-size: 10.5px; font-weight: 800; color: #111827;">
                  ${dynamicPaymentReceivedHeading}: <span style="color: #059669; font-weight: 800;">₹ ${totalReceived.toLocaleString('en-IN')}</span>
                </div>
              `;
            } else {
              paymentBreakdownHtml = `
                <div style="margin-bottom: 3px; font-size: 10.5px; color: #4b5563;">
                  <span style="font-weight: 800; color: #111827;">Payment Received in ${formattedBillingMonth}:</span>
                  <span style="font-weight: 800; color: #dc2626; margin-left: 4px;">₹ 0</span>
                  <span style="font-style: italic; color: #6b7280; font-size: 9.5px; margin-left: 6px;">(No payment received this month)</span>
                </div>
              `;
            }

            return `
              <div class="payment-allocation-box" style="margin-top: 8px; margin-bottom: 10px; border: 1px solid #111827; background-color: #ffffff; page-break-inside: avoid;">
                <div style="background-color: #3b49df; color: #ffffff; padding: 5px 8px; font-weight: 800; font-size: 10.5px; display: flex; justify-content: space-between; align-items: center;">
                  <span>PAYMENT & ALLOCATION DETAILS</span>
                  <span style="font-size: 9.5px; letter-spacing: 0.5px; text-transform: uppercase;">STATUS: ${statusLabel}</span>
                </div>
                
                <div style="padding: 7px 9px;">
                  <!-- Dynamic Month-wise Payment Received breakdown -->
                  ${paymentBreakdownHtml}

                  <!-- Summary Allocation Breakdown Table -->
                  <table style="width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 10.5px; border-top: 1px solid #e5e7eb; padding-top: 4px;">
                    <tr>
                      <td style="padding: 2px 0; color: #374151;">Current Month Bill:</td>
                      <td style="padding: 2px 0; text-align: right; font-weight: 700; color: #111827;">₹ ${currentBillTotal.toLocaleString('en-IN')}</td>
                    </tr>
                    ${hasPrevDue ? `
                    <tr>
                      <td style="padding: 2px 0; color: #dc2626;">Previous Outstanding Due:</td>
                      <td style="padding: 2px 0; text-align: right; font-weight: 700; color: #dc2626;">₹ ${previousDue.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr style="font-weight: 800; border-top: 1px dashed #cbd5e1; border-bottom: 1px dashed #cbd5e1;">
                      <td style="padding: 3px 0; color: #111827;">Total Payable:</td>
                      <td style="padding: 3px 0; text-align: right; color: #111827;">₹ ${totalPayable.toLocaleString('en-IN')}</td>
                    </tr>
                    ` : ''}
                    <tr style="color: #059669; font-weight: 700;">
                      <td style="padding: 2px 0;">${dynamicPaymentReceivedHeading}:</td>
                      <td style="padding: 2px 0; text-align: right; font-weight: 800; color: #059669;">₹ ${totalReceived.toLocaleString('en-IN')}</td>
                    </tr>
                    ${hasPrevDue ? `
                    <tr style="color: #4b5563; font-size: 10px;">
                      <td style="padding: 1px 0 1px 12px;">• Previous Due Cleared:</td>
                      <td style="padding: 1px 0; text-align: right; font-weight: 700; color: #059669;">₹ ${previousDuePaid.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr style="color: #4b5563; font-size: 10px;">
                      <td style="padding: 1px 0 1px 12px;">• Amount Applied to Current Month's Bill:</td>
                      <td style="padding: 1px 0; text-align: right; font-weight: 700; color: #059669;">₹ ${currentBillPaid.toLocaleString('en-IN')}</td>
                    </tr>
                    ` : ''}
                    <tr style="font-weight: 800; font-size: 11px; border-top: 1px solid #111827; background-color: #eff6ff;">
                      <td style="padding: 4px 6px; color: #111827;">Remaining Amount Due:</td>
                      <td style="padding: 4px 6px; text-align: right; color: ${remainingAmountDue > 0 ? '#dc2626' : '#059669'}; font-size: 11.5px;">₹ ${remainingAmountDue.toLocaleString('en-IN')}</td>
                    </tr>
                  </table>
                </div>
              </div>
            `;
          })()}

          <!-- Notes Section -->
          <div class="notes-header">Notes</div>
          <div class="notes-body">
            Kindly clear the bill amount before the due date to avoid any late charges; late payment may attract additional charges as per agreement terms.<br>
            कृपया नियत तिथि से पहले बिल राशि का भुगतान कर दें, अन्यथा अनुबंध की शर्तों के अनुसार विलंब शुल्क 100 लागू हो सकता है।
          </div>

          <!-- Payment Scan Area -->
          <div class="payment-scan-container">
            <h3 class="payment-scan-title">Scan QR Code or copy UPI ID for payment</h3>
            ${upiId ? `
              <div class="qr-image-wrapper">
                ${qrBase64 ? `<img src="${qrBase64}" class="qr-image" />` : `<img src="${qrUrl}" class="qr-image" />`}
              </div>
              <div class="upi-id-bold">${upiId}</div>
            ` : `
              <div style="border:1px dashed #ccc; width:120px; height:120px; margin:0 auto 8px auto; display:flex; align-items:center; justify-content:center; font-size:10px; color:#aaa;">No UPI Configured</div>
            `}
            
            <!-- Brands Strip -->
            <div class="payment-logos-strip">
              <span class="brand-logo-text phonepe-brand">PhonePe</span>
              <span class="brand-logo-text paytm-brand">Paytm</span>
              <span class="brand-logo-text gpay-brand">G Pay</span>
              <span class="brand-logo-text bhim-brand">BHIM</span>
              <span class="brand-logo-text amazon-brand">amazon pay</span>
              <span class="brand-logo-text mobikwik-brand">MobiKwik</span>
              <span class="brand-logo-text freecharge-brand">freecharge</span>
            </div>
          </div>

          <!-- Signatory Footer Area -->
          <div class="signature-bottom-container">
            <div class="signature-inner-box">
              <p class="signature-label" style="font-size: 11px; font-weight: 800; color: #4b5563; margin: 0 0 4px 0; text-transform: uppercase;">Authorized By</p>
              <div style="font-size: 14px; font-weight: 800; text-transform: uppercase; color: #111827; height: 35px; display: flex; align-items: center; justify-content: center; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
                ${ownerName}
              </div>
              <div class="signature-line" style="border-top: 1px solid #111827; margin-top: 4px;"></div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      const filename = getBillPDFFilename(tenant?.name, bill.billNumber);
      const baseDir = (FileSystem.documentDirectory || FileSystem.cacheDirectory || '').replace(/\/?$/, '/');
      const targetUri = `${baseDir}${filename}`;

      try {
        const fileInfo = await FileSystem.getInfoAsync(targetUri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(targetUri, { idempotent: true });
        }
        await FileSystem.copyAsync({
          from: uri,
          to: targetUri,
        });
        return targetUri;
      } catch (fileErr) {
        console.warn('Could not copy PDF with custom filename, returning original uri:', fileErr);
        return uri;
      }
    } catch (e) {
      console.error('PDF Generation Error', e);
      throw new Error('Could not generate PDF bill. Please check printer configuration.');
    }
  },

  async generateSettlementPDF(
    settlement: Settlement,
    tenant: Tenant,
    property?: Property | null,
    settings?: BillSettings | null
  ): Promise<string> {
    const ownerName = settings?.ownerName || settings?.businessName || property?.name || 'Property Owner';
    const businessName = settings?.businessName || property?.name || 'Rentora Property Management';
    const phone = settings?.phone || '';
    const address = settings?.address || property?.address || '';

    // Convert local files to base64 for reliable rendering
    let localLogoBase64: string | null = null;
    let localSignatureBase64: string | null = null;

    if (settings?.logoUrl) {
      localLogoBase64 = await getBase64Image(settings.logoUrl);
    }
    if (settings?.signatureUrl) {
      localSignatureBase64 = await getBase64Image(settings.signatureUrl);
    }

    const netAmountFormatted = Math.abs(settlement.finalAmount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const isPayable = settlement.finalStatus === 'payable';
    const isRefundable = settlement.finalStatus === 'refundable';
    const isZero = settlement.finalStatus === 'zero_balance';

    const netStatusColor = isPayable ? '#DC2626' : isRefundable ? '#16A34A' : '#4B5563';
    const netStatusBadge = isPayable
      ? 'AMOUNT PAYABLE BY TENANT'
      : isRefundable
      ? 'AMOUNT REFUNDABLE TO TENANT'
      : 'FULLY SETTLED (ZERO BALANCE)';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Settlement Statement - ${settlement.settlementNumber}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #111827;
            margin: 0;
            padding: 24px;
            background: #ffffff;
            font-size: 13px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #E5E7EB;
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          .brand-title {
            font-size: 22px;
            font-weight: 800;
            color: #111827;
            margin: 0 0 4px 0;
          }
          .brand-sub {
            font-size: 12px;
            color: #6B7280;
            margin: 0;
          }
          .settlement-badge {
            background: #F3F4F6;
            border: 1px solid #D1D5DB;
            border-radius: 8px;
            padding: 10px 16px;
            text-align: right;
          }
          .settlement-id {
            font-size: 16px;
            font-weight: 800;
            color: #1E3A8A;
            margin: 0;
          }
          .settlement-date {
            font-size: 11px;
            color: #6B7280;
            margin: 2px 0 0 0;
          }
          .section-title {
            font-size: 14px;
            font-weight: 700;
            color: #1F2937;
            border-bottom: 1px solid #E5E7EB;
            padding-bottom: 6px;
            margin: 18px 0 10px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .grid-2 {
            display: flex;
            gap: 16px;
            margin-bottom: 16px;
          }
          .info-card {
            flex: 1;
            background: #F9FAFB;
            border: 1px solid #E5E7EB;
            border-radius: 6px;
            padding: 12px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
          }
          .info-label {
            color: #6B7280;
            font-size: 12px;
          }
          .info-val {
            font-weight: 600;
            color: #111827;
            font-size: 12px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
          }
          th {
            background: #F3F4F6;
            color: #374151;
            font-weight: 700;
            font-size: 11px;
            text-transform: uppercase;
            padding: 8px 10px;
            text-align: left;
            border: 1px solid #E5E7EB;
          }
          td {
            padding: 8px 10px;
            border: 1px solid #E5E7EB;
            font-size: 12px;
          }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .bold { font-weight: 700; }
          .net-box {
            background: #F9FAFB;
            border: 2px solid ${netStatusColor};
            border-radius: 8px;
            padding: 16px;
            margin: 20px 0;
            text-align: center;
          }
          .net-badge-title {
            font-size: 13px;
            font-weight: 700;
            color: ${netStatusColor};
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 6px;
          }
          .net-amount {
            font-size: 28px;
            font-weight: 800;
            color: ${netStatusColor};
          }
          .footer-signs {
            display: flex;
            justify-content: space-between;
            margin-top: 40px;
            padding-top: 10px;
          }
          .sign-box {
            width: 200px;
            text-align: center;
          }
          .sign-line {
            border-top: 1px solid #9CA3AF;
            margin-top: 40px;
            padding-top: 6px;
            font-size: 11px;
            color: #6B7280;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            ${localLogoBase64 ? `<img src="${localLogoBase64}" style="height: 48px; max-width: 160px; object-fit: contain; margin-bottom: 6px;" />` : ''}
            <h1 class="brand-title">${businessName}</h1>
            ${phone ? `<p class="brand-sub">Phone: ${phone}</p>` : ''}
            ${address ? `<p class="brand-sub">${address}</p>` : ''}
          </div>
          <div class="settlement-badge">
            <p style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #6B7280; margin: 0;">Final Settlement</p>
            <p class="settlement-id">${settlement.settlementNumber}</p>
            <p class="settlement-date">Date: ${formatBillDate(settlement.settlementDate)}</p>
          </div>
        </div>

        <div class="grid-2">
          <div class="info-card">
            <div style="font-size: 11px; font-weight: 700; color: #4B5563; text-transform: uppercase; margin-bottom: 8px;">Tenant Profile</div>
            <div class="info-row"><span class="info-label">Tenant Name:</span><span class="info-val">${settlement.tenantName}</span></div>
            <div class="info-row"><span class="info-label">Mobile:</span><span class="info-val">${tenant.mobile || '-'}</span></div>
            <div class="info-row"><span class="info-label">Assigned Room:</span><span class="info-val">${settlement.unitNumber ? 'Unit ' + settlement.unitNumber : '-'}</span></div>
            <div class="info-row"><span class="info-label">Property:</span><span class="info-val">${settlement.propertyName || property?.name || '-'}</span></div>
          </div>
          <div class="info-card">
            <div style="font-size: 11px; font-weight: 700; color: #4B5563; text-transform: uppercase; margin-bottom: 8px;">Stay & Period Information</div>
            <div class="info-row"><span class="info-label">Move-in Date:</span><span class="info-val">${formatBillDate(settlement.moveInDate)}</span></div>
            <div class="info-row"><span class="info-label">Normal Paid Through:</span><span class="info-val">${formatBillDate(settlement.normalPeriodEndDate)}</span></div>
            <div class="info-row"><span class="info-label">Actual Move-out Date:</span><span class="info-val bold" style="color: #DC2626;">${formatBillDate(settlement.moveOutDate)}</span></div>
            <div class="info-row"><span class="info-label">Eligible Extra Days:</span><span class="info-val bold">${settlement.eligibleExtraDays} Day(s)</span></div>
          </div>
        </div>

        <div class="section-title">Final Charges Breakdown</div>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th class="text-center">Rate / Basis</th>
              <th class="text-center">Units / Days</th>
              <th class="text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span class="bold">Extra-Stay Rent</span><br>
                <small style="color: #6B7280;">Policy: ${settlement.extraStayPolicy === 'fixed30' ? 'Fixed 30-day basis' : 'Actual billing-period days'}</small>
              </td>
              <td class="text-center">₹${settlement.dailyRateBasis.toFixed(2)} / day</td>
              <td class="text-center">${settlement.eligibleExtraDays} day(s)</td>
              <td class="text-right bold">₹${settlement.extraStayAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td>
                <span class="bold">Final Electricity Charge</span><br>
                <small style="color: #6B7280;">${settlement.electricityBillType === 'perUnit' ? `Readings: ${settlement.previousMeterReading} → ${settlement.finalMeterReading}` : settlement.electricityBillType === 'fixed' ? 'Fixed charge mode' : 'Included in rent / None'}</small>
              </td>
              <td class="text-center">${settlement.electricityBillType === 'perUnit' ? `₹${settlement.electricityRate}/unit` : '-'}</td>
              <td class="text-center">${settlement.electricityUnits} unit(s)</td>
              <td class="text-right bold">₹${settlement.electricityCharge.toFixed(2)}</td>
            </tr>
            <tr>
              <td>
                <span class="bold">Previous Outstanding Bills & Arrears</span><br>
                <small style="color: #6B7280;">Carried forward from historical unpaid statements</small>
              </td>
              <td class="text-center">-</td>
              <td class="text-center">-</td>
              <td class="text-right bold">₹${settlement.outstandingBillsBalance.toFixed(2)}</td>
            </tr>
            ${settlement.otherCharges > 0 ? `
            <tr>
              <td>
                <span class="bold">Other Charges / Deductions</span><br>
                <small style="color: #6B7280;">${settlement.otherChargesNotes || 'Miscellaneous charges'}</small>
              </td>
              <td class="text-center">-</td>
              <td class="text-center">-</td>
              <td class="text-right bold">₹${settlement.otherCharges.toFixed(2)}</td>
            </tr>
            ` : ''}
            <tr style="background: #F9FAFB;">
              <td colspan="3" class="bold text-right" style="font-size: 13px;">Total Charges Payable:</td>
              <td class="text-right bold" style="font-size: 13px; color: #111827;">₹${settlement.totalCharges.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div class="section-title">Advance Rent & Security Deposit Adjustments</div>
        <table>
          <thead>
            <tr>
              <th>Deposit / Fund Category</th>
              <th class="text-right">Original Balance</th>
              <th class="text-right">Adjusted Against Dues</th>
              <th class="text-right">Refunded Amount</th>
              <th class="text-right">Remaining Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="bold">Advance Rent</td>
              <td class="text-right">₹${settlement.advanceRentOriginal.toFixed(2)}</td>
              <td class="text-right bold" style="color: #16A34A;">(-) ₹${settlement.advanceRentAdjusted.toFixed(2)}</td>
              <td class="text-right">₹${settlement.advanceRentRefunded.toFixed(2)}</td>
              <td class="text-right">₹${settlement.advanceRentRemaining.toFixed(2)}</td>
            </tr>
            <tr>
              <td class="bold">Security Deposit</td>
              <td class="text-right">₹${settlement.securityDepositOriginal.toFixed(2)}</td>
              <td class="text-right bold" style="color: #16A34A;">(-) ₹${settlement.securityDepositAdjusted.toFixed(2)}</td>
              <td class="text-right">₹${settlement.securityDepositRefunded.toFixed(2)}</td>
              <td class="text-right">₹${settlement.securityDepositRemaining.toFixed(2)}</td>
            </tr>
            <tr style="background: #F9FAFB;">
              <td colspan="2" class="bold text-right">Total Applied Adjustments:</td>
              <td class="text-right bold" style="color: #16A34A;">(-) ₹${(settlement.advanceRentAdjusted + settlement.securityDepositAdjusted).toFixed(2)}</td>
              <td colspan="2"></td>
            </tr>
          </tbody>
        </table>

        <div class="net-box">
          <div class="net-badge-title">${netStatusBadge}</div>
          <div class="net-amount">₹${netAmountFormatted}</div>
        </div>

        ${settlement.notes ? `
        <div style="background: #F3F4F6; border-radius: 6px; padding: 10px; margin-bottom: 20px;">
          <div style="font-size: 11px; font-weight: 700; color: #4B5563; text-transform: uppercase; margin-bottom: 4px;">Settlement Notes</div>
          <div style="font-size: 12px; color: #1F2937;">${settlement.notes}</div>
        </div>
        ` : ''}

        <div class="footer-signs">
          <div class="sign-box">
            ${localSignatureBase64 ? `<img src="${localSignatureBase64}" style="height: 36px; max-width: 140px; object-fit: contain; margin-bottom: 4px;" />` : `<div style="height: 36px;"></div>`}
            <div class="sign-line">Authorized Signatory (${ownerName})</div>
          </div>
          <div class="sign-box">
            <div style="height: 36px;"></div>
            <div class="sign-line">Tenant Signature (${settlement.tenantName})</div>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      const safeTenant = sanitizeForFilename(settlement.tenantName || 'Tenant');
      const filename = `Rentora_Settlement_${safeTenant}_${settlement.settlementNumber}.pdf`;
      const baseDir = (FileSystem.documentDirectory || FileSystem.cacheDirectory || '').replace(/\/?$/, '/');
      const targetUri = `${baseDir}${filename}`;

      try {
        const fileInfo = await FileSystem.getInfoAsync(targetUri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(targetUri, { idempotent: true });
        }
        await FileSystem.copyAsync({
          from: uri,
          to: targetUri,
        });
        return targetUri;
      } catch (fileErr) {
        console.warn('Could not copy settlement PDF with custom filename, returning original uri:', fileErr);
        return uri;
      }
    } catch (e) {
      console.error('Settlement PDF Generation Error', e);
      throw new Error('Could not generate Settlement PDF. Please check printer configuration.');
    }
  }
};
export default pdfService;
