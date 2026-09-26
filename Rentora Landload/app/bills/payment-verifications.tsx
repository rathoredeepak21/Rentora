import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useTheme, useStyles, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import LoadingView from '../../components/ui/LoadingView';
import MoneyText from '../../components/ui/MoneyText';
import AppButton from '../../components/ui/AppButton';
import EmptyState from '../../components/ui/EmptyState';
import db from '../../utils/db';
import { Payment, Tenant, Property, Unit, Bill, PaymentVerificationStatus } from '../../types';
import { paymentService } from '../../services/paymentService';

export default function PaymentVerificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(getStyles);

  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Resolution maps
  const [tenantMap, setTenantMap] = useState<Record<string, Tenant>>({});
  const [propertyMap, setPropertyMap] = useState<Record<string, Property>>({});
  const [unitMap, setUnitMap] = useState<Record<string, Unit>>({});
  const [billMap, setBillMap] = useState<Record<string, Bill>>({});

  const loadData = useCallback(async (force = false) => {
    if (!user) return;
    try {
      if (force) {
        db.clearCache('payments');
        db.clearCache('bills');
        db.clearCache('tenants');
        db.clearCache('properties');
        db.clearCache('units');
      }

      const [allPayments, allTenants, allProperties, allUnits, allBills] = await Promise.all([
        db.getDocs<Payment>('payments', force),
        db.getDocs<Tenant>('tenants', force),
        db.getDocs<Property>('properties', force),
        db.getDocs<Unit>('units', force),
        db.getDocs<Bill>('bills', force),
      ]);

      // Filter payments belonging to this landlord
      const ownerPayments = allPayments.filter((p) => p.ownerId === user.uid);
      // Sort newest first
      ownerPayments.sort((a, b) => {
        const dateA = a.submittedAt || a.paymentDate || a.createdAt;
        const dateB = b.submittedAt || b.paymentDate || b.createdAt;
        return dateB.localeCompare(dateA);
      });
      setPayments(ownerPayments);

      // Maps
      const tMap: Record<string, Tenant> = {};
      allTenants.forEach((t) => {
        if (t.id) tMap[t.id] = t;
      });
      setTenantMap(tMap);

      const pMap: Record<string, Property> = {};
      allProperties.forEach((p) => {
        if (p.id) pMap[p.id] = p;
      });
      setPropertyMap(pMap);

      const uMap: Record<string, Unit> = {};
      allUnits.forEach((u) => {
        if (u.id) uMap[u.id] = u;
      });
      setUnitMap(uMap);

      const bMap: Record<string, Bill> = {};
      allBills.forEach((b) => {
        if (b.id) bMap[b.id] = b;
      });
      setBillMap(bMap);
    } catch (e) {
      console.error('Error loading payment verifications', e);
      Alert.alert('Error', 'Failed to load payment submissions.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  };

  const handleApprove = (payment: Payment) => {
    const tenant = tenantMap[payment.tenantId];
    const tenantName = tenant ? tenant.name : 'Tenant';
    const bill = billMap[payment.billId];
    const paidAmt = payment.amountPaid || payment.amount;
    const remainingAfter = bill ? Math.max(0, bill.remainingAmount - paidAmt) : 0;

    Alert.alert(
      'Approve Payment?',
      `Approve ₹${paidAmt.toLocaleString('en-IN')} submitted by ${tenantName}?\n\n` +
      `Bill Total: ₹${bill ? bill.totalAmount.toLocaleString('en-IN') : 'N/A'}\n` +
      `Amount Paid: ₹${paidAmt.toLocaleString('en-IN')}\n` +
      `Remaining Due After Approval: ₹${remainingAfter.toLocaleString('en-IN')}\n\n` +
      `This will verify the payment and update the bill status.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve & Apply',
          style: 'default',
          onPress: async () => {
            setProcessingId(payment.id!);
            try {
              await paymentService.approvePayment(payment.id!);
              Alert.alert('Success', 'Payment approved and verified successfully!');
              await loadData(true);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to approve payment.');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  const handleReject = (payment: Payment) => {
    const tenant = tenantMap[payment.tenantId];
    const tenantName = tenant ? tenant.name : 'Tenant';

    Alert.alert(
      'Reject Payment?',
      `Reject ₹${payment.amount} submission by ${tenantName}? The bill status will remain unverified and unchanged.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject Payment',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(payment.id!);
            try {
              await paymentService.rejectPayment(payment.id!, 'Transaction unverified or not received.');
              Alert.alert('Rejected', 'Payment submission marked as Rejected.');
              await loadData(true);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to reject payment.');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <LoadingView message="Loading payment submissions..." />;
  }

  // Filtered by tab
  const filteredPayments = payments.filter((p) => {
    const status = p.status || 'approved'; // default legacy is approved
    if (activeTab === 'pending') return status === 'pending';
    if (activeTab === 'approved') return status === 'approved';
    if (activeTab === 'rejected') return status === 'rejected';
    return true;
  });

  const pendingCount = payments.filter((p) => (p.status || 'approved') === 'pending').length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'pending' && styles.tabButtonActive]}
          onPress={() => setActiveTab('pending')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
            Pending {pendingCount > 0 ? `(${pendingCount})` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'approved' && styles.tabButtonActive]}
          onPress={() => setActiveTab('approved')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'approved' && styles.tabTextActive]}>Approved</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'rejected' && styles.tabButtonActive]}
          onPress={() => setActiveTab('rejected')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'rejected' && styles.tabTextActive]}>Rejected</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'all' && styles.tabButtonActive]}
          onPress={() => setActiveTab('all')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>All</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredPayments}
        keyExtractor={(item) => item.id!}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <EmptyState
            icon={activeTab === 'pending' ? 'shield-checkmark-outline' : 'cash-outline'}
            title={activeTab === 'pending' ? 'No Pending Verifications' : 'No Payments Found'}
            description={
              activeTab === 'pending'
                ? 'All tenant payment submissions have been reviewed and verified.'
                : 'There are no payment records matching this status filter.'
            }
          />
        }
        renderItem={({ item }) => {
          const tenant = tenantMap[item.tenantId];
          const bill = billMap[item.billId];
          const property = item.propertyId
            ? propertyMap[item.propertyId]
            : bill
            ? propertyMap[bill.propertyId]
            : null;
          const unit = item.unitId ? unitMap[item.unitId] : bill ? unitMap[bill.unitId] : null;
          const status = item.status || 'approved';
          const isProcessing = processingId === item.id;

          const submissionDateStr = item.submittedAt
            ? new Date(item.submittedAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : item.paymentDate;

          return (
            <View style={styles.paymentCard}>
              {/* Top Row: Tenant Info + Status Badge */}
              <View style={styles.cardHeader}>
                <View style={styles.tenantInfoRow}>
                  <View style={styles.avatarMini}>
                    <Text style={styles.avatarMiniText}>
                      {(tenant?.name || 'T')
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .substring(0, 2)
                        .toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.tenantName}>{tenant?.name || 'Unknown Tenant'}</Text>
                    <Text style={styles.propertySub}>
                      {property?.name || 'Property'} • Unit {unit?.unitNumber || '...'}
                    </Text>
                  </View>
                </View>

                {/* Status Badge */}
                <View
                  style={[
                    styles.statusBadge,
                    status === 'approved'
                      ? styles.statusApproved
                      : status === 'rejected'
                      ? styles.statusRejected
                      : styles.statusPending,
                  ]}
                >
                  <Ionicons
                    name={
                      status === 'approved'
                        ? 'checkmark-circle'
                        : status === 'rejected'
                        ? 'close-circle'
                        : 'time'
                    }
                    size={13}
                    color={
                      status === 'approved'
                        ? colors.secondary
                        : status === 'rejected'
                        ? colors.danger
                        : colors.warning
                    }
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.statusBadgeText,
                      status === 'approved'
                        ? styles.statusApprovedText
                        : status === 'rejected'
                        ? styles.statusRejectedText
                        : styles.statusPendingText,
                    ]}
                  >
                    {status === 'approved'
                      ? 'Approved'
                      : status === 'rejected'
                      ? 'Rejected'
                      : 'Pending Verification'}
                  </Text>
                </View>
              </View>

              {/* Middle Section: Financial & Txn Details */}
              <View style={styles.detailsBox}>
                {bill && (
                  <>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Invoice Details</Text>
                      <Text style={styles.detailValue}>
                        {bill.billNumber} ({bill.billingMonth})
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Bill Total Amount</Text>
                      <MoneyText amount={bill.totalAmount} style={styles.detailValue} />
                    </View>
                  </>
                )}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Amount Paid by Tenant</Text>
                  <MoneyText amount={item.amountPaid || item.amount} style={styles.amountText} />
                </View>

                {bill && status === 'pending' && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Remaining After Approval</Text>
                    <MoneyText
                      amount={Math.max(0, bill.remainingAmount - (item.amountPaid || item.amount))}
                      variant="danger"
                      style={styles.detailValue}
                    />
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Transaction ID / UTR</Text>
                  <Text style={[styles.detailValue, styles.boldValue]}>
                    {item.transactionId || 'Not provided'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Submission Date</Text>
                  <Text style={styles.detailValue}>{submissionDateStr}</Text>
                </View>

                {status === 'rejected' && item.rejectionReason && (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.danger }]}>Reason</Text>
                    <Text style={[styles.detailValue, { color: colors.danger }]}>
                      {item.rejectionReason}
                    </Text>
                  </View>
                )}
              </View>

              {/* Receipt Attachment Link */}
              {item.screenshotUrl && (
                <TouchableOpacity
                  style={styles.receiptButton}
                  onPress={() => {
                    Alert.alert('Payment Receipt', 'Open attached receipt image?\n\n' + item.screenshotUrl, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Open URL', onPress: () => Linking.openURL(item.screenshotUrl!) },
                    ]);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="document-attach-outline" size={16} color={colors.primary} />
                  <Text style={styles.receiptButtonText}>View Payment Receipt Attachment</Text>
                </TouchableOpacity>
              )}

              {/* Actions for Pending Verification */}
              {status === 'pending' && (
                <View style={styles.actionButtonsRow}>
                  <AppButton
                    title="Reject"
                    variant="danger"
                    size="sm"
                    icon="close-outline"
                    onPress={() => handleReject(item)}
                    loading={isProcessing}
                    style={styles.actionButtonHalf}
                  />
                  <AppButton
                    title="Approve"
                    variant="primary"
                    size="sm"
                    icon="checkmark-outline"
                    onPress={() => handleApprove(item)}
                    loading={isProcessing}
                    style={styles.actionButtonHalf}
                  />
                </View>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    tabContainer: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tabButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      borderRadius: spacing.borderRadius.md,
      marginHorizontal: 2,
    },
    tabButtonActive: {
      backgroundColor: colors.primaryLight + '20',
    },
    tabText: {
      fontSize: typography.sizes.xs + 1,
      fontWeight: typography.weights.semibold,
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: colors.primary,
      fontWeight: typography.weights.bold,
    },
    listContent: {
      padding: spacing.md,
      paddingBottom: spacing.xxl,
    },
    paymentCard: {
      backgroundColor: colors.surface,
      borderRadius: spacing.borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...spacing.shadows.light,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tenantInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    avatarMini: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: spacing.sm,
    },
    avatarMiniText: {
      fontSize: typography.sizes.xs + 1,
      fontWeight: typography.weights.bold,
      color: colors.primary,
    },
    tenantName: {
      fontSize: typography.sizes.sm + 1,
      fontWeight: typography.weights.bold,
      color: colors.text,
    },
    propertySub: {
      fontSize: typography.sizes.xs,
      color: colors.textSecondary,
      marginTop: 1,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: spacing.borderRadius.round,
    },
    statusPending: {
      backgroundColor: colors.warning + '20',
    },
    statusApproved: {
      backgroundColor: colors.secondary + '20',
    },
    statusRejected: {
      backgroundColor: colors.danger + '20',
    },
    statusBadgeText: {
      fontSize: typography.sizes.xs - 1,
      fontWeight: typography.weights.bold,
    },
    statusPendingText: {
      color: colors.warning,
    },
    statusApprovedText: {
      color: colors.secondary,
    },
    statusRejectedText: {
      color: colors.danger,
    },
    detailsBox: {
      backgroundColor: colors.background,
      borderRadius: spacing.borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    detailLabel: {
      fontSize: typography.sizes.xs + 1,
      color: colors.textSecondary,
    },
    detailValue: {
      fontSize: typography.sizes.xs + 1,
      color: colors.text,
      fontWeight: typography.weights.medium,
    },
    boldValue: {
      fontWeight: typography.weights.bold,
      color: colors.primary,
    },
    amountText: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.bold,
      color: colors.primary,
    },
    receiptButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xs + 2,
      marginBottom: spacing.sm,
    },
    receiptButtonText: {
      fontSize: typography.sizes.xs + 1,
      color: colors.primary,
      fontWeight: typography.weights.semibold,
      marginLeft: 4,
    },
    actionButtonsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    actionButtonHalf: {
      flex: 1,
    },
  });
