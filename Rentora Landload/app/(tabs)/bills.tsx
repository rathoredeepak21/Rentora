import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, RefreshControl, Alert, Platform } from 'react-native';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useBills } from '../../hooks/useBills';
import { useProperties } from '../../hooks/useProperties';
import { useUnits } from '../../hooks/useUnits';
import { useTenants } from '../../hooks/useTenants';
import BillCard from '../../components/domain/BillCard';
import AppInput from '../../components/ui/AppInput';
import LoadingView from '../../components/ui/LoadingView';
import EmptyState from '../../components/ui/EmptyState';
import { Bill } from '../../types';
import { billService } from '../../services/billService';
import { paymentService } from '../../services/paymentService';

import SwipeableTabWrapper from '../../components/ui/SwipeableTabWrapper';

export default function BillsScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const router = useRouter();
  const { bills, loading: billsLoading, refresh: refreshBills, searchBills } = useBills();
  const { properties, loading: propLoading, refresh: refreshProps } = useProperties();
  const { units, loading: unitLoading, refresh: refreshUnits } = useUnits();
  const { tenants, loading: tenantLoading, refresh: refreshTenants } = useTenants();

  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'paid'>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState(0);

  const fetchPendingPayments = useCallback(async () => {
    if (!user) return;
    try {
      const pendings = await paymentService.getPendingPayments(user.uid);
      setPendingPaymentsCount(pendings.length);
    } catch (e) {
      console.warn('Could not fetch pending payments count', e);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchPendingPayments();
    }, [fetchPendingPayments])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refreshBills(true),
      refreshProps(true),
      refreshUnits(true),
      refreshTenants(true),
      fetchPendingPayments(),
    ]);
    setRefreshing(false);
  };

  // Trigger search
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      // Map 'pending' tab search filter to include both 'unpaid' and 'partial' statuses
      let searchStatus = activeTab;
      searchBills(search, searchStatus);
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [search, activeTab]);

  const isLoading = billsLoading || propLoading || unitLoading || tenantLoading;

  // Filter bills list locally for tab selection
  const filteredBills = bills.filter((b) => {
    if (activeTab === 'pending') {
      return b.remainingAmount > 0 || b.paymentStatus === 'unpaid' || b.paymentStatus === 'partial';
    }
    if (activeTab === 'paid') {
      return b.paymentStatus === 'paid' && (b.remainingAmount === 0 || b.remainingAmount === undefined);
    }
    return true; // All
  });

  const handleDeleteBill = useCallback((bill: Bill) => {
    Alert.alert(
      "Delete Bill?",
      "Are you sure you want to delete this bill permanently? Any payment records associated with this bill will also be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await billService.deleteBill(bill.id!);
              Alert.alert("Success", "Bill deleted successfully!");
              refreshBills();
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete bill");
            }
          }
        }
      ]
    );
  }, [refreshBills]);

  const handleMenuPress = useCallback((bill: Bill) => {
    Alert.alert(
      `Invoice ${bill.billNumber}`,
      "Choose an action for this invoice:",
      [
        {
          text: "View Bill",
          onPress: () => router.push({ pathname: '/bills/[id]', params: { id: bill.id } })
        },
        {
          text: "Edit Bill",
          onPress: () => router.push({ pathname: '/bills/edit', params: { billId: bill.id } })
        },
        bill.paymentStatus !== 'paid' ? {
          text: "Record Payment",
          onPress: () => router.push({ pathname: '/bills/payment', params: { billId: bill.id } })
        } : null,
        {
          text: "Delete Bill",
          style: "destructive",
          onPress: () => handleDeleteBill(bill)
        },
        { text: "Cancel", style: "cancel" }
      ].filter(Boolean) as any
    );
  }, [router, handleDeleteBill]);

  const handleBillPress = useCallback((id: string) => {
    router.push({ pathname: '/bills/[id]', params: { id } });
  }, [router]);

  return (
    <SwipeableTabWrapper currentTab="bills">
      <SafeAreaView style={styles.container}>
        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          {(['all', 'pending', 'paid'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'all' ? 'All Invoices' : tab === 'pending' ? 'Pending' : 'Paid'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Pending Verifications Banner */}
        {pendingPaymentsCount > 0 && (
          <TouchableOpacity
            style={styles.pendingBanner}
            onPress={() => router.push('/bills/payment-verifications')}
            activeOpacity={0.8}
          >
            <View style={styles.pendingBannerLeft}>
              <Ionicons name="shield-checkmark" size={18} color="#D97706" />
              <Text style={styles.pendingBannerText}>
                {pendingPaymentsCount} {pendingPaymentsCount === 1 ? 'payment submission' : 'payment submissions'} pending verification
              </Text>
            </View>
            <View style={styles.pendingBannerRight}>
              <Text style={styles.pendingBannerAction}>Review</Text>
              <Ionicons name="chevron-forward" size={14} color="#D97706" />
            </View>
          </TouchableOpacity>
        )}

        {/* Search Header */}
        <View style={styles.header}>
          <AppInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by invoice number or month..."
            icon="search-outline"
            style={styles.searchInput}
          />
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/bills/create')}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {isLoading && !refreshing ? (
          <LoadingView message="Loading invoices..." />
        ) : filteredBills.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="receipt-outline"
              title={search.trim() ? "No Search Results" : "No Invoices Found"}
              description={
                search.trim()
                  ? `We couldn't find any invoices matching "${search}". Try searching for something else.`
                  : activeTab === 'pending'
                  ? "Excellent! No pending bills to collect."
                  : activeTab === 'paid'
                  ? "No paid invoices recorded yet."
                  : "Create your first rent invoice to start collecting and tracking payments."
              }
              actionTitle={search.trim() ? "Clear Search" : activeTab === 'all' ? "Create Rent Bill" : undefined}
              onActionPress={() => {
                if (search.trim()) {
                  setSearch('');
                } else {
                  router.push('/bills/create');
                }
              }}
            />
          </View>
        ) : (
          <FlatList
            data={filteredBills}
            keyExtractor={(item) => item.id!}
            contentContainerStyle={styles.listContainer}
            initialNumToRender={8}
            windowSize={5}
            maxToRenderPerBatch={10}
            removeClippedSubviews={Platform.OS === 'android'}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
            }
            renderItem={({ item }) => {
              const tenantObj = tenants.find((t) => t.id === item.tenantId);
              const propObj = properties.find((p) => p.id === item.propertyId);
              const unitObj = units.find((u) => u.id === item.unitId);

              return (
                <BillCard
                  bill={item}
                  tenantName={tenantObj ? tenantObj.name : 'Unknown Tenant'}
                  propertyName={propObj ? propObj.name : 'Property'}
                  unitNumber={unitObj ? unitObj.unitNumber : '...'}
                  onPress={handleBillPress}
                  onMenuPress={handleMenuPress}
                />
              );
            }}
          />
        )}
      </SafeAreaView>
    </SwipeableTabWrapper>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.md - 2,
    alignItems: 'center',
    borderRadius: spacing.borderRadius.sm,
  },
  tabButtonActive: {
    backgroundColor: colors.primaryLight,
  },
  tabText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  searchInput: {
    flex: 1,
    marginBottom: 0,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: spacing.borderRadius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...spacing.shadows.light,
  },
  listContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  emptyContainer: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  pendingBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pendingBannerText: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    color: '#92400E',
    marginLeft: spacing.xs,
  },
  pendingBannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pendingBannerAction: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    color: '#D97706',
    marginRight: 2,
  },
});
