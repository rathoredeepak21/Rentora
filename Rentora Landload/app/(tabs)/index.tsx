import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, RefreshControl } from 'react-native';
import { useTheme, useStyles, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import LoadingView from '../../components/ui/LoadingView';
import MoneyText from '../../components/ui/MoneyText';
import StatusBadge from '../../components/ui/StatusBadge';
import db from '../../utils/db';
import { Property, Unit, Tenant, Bill, Payment } from '../../types';
import { decorateBills } from '../../services/billService';
import { notificationService } from '../../services/notificationService';
import SwipeableTabWrapper from '../../components/ui/SwipeableTabWrapper';

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // DB States
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  // Resolved list display maps
  const [tenantMap, setTenantMap] = useState<Record<string, string>>({});
  const [propertyMap, setPropertyMap] = useState<Record<string, string>>({});
  const [unitMap, setUnitMap] = useState<Record<string, string>>({});
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = notificationService.subscribeLandlordNotifications(user.uid, (list) => {
      const unread = list.filter((n) => !n.isRead).length;
      setUnreadNotifCount(unread);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  const loadDashboardData = useCallback(async (force = false) => {
    if (!user) return;
    try {
      const [props, unts, tnts, bls, pymts] = await Promise.all([
        db.getDocs<Property>('properties', force),
        db.getDocs<Unit>('units', force),
        db.getDocs<Tenant>('tenants', force),
        db.getDocs<Bill>('bills', force),
        db.getDocs<Payment>('payments', force),
      ]);

      // Filter by ownerId safely
      const ownerProps = (props || []).filter(p => p && p.ownerId === user.uid && !p.isDeleted);
      const ownerUnits = (unts || []).filter(u => u && u.ownerId === user.uid);
      const ownerTenants = (tnts || []).filter(t => t && t.ownerId === user.uid);
      const ownerBills = (bls || []).filter(b => b && b.ownerId === user.uid);
      const ownerPayments = (pymts || []).filter(p => p && p.ownerId === user.uid);

      setProperties(ownerProps);
      setUnits(ownerUnits);
      setTenants(ownerTenants);
      
      // Group ownerBills by tenantId and decorate
      const billsByTenant: Record<string, Bill[]> = {};
      ownerBills.forEach(b => {
        if (!b || !b.tenantId) return;
        if (!billsByTenant[b.tenantId]) {
          billsByTenant[b.tenantId] = [];
        }
        billsByTenant[b.tenantId].push(b);
      });
      
      const decoratedBills: Bill[] = [];
      Object.keys(billsByTenant).forEach(tId => {
        decoratedBills.push(...decorateBills(billsByTenant[tId]));
      });

      setBills(decoratedBills);
      setPayments(ownerPayments);

      // Create maps for quick resolution in lists
      const tMap: Record<string, string> = {};
      (tnts || []).forEach(t => { if (t && t.id) tMap[t.id] = t.name || 'Tenant'; });
      setTenantMap(tMap);

      const pMap: Record<string, string> = {};
      (props || []).forEach(p => { if (p && p.id) pMap[p.id] = p.name || 'Property'; });
      setPropertyMap(pMap);

      const uMap: Record<string, string> = {};
      (unts || []).forEach(u => { if (u && u.id) uMap[u.id] = u.unitNumber || 'Unit'; });
      setUnitMap(uMap);
    } catch (e) {
      console.error('Error loading dashboard stats', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [loadDashboardData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData(true);
    setRefreshing(false);
  };

  if (loading) {
    return <LoadingView message="Loading dashboard..." />;
  }

  // Stats Computations
  const totalProperties = properties.length;
  const totalUnits = units.length;
  const occupiedUnits = units.filter(u => u && u.status === 'occupied').length;
  const vacantUnits = totalUnits - occupiedUnits;
  const activeTenants = tenants.filter(t => t && t.status === 'active').length;

  // Monthly financials computation (based on bills generated in the current month)
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; // e.g. "2026-08"

  const currentMonthBills = bills.filter(b => b && b.billingMonth === currentMonthStr);
  const totalBilled = currentMonthBills.reduce((acc, b) => acc + (b.totalAmount || 0), 0);
  const totalReceived = currentMonthBills.reduce((acc, b) => acc + (b.paidAmount || 0), 0);
  const totalPending = currentMonthBills.reduce((acc, b) => acc + (b.remainingAmount || 0), 0);

  // Lists filtering
  const pendingBills = bills.filter(b => b && (b.remainingAmount > 0 || b.paymentStatus === 'unpaid' || b.paymentStatus === 'partial')).slice(0, 5);
  const recentPayments = [...payments].sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')).slice(0, 5);
  const pendingPaymentsCount = payments.filter(p => p && p.status === 'pending').length;

  return (
    <SwipeableTabWrapper currentTab="index">
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
          }
        >
          {/* Welcome Section */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.greetingText}>Welcome Back,</Text>
              <Text style={styles.ownerNameText} numberOfLines={1} ellipsizeMode="tail">{user?.name || 'Landlord'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                style={styles.avatarCircle}
                onPress={() => router.push('/notifications')}
                activeOpacity={0.75}
              >
                <Ionicons name="notifications-outline" size={20} color={colors.primary} />
                {unreadNotifCount > 0 && (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText}>
                      {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.avatarCircle} onPress={() => router.push('/(tabs)/settings')}>
                <Ionicons name="person" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Pending Verification Alert Banner */}
          {pendingPaymentsCount > 0 && (
            <TouchableOpacity
              style={styles.pendingVerificationBanner}
              onPress={() => router.push('/bills/payment-verifications')}
              activeOpacity={0.8}
            >
              <View style={styles.pendingBannerLeft}>
                <View style={styles.pendingBadgeIcon}>
                  <Ionicons name="shield-checkmark" size={20} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendingBannerTitle}>Pending Payment Approvals ({pendingPaymentsCount})</Text>
                  <Text style={styles.pendingBannerSub}>
                    {pendingPaymentsCount} {pendingPaymentsCount === 1 ? 'tenant submission' : 'tenant submissions'} waiting for your verification
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#D97706" />
            </TouchableOpacity>
          )}

          {/* Stats Grid */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="business" size={18} color={colors.primary} />
              </View>
              <Text style={styles.statValue}>{totalProperties}</Text>
              <Text style={styles.statLabel}>Properties</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: themeMode === 'dark' ? '#2E1065' : '#ECE5FD' }]}>
                <Ionicons name="key" size={18} color={themeMode === 'dark' ? '#A78BFA' : '#8B5CF6'} />
              </View>
              <Text style={styles.statValue}>{totalUnits}</Text>
              <Text style={styles.statLabel}>Total Units</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: colors.secondaryLight }]}>
                <Ionicons name="people" size={18} color={colors.secondary} />
              </View>
              <Text style={styles.statValue}>{activeTenants}</Text>
              <Text style={styles.statLabel}>Active Tenants</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: colors.warningLight }]}>
                <Ionicons name="bed" size={18} color={colors.warning} />
              </View>
              <Text style={styles.statValue}>{vacantUnits}</Text>
              <Text style={styles.statLabel}>Vacant Units</Text>
            </View>
          </View>

          {/* Financial Overview Card */}
          <View style={styles.financialCard}>
            <View style={styles.financialHeader}>
              <Text style={styles.financialTitle}>This Month's Invoicing</Text>
              <Text style={styles.financialMonth}>({now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })})</Text>
            </View>
            
            <View style={styles.financialGrid}>
              <View style={styles.finStat}>
                <Text style={styles.finLabel}>Total Billed</Text>
                <MoneyText amount={totalBilled} style={styles.finValue} />
              </View>
              <View style={styles.finStat}>
                <Text style={styles.finLabel}>Received</Text>
                <MoneyText amount={totalReceived} variant="success" style={styles.finValue} />
              </View>
              <View style={styles.finStat}>
                <Text style={styles.finLabel}>Pending</Text>
                <MoneyText amount={totalPending} variant="danger" style={styles.finValue} />
              </View>
            </View>
          </View>

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/properties/add')}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="business" size={22} color={colors.primary} />
              </View>
              <Text style={styles.actionLabel}>Add Property</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/tenants/add')}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: colors.secondaryLight }]}>
                <Ionicons name="person-add" size={22} color={colors.secondary} />
              </View>
              <Text style={styles.actionLabel}>Add Tenant</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/bills/create')}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: colors.warningLight }]}>
                <Ionicons name="receipt" size={22} color={colors.warning} />
              </View>
              <Text style={styles.actionLabel}>Create Bill</Text>
            </TouchableOpacity>
          </View>

          {/* Pending Bills */}
          <Text style={styles.sectionTitle}>Pending Collections ({pendingBills.length})</Text>
          {pendingBills.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle-outline" size={32} color={colors.secondary} />
              <Text style={styles.emptyText}>All invoices are fully paid! Great job.</Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {pendingBills.map((bill) => (
                <TouchableOpacity
                  key={bill.id}
                  style={styles.listItem}
                  onPress={() => router.push({ pathname: '/bills/[id]', params: { id: bill.id } })}
                  activeOpacity={0.8}
                >
                  <View style={styles.listItemLeft}>
                    <Text style={styles.listItemTitle} numberOfLines={1} ellipsizeMode="tail">{tenantMap[bill.tenantId] || 'Tenant'}</Text>
                    <Text style={styles.listItemSub} numberOfLines={1} ellipsizeMode="tail">
                      Unit {unitMap[bill.unitId]} • {propertyMap[bill.propertyId]}
                    </Text>
                  </View>
                  <View style={styles.listItemRight}>
                    <MoneyText amount={bill.remainingAmount} variant="danger" style={styles.listItemAmount} />
                    <StatusBadge status={bill.paymentStatus} type="bill" />
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.seeAllButton} onPress={() => router.push('/(tabs)/bills')}>
                <Text style={styles.seeAllText}>View All Invoices</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Recent Payments */}
          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Recent Payment History</Text>
          {recentPayments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="cash-outline" size={32} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No payments recorded yet.</Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {recentPayments.map((payment) => (
                <View key={payment.id} style={styles.listItem}>
                  <View style={styles.listItemLeft}>
                    <Text style={styles.listItemTitle} numberOfLines={1} ellipsizeMode="tail">{tenantMap[payment.tenantId] || 'Tenant'}</Text>
                    <Text style={styles.listItemSub} numberOfLines={1} ellipsizeMode="tail">
                      Recv: {payment.paymentDate} • {payment.paymentMethod.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.listItemRight}>
                    <MoneyText amount={payment.amount} variant="success" style={styles.listItemAmount} />
                    <Text style={styles.txnText}>ID: {payment.transactionId || 'N/A'}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </SwipeableTabWrapper>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  greetingText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
  },
  ownerNameText: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary + '20',
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.danger || '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  notifBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  statCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...spacing.shadows.light,
  },
  statIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  statLabel: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginTop: 2,
  },
  financialCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...spacing.shadows.light,
  },
  financialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  financialTitle: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  financialMonth: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
  },
  financialGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  finStat: {
    flex: 1,
    alignItems: 'center',
  },
  finLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  finValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  actionButton: {
    width: '30%',
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...spacing.shadows.light,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: spacing.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  actionLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.text,
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 100,
  },
  emptyText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    fontWeight: typography.weights.semibold,
    textAlign: 'center',
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...spacing.shadows.light,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listItemLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  listItemTitle: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  listItemSub: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
    marginTop: 2,
  },
  listItemRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  listItemAmount: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
  },
  seeAllButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: 4,
  },
  seeAllText: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  txnText: {
    fontSize: 9,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
  },
  pendingVerificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    padding: spacing.md,
    borderRadius: spacing.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    marginBottom: spacing.lg,
    ...spacing.shadows.light,
  },
  pendingBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: spacing.sm,
  },
  pendingBadgeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  pendingBannerTitle: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: '#92400E',
  },
  pendingBannerSub: {
    fontSize: typography.sizes.xs,
    color: '#B45309',
    marginTop: 2,
  },
});
