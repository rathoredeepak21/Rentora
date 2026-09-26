import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Image,
  Linking,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/ThemeContext';
import { tenantDataService } from '../../../services/tenantDataService';
import { Bill, Property, Unit, BillSettings, PaymentSubmission } from '../../../types';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppSafeAreaView from '../../../components/ui/AppSafeAreaView';

export default function PayBillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userProfile, user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [bill, setBill] = useState<Bill | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [settings, setSettings] = useState<BillSettings | null>(null);
  const [pendingPayments, setPendingPayments] = useState<PaymentSubmission[]>([]);

  const [amountPaidInput, setAmountPaidInput] = useState('');
  const [submittedAmount, setSubmittedAmount] = useState<number>(0);
  const [transactionId, setTransactionId] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    if (!id) {
      setErrorMessage('Bill ID not specified.');
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const fetchBill = async () => {
      try {
        const billData = await tenantDataService.fetchBillDetails(id as string);
        if (!billData) {
          if (isMounted) setErrorMessage('Bill record not found.');
          return;
        }

        // Security check: tenant identity match
        if (userProfile && billData.tenantId !== userProfile.tenantId) {
          if (isMounted) setErrorMessage('You are not authorized to access this bill.');
          return;
        }

        if (isMounted) {
          setBill(billData);
          setAmountPaidInput(billData.remainingAmount.toString());
        }

        // Fetch landlord settings & property/unit
        if (billData.ownerId) {
          tenantDataService.fetchLandlordSettings(billData.ownerId).then((s) => {
            if (isMounted) setSettings(s);
          });
        }
        if (billData.propertyId) {
          tenantDataService.fetchPropertyDetails(billData.propertyId).then((p) => {
            if (isMounted) setProperty(p);
          });
        }
        if (billData.unitId) {
          tenantDataService.fetchUnitDetails(billData.unitId).then((u) => {
            if (isMounted) setUnit(u);
          });
        }
      } catch (e) {
        if (isMounted) setErrorMessage('Failed to load bill details.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchBill();

    // Subscribe to existing bill payments to check pending submissions
    const unsubscribePayments = tenantDataService.subscribeBillPayments(
      id as string,
      (payments) => {
        if (isMounted) {
          setPendingPayments(payments.filter((p) => p.status === 'pending'));
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribePayments();
    };
  }, [id, userProfile?.tenantId]);

  const ownerName = settings?.ownerName || settings?.businessName || property?.name || 'Property Owner';
  const upiId = settings?.upiId || '';

  const handleOpenUPI = async () => {
    if (!bill || !upiId) {
      alert('Landlord UPI ID is not configured.');
      return;
    }

    const parsedAmt = parseFloat(amountPaidInput.trim());
    const amount = (!isNaN(parsedAmt) && parsedAmt > 0) ? parsedAmt : bill.remainingAmount;
    const note = `Rent Bill ${bill.billNumber}`;
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
      ownerName
    )}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;

    try {
      const supported = await Linking.canOpenURL(upiUrl);
      if (supported) {
        await Linking.openURL(upiUrl);
      } else {
        // Direct attempt
        await Linking.openURL(upiUrl);
      }
    } catch (err) {
      alert(
        'Could not launch UPI app automatically. Please scan the QR Code below or use your UPI app manually.'
      );
    }
  };

  const handleSubmitPayment = async () => {
    Keyboard.dismiss();
    setErrorMessage(null);

    if (!bill || !userProfile || !user) {
      setErrorMessage('Session invalid. Please refresh.');
      return;
    }

    const amountClean = amountPaidInput.trim();
    if (!amountClean) {
      setErrorMessage('Please enter the Amount Paid.');
      return;
    }

    const numericAmount = parseFloat(amountClean);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setErrorMessage('Please enter a valid amount greater than zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Re-verify latest bill status with accurate allocation before submitting
      let currentRemaining = bill.remainingAmount;
      const latestData = await tenantDataService.fetchBillDetails(bill.id!);
      if (latestData) {
        currentRemaining = latestData.remainingAmount;
        if (latestData.remainingAmount <= 0 || latestData.paymentStatus === 'paid') {
          setErrorMessage('This bill has already been fully paid and verified.');
          setIsSubmitting(false);
          return;
        }
      }

      // Check if numericAmount exceeds current remaining payable
      const roundedAmount = Math.round(numericAmount * 100) / 100;
      const roundedRemaining = Math.round(currentRemaining * 100) / 100;

      if (roundedAmount > roundedRemaining) {
        setErrorMessage('Amount cannot be greater than the remaining amount.');
        setIsSubmitting(false);
        return;
      }

      const utrClean = transactionId.trim();
      if (!utrClean) {
        setErrorMessage('Please enter the Transaction ID / UTR number.');
        setIsSubmitting(false);
        return;
      }
      if (utrClean.length < 6 || utrClean.length > 35) {
        setErrorMessage('Transaction ID / UTR must be between 6 and 35 characters.');
        setIsSubmitting(false);
        return;
      }

      await tenantDataService.submitTenantPayment({
        ownerId: bill.ownerId,
        billId: bill.id!,
        tenantId: userProfile.tenantId,
        tenantAuthUid: user.uid,
        propertyId: bill.propertyId,
        unitId: bill.unitId,
        amount: roundedAmount,
        amountPaid: roundedAmount,
        paymentMethod: 'upi',
        transactionId: utrClean,
        status: 'pending',
        submittedAt: new Date().toISOString(),
      });

      setSubmittedAmount(roundedAmount);
      setShowSuccessModal(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit payment. Please check network.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatMonthTitle = (monthStr?: string) => {
    if (!monthStr) return 'Bill Statement';
    try {
      const [year, month] = monthStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    } catch (e) {
      return monthStr;
    }
  };

  if (isLoading) {
    return (
      <AppSafeAreaView style={[styles.centerSafeArea, { backgroundColor: colors.bg }]}>
        <StatusBar style={colors.statusBarStyle} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Preparing Payment Interface...</Text>
      </AppSafeAreaView>
    );
  }

  if (errorMessage && !bill) {
    return (
      <AppSafeAreaView style={[styles.centerSafeArea, { backgroundColor: colors.bg }]}>
        <StatusBar style={colors.statusBarStyle} />
        <MaterialCommunityIcons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Payment Unavailable</Text>
        <Text style={[styles.errorSubtitle, { color: colors.textMuted }]}>{errorMessage}</Text>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </AppSafeAreaView>
    );
  }

  const parsedQrAmt = parseFloat(amountPaidInput.trim());
  const qrAmount = (!isNaN(parsedQrAmt) && parsedQrAmt > 0) ? parsedQrAmt : (bill?.remainingAmount || 0);

  const qrUrl = upiId && bill
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
        `upi://pay?pa=${upiId}&pn=${encodeURIComponent(ownerName)}&am=${qrAmount}&cu=INR`
      )}`
    : null;

  return (
    <AppSafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />
      {/* Top Header Bar */}
      <View style={[styles.topHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.iconBackBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.topHeaderTitle, { color: colors.textPrimary }]}>Pay Bill</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom + 40, 60) }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Bill Payable Hero Card */}
            <View style={styles.heroCard}>
              <Text style={styles.monthHeaderTitle}>{formatMonthTitle(bill?.billingMonth)}</Text>
              <Text style={styles.billNumberSub}>Statement #{bill?.billNumber}</Text>

              <View style={styles.heroAmountBox}>
                <Text style={styles.heroAmountLabel}>Amount to Pay</Text>
                <Text style={styles.heroAmountValue}>₹{bill?.remainingAmount.toLocaleString('en-IN')}</Text>
              </View>

              <View style={styles.breakdownRow}>
                <View style={styles.bdCol}>
                  <Text style={styles.bdLabel}>Total Payable</Text>
                  <Text style={styles.bdValue}>₹{bill?.totalAmount.toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.bdCol}>
                  <Text style={styles.bdLabel}>Already Paid</Text>
                  <Text style={[styles.bdValue, { color: COLORS.success }]}>
                    ₹{bill?.paidAmount.toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={styles.bdCol}>
                  <Text style={styles.bdLabel}>Remaining Due</Text>
                  <Text style={[styles.bdValue, { color: COLORS.danger, fontWeight: '800' }]}>
                    ₹{bill?.remainingAmount.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

              {bill && bill.previousDue > 0 ? (
                <View style={{ marginTop: 8, paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', textAlign: 'center' }}>
                    Includes ₹{bill.previousDue.toLocaleString('en-IN')} arrears + ₹{bill.subtotal.toLocaleString('en-IN')} current charges
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Pending Verification Notice if submission already pending */}
            {pendingPayments.length > 0 ? (
              <View style={styles.pendingNoticeBanner}>
                <MaterialCommunityIcons name="clock-alert-outline" size={22} color={COLORS.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendingNoticeTitle}>Payment Verification Pending</Text>
                  <Text style={styles.pendingNoticeText}>
                    You submitted ₹{pendingPayments[0].amount.toLocaleString('en-IN')} (UTR:{' '}
                    {pendingPayments[0].transactionId}) awaiting landlord approval.
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Error Message */}
            {errorMessage ? (
              <View style={styles.errorBanner}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={COLORS.danger} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* UPI Configuration Warning if UPI ID missing */}
            {!upiId ? (
              <View style={styles.warningCard}>
                <MaterialCommunityIcons name="alert-outline" size={24} color={COLORS.warning} />
                <Text style={styles.warningText}>
                  Online payment is not configured by your landlord yet. Please contact your landlord directly to get their UPI ID or payment details.
                </Text>
              </View>
            ) : (
              /* Payment Options Section */
              <View style={styles.optionsSection}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Select Payment Method</Text>

                {/* Pay via UPI App Button */}
                <TouchableOpacity
                  style={[styles.upiAppButton, { backgroundColor: colors.card, borderColor: colors.primaryGlow }]}
                  onPress={handleOpenUPI}
                  activeOpacity={0.8}
                >
                  <View style={styles.upiBtnLeft}>
                    <View style={[styles.upiIconBadge, { backgroundColor: colors.primaryGlow }]}>
                      <MaterialCommunityIcons name="cellphone-nfc" size={24} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={[styles.upiBtnTitle, { color: colors.textPrimary }]}>Pay via Installed UPI App</Text>
                      <Text style={[styles.upiBtnSubtitle, { color: colors.textMuted }]}>GPay, PhonePe, Paytm, BHIM</Text>
                    </View>
                  </View>
                  <MaterialCommunityIcons name="open-in-new" size={20} color={colors.primary} />
                </TouchableOpacity>

                {/* Pay via QR Toggle Button */}
                <TouchableOpacity
                  style={[styles.qrToggleButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => setShowQR(!showQR)}
                  activeOpacity={0.8}
                >
                  <View style={styles.upiBtnLeft}>
                    <View style={[styles.upiIconBadge, { backgroundColor: 'rgba(14, 165, 233, 0.1)' }]}>
                      <MaterialCommunityIcons name="qrcode-scan" size={24} color="#0EA5E9" />
                    </View>
                    <View>
                      <Text style={[styles.upiBtnTitle, { color: colors.textPrimary }]}>Pay via Landlord QR Code</Text>
                      <Text style={[styles.upiBtnSubtitle, { color: colors.textMuted }]}>Scan using any UPI camera scanner</Text>
                    </View>
                  </View>
                  <MaterialCommunityIcons
                    name={showQR ? 'chevron-up' : 'chevron-down'}
                    size={24}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>

                {/* QR Display Card */}
                {showQR && qrUrl ? (
                  <View style={[styles.qrContainerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.qrInstruction, { color: colors.textSecondary }]}>
                      Scan QR code using PhonePe, Google Pay, Paytm, or BHIM:
                    </Text>
                    <View style={styles.qrImageBorder}>
                      <Image source={{ uri: qrUrl }} style={styles.qrImage} resizeMode="contain" />
                    </View>
                    <Text style={[styles.upiIdDisplay, { color: colors.textPrimary }]}>{upiId}</Text>
                    <Text style={[styles.upiOwnerDisplay, { color: colors.textMuted }]}>Payee: {ownerName}</Text>
                  </View>
                ) : null}

                {/* Informational Note */}
                <View style={[styles.infoBox, { backgroundColor: colors.cardSubtle }]}>
                  <MaterialCommunityIcons name="information-outline" size={18} color={colors.textMuted} />
                  <Text style={[styles.infoText, { color: colors.textMuted }]}>
                    Completing payment in your UPI app does NOT automatically mark your bill paid. You must submit your Transaction ID / UTR below.
                  </Text>
                </View>
              </View>
            )}

            {/* Payment & Transaction ID Submission Section */}
            <View style={[styles.submitCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <Text style={[styles.submitCardTitle, { color: colors.textPrimary }]}>Submit Payment Reference</Text>
              <Text style={[styles.submitCardSubtitle, { color: colors.textSecondary }]}>
                Enter the actual amount paid and the 12-digit UTR or Transaction ID from your payment receipt.
              </Text>

              {/* Amount Paid Field */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Amount Paid (₹)</Text>
                <View style={[styles.inputWrapper, { backgroundColor: colors.cardSubtle, borderColor: colors.border }]}>
                  <MaterialCommunityIcons
                    name="currency-inr"
                    size={22}
                    color={colors.textSecondary}
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary }]}
                    placeholder={`Max ₹${bill?.remainingAmount.toLocaleString('en-IN')}`}
                    placeholderTextColor={colors.textMuted}
                    value={amountPaidInput}
                    onChangeText={(text: string) => {
                      setAmountPaidInput(text);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Transaction ID / UTR Field */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Transaction ID / UTR Number</Text>
                <View style={[styles.inputWrapper, { backgroundColor: colors.cardSubtle, borderColor: colors.border }]}>
                  <MaterialCommunityIcons
                    name="numeric"
                    size={22}
                    color={colors.textSecondary}
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary }]}
                    placeholder="e.g. 123456789012"
                    placeholderTextColor={colors.textMuted}
                    value={transactionId}
                    onChangeText={(text: string) => {
                      setTransactionId(text);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    autoCapitalize="characters"
                    maxLength={35}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
                onPress={handleSubmitPayment}
                disabled={isSubmitting}
                activeOpacity={0.85}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={COLORS.textWhite} size="small" />
                ) : (
                  <View style={styles.btnRow}>
                    <Text style={styles.submitBtnText}>Submit Payment for Verification</Text>
                    <MaterialCommunityIcons name="send" size={18} color={COLORS.textWhite} />
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Submission Success Modal */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.successIconBox}>
              <MaterialCommunityIcons name="check-circle" size={48} color={colors.success} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Payment Submitted!</Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              Your transaction reference ({transactionId}) of ₹
              {submittedAmount.toLocaleString('en-IN')} has been submitted successfully.
            </Text>
            <Text style={[styles.modalSubMessage, { color: colors.textMuted }]}>
              Your payment is now in <Text style={{ fontWeight: '700', color: COLORS.warning }}>Pending Verification</Text> status. Your landlord will verify and update your bill status.
            </Text>

            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                setShowSuccessModal(false);
                router.replace(`/bills/${id}`);
              }}
            >
              <Text style={styles.modalBtnText}>Back to Bill Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </AppSafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  centerSafeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 14,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: SPACING.md,
    marginBottom: 4,
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  backBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  topHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
  },
  iconBackBtn: {
    padding: 6,
  },
  topHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  container: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  heroCard: {
    backgroundColor: COLORS.bgDark,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  monthHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  billNumberSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  heroAmountBox: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: SPACING.md,
    marginVertical: SPACING.md,
    alignItems: 'center',
  },
  heroAmountLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  heroAmountValue: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.textWhite,
    marginTop: 2,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bdCol: {
    flex: 1,
  },
  bdLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  bdValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
  pendingNoticeBanner: {
    flexDirection: 'row',
    backgroundColor: COLORS.warningBg,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    gap: 10,
    alignItems: 'center',
  },
  pendingNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.warning,
  },
  pendingNoticeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerBg,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.danger,
    fontWeight: '500',
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningBg,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    gap: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.warning,
    lineHeight: 18,
    fontWeight: '500',
  },
  optionsSection: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  upiAppButton: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    borderWidth: 1.5,
    borderColor: COLORS.primaryGlow,
    ...SHADOWS.sm,
  },
  qrToggleButton: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.sm,
  },
  upiBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upiIconBadge: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upiBtnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  upiBtnSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  qrContainerCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  qrInstruction: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  qrImageBorder: {
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: SPACING.md,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  upiIdDisplay: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  upiOwnerDisplay: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgCard,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    gap: 8,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  submitCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  submitCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  submitCardSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
    marginBottom: SPACING.md,
  },
  inputGroup: {
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgLight,
    paddingHorizontal: SPACING.md,
    height: 50,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    height: 52,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.md,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitBtnText: {
    color: COLORS.textWhite,
    fontSize: 15,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  successIconBox: {
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 18,
  },
  modalSubMessage: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 16,
  },
  modalBtn: {
    width: '100%',
    height: 48,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnText: {
    color: COLORS.textWhite,
    fontSize: 15,
    fontWeight: '700',
  },
});
