import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTenants } from '../../hooks/useTenants';
import { useProperties } from '../../hooks/useProperties';
import { useUnits } from '../../hooks/useUnits';
import TenantCard from '../../components/domain/TenantCard';
import AppInput from '../../components/ui/AppInput';
import LoadingView from '../../components/ui/LoadingView';
import EmptyState from '../../components/ui/EmptyState';
import SwipeableTabWrapper from '../../components/ui/SwipeableTabWrapper';

export default function TenantsScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const router = useRouter();
  const { tenants, loading: tenantLoading, refresh: refreshTenants, searchTenants } = useTenants();
  const { properties, loading: propLoading, refresh: refreshProps } = useProperties();
  const { units, loading: unitLoading, refresh: refreshUnits } = useUnits();

  const [activeTab, setActiveTab] = useState<'active' | 'vacated'>('active');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshTenants(true), refreshProps(true), refreshUnits(true)]);
    setRefreshing(false);
  };

  const handleTenantPress = useCallback((id: string) => {
    router.push({ pathname: '/tenants/[id]', params: { id } });
  }, [router]);

  // Trigger search on typing
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      searchTenants(search, activeTab);
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [search, activeTab]);

  const isLoading = tenantLoading || propLoading || unitLoading;

  return (
    <SwipeableTabWrapper currentTab="tenants">
      <SafeAreaView style={styles.container}>
        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'active' && styles.tabButtonActive]}
            onPress={() => setActiveTab('active')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>Active</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'vacated' && styles.tabButtonActive]}
            onPress={() => setActiveTab('vacated')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'vacated' && styles.tabTextActive]}>Vacated</Text>
          </TouchableOpacity>
        </View>

        {/* Search Header */}
        <View style={styles.header}>
          <AppInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by tenant name or mobile..."
            icon="search-outline"
            style={styles.searchInput}
          />
          {activeTab === 'active' && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/tenants/add')}
              activeOpacity={0.8}
            >
              <Ionicons name="person-add" size={20} color={colors.white} />
            </TouchableOpacity>
          )}
        </View>

        {/* Content */}
        {isLoading && !refreshing ? (
          <LoadingView message="Loading tenants..." />
        ) : tenants.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="people-outline"
              title={search.trim() ? "No Search Results" : "No Tenants Yet"}
              description={
                search.trim()
                  ? `We couldn't find any tenants matching "${search}". Try searching for something else.`
                  : activeTab === 'active'
                  ? "Add your first tenant and assign them to an available vacant unit to start tracking rent."
                  : "No historical vacated tenants found."
              }
              actionTitle={search.trim() ? "Clear Search" : activeTab === 'active' ? "Add Tenant" : undefined}
              onActionPress={() => {
                if (search.trim()) {
                  setSearch('');
                } else if (activeTab === 'active') {
                  router.push('/tenants/add');
                }
              }}
            />
          </View>
        ) : (
          <FlatList
            data={tenants}
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
              // Find property and unit details
              const prop = properties.find((p) => p.id === item.propertyId);
              const unit = units.find((u) => u.id === item.unitId);
              
              return (
                <TenantCard
                  tenant={item}
                  propertyName={prop ? prop.name : 'Unknown Property'}
                  unitNumber={unit ? unit.unitNumber : '...'}
                  onPress={handleTenantPress}
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
});
