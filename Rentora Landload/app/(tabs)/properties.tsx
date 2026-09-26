import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useProperties } from '../../hooks/useProperties';
import { useUnits } from '../../hooks/useUnits';
import PropertyCard from '../../components/domain/PropertyCard';
import AppInput from '../../components/ui/AppInput';
import LoadingView from '../../components/ui/LoadingView';
import EmptyState from '../../components/ui/EmptyState';
import SwipeableTabWrapper from '../../components/ui/SwipeableTabWrapper';

export default function PropertiesScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const router = useRouter();
  const { properties, loading: propLoading, refresh: refreshProps, searchProperties } = useProperties();
  const { units, loading: unitLoading, refresh: refreshUnits } = useUnits();
  
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshProps(true), refreshUnits(true)]);
    setRefreshing(false);
  };

  const handlePropertyPress = useCallback((id: string) => {
    router.push({ pathname: '/properties/[id]', params: { id } });
  }, [router]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      searchProperties(search);
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [search]);

  const isLoading = propLoading || unitLoading;

  return (
    <SwipeableTabWrapper currentTab="properties">
      <SafeAreaView style={styles.container}>
        {/* Search Header */}
        <View style={styles.header}>
          <AppInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search properties by name or address..."
            icon="search-outline"
            style={styles.searchInput}
          />
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/properties/add')}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {isLoading && !refreshing ? (
          <LoadingView message="Loading properties..." />
        ) : properties.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="business-outline"
              title={search.trim() ? "No Search Results" : "No Properties Yet"}
              description={
                search.trim()
                  ? `We couldn't find any properties matching "${search}". Try searching for something else.`
                  : "Add your first property flat, room, house, shop, or office to begin managing units and billing."
              }
              actionTitle={search.trim() ? "Clear Search" : "Add Property"}
              onActionPress={() => {
                if (search.trim()) {
                  setSearch('');
                } else {
                  router.push('/properties/add');
                }
              }}
            />
          </View>
        ) : (
          <FlatList
            data={properties}
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
              // Filter units for this property
              const propUnits = units.filter((u) => u.propertyId === item.id);
              const totalUnits = item.totalUnits || propUnits.length;
              const occupiedUnits = propUnits.filter(u => u.status === 'occupied').length;
              const vacantUnits = propUnits.length - occupiedUnits;
              return (
                <PropertyCard
                  property={item}
                  totalUnits={totalUnits}
                  occupiedUnits={occupiedUnits}
                  vacantUnits={vacantUnits}
                  onPress={handlePropertyPress}
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
