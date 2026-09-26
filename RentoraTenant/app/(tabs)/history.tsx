import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { tenantDataService } from '../../services/tenantDataService';
import { PaymentSubmission, PaymentVerificationStatus } from '../../types';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';

import SwipeableTabWrapper from '../../components/ui/SwipeableTabWrapper';

type FilterType = 'all' | 'pending' | 'approved' | 'rejected';

export default function PaymentHistoryTabScreen() {
  const { userProfile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    if (!userProfile?.tenantId) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = tenantDataService.subscribeTenantPayments(
      userProfile.tenantId,
      (list) => {
        setPayments(list);
        setIsLoading(false);
        setRefreshing(false);
      },
      () => {
        setIsLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, [userProfile?.tenantId]);

  const onRefresh = () => {
    setRefreshing(true);
    if (!userProfile?.tenantId) setRefreshing(false);
  };

  const filteredPayments = payments.filter((p) => {
    if (filter === 'pending') return p.status === 'pending';
    if (filter === 'approved') return p.status === 'approved';
    if (filter === 'rejected') return p.status === 'rejected';
    return true;
  });

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

  const renderItem = ({ item }: { item: PaymentSubmission }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
      onPress={() => router.push(`/payments/${item.id}`)}
      activeOpacity={0.75}
    >
      <View style={styles.cardHeaderRow}>
        <View style={styles.leftHeaderRow}>
          <View style={[styles.iconBox, { backgroundColor: colors.primaryGlow }]}>
            <MaterialCommunityIcons name="receipt-text-outline" size={22} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.amountText, { color: colors.textPrimary }]}>₹{item.amount.toLocaleString('en-IN')}</Text>
            <Text style={[styles.utrText, { color: colors.textSecondary }]}>UTR: {item.transactionId || 'N/A'}</Text>
          </View>
        </View>
        {renderStatusBadge(item.status)}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.cardMetaRow}>
        <Text style={[styles.metaText, { color: colors.textMuted }]}>
          Date: {item.submittedAt ? item.submittedAt.split('T')[0] : 'N/A'}
        </Text>
        {item.billId ? (
          <TouchableOpacity
            style={styles.viewDetailsRow}
            onPress={() => router.push(`/bills/${item.billId}`)}
          >
            <Text style={[styles.viewDetailsText, { color: colors.primary }]}>View Statement</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.viewDetailsRow}
            onPress={() => router.push(`/payments/${item.id}`)}
          >
            <Text style={[styles.viewDetailsText, { color: colors.primary }]}>Details</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {item.status === 'rejected' && item.rejectionReason ? (
        <View style={styles.rejectionBox}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.danger} />
          <Text style={styles.rejectionText} numberOfLines={1}>
            Reason: {item.rejectionReason}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <SwipeableTabWrapper currentTab="history">
      <AppSafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
        <StatusBar style={colors.statusBarStyle} />
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Payment History</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Track all submitted transaction references & statuses</Text>

          {/* Filter Pills */}
          <View style={styles.filterContainer}>
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
                All ({payments.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterPill,
                {
                  backgroundColor: filter === 'pending' ? colors.primary : colors.card,
                  borderColor: filter === 'pending' ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilter('pending')}
            >
              <Text style={[styles.filterPillText, { color: filter === 'pending' ? '#FFFFFF' : colors.textSecondary }]}>
                Pending ({payments.filter((p) => p.status === 'pending').length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterPill,
                {
                  backgroundColor: filter === 'approved' ? colors.primary : colors.card,
                  borderColor: filter === 'approved' ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilter('approved')}
            >
              <Text style={[styles.filterPillText, { color: filter === 'approved' ? '#FFFFFF' : colors.textSecondary }]}>
                Approved ({payments.filter((p) => p.status === 'approved').length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterPill,
                {
                  backgroundColor: filter === 'rejected' ? colors.primary : colors.card,
                  borderColor: filter === 'rejected' ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilter('rejected')}
            >
              <Text style={[styles.filterPillText, { color: filter === 'rejected' ? '#FFFFFF' : colors.textSecondary }]}>
                Rejected ({payments.filter((p) => p.status === 'rejected').length})
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading payment records...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredPayments}
            keyExtractor={(item: PaymentSubmission) => item.id || item.transactionId || String(Math.random())}
            renderItem={renderItem}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 90, 110) }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="history" size={56} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No payment history yet</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                  When you pay rent bills via UPI or QR code and submit UTR reference numbers, your verification timeline will appear here.
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
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.sm,
  },
  filterPill: {
    paddingHorizontal: 12,
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
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  amountText: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  utrText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 6,
  },
  badgeApproved: { backgroundColor: COLORS.successBg },
  badgeRejected: { backgroundColor: COLORS.dangerBg },
  badgePending: { backgroundColor: COLORS.warningBg },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: SPACING.md,
  },
  cardMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  viewDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewDetailsText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  rejectionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerBg,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    marginTop: SPACING.sm,
    gap: 6,
  },
  rejectionText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: '600',
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
    lineHeight: 18,
  },
});
