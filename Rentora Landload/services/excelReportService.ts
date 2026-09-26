import db from '../utils/db';
import { Property, Unit, Tenant, Bill, Payment } from '../types';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { decorateBills } from './billService';

export const excelReportService = {
  async generateReport(ownerId: string, propertyId: string, monthStr: string, monthLabel: string): Promise<string> {
    // 1. Fetch all data from local database wrapper
    const properties = await db.getDocs<Property>('properties');
    const units = await db.getDocs<Unit>('units');
    const tenants = await db.getDocs<Tenant>('tenants');
    const rawBills = await db.getDocs<Bill>('bills');
    const payments = await db.getDocs<Payment>('payments');

    // Group rawBills by tenantId to decorate them chronologically
    const billsByTenant: Record<string, Bill[]> = {};
    rawBills.forEach(b => {
      if (!billsByTenant[b.tenantId]) {
        billsByTenant[b.tenantId] = [];
      }
      billsByTenant[b.tenantId].push(b);
    });
    
    const bills: Bill[] = [];
    Object.keys(billsByTenant).forEach(tId => {
      bills.push(...decorateBills(billsByTenant[tId]));
    });

    // 2. Filter properties
    const selectedProperties = propertyId === 'all' 
      ? properties 
      : properties.filter(p => p.id === propertyId);

    const propIds = selectedProperties.map(p => p.id);

    const selectedPropertyNames = propertyId === 'all'
      ? 'All Properties'
      : (properties.find(p => p.id === propertyId)?.name || 'Property');

    // 3. Filter units
    const filteredUnits = units.filter(u => propIds.includes(u.propertyId));

    // 4. Filter bills
    const filteredBills = bills.filter(b => b.billingMonth === monthStr && propIds.includes(b.propertyId));

    // 5. Filter tenants (active or vacated in this month)
    const startOfMonth = `${monthStr}-01`;
    const endOfMonth = `${monthStr}-31`; // safe lexicographical comparison

    const filteredTenants = tenants.filter(t => {
      if (!propIds.includes(t.propertyId)) return false;
      const moveIn = t.moveInDate || '';
      const moveOut = t.moveOutDate || '';
      return moveIn <= endOfMonth && (t.status === 'active' || !moveOut || moveOut >= startOfMonth);
    });

    // 6. Filter payments
    const filteredPayments = payments.filter(p => {
      const bill = bills.find(b => b.id === p.billId);
      if (!bill) return false;
      return p.paymentDate.startsWith(monthStr) && propIds.includes(bill.propertyId);
    });

    // Helper functions for cell types
    const currencyCell = (v: number) => ({ v, t: 'n', z: '"₹"#,##,##0' });
    const percentCell = (v: number) => ({ v: v / 100, t: 'n', z: '0%' });
    const numCell = (v: number) => ({ v, t: 'n' });
    const strCell = (v: string) => ({ v, t: 's' });
    const dateCell = (dStr?: string | null) => ({ v: formatExcelDate(dStr), t: 's' });

    // Formatting date helper
    function formatExcelDate(dateStr?: string | null): string {
      if (!dateStr) return '-';
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const day = String(date.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
    }

    // Proportional Payment Allocation Helper
    const allocatePayment = (payment: Payment) => {
      const bill = bills.find(b => b.id === payment.billId);
      if (!bill) {
        return {
          rent: payment.amount,
          electricity: 0,
          water: 0,
          parking: 0,
          maintenance: 0,
          other: 0,
          previousDue: 0
        };
      }
      const ratio = bill.totalAmount > 0 ? (payment.amount / bill.totalAmount) : 0;
      return {
        rent: (bill.rent || 0) * ratio,
        electricity: (bill.electricityCharge || 0) * ratio,
        water: (bill.waterCharge || 0) * ratio,
        parking: (bill.parkingCharge || 0) * ratio,
        maintenance: (bill.maintenanceCharge || 0) * ratio,
        other: (bill.otherCharges || 0) * ratio,
        previousDue: (bill.previousDue || 0) * ratio
      };
    };

    // --- 1. Summary Sheet ---
    const expectedRent = filteredBills.reduce((sum, b) => sum + (b.rent || 0), 0);
    const rentCollected = filteredBills.reduce((sum, b) => sum + (b.paidAmount * ((b.rent || 0) / (b.totalAmount || 1))), 0);
    const rentOutstanding = filteredBills.reduce((sum, b) => sum + (b.remainingAmount * ((b.rent || 0) / (b.totalAmount || 1))), 0);

    const totalCollected = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalOutstanding = filteredBills.reduce((sum, b) => sum + (b.remainingAmount || 0), 0);

    const newTenantsCount = filteredTenants.filter(t => t.moveInDate && t.moveInDate.startsWith(monthStr)).length;
    const vacatedTenantsCount = filteredTenants.filter(t => t.status === 'vacated' && t.moveOutDate && t.moveOutDate.startsWith(monthStr)).length;

    const totalRooms = propertyId === 'all' 
      ? properties.reduce((sum, p) => sum + (p.totalUnits || 0), 0)
      : (properties.find(p => p.id === propertyId)?.totalUnits || filteredUnits.length);

    const occupiedRooms = filteredUnits.filter(u => u.status === 'occupied').length;
    const vacantRooms = Math.max(0, totalRooms - occupiedRooms);

    const occupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;
    const vacancyRate = totalRooms > 0 ? (vacantRooms / totalRooms) * 100 : 0;

    const paidBillsCount = filteredBills.filter(b => b.paymentStatus === 'paid').length;
    const partialBillsCount = filteredBills.filter(b => b.paymentStatus === 'partial').length;
    const unpaidBillsCount = filteredBills.filter(b => b.paymentStatus === 'unpaid').length;

    const summaryRows: any[][] = [
      [strCell('RENTORA — MONTHLY PROPERTY REPORT'), strCell('')],
      [],
      [strCell('Property:'), strCell(selectedPropertyNames)],
      [strCell('Report Month:'), strCell(monthLabel)],
      [strCell('Report Generated Date:'), strCell(formatExcelDate(new Date().toISOString().split('T')[0]))],
      [],
      [strCell('OVERALL SUMMARY'), strCell('')],
      [strCell('Expected Rent:'), currencyCell(expectedRent)],
      [strCell('Collected:'), currencyCell(totalCollected)],
      [strCell('Outstanding:'), currencyCell(totalOutstanding)],
      [strCell('New Tenants:'), numCell(newTenantsCount)],
      [strCell('Vacated Tenants:'), numCell(vacatedTenantsCount)],
      [strCell('Occupied Rooms:'), strCell(`${occupiedRooms} / ${totalRooms}`)],
      [strCell('Vacant Rooms:'), strCell(`${vacantRooms} / ${totalRooms}`)],
      [strCell('Occupancy:'), percentCell(occupancyRate)],
      [strCell('Vacancy:'), percentCell(vacancyRate)],
      [],
      [strCell('RENT DETAILS'), strCell('')],
      [strCell('Total Expected Rent:'), currencyCell(expectedRent)],
      [strCell('Total Rent Received:'), currencyCell(rentCollected)],
      [strCell('Total Rent Due:'), currencyCell(rentOutstanding)],
      [strCell('Previous Due:'), currencyCell(filteredBills.reduce((sum, b) => sum + (b.previousDue || 0), 0))],
      [strCell('Current Month Due:'), currencyCell(totalOutstanding)],
      [strCell('Total Amount Collected:'), currencyCell(totalCollected)],
      [strCell('Total Outstanding:'), currencyCell(totalOutstanding)],
      [],
      [strCell('BILL STATUS SUMMARY'), strCell('')],
      [strCell('Paid Bills:'), numCell(paidBillsCount)],
      [strCell('Partially Paid Bills:'), numCell(partialBillsCount)],
      [strCell('Unpaid Bills:'), numCell(unpaidBillsCount)],
    ];

    summaryRows.push([], [strCell('PROPERTY SUMMARY DETAILS'), strCell('')]);
    
    if (propertyId === 'all') {
      summaryRows.push(
        [strCell('Property Name'), strCell('Type'), strCell('Address'), strCell('Total Units'), strCell('Occupied'), strCell('Vacant'), strCell('Active Tenants'), strCell('Vacated')]
      );
      selectedProperties.forEach(p => {
        const pUnits = units.filter(u => u.propertyId === p.id);
        const pTotal = p.totalUnits || pUnits.length;
        const pOccupied = pUnits.filter(u => u.status === 'occupied').length;
        const pVacant = Math.max(0, pTotal - pOccupied);
        const pActiveTenants = tenants.filter(t => t.propertyId === p.id && t.status === 'active').length;
        const pVacatedTenants = tenants.filter(t => t.propertyId === p.id && t.status === 'vacated' && t.moveOutDate && t.moveOutDate.startsWith(monthStr)).length;
        
        summaryRows.push([
          strCell(p.name),
          strCell(p.type),
          strCell(p.address),
          numCell(pTotal),
          numCell(pOccupied),
          numCell(pVacant),
          numCell(pActiveTenants),
          numCell(pVacatedTenants)
        ]);
      });
    } else {
      const p = selectedProperties[0];
      if (p) {
        const pUnits = units.filter(u => u.propertyId === p.id);
        const pTotal = p.totalUnits || pUnits.length;
        const pOccupied = pUnits.filter(u => u.status === 'occupied').length;
        const pVacant = Math.max(0, pTotal - pOccupied);
        const pActiveTenants = tenants.filter(t => t.propertyId === p.id && t.status === 'active').length;
        const pVacatedTenants = tenants.filter(t => t.propertyId === p.id && t.status === 'vacated' && t.moveOutDate && t.moveOutDate.startsWith(monthStr)).length;

        summaryRows.push([strCell('Property Name:'), strCell(p.name)]);
        summaryRows.push([strCell('Property Type:'), strCell(p.type)]);
        summaryRows.push([strCell('Property Address:'), strCell(p.address)]);
        summaryRows.push([strCell('Total Rooms/Units:'), numCell(pTotal)]);
        summaryRows.push([strCell('Occupied Rooms:'), numCell(pOccupied)]);
        summaryRows.push([strCell('Vacant Rooms:'), numCell(pVacant)]);
        summaryRows.push([strCell('Active Tenants:'), numCell(pActiveTenants)]);
        summaryRows.push([strCell('Vacated Tenants:'), numCell(pVacatedTenants)]);
      }
    }

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);

    // --- 2. Tenant Details Sheet ---
    const tenantRows: any[][] = [
      [strCell('Tenant Name'), strCell('Mobile Number'), strCell('Property'), strCell('Monthly Rent'), strCell('Move-in Date')]
    ];
    filteredTenants.forEach(t => {
      const propName = properties.find(p => p.id === t.propertyId)?.name || 'Property';
      tenantRows.push([
        strCell(t.name),
        strCell(t.mobile),
        strCell(propName),
        currencyCell(t.monthlyRent || 0),
        dateCell(t.moveInDate)
      ]);
    });
    const wsTenantDetails = XLSX.utils.aoa_to_sheet(tenantRows);

    // --- 3. Bills Sheet ---
    const billRows: any[][] = [
      [strCell('Bill Number'), strCell('Tenant Name'), strCell('Rent'), strCell('Previous Due'), strCell('Total Payable'), strCell('Paid Amount'), strCell('Remaining Due'), strCell('Payment Status')]
    ];
    filteredBills.forEach(b => {
      const tenantName = tenants.find(t => t.id === b.tenantId)?.name || 'Tenant';
      billRows.push([
        strCell(b.billNumber),
        strCell(tenantName),
        currencyCell(b.rent || 0),
        currencyCell(b.previousDue || 0),
        currencyCell(b.totalAmount || 0),
        currencyCell(b.paidAmount || 0),
        currencyCell(b.remainingAmount || 0),
        strCell(b.paymentStatus.toUpperCase())
      ]);
    });
    const wsBills = XLSX.utils.aoa_to_sheet(billRows);

    // --- 4. Payments Sheet ---
    const paymentRows: any[][] = [
      [strCell('Payment Date'), strCell('Tenant Name'), strCell('Bill Number'), strCell('Amount Paid'), strCell('Payment Method'), strCell('Transaction ID'), strCell('Payment Status')]
    ];
    filteredPayments.forEach(p => {
      const tenantName = tenants.find(t => t.id === p.tenantId)?.name || 'Tenant';
      const bill = bills.find(b => b.id === p.billId);
      const billNo = bill ? bill.billNumber : '-';
      const billStatus = bill ? bill.paymentStatus.toUpperCase() : '-';
      
      let pMethod = p.paymentMethod as string;
      if (pMethod === 'bank_transfer') pMethod = 'Bank Transfer';
      else if (pMethod === 'upi') pMethod = 'UPI';
      else if (pMethod === 'cash') pMethod = 'Cash';
      else pMethod = 'Other';

      paymentRows.push([
        dateCell(p.paymentDate),
        strCell(tenantName),
        strCell(billNo),
        currencyCell(p.amount || 0),
        strCell(pMethod),
        strCell(p.transactionId || ''),
        strCell(billStatus)
      ]);
    });
    const wsPayments = XLSX.utils.aoa_to_sheet(paymentRows);

    // --- 5. New Tenants Sheet ---
    const newTenantsList = filteredTenants.filter(t => t.moveInDate && t.moveInDate.startsWith(monthStr));
    const newTenantRows: any[][] = [
      [strCell('Total New Tenants:'), numCell(newTenantsList.length)],
      [],
      [strCell('Tenant Name'), strCell('Room'), strCell('Move-in Date'), strCell('Monthly Rent')]
    ];
    newTenantsList.forEach(t => {
      const unitNo = units.find(u => u.id === t.unitId)?.unitNumber || '-';
      newTenantRows.push([
        strCell(t.name),
        strCell(unitNo),
        dateCell(t.moveInDate),
        currencyCell(t.monthlyRent || 0)
      ]);
    });
    const wsNewTenants = XLSX.utils.aoa_to_sheet(newTenantRows);

    // --- 6. Vacated Tenants Sheet ---
    const vacatedTenantsList = filteredTenants.filter(t => t.status === 'vacated' && t.moveOutDate && t.moveOutDate.startsWith(monthStr));
    const vacatedTenantRows: any[][] = [
      [strCell('Total Vacated Tenants:'), numCell(vacatedTenantsList.length)],
      [],
      [strCell('Tenant Name'), strCell('Room'), strCell('Move-in Date'), strCell('Move-out Date'), strCell('Rent')]
    ];
    vacatedTenantsList.forEach(t => {
      const unitNo = units.find(u => u.id === t.unitId)?.unitNumber || '-';
      vacatedTenantRows.push([
        strCell(t.name),
        strCell(unitNo),
        dateCell(t.moveInDate),
        dateCell(t.moveOutDate),
        currencyCell(t.monthlyRent || 0)
      ]);
    });
    const wsVacatedTenants = XLSX.utils.aoa_to_sheet(vacatedTenantRows);

    // --- 7. Outstanding Sheet ---
    const outstandingRows: any[][] = [
      [strCell('Tenant'), strCell('Room'), strCell('Total Bill'), strCell('Paid'), strCell('Due'), strCell('Due Since'), strCell('Due Date'), strCell('Days Overdue'), strCell('Status')]
    ];
    const outstandingBills = filteredBills.filter(b => b.remainingAmount > 0);
    
    const getDaysOverdue = (dueDateStr?: string) => {
      if (!dueDateStr) return 0;
      const due = new Date(dueDateStr);
      const today = new Date();
      due.setHours(0,0,0,0);
      today.setHours(0,0,0,0);
      const diffTime = today.getTime() - due.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 0;
    };

    outstandingBills.forEach(b => {
      const tenant = tenants.find(t => t.id === b.tenantId);
      const tenantName = tenant ? tenant.name : 'Tenant';
      const unitNo = units.find(u => u.id === b.unitId)?.unitNumber || '-';
      
      outstandingRows.push([
        strCell(tenantName),
        strCell(unitNo),
        currencyCell(b.totalAmount || 0),
        currencyCell(b.paidAmount || 0),
        currencyCell(b.remainingAmount || 0),
        strCell(b.billingMonth),
        dateCell(b.dueDate),
        numCell(getDaysOverdue(b.dueDate)),
        strCell(b.paymentStatus.toUpperCase())
      ]);
    });
    const wsOutstanding = XLSX.utils.aoa_to_sheet(outstandingRows);

    // --- 8. Electricity Sheet ---
    const electricityRows: any[][] = [
      [strCell('Tenant Name'), strCell('Property'), strCell('Billing Type'), strCell('Previous Reading'), strCell('Prev Reading Date'), strCell('Current Reading'), strCell('Curr Reading Date'), strCell('Total Units'), strCell('Total Days'), strCell('Rate Per Unit'), strCell('Fixed Monthly Amount'), strCell('Electricity Amount')]
    ];
    filteredBills.forEach(b => {
      const tenant = tenants.find(t => t.id === b.tenantId);
      const tenantName = tenant ? tenant.name : 'Tenant';
      const propName = properties.find(p => p.id === b.propertyId)?.name || 'Property';

      const eType = b.electricityBillType || 'perUnit';
      
      if (eType === 'fixed') {
        electricityRows.push([
          strCell(tenantName),
          strCell(propName),
          strCell('Fixed'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          currencyCell(b.electricityFixedAmount || 0),
          currencyCell(b.electricityCharge || 0)
        ]);
      } else if (eType === 'none') {
        electricityRows.push([
          strCell(tenantName),
          strCell(propName),
          strCell('None'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          currencyCell(0)
        ]);
      } else {
        let daysText = '-';
        if (b.currentMeterReadingDate && b.previousMeterReadingDate) {
          const start = new Date(b.previousMeterReadingDate);
          const end = new Date(b.currentMeterReadingDate);
          const diff = end.getTime() - start.getTime();
          const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
          if (days >= 0) daysText = String(days);
        }
        electricityRows.push([
          strCell(tenantName),
          strCell(propName),
          strCell('Per Unit'),
          numCell(b.previousMeterReading || 0),
          dateCell(b.previousMeterReadingDate),
          numCell(b.currentMeterReading || 0),
          dateCell(b.currentMeterReadingDate),
          numCell(b.electricityUnits || 0),
          strCell(daysText),
          currencyCell(b.electricityRate || 0),
          strCell('-'),
          currencyCell(b.electricityCharge || 0)
        ]);
      }
    });
    const wsElectricity = XLSX.utils.aoa_to_sheet(electricityRows);

    // --- 9. Water Sheet ---
    const waterRows: any[][] = [
      [strCell('Tenant Name'), strCell('Property'), strCell('Billing Type'), strCell('Previous Reading'), strCell('Prev Reading Date'), strCell('Current Reading'), strCell('Curr Reading Date'), strCell('Total Units'), strCell('Total Days'), strCell('Rate Per Unit'), strCell('Fixed Monthly Amount'), strCell('Water Amount')]
    ];
    filteredBills.forEach(b => {
      const tenant = tenants.find(t => t.id === b.tenantId);
      const tenantName = tenant ? tenant.name : 'Tenant';
      const propName = properties.find(p => p.id === b.propertyId)?.name || 'Property';

      const wType = b.waterBillType || (b.waterCharge > 0 ? 'fixed' : 'none');

      if (wType === 'fixed') {
        waterRows.push([
          strCell(tenantName),
          strCell(propName),
          strCell('Fixed'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          currencyCell(b.waterFixedAmount || b.waterCharge),
          currencyCell(b.waterCharge || 0)
        ]);
      } else if (wType === 'none') {
        waterRows.push([
          strCell(tenantName),
          strCell(propName),
          strCell('None'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          strCell('-'),
          currencyCell(0)
        ]);
      } else {
        let daysText = '-';
        if (b.currentMeterReadingDate && b.previousMeterReadingDate) {
          const start = new Date(b.previousMeterReadingDate);
          const end = new Date(b.currentMeterReadingDate);
          const diff = end.getTime() - start.getTime();
          const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
          if (days >= 0) daysText = String(days);
        }
        waterRows.push([
          strCell(tenantName),
          strCell(propName),
          strCell('Per Unit'),
          numCell(b.previousMeterReading || 0),
          dateCell(b.previousMeterReadingDate),
          numCell(b.currentMeterReading || 0),
          dateCell(b.currentMeterReadingDate),
          numCell(b.electricityUnits || 0),
          strCell(daysText),
          currencyCell(b.waterRatePerUnit || 0),
          strCell('-'),
          currencyCell(b.waterCharge || 0)
        ]);
      }
    });
    const wsWater = XLSX.utils.aoa_to_sheet(waterRows);

    // --- 10. Occupancy Sheet ---
    const occupancyRows: any[][] = [
      [strCell('Occupancy Metrics'), strCell('Value')],
      [strCell('Total Units:'), numCell(totalRooms)],
      [strCell('Occupied Units:'), numCell(occupiedRooms)],
      [strCell('Vacant Units:'), numCell(vacantRooms)],
      [strCell('Occupancy Rate:'), percentCell(occupancyRate)],
      [strCell('Vacancy Rate:'), percentCell(vacancyRate)],
    ];
    const wsOccupancy = XLSX.utils.aoa_to_sheet(occupancyRows);

    // --- 11. Date-wise Collection Sheet ---
    const dateMap: Record<string, number> = {};
    filteredPayments.forEach(p => {
      const dExcel = formatExcelDate(p.paymentDate);
      dateMap[dExcel] = (dateMap[dExcel] || 0) + (p.amount || 0);
    });

    const dateWiseRows: any[][] = [
      [strCell('Date'), strCell('Amount Collected')]
    ];
    const sortedDates = Object.keys(dateMap).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    sortedDates.forEach(d => {
      dateWiseRows.push([
        strCell(d),
        currencyCell(dateMap[d])
      ]);
    });
    const wsDateWise = XLSX.utils.aoa_to_sheet(dateWiseRows);

    // --- 12. Collection Summary Sheet ---
    let collRent = 0;
    let collElec = 0;
    let collWater = 0;
    let collParking = 0;
    let collMaint = 0;
    let collOther = 0;
    let collPrevDue = 0;

    filteredPayments.forEach(p => {
      const allocation = allocatePayment(p);
      collRent += allocation.rent;
      collElec += allocation.electricity;
      collWater += allocation.water;
      collParking += allocation.parking;
      collMaint += allocation.maintenance;
      collOther += allocation.other;
      collPrevDue += allocation.previousDue;
    });

    const collTotal = collRent + collElec + collWater + collParking + collMaint + collOther + collPrevDue;

    const collectionSummaryRows: any[][] = [
      [strCell('Category'), strCell('Amount Collected')],
      [strCell('Rent Collection'), currencyCell(collRent)],
      [strCell('Electricity Collection'), currencyCell(collElec)],
      [strCell('Water Collection'), currencyCell(collWater)],
      [strCell('Parking Collection'), currencyCell(collParking)],
      [strCell('Maintenance'), currencyCell(collMaint)],
      [strCell('Other Charges'), currencyCell(collOther)],
      [strCell('Previous Due Collection'), currencyCell(collPrevDue)],
      [],
      [strCell('Total Collection'), currencyCell(collTotal)],
    ];
    const wsCollectionSummary = XLSX.utils.aoa_to_sheet(collectionSummaryRows);

    // 7. Create Workbook
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

    // 8. Auto-fit column widths helper
    const autoFitColumns = (ws: XLSX.WorkSheet) => {
      if (!ws || !ws['!ref']) return;
      const range = XLSX.utils.decode_range(ws['!ref']);
      const cols = [];
      for (let C = range.s.c; C <= range.e.c; ++C) {
        let maxWidth = 12;
        for (let R = range.s.r; R <= range.e.r; ++R) {
          const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
          if (cell && cell.v !== undefined) {
            let valStr = String(cell.v);
            if (cell.z === '"₹"#,##,##0') {
              valStr = `₹${parseFloat(valStr).toLocaleString('en-IN')}`;
            } else if (cell.z === '0%') {
              valStr = `${Math.round(parseFloat(valStr) * 100)}%`;
            }
            if (valStr.length > maxWidth) {
              maxWidth = valStr.length;
            }
          }
        }
        cols.push({ wch: maxWidth + 3 });
      }
      ws['!cols'] = cols;
    };

    const sheets = [
      wsSummary, wsTenantDetails, wsBills, wsPayments, 
      wsNewTenants, wsVacatedTenants, wsOutstanding, 
      wsElectricity, wsWater, wsOccupancy, wsDateWise, wsCollectionSummary
    ];

    sheets.forEach(ws => {
      autoFitColumns(ws);
    });

    // 9. Apply Freezes and Filters where appropriate
    wsTenantDetails['!views'] = [{ state: 'frozen', ySplit: 1 }];
    wsTenantDetails['!autofilter'] = { ref: wsTenantDetails['!ref'] || 'A1' };

    wsBills['!views'] = [{ state: 'frozen', ySplit: 1 }];
    wsBills['!autofilter'] = { ref: wsBills['!ref'] || 'A1' };

    wsPayments['!views'] = [{ state: 'frozen', ySplit: 1 }];
    wsPayments['!autofilter'] = { ref: wsPayments['!ref'] || 'A1' };

    wsOutstanding['!views'] = [{ state: 'frozen', ySplit: 1 }];
    wsOutstanding['!autofilter'] = { ref: wsOutstanding['!ref'] || 'A1' };

    wsElectricity['!views'] = [{ state: 'frozen', ySplit: 1 }];
    wsElectricity['!autofilter'] = { ref: wsElectricity['!ref'] || 'A1' };

    wsWater['!views'] = [{ state: 'frozen', ySplit: 1 }];
    wsWater['!autofilter'] = { ref: wsWater['!ref'] || 'A1' };

    wsNewTenants['!views'] = [{ state: 'frozen', ySplit: 3 }];
    wsVacatedTenants['!views'] = [{ state: 'frozen', ySplit: 3 }];
    wsDateWise['!views'] = [{ state: 'frozen', ySplit: 1 }];
    wsCollectionSummary['!views'] = [{ state: 'frozen', ySplit: 1 }];

    // 10. Generate Sanitized Filename
    const sanitizeFileName = (name: string): string => {
      return name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    };

    const sanitizedPropName = propertyId === 'all' 
      ? 'All_Properties' 
      : sanitizeFileName(selectedPropertyNames);
    
    const sanitizedMonth = monthLabel.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `Rentora_${sanitizedPropName}_${sanitizedMonth}.xlsx`;
    const fileUri = `${FileSystem.documentDirectory}${filename}`;

    // 11. Write binary xlsx stream as base64 string
    const base64Content = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    await FileSystem.writeAsStringAsync(fileUri, base64Content, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // 12. Trigger native sharing
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Export Rentora Excel Report',
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });

    return fileUri;
  }
};
export default excelReportService;
