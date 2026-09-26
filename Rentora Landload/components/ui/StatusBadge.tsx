import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme, typography, spacing } from '../../theme';

interface StatusBadgeProps {
  status: string;
  type?: 'tenant' | 'unit' | 'bill';
  style?: ViewStyle;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type = 'bill', style }) => {
  const { colors } = useTheme();

  const getBadgeStyles = () => {
    let backgroundColor = colors.border;
    let color = colors.textSecondary;
    let label = status;

    const normStatus = status.toLowerCase().trim();

    if (type === 'tenant') {
      if (normStatus === 'active') {
        backgroundColor = colors.secondaryLight;
        color = colors.secondary;
        label = 'Active';
      } else if (normStatus === 'vacated') {
        backgroundColor = colors.dangerLight;
        color = colors.danger;
        label = 'Vacated';
      }
    } else if (type === 'unit') {
      if (normStatus === 'occupied') {
        backgroundColor = colors.primaryLight;
        color = colors.primary;
        label = 'Occupied';
      } else if (normStatus === 'vacant') {
        backgroundColor = colors.secondaryLight;
        color = colors.secondary;
        label = 'Vacant';
      }
    } else if (type === 'bill') {
      if (normStatus === 'paid') {
        backgroundColor = colors.secondaryLight;
        color = colors.secondary;
        label = 'Paid';
      } else if (normStatus === 'partial') {
        backgroundColor = colors.warningLight;
        color = colors.warning;
        label = 'Partial';
      } else if (normStatus === 'unpaid' || normStatus === 'pending') {
        backgroundColor = colors.dangerLight;
        color = colors.danger;
        label = 'Unpaid';
      }
    }

    return { backgroundColor, color, label };
  };

  const { backgroundColor, color, label } = getBadgeStyles();

  return (
    <View style={[styles.badge, { backgroundColor }, style]}>
      <Text style={[styles.text, { color }]}>{label.toUpperCase()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: spacing.borderRadius.sm,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: typography.sizes.xs - 1,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.5,
  },
});

export default StatusBadge;
