import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { Bill, Tenant, Property, Unit, BillSettings } from '../types';
import { formatBillDate, formatShortBillDate, parseDateSafely } from '../utils/date';
import { rentoraLogoBase64 } from './logoData';

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

export const pdfService = {
  async generateBillPDF(
    bill: Bill,
    tenant: Tenant,
    property: Property,
    unit: Unit,
    settings: BillSettings | null
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
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
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

    // Generate QR code URL
    const qrUrl = upiId
      ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent('upi://pay?pa=' + upiId + '&pn=' + encodeURIComponent(ownerName) + '&am=' + (bill.remainingAmount > 0 ? bill.remainingAmount : bill.totalAmount) + '&cu=INR')}`
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
                  <span class="tenant-grid-value" style="color: ${bill.paymentStatus === 'paid' ? '#059669' : bill.paymentStatus === 'partial' ? '#d97706' : '#dc2626'}; text-transform: uppercase;">
                    ${bill.paymentStatus.toUpperCase()}
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
                const hasPrevDue = bill.previousDue > 0;
                const hasPaid = bill.paidAmount > 0;

                let html = '';

                if (hasPrevDue) {
                  html += `
                    <tr class="charges-tr" style="font-weight: 700;">
                      <td colspan="7">Current Bill Total</td>
                      <td class="right-text">₹ ${bill.subtotal}</td>
                    </tr>
                    <tr class="charges-tr" style="color: #dc2626; font-weight: 700;">
                      <td colspan="7">Previous Due</td>
                      <td class="right-text">₹ ${bill.previousDue}</td>
                    </tr>
                  `;

                  if (hasPaid) {
                    html += `
                      <tr class="charges-tr" style="font-weight: 800; background-color: #f9fafb;">
                        <td colspan="7">Total Payable</td>
                        <td class="right-text">₹ ${bill.totalAmount}</td>
                      </tr>
                      <tr class="charges-tr" style="color: #059669; font-weight: 700;">
                        <td colspan="7">Paid Amount</td>
                        <td class="right-text">₹ ${bill.paidAmount}</td>
                      </tr>
                      ${
                        bill.previousDue > 0
                          ? `<tr class="charges-tr" style="color: #4b5563; font-size: 9.5px;">
                              <td colspan="7" style="padding-left: 20px;">• Previous Due Paid</td>
                              <td class="right-text">₹ ${bill.previousDuePaid !== undefined ? bill.previousDuePaid : Math.min(bill.previousDue, bill.paidAmount)}</td>
                            </tr>
                            <tr class="charges-tr" style="color: #4b5563; font-size: 9.5px;">
                              <td colspan="7" style="padding-left: 20px;">• Current Month Paid</td>
                              <td class="right-text">₹ ${bill.currentBillPaid !== undefined ? bill.currentBillPaid : Math.min(bill.subtotal || 0, Math.max(0, bill.paidAmount - (bill.previousDuePaid !== undefined ? bill.previousDuePaid : Math.min(bill.previousDue, bill.paidAmount))))}</td>
                            </tr>`
                          : ''
                      }
                      <tr class="total-amount-row">
                        <td colspan="7">Remaining Due</td>
                        <td class="right-text">₹ ${bill.remainingAmount}</td>
                      </tr>
                    `;
                  } else {
                    html += `
                      <tr class="total-amount-row">
                        <td colspan="7">Total Payable</td>
                        <td class="right-text">₹ ${bill.totalAmount}</td>
                      </tr>
                    `;
                  }
                } else {
                  if (hasPaid) {
                    html += `
                      <tr class="charges-tr" style="font-weight: 800; background-color: #f9fafb;">
                        <td colspan="7">Total Amount</td>
                        <td class="right-text">₹ ${bill.totalAmount}</td>
                      </tr>
                      <tr class="charges-tr" style="color: #059669; font-weight: 700;">
                        <td colspan="7">Paid Amount</td>
                        <td class="right-text">₹ ${bill.paidAmount}</td>
                      </tr>
                      <tr class="total-amount-row">
                        <td colspan="7">Remaining Due</td>
                        <td class="right-text">₹ ${bill.remainingAmount}</td>
                      </tr>
                    `;
                  } else {
                    html += `
                      <tr class="total-amount-row">
                        <td colspan="7">Total Amount</td>
                        <td class="right-text">₹ ${bill.totalAmount}</td>
                      </tr>
                    `;
                  }
                }

                return html;
              })()}
            </tbody>
          </table>

          <!-- Notes Section -->
          <div class="notes-header">Notes</div>
          <div class="notes-body">
            Kindly clear the bill amount before the due date to avoid any late charges; late payment may attract additional charges as per agreement terms.<br>
            कृपया नियत तिथि से पहले बिल राशि का भुगतान कर दें, अन्यथा अनुबंध की शर्तों के अनुसार विलंब शुल्क लागू हो सकता है।
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
      return uri;
    } catch (e) {
      console.error('PDF Generation Error', e);
      throw new Error('Could not generate PDF bill. Please check printer configuration.');
    }
  }
};
export default pdfService;
