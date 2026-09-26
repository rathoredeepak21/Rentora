import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useProperties } from '../../hooks/useProperties';
import { useUnits } from '../../hooks/useUnits';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import LoadingView from '../../components/ui/LoadingView';
import UnitCard from '../../components/domain/UnitCard';
import MoneyText from '../../components/ui/MoneyText';
import AppButton from '../../components/ui/AppButton';
import db from '../../utils/db';
import { Tenant } from '../../types';

export default function PropertyDetailsScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { properties, loading: propLoading, deleteProperty } = useProperties();
  const { units, loading: unitLoading, refresh: refreshUnits } = useUnits(id);
  
  const [tenants, setTenants] = useState<Record<string, string>>({}); // Map unitId -> tenantName
  const [isDeleting, setIsDeleting] = useState(false);

  const property = properties.find((p) => p.id === id);

  // Fetch tenant names for units
  useEffect(() => {
    const fetchTenants = async () => {
      try {
        const allTenants = await db.getDocs<Tenant>('tenants');
        const tenantMap: Record<string, string> = {};
        allTenants.forEach((t) => {
          if (t.status === 'active' && t.propertyId === id) {
            tenantMap[t.unitId] = t.name;
          }
        });
        setTenants(tenantMap);
      } catch (e) {
        console.error('Error fetching tenants', e);
      }
    };
    if (id) {
      fetchTenants();
    }
  }, [id, units]);

  // Handle focus reload
  useEffect(() => {
    refreshUnits();
  }, [refreshUnits]);

  if (propLoading || !property) {
    return <LoadingView message="Loading property details..." />;
  }

  const handleDelete = () => {
    // Check if property has occupied units
    const hasOccupied = units.some((u) => u.status === 'occupied');
    
    if (hasOccupied) {
      Alert.alert(
        'Cannot Delete Property',
        'This property contains active tenants in occupied units. You must vacate the tenants before deleting the property.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Delete Property',
      'Are you sure you want to delete this property? This will soft-delete the property record.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteProperty(property.id!);
              Alert.alert('Success', 'Property deleted successfully', [
                { text: 'OK', onPress: () => router.replace('/(tabs)/properties') }
              ]);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete property');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const getPropertyIcon = (type: string) => {
    switch (type) {
      case 'Room': return 'bed-outline';
      case 'Shop': return 'cart-outline';
      case 'Office': return 'desktop-outline';
      case 'House': return 'home-outline';
      case 'Flat':
      default: return 'business-outline';
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Info Card */}
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleWrapper}>
              <View style={styles.iconContainer}>
                <Ionicons name={getPropertyIcon(property.type) as any} size={24} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.name}>{property.name}</Text>
                <Text style={styles.type}>{property.type}</Text>
              </View>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/properties/edit', params: { id: property.id } })}
                style={styles.editButton}
              >
                <Ionicons name="create-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.deleteButton} disabled={isDeleting}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>

          {property.address ? (
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={16} color={colors.textSecondary} style={styles.addressIcon} />
              <Text style={styles.address}>{property.address}</Text>
            </View>
          ) : null}

          <View style={styles.divider} />

          <Text style={styles.subTitle}>Default Pricing & Rates</Text>
          <View style={styles.pricingGrid}>
            <View style={styles.pricingItem}>
              <Text style={styles.pricingLabel}>Rent</Text>
              <MoneyText amount={property.defaultRent} style={styles.pricingValue} />
            </View>
            <View style={styles.pricingItem}>
              <Text style={styles.pricingLabel}>Elec Rate</Text>
              <Text style={styles.pricingValueText}>₹{property.electricityRate}/Unit</Text>
            </View>
            <View style={styles.pricingItem}>
              <Text style={styles.pricingLabel}>Water</Text>
              <MoneyText amount={property.waterCharge} style={styles.pricingValue} />
            </View>
            <View style={styles.pricingItem}>
              <Text style={styles.pricingLabel}>Parking</Text>
              <MoneyText amount={property.parkingCharge} style={styles.pricingValue} />
            </View>
          </View>
        </View>

        {/* Property Rules Card */}
        {property.propertyRules && property.propertyRules.length > 0 ? (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
                <Text style={styles.subTitle}>Property Rules ({property.propertyRules.length})</Text>
              </View>
              <TouchableOpacity onPress={() => router.push({ pathname: '/properties/edit', params: { id: property.id } })}>
                <Text style={{ fontSize: typography.sizes.xs + 1, color: colors.primary, fontWeight: typography.weights.bold }}>Edit</Text>
              </TouchableOpacity>
            </View>
            <View style={{ gap: 8, marginTop: 4 }}>
              {property.propertyRules.map((rule, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, fontSize: typography.sizes.sm, color: colors.text, lineHeight: 18 }}>{rule}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="shield-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.subTitle}>Property Rules</Text>
              </View>
              <TouchableOpacity onPress={() => router.push({ pathname: '/properties/edit', params: { id: property.id } })}>
                <Text style={{ fontSize: typography.sizes.xs + 1, color: colors.primary, fontWeight: typography.weights.bold }}>+ Add Rules</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: typography.sizes.xs + 1, color: colors.textSecondary, marginTop: 6 }}>
              No rules added yet. Set house guidelines for your tenants.
            </Text>
          </View>
        )}

        {/* Units Heading */}
        <View style={styles.unitsHeaderRow}>
          <Text style={styles.sectionTitle}>Units / Rooms ({units.length})</Text>
          <TouchableOpacity
            style={styles.addUnitBtn}
            onPress={() => router.push({ pathname: '/properties/unit-add', params: { propertyId: property.id } })}
          >
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={styles.addUnitText}>Add Unit</Text>
          </TouchableOpacity>
        </View>

        {/* Units List */}
        {unitLoading ? (
          <LoadingView message="Loading units..." fullscreen={false} />
        ) : units.length === 0 ? (
          <View style={styles.emptyUnitsCard}>
            <Ionicons name="apps-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyUnitsText}>No units added yet</Text>
            <Text style={styles.emptyUnitsSub}>Add units to this property to house tenants.</Text>
            <AppButton
              title="Add Your First Unit"
              onPress={() => router.push({ pathname: '/properties/unit-add', params: { propertyId: property.id } })}
              size="sm"
              style={styles.emptyUnitsBtn}
            />
          </View>
        ) : (
          <View style={styles.unitsList}>
            {units.map((unit) => (
              <UnitCard
                key={unit.id}
                unit={unit}
                tenantName={tenants[unit.id!]}
                onEdit={() => router.push({ pathname: '/properties/unit-edit', params: { id: unit.id, propertyId: property.id } })}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 60,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...spacing.shadows.light,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: spacing.borderRadius.md,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  name: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  type: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.bold,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButton: {
    width: 38,
    height: 38,
    borderRadius: spacing.borderRadius.sm,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  deleteButton: {
    width: 38,
    height: 38,
    borderRadius: spacing.borderRadius.sm,
    backgroundColor: colors.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingHorizontal: 2,
  },
  addressIcon: {
    marginRight: spacing.xs,
  },
  address: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  subTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pricingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  pricingItem: {
    width: '45%',
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pricingLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginBottom: 4,
  },
  pricingValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  pricingValueText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  unitsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.md + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  addUnitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: spacing.borderRadius.sm,
  },
  addUnitText: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    marginLeft: 2,
  },
  emptyUnitsCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: colors.border,
    minHeight: 180,
    marginBottom: spacing.xl,
  },
  emptyUnitsText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyUnitsSub: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  emptyUnitsBtn: {
    paddingHorizontal: spacing.xl,
  },
  unitsList: {
    marginBottom: spacing.xl,
  },
});
