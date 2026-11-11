import db from '../utils/db';
import { Property, Unit, Tenant, Bill, Payment, Settlement } from '../types';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { decorateBills, calculateOverallPending } from './billService';
import { paymentService } from './paymentService';

export const excelReportService = {
  async generateReport(ownerId: string, propertyId: string, monthStr: string, monthLabel: string): Promise<string> {
    // 1. Fetch all data from local database wrapper
    const properties = await db.getDocs<Property>('properties');
    const units = await db.getDocs<Unit>('units');
    const tenants = await db.getDocs<Tenant>('tenants');
    const rawBills = await db.getDocs<Bill>('bills');
    const rawPayments = await db.getDocs<Payment>('payments');

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

    // 6. Filter canonical payments: money received in this calendar month!
    const canonicalPayments = paymentService.filterCanonicalPayments(rawPayments);
    const filteredPayments = canonicalPayments.filter(p => {
      if (p.status === 'rejected' || p.status === 'pending') return false;
      if (!p.paymentDate || !p.paymentDate.startsWith(monthStr)) return false;

      // Determine property ID
      let pPropId = p.propertyId;
      if (!pPropId && p.billId && p.billId !== 'advance') {
        pPropId = bills.find(b => b.id === p.billId)?.propertyId;
      }
      if (!pPropId && Array.isArray(p.allocations) && p.allocations.length > 0) {
        const firstBillAlloc = p.allocations.find(a => a.billId !== 'advance');
        if (firstBillAlloc) {
          pPropId = bills.find(b => b.id === firstBillAlloc.billId)?.propertyId;
        }
      }
      if (!pPropId && p.tenantId) {
        pPropId = tenants.find(t => t.id === p.tenantId)?.propertyId;
      }

      return pPropId ? propIds.includes(pPropId) : false;
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
      if (Array.isArray(payment.allocations) && payment.allocations.length > 0) {
        const result = {
          rent: 0,
          electricity: 0,
          water: 0,
          parking: 0,
          maintenance: 0,
          other: 0,
          previousDue: 0
        };
        for (const alloc of payment.allocations) {
          if (alloc.type === 'advance') {
            result.rent += Number(alloc.amount) || 0;
            continue;
          }
          const bill = bills.find(b => b.id === alloc.billId);
          if (!bill || !bill.totalAmount) {
            result.rent += Number(alloc.amount) || 0;
            continue;
          }
          const ratio = (Number(alloc.amount) || 0) / (bill.totalAmount || 1);
          result.rent += (bill.rent || 0) * ratio;
          result.electricity += (bill.electricityCharge || 0) * ratio;
          result.water += (bill.waterCharge || 0) * ratio;
          result.parking += (bill.parkingCharge || 0) * ratio;
          result.maintenance += (bill.maintenanceCharge || 0) * ratio;
          result.other += (bill.otherCharges || 0) * ratio;
          result.previousDue += (bill.previousDue || 0) * ratio;
        }
        return result;
      }

      const bill = bills.find(b => b.id === payment.billId);
      if (!bill) {
        return {
          rent: Number(payment.amount) || 0,
          electricity: 0,
          water: 0,
          parking: 0,
          maintenance: 0,
          other: 0,
          previousDue: 0
        };
      }
      const ratio = bill.totalAmount > 0 ? ((Number(payment.amount) || 0) / bill.totalAmount) : 0;
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
    const totalOutstanding = calculateOverallPending(filteredBills);

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
      let billNo = '-';
      let billStatus = (p.status || 'approved').toUpperCase();

      if (Array.isArray(p.allocations) && p.allocations.length > 0) {
        billNo = p.allocations
          .map(a => {
            if (a.type === 'advance') return `Advance (₹${a.amount})`;
            const b = bills.find(tb => tb.id === a.billId);
            return `${b ? b.billNumber : a.billId} (₹${a.amount})`;
          })
          .join(', ');
      } else {
        const bill = bills.find(b => b.id === p.billId);
        billNo = bill ? bill.billNumber : (p.billId === 'advance' ? 'Advance Payment' : '-');
        if (bill) {
          billStatus = bill.paymentStatus.toUpperCase();
        }
      }
      
      let pMethod = p.paymentMethod as string;
      if (pMethod === 'bank_transfer') pMethod = 'Bank Transfer';
      else if (pMethod === 'upi') pMethod = 'UPI';
      else if (pMethod === 'cash') pMethod = 'Cash';
      else pMethod = 'Other';

      paymentRows.push([
        dateCell(p.paymentDate),
        strCell(tenantName),
        strCell(billNo),
        currencyCell(Number(p.amount) || Number(p.amountPaid) || 0),
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
  },

  /**
   * Generates a 4-sheet Tenant-Wise Historical Financial Report (.xlsx)
   * Sheet 1: Tenant Summary
   * Sheet 2: Bills History
   * Sheet 3: Payment History
   * Sheet 4: Outstanding & Final Settlement
   */
  async generateTenantHistoricalReport(
    tenant: Tenant,
    settlement: Settlement,
    property?: Property | null,
    unit?: Unit | null,
    bills: Bill[] = [],
    payments: Payment[] = []
  ): Promise<string> {
    const wb = XLSX.utils.book_new();

    const formatCurrency = (val: number): string => {
      const n = Number(val);
      if (isNaN(n)) return '0.00';
      return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatDate = (dateStr?: string | null): string => {
      if (!dateStr) return '—';
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      } catch {
        return String(dateStr);
      }
    };

    const formatDateTime = (dateStr?: string | null): string => {
      if (!dateStr) return '—';
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        return d.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return String(dateStr);
      }
    };

    // Filter and sort bills strictly for this tenant
    const tenantBills = [...bills]
      .filter((b) => b.tenantId === tenant.id)
      .sort((a, b) => (a.createdAt || a.dueDate || '').localeCompare(b.createdAt || b.dueDate || ''));

    // Filter and sort canonical payments strictly for this tenant
    const rawTenantPayments = [...payments].filter((p) => p.tenantId === tenant.id);
    const tenantPayments = paymentService
      .filterCanonicalPayments(rawTenantPayments)
      .sort((a, b) => (a.paymentDate || a.createdAt || '').localeCompare(b.paymentDate || b.createdAt || ''));

    const totalBilled = tenantBills.reduce((acc, b) => acc + (Number(b.totalAmount) || 0), 0);
    const totalPaid = tenantPayments.reduce((acc, p) => acc + (Number(p.amount) || Number(p.amountPaid) || 0), 0);
    const totalOutstanding = tenantBills.reduce((acc, b) => {
      if (b.paymentStatus === 'paid') return acc;
      return acc + (Number(b.remainingAmount) || 0);
    }, 0);

    const billNumberMap: Record<string, string> = {};
    tenantBills.forEach((b) => {
      if (b.id) billNumberMap[b.id] = b.billNumber || b.id;
    });

    // ─────────────────────────────────────────────────────────────
    // SHEET 1: Tenant Summary
    // ─────────────────────────────────────────────────────────────
    const s1Rows: any[][] = [
      ['RENTORA LANDLORD PLATFORM — TENANT-WISE HISTORICAL REPORT'],
      ['Generated On', formatDateTime(new Date().toISOString())],
      ['Report Mode', 'Tenant Financial History (Move-In through Settlement)'],
      [],
      ['TENANT INFORMATION'],
      ['Tenant Name', tenant.name],
      ['Tenant Permanent ID', tenant.id || '—'],
      ['Phone Number', tenant.mobileNumber || tenant.mobile || '—'],
      ['Gender', tenant.gender || '—'],
      ['Occupation', tenant.occupation || '—'],
      ['Total Family Members', tenant.totalMembers ?? '—'],
      ['ID Proof Type', tenant.idProofType || '—'],
      ['ID Document Number', tenant.documentNumber || '—'],
      [],
      ['PROPERTY & UNIT INFORMATION'],
      ['Property Name', property?.name || '—'],
      ['Property Type', property?.type || '—'],
      ['Property Address', property?.address || '—'],
      ['Room / Unit Number', tenant.unitId ? (unit?.unitNumber || 'Unit') : '—'],
      ['Floor', unit?.floor || '—'],
      ['Meter Number', unit?.meterNumber || '—'],
      ['Initial Meter Reading', tenant.initialMeterReading ?? '—'],
      ['Final Meter Reading', settlement.finalMeterReading ?? '—'],
      [],
      ['TENANCY TIMELINE & TERMS'],
      ['Move-In Date', formatDate(tenant.moveInDate)],
      ['Vacate Date', formatDate(tenant.moveOutDate || settlement.moveOutDate)],
      ['Monthly Rent (Agreed)', Number(tenant.monthlyRent) || 0],
      ['Security Deposit (Recorded)', Number(tenant.securityDeposit) || 0],
      ['Advance Rent (Recorded)', Number(tenant.advanceAmount) || 0],
      ['Tenant Status', tenant.status.toUpperCase()],
      [],
      ['FINAL SETTLEMENT SNAPSHOT'],
      ['Settlement Number', settlement.settlementNumber],
      ['Settlement Date & Time', formatDateTime(settlement.createdAt || settlement.settlementDate)],
      ['Normal Billing Period End', formatDate(settlement.normalPeriodEndDate)],
      ['Actual Move-Out Date', formatDate(settlement.moveOutDate)],
      ['Extra Stay Policy', settlement.extraStayPolicy === 'fixed30' ? 'Fixed 30 Days' : 'Actual Billing Period'],
      ['Extra Stay Days Count', settlement.eligibleExtraDays ?? 0],
      ['Daily Rent Rate Basis', Number(settlement.dailyRateBasis) || 0],
      ['Extra Stay Rent Amount', Number(settlement.extraStayAmount) || 0],
      ['Final Electricity Units', settlement.electricityUnits ?? 0],
      ['Electricity Billing Rate', Number(settlement.electricityRate) || 0],
      ['Final Electricity Charges', Number(settlement.electricityCharge) || 0],
      ['Other Charges / Adjustments', Number(settlement.otherCharges) || 0],
      ['Total Charges Payable (A)', Number(settlement.totalCharges) || 0],
      ['Advance Rent Adjusted (B1)', Number(settlement.advanceRentAdjusted) || 0],
      ['Security Deposit Adjusted (B2)', Number(settlement.securityDepositAdjusted) || 0],
      ['Total Deductions (B)', (Number(settlement.advanceRentAdjusted) || 0) + (Number(settlement.securityDepositAdjusted) || 0)],
      ['Final Net Amount', Number(settlement.finalAmount) || 0],
      [
        'Final Settlement Status',
        settlement.finalStatus === 'payable'
          ? 'PAYABLE BY TENANT'
          : settlement.finalStatus === 'refundable'
          ? 'REFUNDABLE TO TENANT'
          : 'FULLY SETTLED (ZERO BALANCE)',
      ],
      [],
      ['OVERALL FINANCIAL SUMMARY'],
      ['Total Bills Raised', tenantBills.length],
      ['Total Payment Transactions', tenantPayments.length],
      ['Total Amount Billed (₹)', totalBilled],
      ['Total Payments Collected (₹)', totalPaid],
      ['Total Outstanding Dues (₹)', totalOutstanding],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(s1Rows);
    wsSummary['!cols'] = [{ wch: 34 }, { wch: 48 }];

    // ─────────────────────────────────────────────────────────────
    // SHEET 2: Bills History
    // ─────────────────────────────────────────────────────────────
    const s2Headers = [
      'Bill #',
      'Bill Number',
      'Billing Month',
      'Bill Issue Date',
      'Due Date',
      'Monthly Rent (₹)',
      'Electricity Units',
      'Electricity Rate (₹/unit)',
      'Electricity Charge (₹)',
      'Water Charge (₹)',
      'Parking Charge (₹)',
      'Maintenance Charge (₹)',
      'Other Charges (₹)',
      'Previous Due (₹)',
      'Subtotal (₹)',
      'Total Bill Amount (₹)',
      'Paid Amount (₹)',
      'Outstanding Amount (₹)',
      'Payment Status',
      'Prev Meter Reading',
      'Curr Meter Reading',
      'Prev Reading Date',
      'Curr Reading Date',
      'Bill Notes',
    ];

    const s2Rows: any[][] = [s2Headers];
    tenantBills.forEach((b, idx) => {
      s2Rows.push([
        idx + 1,
        b.billNumber || '—',
        b.billingMonth || '—',
        formatDate(b.createdAt),
        formatDate(b.dueDate),
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
        (b.paymentStatus || 'unpaid').toUpperCase(),
        b.previousMeterReading ?? '—',
        b.currentMeterReading ?? '—',
        formatDate(b.previousMeterReadingDate),
        formatDate(b.currentMeterReadingDate),
        b.notes || '',
      ]);
    });

    // Total row for Bills
    s2Rows.push([
      'TOTAL',
      '',
      '',
      '',
      '',
      tenantBills.reduce((acc, b) => acc + (Number(b.rent) || 0), 0),
      tenantBills.reduce((acc, b) => acc + (Number(b.electricityUnits) || 0), 0),
      '',
      tenantBills.reduce((acc, b) => acc + (Number(b.electricityCharge) || 0), 0),
      tenantBills.reduce((acc, b) => acc + (Number(b.waterCharge) || 0), 0),
      tenantBills.reduce((acc, b) => acc + (Number(b.parkingCharge) || 0), 0),
      tenantBills.reduce((acc, b) => acc + (Number(b.maintenanceCharge) || 0), 0),
      tenantBills.reduce((acc, b) => acc + (Number(b.otherCharges) || 0), 0),
      '',
      tenantBills.reduce((acc, b) => acc + (Number(b.subtotal) || 0), 0),
      totalBilled,
      tenantBills.reduce((acc, b) => acc + (Number(b.paidAmount) || 0), 0),
      totalOutstanding,
      '',
      '',
      '',
      '',
      '',
      '',
    ]);

    const wsBills = XLSX.utils.aoa_to_sheet(s2Rows);

    // ─────────────────────────────────────────────────────────────
    // SHEET 3: Payment History
    // ─────────────────────────────────────────────────────────────
    const s3Headers = [
      'Txn #',
      'Payment Date',
      'Time (Recorded)',
      'Payment Amount (₹)',
      'Payment Mode',
      'Transaction / Ref ID',
      'Bill Allocation / Details',
      'Verification Status',
      'Bill Month Ref',
    ];

    const s3Rows: any[][] = [s3Headers];
    tenantPayments.forEach((p, idx) => {
      let allocationSummary = '—';
      if (Array.isArray(p.allocations) && p.allocations.length > 0) {
        allocationSummary = p.allocations
          .map((a) => {
            if (a.type === 'advance') return `Advance (₹${a.amount})`;
            const b = tenantBills.find((tb) => tb.id === a.billId);
            return `${b ? b.billNumber : billNumberMap[a.billId] || a.billId} (₹${a.amount})`;
          })
          .join(', ');
      } else {
        const associatedBill = tenantBills.find((b) => b.id === p.billId);
        allocationSummary = associatedBill ? associatedBill.billNumber : billNumberMap[p.billId] || p.billId || 'Direct Payment';
      }

      const firstAlloc = Array.isArray(p.allocations) && p.allocations.length > 0 ? p.allocations[0] : null;
      const associatedBill = tenantBills.find((b) => b.id === p.billId) ||
        (firstAlloc ? tenantBills.find((b) => b.id === firstAlloc.billId) : null);
      const timeStr = p.createdAt ? p.createdAt.split('T')[1]?.slice(0, 5) || '—' : '—';
      s3Rows.push([
        idx + 1,
        formatDate(p.paymentDate),
        timeStr,
        Number(p.amount) || Number(p.amountPaid) || 0,
        (p.paymentMethod || 'cash').toUpperCase(),
        p.transactionId || '—',
        allocationSummary,
        (p.status || 'approved').toUpperCase(),
        associatedBill?.billingMonth || '—',
      ]);
    });

    s3Rows.push(['TOTAL', '', '', totalPaid, '', '', '', '', '']);

    const wsPayments = XLSX.utils.aoa_to_sheet(s3Rows);

    // ─────────────────────────────────────────────────────────────
    // SHEET 4: Outstanding & Final Settlement
    // ─────────────────────────────────────────────────────────────
    const unpaidBills = tenantBills.filter((b) => b.paymentStatus !== 'paid');

    const s4Rows: any[][] = [
      ['A. OUTSTANDING BILLS RECORD'],
      ['Bill #', 'Bill Number', 'Billing Month', 'Due Date', 'Total Amount (₹)', 'Paid Amount (₹)', 'Remaining Dues (₹)', 'Status'],
    ];

    if (unpaidBills.length === 0) {
      s4Rows.push(['—', 'All generated bills have been paid in full', '', '', 0, 0, 0, 'CLEARED']);
    } else {
      unpaidBills.forEach((b, idx) => {
        s4Rows.push([
          idx + 1,
          b.billNumber,
          b.billingMonth,
          formatDate(b.dueDate),
          Number(b.totalAmount) || 0,
          Number(b.paidAmount) || 0,
          Number(b.remainingAmount) || 0,
          (b.paymentStatus || 'unpaid').toUpperCase(),
        ]);
      });
      s4Rows.push([
        'SUBTOTAL',
        '',
        '',
        '',
        unpaidBills.reduce((acc, b) => acc + (Number(b.totalAmount) || 0), 0),
        unpaidBills.reduce((acc, b) => acc + (Number(b.paidAmount) || 0), 0),
        totalOutstanding,
        '',
      ]);
    }

    s4Rows.push([]);
    s4Rows.push(['B. FINAL SETTLEMENT BREAKDOWN']);
    s4Rows.push(['Settlement Document Number', settlement.settlementNumber]);
    s4Rows.push(['Settlement Date & Time', formatDateTime(settlement.createdAt || settlement.settlementDate)]);
    s4Rows.push(['Billing Cycle End Date', formatDate(settlement.normalPeriodEndDate)]);
    s4Rows.push(['Actual Move-Out Date', formatDate(settlement.moveOutDate)]);
    s4Rows.push(['Extra Stay Calculation Policy', settlement.extraStayPolicy === 'fixed30' ? 'Fixed 30 Days' : 'Actual Billing Period']);
    s4Rows.push(['Eligible Extra Stay Days', settlement.eligibleExtraDays ?? 0]);
    s4Rows.push(['Daily Rate Basis (₹/day)', Number(settlement.dailyRateBasis) || 0]);
    s4Rows.push(['Extra Stay Rent (₹)', Number(settlement.extraStayAmount) || 0]);
    s4Rows.push(['Final Electricity Previous Reading', settlement.previousMeterReading ?? '—']);
    s4Rows.push(['Final Electricity Exit Reading', settlement.finalMeterReading ?? '—']);
    s4Rows.push(['Final Electricity Units Consumed', settlement.electricityUnits ?? 0]);
    s4Rows.push(['Final Electricity Billing Rate (₹/unit)', Number(settlement.electricityRate) || 0]);
    s4Rows.push(['Final Electricity Charge (₹)', Number(settlement.electricityCharge) || 0]);
    s4Rows.push(['Outstanding Bills Balance (at move-out) (₹)', Number(settlement.outstandingBillsBalance) || 0]);
    s4Rows.push(['Other Charges / Penalties (₹)', Number(settlement.otherCharges) || 0]);
    if (settlement.otherChargesNotes) {
      s4Rows.push(['Other Charges Notes', settlement.otherChargesNotes]);
    }
    s4Rows.push(['TOTAL CHARGES (A) (₹)', Number(settlement.totalCharges) || 0]);
    s4Rows.push([]);
    s4Rows.push(['C. ADVANCE RENT & SECURITY DEPOSIT DEDUCTIONS']);
    s4Rows.push(['Advance Rent Original (₹)', Number(settlement.advanceRentOriginal) || 0]);
    s4Rows.push(['Advance Rent Adjusted against dues (₹)', Number(settlement.advanceRentAdjusted) || 0]);
    s4Rows.push(['Advance Rent Refunded directly (₹)', Number(settlement.advanceRentRefunded) || 0]);
    s4Rows.push(['Advance Rent Remaining balance (₹)', Number(settlement.advanceRentRemaining) || 0]);
    s4Rows.push(['Security Deposit Original (₹)', Number(settlement.securityDepositOriginal) || 0]);
    s4Rows.push(['Security Deposit Adjusted against dues (₹)', Number(settlement.securityDepositAdjusted) || 0]);
    s4Rows.push(['Security Deposit Refunded directly (₹)', Number(settlement.securityDepositRefunded) || 0]);
    s4Rows.push(['Security Deposit Remaining balance (₹)', Number(settlement.securityDepositRemaining) || 0]);
    s4Rows.push([
      'TOTAL DEDUCTIONS APPLIED (B) (₹)',
      (Number(settlement.advanceRentAdjusted) || 0) + (Number(settlement.securityDepositAdjusted) || 0),
    ]);
    s4Rows.push([]);
    s4Rows.push(['D. FINAL SETTLEMENT RESULT']);
    s4Rows.push(['Final Net Amount (A - B) (₹)', Number(settlement.finalAmount) || 0]);
    s4Rows.push([
      'Settlement Outcome',
      settlement.finalStatus === 'payable'
        ? 'TENANT OWES LANDLORD (PAYABLE)'
        : settlement.finalStatus === 'refundable'
        ? 'LANDLORD REFUNDS TENANT (REFUNDABLE)'
        : 'BALANCE ZERO — FULLY SETTLED',
    ]);
    if (settlement.notes) {
      s4Rows.push(['Settlement Remarks / Notes', settlement.notes]);
    }

    const wsOutstanding = XLSX.utils.aoa_to_sheet(s4Rows);
    wsOutstanding['!cols'] = [{ wch: 42 }, { wch: 48 }];

    // Auto-fit helper
    const autoFit = (ws: XLSX.WorkSheet) => {
      if (!ws || !ws['!ref']) return;
      const range = XLSX.utils.decode_range(ws['!ref']);
      const cols = ws['!cols'] ? [...ws['!cols']] : [];
      for (let C = range.s.c; C <= range.e.c; ++C) {
        let maxWidth = cols[C]?.wch || 12;
        for (let R = range.s.r; R <= range.e.r; ++R) {
          const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
          if (cell && cell.v !== undefined) {
            const valStr = String(cell.v);
            if (valStr.length > maxWidth) {
              maxWidth = Math.min(valStr.length, 50);
            }
          }
        }
        cols[C] = { wch: maxWidth + 3 };
      }
      ws['!cols'] = cols;
    };

    autoFit(wsSummary);
    autoFit(wsBills);
    autoFit(wsPayments);
    autoFit(wsOutstanding);

    // Apply Freeze Panes
    wsSummary['!views'] = [{ state: 'frozen', ySplit: 1 }];
    wsBills['!views'] = [{ state: 'frozen', ySplit: 1 }];
    wsPayments['!views'] = [{ state: 'frozen', ySplit: 1 }];

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Tenant Summary');
    XLSX.utils.book_append_sheet(wb, wsBills, 'Bills History');
    XLSX.utils.book_append_sheet(wb, wsPayments, 'Payment History');
    XLSX.utils.book_append_sheet(wb, wsOutstanding, 'Settlement & Dues');

    const sanitizeFileName = (name: string): string => name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const safeTenantName = sanitizeFileName(tenant.name || 'Tenant');
    const filename = `Rentora_HistoricalReport_${safeTenantName}_${tenant.id || 'id'}.xlsx`;
    const fileUri = `${FileSystem.documentDirectory}${filename}`;

    const base64Content = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    await FileSystem.writeAsStringAsync(fileUri, base64Content, {
      encoding: FileSystem.EncodingType.Base64,
    });

    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: `Tenant Historical Report — ${tenant.name}`,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });

    return fileUri;
  }
};
export default excelReportService;
