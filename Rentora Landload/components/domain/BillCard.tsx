import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Bill } from '../../types';
import { useStyles, useTheme, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import AppCard from '../ui/AppCard';
import StatusBadge from '../ui/StatusBadge';
import MoneyText from '../../components/ui/MoneyText';

interface BillCardProps {
  bill: Bill;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  onPress: (id: string) => void;
  onMenuPress?: (bill: Bill) => void;
}

export const BillCard = memo<BillCardProps>(({
  bill,
  tenantName,
  propertyName,
  unitNumber,
  onPress,
  onMenuPress,
}) => {
  const styles = useStyles(getStyles);
  const { colors } = useTheme();

  const formatMonth = (monthStr: string) => {
    try {
      const [year, month] = monthStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    } catch (e) {
      return monthStr;
    }
  };

  return (
    <AppCard onPress={() => onPress(bill.id!)} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.invoiceInfo}>
          <Text style={styles.billNumber}>{bill.billNumber}</Text>
          <Text style={styles.monthText}>{formatMonth(bill.billingMonth)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <StatusBadge status={bill.paymentStatus} type="bill" />
          {onMenuPress && (
            <TouchableOpacity onPress={() => onMenuPress(bill)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="ellipsis-vertical" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.tenantRow}>
        <Ionicons name="person-outline" size={14} color={colors.textSecondary} />
        <Text style={styles.tenantText} numberOfLines={1} ellipsizeMode="tail">
          {tenantName}
        </Text>
        <Text style={styles.unitText} numberOfLines={1} ellipsizeMode="tail">
          {propertyName} ({unitNumber})
        </Text>
      </View>

      <View style={styles.footerRow}>
        <View style={styles.dueCol}>
          <Text style={styles.dueLabel}>Due Date</Text>
          <Text style={styles.dueValue}>{bill.dueDate}</Text>
        </View>
        
        <View style={styles.amountCol}>
          <Text style={styles.amountLabel}>Total Due</Text>
          <MoneyText amount={bill.totalAmount} variant="bold" style={styles.amountValue} />
          {bill.previousDue > 0 && (
            <Text style={styles.prevDueHint} numberOfLines={1}>
              (₹{bill.subtotal || (bill.totalAmount - bill.previousDue)} + ₹{bill.previousDue} Prev)
            </Text>
          )}
        </View>
      </View>

      {bill.paymentStatus === 'partial' && (
        <View style={styles.partialFooter}>
          <Text style={styles.partialText}>
            Balance Due: <Text style={styles.boldText}>₹{bill.remainingAmount}</Text>
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
    alignItems: 'center',
  },
  invoiceInfo: {
    flex: 1,
  },
  billNumber: {
    fontSize: typography.sizes.md - 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  monthText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  tenantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  tenantText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginLeft: spacing.xs,
    maxWidth: '45%',
  },
  unitText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginLeft: spacing.sm,
    flex: 1,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dueCol: {
    flex: 1,
  },
  dueLabel: {
    fontSize: typography.sizes.xs - 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
  },
  dueValue: {
    fontSize: typography.sizes.sm,
    color: colors.text,
    fontWeight: typography.weights.semibold,
    marginTop: 2,
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  amountLabel: {
    fontSize: typography.sizes.xs - 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
  },
  amountValue: {
    fontSize: typography.sizes.md,
    color: colors.primary,
    marginTop: 2,
  },
  prevDueHint: {
    fontSize: typography.sizes.xs - 2,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'right',
  },
  partialFooter: {
    backgroundColor: colors.warningLight,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: spacing.borderRadius.sm,
    marginTop: spacing.md,
    alignItems: 'flex-end',
  },
  partialText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
  },
  boldText: {
    color: colors.danger,
    fontWeight: typography.weights.bold,
  },
});

export default BillCard;
