import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Property, PropertyType } from '../../types';
import { useStyles, useTheme, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import AppCard from '../ui/AppCard';

interface PropertyCardProps {
  property: Property;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  onPress: (id: string) => void;
}

export const PropertyCard = memo<PropertyCardProps>(({ 
  property, 
  totalUnits, 
  occupiedUnits, 
  vacantUnits, 
  onPress 
}) => {
  const styles = useStyles(getStyles);
  const { colors } = useTheme();

  const getPropertyIcon = (type: PropertyType): string => {
    switch (type) {
      case 'Room': return 'bed-outline';
      case 'Flat': return 'business-outline';
      case 'Shop': return 'cart-outline';
      case 'Office': return 'desktop-outline';
      case 'House':
      default: return 'home-outline';
    }
  };

  return (
    <AppCard onPress={() => onPress(property.id!)} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleWrapper}>
          <View style={styles.iconContainer}>
            <Ionicons name={getPropertyIcon(property.type) as any} size={22} color={colors.primary} />
          </View>
          <View style={styles.nameContainer}>
            <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
              {property.name}
            </Text>
            <Text style={styles.typeText}>{property.type}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>

      <View style={styles.addressWrapper}>
        <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
        <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="tail">
          {property.address || 'No Address Specified'}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.footerRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Total Units</Text>
          <Text style={styles.statValue}>{totalUnits}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.primary }]}>Occupied</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{occupiedUnits}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.secondary }]}>Vacant</Text>
          <Text style={[styles.statValue, { color: colors.secondary }]}>{vacantUnits}</Text>
        </View>
      </View>
    </AppCard>
  );
});

const getStyles = (colors: any) => StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  titleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  nameContainer: {
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: spacing.borderRadius.sm,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  name: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  typeText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginTop: spacing.xs - 2,
  },
  addressWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingLeft: 2,
  },
  addressText: {
    fontSize: typography.sizes.sm - 1,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: typography.sizes.xs - 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginBottom: spacing.xs - 2,
  },
  statValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
});

export default PropertyCard;
