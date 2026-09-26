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
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { tenantDataService } from '../../services/tenantDataService';
import { PaymentSubmission, PaymentVerificationStatus } from '../../types';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

type FilterType = 'all' | 'pending' | 'approved' | 'rejected';

export default function PaymentHistoryScreen() {
  const { userProfile } = useAuth();
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
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.leftHeaderRow}>
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name="receipt" size={22} color={COLORS.primary} />
          </View>
          <View>
            <Text style={styles.amountText}>₹{item.amount.toLocaleString('en-IN')}</Text>
            <Text style={styles.utrText}>UTR: {item.transactionId || 'N/A'}</Text>
          </View>
        </View>
        {renderStatusBadge(item.status)}
      </View>

      <View style={styles.divider} />

      <View style={styles.cardMetaRow}>
        <Text style={styles.metaText}>
          Submitted: {item.submittedAt ? item.submittedAt.split('T')[0] : 'N/A'}
        </Text>
        {item.billId ? (
          <TouchableOpacity
            style={styles.viewBillLink}
            onPress={() => router.push(`/bills/${item.billId}`)}
          >
            <Text style={styles.viewBillLinkText}>View Bill</Text>
            <MaterialCommunityIcons name="chevron-right" size={14} color={COLORS.primary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {item.status === 'rejected' && item.rejectionReason ? (
        <View style={styles.rejectionBox}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.danger} />
          <Text style={styles.rejectionText}>Reason: {item.rejectionReason}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <AppSafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.iconBackBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topHeaderTitle}>Payment Submissions</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterPill, filter === 'all' && styles.filterPillActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterPillText, filter === 'all' && styles.filterPillTextActive]}>
            All ({payments.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, filter === 'pending' && styles.filterPillActive]}
          onPress={() => setFilter('pending')}
        >
          <Text style={[styles.filterPillText, filter === 'pending' && styles.filterPillTextActive]}>
            Pending ({payments.filter((p) => p.status === 'pending').length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, filter === 'approved' && styles.filterPillActive]}
          onPress={() => setFilter('approved')}
        >
          <Text style={[styles.filterPillText, filter === 'approved' && styles.filterPillTextActive]}>
            Approved ({payments.filter((p) => p.status === 'approved').length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, filter === 'rejected' && styles.filterPillActive]}
          onPress={() => setFilter('rejected')}
        >
          <Text style={[styles.filterPillText, filter === 'rejected' && styles.filterPillTextActive]}>
            Rejected ({payments.filter((p) => p.status === 'rejected').length})
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading payment history...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPayments}
          keyExtractor={(item: PaymentSubmission) => item.id || item.transactionId || String(Math.random())}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="history" size={56} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No payment submissions found</Text>
              <Text style={styles.emptySubtitle}>
                When you pay rent bills via UPI or QR code and submit UTR reference numbers, they will appear here.
              </Text>
            </View>
          }
        />
      )}
    </AppSafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bgLight,
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
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 8,
    backgroundColor: COLORS.bgLight,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  viewBillLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewBillLinkText: {
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
