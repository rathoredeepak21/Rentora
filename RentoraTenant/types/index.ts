export type TenantLoginStatus = 'active' | 'disabled' | 'not_created';

export interface NotificationPreferences {
  enabled: boolean;
  billNotifications: boolean;
  paymentNotifications: boolean;
  reminderNotifications: boolean;
}

export interface UserProfile {
  uid: string;
  role: 'tenant' | 'landlord';
  name: string;
  email: string;
  phone: string;
  mobileNumber?: string;
  ownerId: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  isFirstLogin: boolean;
  loginPassword?: string;
  authSecret?: string;
  passwordResetRequested?: boolean;
  passwordResetRequestedAt?: string;
  loginStatus: TenantLoginStatus;
  notificationTokens?: string[];
  notificationPreferences?: NotificationPreferences;
  createdAt?: string;
  updatedAt?: string;
}

export interface TenantDetails {
  id: string;
  name: string;
  mobile: string;
  mobileNumber?: string;
  ownerId: string;
  propertyId: string;
  unitId: string;
  tenantAuthUid?: string;
  loginStatus: TenantLoginStatus;
  isFirstLogin?: boolean;
  loginPassword?: string;
  authSecret?: string;
  passwordResetRequested?: boolean;
  passwordResetRequestedAt?: string;
  status: 'active' | 'vacated';
  monthlyRent?: number;
  advanceAmount?: number;
  moveInDate?: string;
  moveOutDate?: string;
  occupation?: string;
  totalMembers?: number;
  idProofType?: string;
  electricityBillType?: 'fixed' | 'perUnit' | 'none';
  waterBillType?: 'fixed' | 'perUnit' | 'none';
  notificationTokens?: string[];
  notificationPreferences?: NotificationPreferences;
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

export type PaymentVerificationStatus = 'pending' | 'approved' | 'rejected';
export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'other';

export interface PaymentSubmission {
  id?: string;
  ownerId: string;
  billId: string;
  tenantId: string;
  tenantAuthUid?: string | null;
  propertyId?: string;
  unitId?: string;
  
  amount: number;
  amountPaid?: number;
  paymentDate?: string;
  paymentMethod?: PaymentMethod;
  transactionId?: string;
  screenshotUrl?: string;
  
  status: PaymentVerificationStatus;
  submittedAt?: string;
  verifiedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  parentPaymentId?: string;
  
  createdAt?: string;
}

export type NotificationType = 
  | 'new_bill' 
  | 'bill_status_update' 
  | 'payment_approved' 
  | 'payment_rejected' 
  | 'bill_paid';

export interface TenantNotification {
  id?: string;
  tenantId: string;
  tenantAuthUid?: string;
  title: string;
  body: string;
  notificationType: NotificationType;
  billId?: string;
  paymentId?: string;
  isRead: boolean;
  createdAt: string;
}

export type DocumentCategory = 'agreement' | 'kyc' | 'property' | 'notice' | 'other';
export type DocumentFileType = 'pdf' | 'image' | 'doc' | 'other';

export interface TenantDocument {
  id?: string;
  title: string;
  category: DocumentCategory;
  fileUrl: string;
  fileType: DocumentFileType;
  fileSize?: string;
  tenantId?: string;
  propertyId?: string;
  ownerId: string;
  uploadedAt: string;
  notes?: string;
}

export interface Property {
  id?: string;
  ownerId: string;
  name: string;
  type?: string;
  address: string;
  propertyRules?: string[];
}

export interface Unit {
  id?: string;
  ownerId: string;
  propertyId: string;
  unitNumber: string;
  floor?: string;
  status?: string;
}

export interface BillSettings {
  id?: string;
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

export interface AuthContextType {
  user: any | null; // Firebase User
  userProfile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isFirstLogin: boolean;
  login: (mobile: string, pass: string) => Promise<void>;
  updatePassword: (newPass: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}
