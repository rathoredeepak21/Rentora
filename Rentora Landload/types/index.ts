export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  photoUrl?: string;
  phone?: string;
  notificationTokens?: string[];
  createdAt: string;
  updatedAt: string;
}

export type PropertyType = 'Room' | 'Flat' | 'Shop' | 'House' | 'Office';

export interface Property {
  id?: string;
  ownerId: string;
  name: string;
  type: PropertyType;
  address: string;
  totalUnits: number;
  defaultRent: number;
  electricityRate: number;
  waterCharge: number;
  parkingCharge: number;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  propertyRules?: string[];
}

export type UnitStatus = 'vacant' | 'occupied';

export interface Unit {
  id?: string;
  ownerId: string;
  propertyId: string;
  unitNumber: string;
  floor: string;
  defaultRent: number;
  meterNumber: string;
  status: UnitStatus;
  currentTenantId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TenantStatus = 'active' | 'vacated';
export type TenantLoginStatus = 'not_created' | 'active' | 'disabled';

export interface Tenant {
  id?: string;
  ownerId: string;
  propertyId: string;
  unitId: string;
  name: string;
  mobile: string;
  mobileNumber?: string; // Standard alias for mobile
  gender?: string;
  occupation?: string;
  totalMembers: number;
  idProofType: string;
  documentNumber: string | null;
  initialMeterReading: number;
  moveInDate: string;
  moveOutDate?: string | null;
  monthlyRent: number;
  advanceAmount?: number;
  status: TenantStatus;
  
  // Tenant App Authentication Linking & Status
  tenantAuthUid?: string | null;
  loginStatus?: TenantLoginStatus;
  isFirstLogin?: boolean;
  loginPassword?: string;
  authSecret?: string;
  passwordResetRequested?: boolean;
  passwordResetRequestedAt?: string;
  
  electricityBillType?: 'fixed' | 'perUnit' | 'none';
  electricityFixedAmount?: number;
  electricityRatePerUnit?: number;
  
  waterBillType?: 'fixed' | 'perUnit' | 'none';
  waterFixedAmount?: number;
  waterRatePerUnit?: number;
  
  createdAt: string;
  updatedAt: string;
}

export type PaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface MonthWiseAccounting {
  hasPreviousDue: boolean;
  previousMonthLabel: string;
  previousMonthOriginal: number;
  previousMonthPaid: number;
  previousMonthRemaining: number;
  previousMonthStatus: PaymentStatus;

  currentMonthLabel: string;
  currentMonthOriginal: number;
  currentMonthPaid: number;
  currentMonthRemaining: number;
  currentMonthStatus: PaymentStatus;

  overallTotalPayable: number;
  overallTotalPaid: number;
  overallTotalRemaining: number;
}

export interface Bill {
  id?: string;
  ownerId: string;
  tenantId: string;
  tenantAuthUid?: string | null;
  propertyId: string;
  unitId: string;
  
  billNumber: string;
  billingMonth: string; // Format: "YYYY-MM"
  
  previousMeterReading: number;
  previousMeterReadingDate?: string;
  currentMeterReading: number;
  currentMeterReadingDate?: string;
  electricityUnits: number;
  electricityRate: number;
  electricityCharge: number;
  notes?: string;
  
  rent: number;
  waterCharge: number;
  parkingCharge: number;
  maintenanceCharge: number;
  otherCharges: number;
  previousDue: number;
  
  subtotal: number;
  totalAmount: number;
  dueDate: string; // Format: "YYYY-MM-DD"
  
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: PaymentStatus;
  
  previousDuePaid?: number;
  previousDueRemaining?: number;
  currentBillPaid?: number;
  currentBillRemaining?: number;
  monthWiseAccounting?: MonthWiseAccounting;
  
  electricityBillType?: 'fixed' | 'perUnit' | 'none';
  electricityFixedAmount?: number;
  electricityRatePerUnit?: number;
  waterBillType?: 'fixed' | 'perUnit' | 'none';
  waterFixedAmount?: number;
  waterRatePerUnit?: number;
  
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'other';
export type PaymentVerificationStatus = 'pending' | 'approved' | 'rejected';

export interface Payment {
  id?: string;
  ownerId: string;
  billId: string;
  tenantId: string;
  tenantAuthUid?: string | null;
  propertyId?: string;
  unitId?: string;
  
  amount: number;
  amountPaid?: number;
  paymentDate: string; // Format: "YYYY-MM-DD"
  paymentMethod: PaymentMethod;
  transactionId?: string;
  screenshotUrl?: string;
  
  // Payment Verification Fields
  status?: PaymentVerificationStatus;
  submittedAt?: string;
  verifiedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  parentPaymentId?: string;
  
  createdAt: string;
}

export interface BillSettings {
  id?: string; // ownerId
  ownerName: string;
  businessName: string;
  phone: string;
  address: string;
  logoUrl?: string;
  signatureUrl?: string;
  upiId: string;
  paymentInstructions: string;
  updatedAt: string;
}

export type NotificationType = 
  | 'payment_submitted'
  | 'payment_approved'
  | 'payment_rejected'
  | 'new_bill'
  | 'bill_paid'
  | 'rent_due_soon'
  | 'rent_overdue';

export interface LandlordNotification {
  id?: string;
  recipientUserId?: string;
  ownerId: string;
  tenantId?: string;
  type?: NotificationType;
  notificationType?: NotificationType;
  title: string;
  message?: string;
  body?: string;
  relatedPaymentId?: string;
  relatedBillId?: string;
  relatedTenantId?: string;
  relatedPropertyId?: string;
  isRead: boolean;
  createdAt: string;
}

