import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { tenantDataService } from '../../services/tenantDataService';
import { Bill, PaymentStatus, PaymentSubmission } from '../../types';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import SwipeableTabWrapper from '../../components/ui/SwipeableTabWrapper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';

type FilterType = 'all' | 'due' | 'partial' | 'paid';

export default function MyBillsScreen() {
  const { userProfile } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    if (!userProfile?.tenantId) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    // 1. Subscribe to Tenant Bills
    const unsubscribeBills = tenantDataService.subscribeTenantBills(
      userProfile.tenantId,
      (updatedBills) => {
        if (isMounted) {
          setBills(updatedBills);
          setIsLoading(false);
          setRefreshing(false);
        }
      },
      () => {
        if (isMounted) {
          setIsLoading(false);
          setRefreshing(false);
        }
      }
    );

    // 2. Subscribe to Tenant Payments (to display pending/rejected verification status on cards)
    const unsubscribePayments = tenantDataService.subscribeTenantPayments(
      userProfile.tenantId,
      (updatedPayments) => {
        if (isMounted) setPayments(updatedPayments);
      }
    );

    return () => {
      isMounted = false;
      unsubscribeBills();
      unsubscribePayments();
    };
  }, [userProfile?.tenantId]);

  const onRefresh = () => {
    setRefreshing(true);
    if (!userProfile?.tenantId) {
      setRefreshing(false);
    }
  };

  const filteredBills = bills.filter((b) => {
    if (filter === 'due') return b.remainingAmount > 0 && b.paymentStatus !== 'paid';
    if (filter === 'partial') return b.paymentStatus === 'partial';
    if (filter === 'paid') return b.paymentStatus === 'paid' || b.remainingAmount === 0;
    return true;
  });

  const renderStatusBadge = (status: PaymentStatus, remainingAmount: number) => {
    if (remainingAmount === 0 || status === 'paid') {
      return (
        <View style={[styles.badge, styles.badgePaid]}>
          <Text style={[styles.badgeText, { color: COLORS.success }]}>PAID</Text>
        </View>
      );
    }
    if (status === 'partial') {
      return (
        <View style={[styles.badge, styles.badgePartial]}>
          <Text style={[styles.badgeText, { color: COLORS.warning }]}>PARTIALLY PAID</Text>
        </View>
      );
    }
    return (
      <View style={[styles.badge, styles.badgeUnpaid]}>
        <Text style={[styles.badgeText, { color: COLORS.danger }]}>DUE</Text>
      </View>
    );
  };

  const formatMonthTitle = (monthStr: string) => {
    if (!monthStr) return 'Bill Statement';
    try {
      const [year, month] = monthStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    } catch (e) {
      return monthStr;
    }
  };

  const getPendingPaymentForBill = (billId?: string) => {
    if (!billId) return null;
    return payments.find((p) => p.billId === billId && p.status === 'pending');
  };

  const getRejectedPaymentForBill = (billId?: string) => {
    if (!billId) return null;
    return payments.find((p) => p.billId === billId && p.status === 'rejected');
  };

  const renderBillItem = ({ item }: { item: Bill }) => {
    const pendingSubmission = getPendingPaymentForBill(item.id);
    const rejectedSubmission = getRejectedPaymentForBill(item.id);

    return (
      <View style={[styles.billCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
        {/* Top Month Header & Status Badge */}
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => router.push(`/bills/${item.id}`)}
          activeOpacity={0.8}
        >
          <View style={styles.monthHeaderRow}>
            <MaterialCommunityIcons name="file-document-outline" size={24} color={colors.primary} />
            <View>
              <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>{formatMonthTitle(item.billingMonth)}</Text>
              <Text style={[styles.billNumber, { color: colors.textMuted }]}>Statement #{item.billNumber}</Text>
            </View>
          </View>
          {renderStatusBadge(
            item.monthWiseAccounting?.hasPreviousDue
              ? item.monthWiseAccounting.currentMonthStatus
              : item.paymentStatus,
            item.currentBillRemaining !== undefined ? item.currentBillRemaining : item.remainingAmount
          )}
        </TouchableOpacity>

        <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

        {/* Pending Verification Notice Banner */}
        {pendingSubmission ? (
          <View style={styles.pendingNoticeBanner}>
            <MaterialCommunityIcons name="clock-alert-outline" size={18} color={COLORS.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingNoticeTitle}>Payment Pending Verification</Text>
              <Text style={styles.pendingNoticeText}>
                Submitted ₹{pendingSubmission.amount.toLocaleString('en-IN')} (UTR: {pendingSubmission.transactionId})
              </Text>
            </View>
          </View>
        ) : null}

        {/* Rejected Payment Notice Banner */}
        {!pendingSubmission && rejectedSubmission ? (
          <View style={styles.rejectedNoticeBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={COLORS.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rejectedNoticeTitle}>Previous Payment Rejected</Text>
              <Text style={styles.rejectedNoticeText}>
                {rejectedSubmission.rejectionReason || 'Landlord rejected the submitted UTR reference.'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Financial Amount Grid */}
        <View style={[styles.amountGrid, { backgroundColor: colors.cardSubtle }]}>
          <View style={styles.amountCol}>
            <Text style={[styles.amountLabel, { color: colors.textMuted }]}>
              {item.previousDue > 0 ? 'Month Bill' : 'Total Bill'}
            </Text>
            <Text style={[styles.amountValue, { color: colors.textPrimary }]}>
              ₹{(item.subtotal !== undefined ? item.subtotal : item.totalAmount).toLocaleString('en-IN')}
            </Text>
          </View>

          <View style={styles.amountCol}>
            <Text style={[styles.amountLabel, { color: colors.textMuted }]}>
              {item.previousDue > 0 ? 'Month Paid' : 'Paid Amount'}
            </Text>
            <Text style={[styles.amountValue, { color: colors.success }]}>
              ₹{(item.currentBillPaid !== undefined ? item.currentBillPaid : item.paidAmount).toLocaleString('en-IN')}
            </Text>
          </View>

          <View style={styles.amountCol}>
            <Text style={[styles.amountLabel, { color: colors.textMuted }]}>
              {item.previousDue > 0 ? 'Month Due' : 'Remaining Due'}
            </Text>
            <Text
              style={[
                styles.amountValue,
                {
                  color: (item.currentBillRemaining !== undefined ? item.currentBillRemaining : item.remainingAmount) > 0 ? colors.danger : colors.success,
                  fontWeight: '800',
                },
              ]}
            >
              ₹{(item.currentBillRemaining !== undefined ? item.currentBillRemaining : item.remainingAmount).toLocaleString('en-IN')}
            </Text>
          </View>
        </View>

        {/* Previous Due Arrears Breakdown Note */}
        {item.previousDue > 0 ? (
          <View style={[styles.previousDueNote, { backgroundColor: colors.cardSubtle, borderColor: colors.border, borderWidth: 1 }]}>
            <MaterialCommunityIcons name="layers-outline" size={14} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.previousDueNoteText, { color: colors.textPrimary }]}>
                {item.previousDueRemaining === 0
                  ? `Arrears (₹${item.previousDue.toLocaleString('en-IN')}): Cleared (PAID)`
                  : `Arrears (₹${item.previousDue.toLocaleString('en-IN')}): Due ₹${(item.previousDueRemaining ?? item.previousDue).toLocaleString('en-IN')}`}
                {' • '}
                <Text style={{ fontWeight: '700', color: item.remainingAmount > 0 ? colors.danger : colors.success }}>
                  Total Statement Balance: ₹{item.remainingAmount.toLocaleString('en-IN')}
                </Text>
                {' (Payable: ₹' + item.totalAmount.toLocaleString('en-IN') + ')'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Footer Actions */}
        <View style={[styles.cardFooter, { backgroundColor: colors.cardSubtle }]}>
          <Text style={[styles.dueText, { color: colors.textSecondary }]}>Due: {item.dueDate || 'N/A'}</Text>

          <View style={styles.actionBtnGroup}>
            <TouchableOpacity
              style={[styles.detailsBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push(`/bills/${item.id}`)}
              activeOpacity={0.75}
            >
              <Text style={[styles.detailsBtnText, { color: colors.textSecondary }]}>Details</Text>
            </TouchableOpacity>

            {item.remainingAmount > 0 ? (
              <TouchableOpacity
                style={[styles.payNowBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push(`/bills/pay/${item.id}`)}
                activeOpacity={0.8}
              >
                <Text style={styles.payNowBtnText}>Pay Now</Text>
                <MaterialCommunityIcons name="arrow-right" size={14} color={COLORS.textWhite} />
              </TouchableOpacity>
            ) : (
              <View style={styles.completePill}>
                <MaterialCommunityIcons name="check" size={14} color={colors.success} />
                <Text style={[styles.completePillText, { color: colors.success }]}>Paid</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SwipeableTabWrapper currentTab="bills">
      <AppSafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
        <StatusBar style={colors.statusBarStyle} />

        {/* Screen Header */}
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>My Bills</Text>
              <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>View and manage all rent statements</Text>
            </View>
            <TouchableOpacity
              style={[styles.historyBtn, { backgroundColor: colors.primaryGlow, borderColor: colors.border }]}
              onPress={() => router.push('/payments/history')}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="history" size={18} color={colors.primary} />
              <Text style={[styles.historyBtnText, { color: colors.primary }]}>Submissions</Text>
            </TouchableOpacity>
          </View>

          {/* Filter Pills Horizontal Scroll */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContainer}>
            <TouchableOpacity
              style={[
                styles.filterPill,
                {
                  backgroundColor: filter === 'all' ? colors.primary : colors.card,
                  borderColor: filter === 'all' ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilter('all')}
            >
              <Text style={[styles.filterPillText, { color: filter === 'all' ? '#FFFFFF' : colors.textSecondary }]}>
                All ({bills.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterPill,
                {
                  backgroundColor: filter === 'due' ? colors.primary : colors.card,
                  borderColor: filter === 'due' ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilter('due')}
            >
              <Text style={[styles.filterPillText, { color: filter === 'due' ? '#FFFFFF' : colors.textSecondary }]}>
                Due ({bills.filter((b) => b.remainingAmount > 0 && b.paymentStatus !== 'paid').length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterPill,
                {
                  backgroundColor: filter === 'partial' ? colors.primary : colors.card,
                  borderColor: filter === 'partial' ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilter('partial')}
            >
              <Text style={[styles.filterPillText, { color: filter === 'partial' ? '#FFFFFF' : colors.textSecondary }]}>
                Partially Paid ({bills.filter((b) => b.paymentStatus === 'partial').length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterPill,
                {
                  backgroundColor: filter === 'paid' ? colors.primary : colors.card,
                  borderColor: filter === 'paid' ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilter('paid')}
            >
              <Text style={[styles.filterPillText, { color: filter === 'paid' ? '#FFFFFF' : colors.textSecondary }]}>
                Paid ({bills.filter((b) => b.paymentStatus === 'paid' || b.remainingAmount === 0).length})
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Main Bills List */}
        {isLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading your bills...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredBills}
            keyExtractor={(item: Bill) => item.id || item.billNumber}
            renderItem={renderBillItem}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 90, 110) }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="file-document-outline" size={56} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No Bills Available</Text>
                <Text style={styles.emptySubtitle}>
                  {filter !== 'all'
                    ? 'No rent statements match your selected filter.'
                    : 'Your bills will appear here when your landlord generates them.'}
                </Text>
              </View>
            }
          />
        )}
      </AppSafeAreaView>
    </SwipeableTabWrapper>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 4,
  },
  historyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: SPACING.sm,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  filterPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  filterPillTextActive: {
    color: COLORS.textWhite,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  billCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  billNumber: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  badgePaid: { backgroundColor: COLORS.successBg },
  badgePartial: { backgroundColor: COLORS.warningBg },
  badgeUnpaid: { backgroundColor: COLORS.dangerBg },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: SPACING.sm + 4,
  },
  pendingNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningBg,
    padding: 10,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    gap: 8,
  },
  pendingNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.warning,
  },
  pendingNoticeText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  rejectedNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerBg,
    padding: 10,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    gap: 8,
  },
  rejectedNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
  },
  rejectedNoticeText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  amountGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  amountCol: {
    flex: 1,
  },
  amountLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  amountValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  previousDueNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.sm,
    gap: 6,
  },
  previousDueNoteText: {
    fontSize: 11,
    color: COLORS.warning,
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.bgLight,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    marginTop: 4,
  },
  dueText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  actionBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailsBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  payNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    gap: 4,
  },
  payNowBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  completePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.md,
    gap: 4,
  },
  completePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.success,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    padding: SPACING.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
});
