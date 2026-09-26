import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { tenantDataService } from '../../services/tenantDataService';
import { Bill, PaymentSubmission, PaymentVerificationStatus } from '../../types';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function PaymentDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userProfile } = useAuth();

  const [payment, setPayment] = useState<PaymentSubmission | null>(null);
  const [bill, setBill] = useState<Bill | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setErrorMsg('Payment ID not specified.');
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const fetchPaymentAndBill = async () => {
      try {
        const payData = await tenantDataService.fetchPaymentDetails(id as string);
        if (!payData) {
          if (isMounted) setErrorMsg('Payment record not found.');
          return;
        }

        // Security check: tenant matching
        if (userProfile && payData.tenantId !== userProfile.tenantId) {
          if (isMounted) setErrorMsg('You are not authorized to view this payment record.');
          return;
        }

        if (isMounted) setPayment(payData);

        // Fetch linked bill details if billId exists
        if (payData.billId) {
          const billData = await tenantDataService.fetchBillDetails(payData.billId);
          if (isMounted) setBill(billData);
        }
      } catch (err) {
        if (isMounted) setErrorMsg('Failed to load payment details.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchPaymentAndBill();

    return () => {
      isMounted = false;
    };
  }, [id, userProfile?.tenantId]);

  const renderStatusBadge = (status: PaymentVerificationStatus) => {
    switch (status) {
      case 'approved':
        return (
          <View style={[styles.badge, styles.badgeApproved]}>
            <View style={[styles.badgeDot, { backgroundColor: COLORS.success }]} />
            <Text style={[styles.badgeText, { color: COLORS.success }]}>APPROVED</Text>
          </View>
        );
      case 'rejected':
        return (
          <View style={[styles.badge, styles.badgeRejected]}>
            <View style={[styles.badgeDot, { backgroundColor: COLORS.danger }]} />
            <Text style={[styles.badgeText, { color: COLORS.danger }]}>REJECTED</Text>
          </View>
        );
      case 'pending':
      default:
        return (
          <View style={[styles.badge, styles.badgePending]}>
            <View style={[styles.badgeDot, { backgroundColor: COLORS.warning }]} />
            <Text style={[styles.badgeText, { color: COLORS.warning }]}>PENDING VERIFICATION</Text>
          </View>
        );
    }
  };

  const formatMonthTitle = (monthStr?: string) => {
    if (!monthStr) return 'Rent Statement';
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
      <AppSafeAreaView style={styles.centerSafeArea}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading payment details...</Text>
      </AppSafeAreaView>
    );
  }

  if (errorMsg || !payment) {
    return (
      <AppSafeAreaView style={styles.centerSafeArea}>
        <StatusBar style="dark" />
        <MaterialCommunityIcons name="alert-circle-outline" size={48} color={COLORS.danger} />
        <Text style={styles.errorTitle}>Error Loading Details</Text>
        <Text style={styles.errorSubtitle}>{errorMsg || 'Payment record could not be found.'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </AppSafeAreaView>
    );
  }

  return (
    <AppSafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.iconBackBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topHeaderTitle}>Payment Details</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Payment Amount Hero Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Submitted Amount</Text>
          <Text style={styles.heroAmount}>₹{payment.amount.toLocaleString('en-IN')}</Text>
          <View style={{ marginTop: SPACING.sm }}>{renderStatusBadge(payment.status)}</View>
        </View>

        {/* Rejection Notice Banner */}
        {payment.status === 'rejected' ? (
          <View style={styles.rejectionCard}>
            <MaterialCommunityIcons name="alert-circle-outline" size={24} color={COLORS.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rejectionTitle}>Payment Rejected by Landlord</Text>
              <Text style={styles.rejectionBody}>
                {payment.rejectionReason || 'The landlord rejected this transaction reference. Please contact your landlord for clarification.'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Pending Verification Notice Banner */}
        {payment.status === 'pending' ? (
          <View style={styles.pendingCard}>
            <MaterialCommunityIcons name="clock-outline" size={24} color={COLORS.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingTitle}>Pending Landlord Verification</Text>
              <Text style={styles.pendingBody}>
                Your payment reference has been submitted. The landlord will verify the transaction and update your bill status.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Payment Metadata Breakdown */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Transaction Info</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Transaction ID / UTR</Text>
            <Text style={[styles.infoValue, styles.utrHighlight]}>{payment.transactionId || 'N/A'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tenant Name</Text>
            <Text style={styles.infoValue}>{userProfile?.name || 'Tenant'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Payment Method</Text>
            <Text style={styles.infoValue}>{(payment.paymentMethod || 'UPI').toUpperCase()}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Submitted Date</Text>
            <Text style={styles.infoValue}>
              {payment.submittedAt ? payment.submittedAt.split('T')[0] : 'N/A'}
            </Text>
          </View>

          {payment.verifiedAt ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Verification Date</Text>
              <Text style={[styles.infoValue, { color: COLORS.success }]}>
                {payment.verifiedAt.split('T')[0]}
              </Text>
            </View>
          ) : payment.rejectedAt ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Rejection Date</Text>
              <Text style={[styles.infoValue, { color: COLORS.danger }]}>
                {payment.rejectedAt.split('T')[0]}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Related Bill Info Card */}
        {bill ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Related Bill Info</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Statement Period</Text>
              <Text style={styles.infoValue}>{formatMonthTitle(bill.billingMonth)}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Statement Number</Text>
              <Text style={styles.infoValue}>#{bill.billNumber}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Current Bill Status</Text>
              <Text
                style={[
                  styles.infoValue,
                  {
                    color:
                      bill.paymentStatus === 'paid'
                        ? COLORS.success
                        : bill.paymentStatus === 'partial'
                        ? COLORS.warning
                        : COLORS.danger,
                    fontWeight: '800',
                    textTransform: 'uppercase',
                  },
                ]}
              >
                {bill.paymentStatus}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Remaining Due</Text>
              <Text
                style={[
                  styles.infoValue,
                  {
                    color: bill.remainingAmount > 0 ? COLORS.danger : COLORS.success,
                    fontWeight: '800',
                  },
                ]}
              >
                ₹{bill.remainingAmount.toLocaleString('en-IN')}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.viewBillBtn}
              onPress={() => router.push(`/bills/${bill.id}`)}
              activeOpacity={0.8}
            >
              <Text style={styles.viewBillBtnText}>View Full Bill Details</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.textWhite} />
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </AppSafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bgLight,
  },
  centerSafeArea: {
    flex: 1,
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
    marginBottom: 4,
  },
  errorSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  backBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
  },
  backBtnText: {
    color: COLORS.textWhite,
    fontWeight: '700',
  },
  topHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  iconBackBtn: {
    padding: 6,
  },
  topHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  container: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  heroCard: {
    backgroundColor: COLORS.bgDark,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  heroLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  heroAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.textWhite,
    marginTop: 4,
    marginBottom: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    gap: 6,
  },
  badgeApproved: { backgroundColor: COLORS.successBg },
  badgeRejected: { backgroundColor: COLORS.dangerBg },
  badgePending: { backgroundColor: COLORS.warningBg },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  rejectionCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.dangerBg,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    gap: 12,
    alignItems: 'flex-start',
  },
  rejectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.danger,
  },
  rejectionBody: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  pendingCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.warningBg,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    gap: 12,
    alignItems: 'flex-start',
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.warning,
  },
  pendingBody: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  sectionCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  infoLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  utrHighlight: {
    fontWeight: '800',
    color: COLORS.primary,
  },
  viewBillBtn: {
    backgroundColor: COLORS.primary,
    height: 48,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.lg,
    ...SHADOWS.md,
  },
  viewBillBtnText: {
    color: COLORS.textWhite,
    fontSize: 14,
    fontWeight: '700',
  },
});
