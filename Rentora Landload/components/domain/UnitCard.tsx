import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Unit } from '../../types';
import { useStyles, useTheme, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import AppCard from '../ui/AppCard';
import StatusBadge from '../ui/StatusBadge';
import MoneyText from '../ui/MoneyText';

interface UnitCardProps {
  unit: Unit;
  tenantName?: string | null;
  onPress?: () => void;
  onEdit?: (id: string) => void;
}

export const UnitCard = memo<UnitCardProps>(({ unit, tenantName, onPress, onEdit }) => {
  const styles = useStyles(getStyles);
  const { colors } = useTheme();

  return (
    <AppCard onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.unitInfo}>
          <Text style={styles.unitNumber}>Unit {unit.unitNumber}</Text>
          <Text style={styles.floorText}>Floor: {unit.floor || 'G'}</Text>
        </View>
        <View style={styles.actionContainer}>
          <StatusBadge status={unit.status} type="unit" style={styles.badge} />
          {onEdit && (
            <TouchableOpacity onPress={() => onEdit(unit.id!)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="create-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Ionicons name="cash-outline" size={16} color={colors.textSecondary} />
          <View style={styles.detailTextWrapper}>
            <Text style={styles.detailLabel}>Rent</Text>
            <MoneyText amount={unit.defaultRent} style={styles.detailValue} />
          </View>
        </View>

        {unit.meterNumber ? (
          <View style={styles.detailItem}>
            <Ionicons name="speedometer-outline" size={16} color={colors.textSecondary} />
            <View style={styles.detailTextWrapper}>
              <Text style={styles.detailLabel}>Meter No.</Text>
              <Text style={styles.detailValueText}>{unit.meterNumber}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {unit.status === 'occupied' && (
        <View style={styles.tenantWrapper}>
          <Ionicons name="person-outline" size={14} color={colors.primary} />
          <Text style={styles.tenantText} numberOfLines={1}>
            Tenant: <Text style={styles.tenantName}>{tenantName || 'Active Tenant'}</Text>
          </Text>
        </View>
      )}
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
    marginBottom: spacing.md,
  },
  unitInfo: {
    flex: 1,
  },
  unitNumber: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  floorText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
    marginTop: 2,
  },
  actionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    marginRight: spacing.md,
  },
  detailsRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.xl,
    flex: 1,
  },
  detailTextWrapper: {
    marginLeft: spacing.sm,
  },
  detailLabel: {
    fontSize: typography.sizes.xs - 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
  },
  detailValue: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  detailValueText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  tenantWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: spacing.borderRadius.sm,
    marginTop: spacing.md,
  },
  tenantText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
    fontWeight: typography.weights.medium,
  },
  tenantName: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
  },
});

export default UnitCard;
