import * as Print from 'expo-print';
import { Bill, BillSettings } from '../types';
import { calculateBillAllocation } from '../utils/billingAllocation';

export const formatCurrency = (amount: number = 0): string => {
  return `₹${amount.toLocaleString('en-IN')}`;
};

export const formatMonthDisplay = (monthStr: string): string => {
  if (!monthStr) return '';
  try {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } catch (e) {
    return monthStr;
  }
};

export const pdfService = {
  async viewBillPDF(params: {
    bill: Bill;
    tenantName: string;
    tenantPhone?: string;
    propertyName?: string;
    propertyAddress?: string;
    unitNumber?: string;
    settings?: BillSettings | null;
  }): Promise<void> {
    const { bill, tenantName, tenantPhone, propertyName, propertyAddress, unitNumber, settings } = params;

    const allocation = calculateBillAllocation(bill);

    const ownerName = settings?.ownerName || settings?.businessName || propertyName || 'Property Owner';
    const businessName = settings?.businessName || propertyName || 'RENTAL PROPERTY';
    const address = settings?.address || propertyAddress || '';
    const upiId = settings?.upiId || '';

    const formattedBillingMonth = formatMonthDisplay(bill.billingMonth);
    const formattedDueDate = bill.dueDate || 'N/A';
    const formattedCreatedDate = bill.createdAt ? bill.createdAt.split('T')[0] : 'N/A';

    const qrUrl = upiId
      ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
          `upi://pay?pa=${upiId}&pn=${encodeURIComponent(ownerName)}&am=${
            allocation.totalOutstanding > 0 ? allocation.totalOutstanding : allocation.totalPayable
          }&cu=INR`
        )}`
      : '';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Rent Bill - ${bill.billNumber}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1f2937;
            margin: 0;
            padding: 10px;
            font-size: 11px;
            line-height: 15px;
            background-color: #fff;
            -webkit-print-color-adjust: exact;
          }
          .invoice-wrapper { max-width: 800px; margin: auto; background: #ffffff; }
          .business-title { font-size: 24px; font-weight: 800; color: #4F46E5; margin: 0; text-transform: uppercase; text-align: center; }
          .business-address { font-size: 11px; color: #6B7280; margin: 3px 0 0 0; text-align: center; }
          .doc-title-block { text-align: center; margin-top: 15px; margin-bottom: 15px; }
          .doc-title { font-size: 15px; font-weight: 800; color: #111827; margin: 0; text-transform: uppercase; }
          .doc-subtitle { font-size: 11px; color: #6B7280; font-weight: 700; margin: 3px 0 0 0; }
          .purple-line { height: 2px; background-color: #4F46E5; width: 100%; margin-bottom: 8px; }
          .due-date-row { text-align: right; margin-bottom: 8px; }
          .due-date-text { font-size: 11px; font-weight: 800; color: #DC2626; margin: 0; }
          .tenant-details-box { border: 1px solid #9CA3AF; border-radius: 6px; padding: 10px 15px; margin-bottom: 12px; }
          .tenant-grid-table { width: 100%; border-collapse: collapse; }
          .tenant-grid-td { padding: 4px 0; font-size: 11px; color: #1F2937; }
          .tenant-grid-label { font-weight: 500; color: #4B5563; }
          .tenant-grid-value { font-weight: 700; color: #111827; }
          .main-charges-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; border: 1px solid #111827; }
          .main-charges-table th { background: #4F46E5; color: #ffffff; font-size: 10.5px; font-weight: 800; padding: 6px 8px; border: 1px solid #111827; }
          .main-charges-table td { border: 1px solid #111827; padding: 7px 8px; font-size: 11px; color: #111827; }
          .center-text { text-align: center; }
          .right-text { text-align: right; }
          .total-amount-row { background-color: #EEF2FF; font-weight: 800; }
          .notes-header { font-size: 11.5px; font-weight: 800; color: #1F2937; margin: 10px 0 3px 0; }
          .notes-body { font-size: 10.5px; color: #4B5563; margin-bottom: 15px; line-height: 14px; }
          .payment-scan-container { text-align: center; margin-top: 15px; margin-bottom: 15px; }
          .payment-scan-title { font-size: 13px; font-weight: 800; color: #4F46E5; margin: 0 0 10px 0; }
          .qr-image { width: 120px; height: 120px; }
          .upi-id-bold { font-size: 16px; font-weight: 800; color: #374151; margin: 8px 0; }
          .signature-bottom-container { display: flex; justify-content: flex-end; margin-top: 20px; }
          .signature-inner-box { text-align: center; width: 160px; }
          .signature-label { font-size: 11px; font-weight: 800; color: #4B5563; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="invoice-wrapper">
          <!-- Rentora Official App Branding Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #6366F1; padding-bottom: 8px; margin-bottom: 14px;">
            <div style="display: flex; align-items: center;">
              <span style="background-color: #6366F1; color: #ffffff; font-weight: 900; font-size: 15px; padding: 3px 8px; border-radius: 6px; margin-right: 8px;">R</span>
              <span style="font-size: 18px; font-weight: 800; color: #6366F1; letter-spacing: 0.5px;">RENTORA</span>
              <span style="font-size: 10px; color: #6B7280; font-weight: 600; margin-left: 8px;">• Official Statement</span>
            </div>
            <div style="font-size: 9.5px; color: #6B7280; font-weight: 700; text-transform: uppercase;">Generated via Rentora Platform</div>
          </div>

          <h1 class="business-title">${businessName}</h1>
          <p class="business-address">${address}</p>

          <div class="doc-title-block">
            <h2 class="doc-title">RENT SUMMARY INVOICE</h2>
            <p class="doc-subtitle">Billing Month: ${formattedBillingMonth}</p>
          </div>

          <div class="purple-line"></div>

          <div class="due-date-row">
            <p class="due-date-text">Due Date: ${formattedDueDate}</p>
          </div>

          <div class="tenant-details-box">
            <table class="tenant-grid-table">
              <tr>
                <td class="tenant-grid-td" style="width: 50%;">
                  <span class="tenant-grid-label">Flat / Unit No. :</span>
                  <span class="tenant-grid-value">${unitNumber || 'N/A'}</span>
                </td>
                <td class="tenant-grid-td" style="width: 50%;">
                  <span class="tenant-grid-label">Bill Number :</span>
                  <span class="tenant-grid-value">${bill.billNumber}</span>
                </td>
              </tr>
              <tr>
                <td class="tenant-grid-td" style="width: 50%;">
                  <span class="tenant-grid-label">Tenant Name :</span>
                  <span class="tenant-grid-value">${tenantName}</span>
                </td>
                <td class="tenant-grid-td" style="width: 50%;">
                  <span class="tenant-grid-label">Issue Date :</span>
                  <span class="tenant-grid-value">${formattedCreatedDate}</span>
                </td>
              </tr>
              <tr>
                <td class="tenant-grid-td" style="width: 50%;">
                  <span class="tenant-grid-label">Mobile No. :</span>
                  <span class="tenant-grid-value">${tenantPhone || 'N/A'}</span>
                </td>
                <td class="tenant-grid-td" style="width: 50%;">
                  <span class="tenant-grid-label">Status :</span>
                  <span class="tenant-grid-value" style="color: ${
                    allocation.paymentStatus === 'paid' ? '#059669' : allocation.paymentStatus === 'partial' ? '#D97706' : '#DC2626'
                  }; text-transform: uppercase;">
                    ${allocation.paymentStatus.toUpperCase()}
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <table class="main-charges-table">
            <thead>
              <tr>
                <th>Charge Description</th>
                <th style="width: 25%; text-align: right;">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Monthly Rent</td>
                <td class="right-text">${bill.rent}</td>
              </tr>
              ${
                bill.electricityCharge > 0 || bill.electricityBillType !== 'none'
                  ? `<tr>
                      <td>Electricity Charges ${
                        bill.electricityBillType === 'perUnit'
                          ? `(${bill.electricityUnits} units @ ₹${bill.electricityRate}/unit)`
                          : bill.electricityBillType === 'fixed'
                          ? '(Fixed)'
                          : '(Included in Rent)'
                      }</td>
                      <td class="right-text">${bill.electricityCharge}</td>
                    </tr>`
                  : ''
              }
              ${
                bill.waterCharge > 0
                  ? `<tr>
                      <td>Water Charges</td>
                      <td class="right-text">${bill.waterCharge}</td>
                    </tr>`
                  : ''
              }
              ${
                bill.maintenanceCharge > 0
                  ? `<tr>
                      <td>Maintenance Charges</td>
                      <td class="right-text">${bill.maintenanceCharge}</td>
                    </tr>`
                  : ''
              }
              ${
                bill.parkingCharge > 0
                  ? `<tr>
                      <td>Parking Charges</td>
                      <td class="right-text">${bill.parkingCharge}</td>
                    </tr>`
                  : ''
              }
              ${
                bill.otherCharges > 0
                  ? `<tr>
                      <td>Other Charges</td>
                      <td class="right-text">${bill.otherCharges}</td>
                    </tr>`
                  : ''
              }
              <tr style="font-weight: 700; background-color: #F9FAFB;">
                <td>Current Month Subtotal</td>
                <td class="right-text">₹${allocation.subtotal.toLocaleString('en-IN')}</td>
              </tr>
              ${
                allocation.previousDue > 0
                  ? `<tr style="color: #DC2626; font-weight: 700;">
                      <td>Previous Arrears / Due</td>
                      <td class="right-text">₹${allocation.previousDue.toLocaleString('en-IN')}</td>
                    </tr>`
                  : ''
              }
              <tr class="total-amount-row">
                <td>Total Payable Amount</td>
                <td class="right-text">₹${allocation.totalPayable.toLocaleString('en-IN')}</td>
              </tr>
              ${
                allocation.totalApprovedPaid > 0
                  ? `<tr style="color: #059669; font-weight: 700;">
                      <td>Amount Paid</td>
                      <td class="right-text">₹${allocation.totalApprovedPaid.toLocaleString('en-IN')}</td>
                    </tr>
                    ${
                      allocation.previousDue > 0
                        ? `<tr style="color: #4B5563; font-size: 10px;">
                            <td style="padding-left: 20px;">• Previous Due Paid</td>
                            <td class="right-text">₹${allocation.previousDuePaid.toLocaleString('en-IN')}</td>
                          </tr>
                          <tr style="color: #4B5563; font-size: 10px;">
                            <td style="padding-left: 20px;">• Current Month Paid</td>
                            <td class="right-text">₹${allocation.currentBillPaid.toLocaleString('en-IN')}</td>
                          </tr>`
                        : ''
                    }`
                  : ''
              }
              <tr style="font-weight: 800; font-size: 12px; background-color: #EEF2FF;">
                <td>Remaining Balance Due</td>
                <td class="right-text" style="color: ${allocation.totalOutstanding > 0 ? '#DC2626' : '#059669'};">
                  ₹${allocation.totalOutstanding.toLocaleString('en-IN')}
                </td>
              </tr>
            </tbody>
          </table>

          <div class="notes-header">Terms & Notes</div>
          <div class="notes-body">
            ${bill.notes ? `${bill.notes}<br>` : ''}
            Please ensure payment is completed by the due date (${formattedDueDate}).
          </div>

          ${
            qrUrl
              ? `<div class="payment-scan-container">
                  <h3 class="payment-scan-title">UPI Payment Details</h3>
                  <img src="${qrUrl}" class="qr-image" />
                  <div class="upi-id-bold">${upiId}</div>
                </div>`
              : ''
          }

          <div class="signature-bottom-container">
            <div class="signature-inner-box">
              <p class="signature-label">Authorized By</p>
              <div style="font-size: 14px; font-weight: 800; text-transform: uppercase; margin-top: 10px;">
                ${ownerName}
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await Print.printAsync({ html: htmlContent });
    } catch (e: any) {
      console.error('PDF print/view error:', e);
      throw new Error('Could not open PDF viewer. Please try again.');
    }
  },
};

export default pdfService;
