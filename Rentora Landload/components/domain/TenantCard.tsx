import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Tenant } from '../../types';
import { useStyles, useTheme, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import AppCard from '../ui/AppCard';
import StatusBadge from '../ui/StatusBadge';
import MoneyText from '../ui/MoneyText';

interface TenantCardProps {
  tenant: Tenant;
  propertyName: string;
  unitNumber: string;
  onPress: (id: string) => void;
}

export const TenantCard = memo<TenantCardProps>(({
  tenant,
  propertyName,
  unitNumber,
  onPress,
}) => {
  const styles = useStyles(getStyles);
  const { colors } = useTheme();

  return (
    <AppCard onPress={() => onPress(tenant.id!)} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
            {tenant.name}
          </Text>
          <View style={styles.phoneRow}>
            <Ionicons name="call-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.phoneText} numberOfLines={1} ellipsizeMode="tail">
              {tenant.mobile || 'No Mobile Number'}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <StatusBadge status={tenant.status} type="tenant" />
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Ionicons name="business-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.detailText} numberOfLines={1}>
            {propertyName} — Unit {unitNumber}
          </Text>
        </View>
        
        <View style={styles.rentWrapper}>
          <Text style={styles.rentLabel}>Rent: </Text>
          <MoneyText amount={tenant.monthlyRent} style={styles.rentValue} />
        </View>
      </View>
    </AppCard>
  );
});

const getStyles = (colors: any) => StyleSheet.create({
  card: {
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  userInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  name: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  phoneText: {
    fontSize: typography.sizes.sm - 1,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
    fontWeight: typography.weights.medium,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.md,
  },
  detailText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginLeft: spacing.xs,
    flex: 1,
  },
  rentWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rentLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
  },
  rentValue: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  resetRequestedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  resetRequestedText: {
    fontSize: typography.sizes.xs - 2,
    fontWeight: typography.weights.bold,
    color: '#D97706',
  },
});

export default TenantCard;
