import React from 'react';
import { Text, TextStyle, StyleSheet } from 'react-native';
import { useStyles, typography } from '../../theme';

interface MoneyTextProps {
  amount: number;
  style?: TextStyle;
  variant?: 'normal' | 'bold' | 'highlight' | 'danger' | 'success';
}

export const MoneyText: React.FC<MoneyTextProps> = ({ amount, style, variant = 'normal' }) => {
  const styles = useStyles(getStyles);

  const formatCurrency = (val: number): string => {
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(val);
    } catch (e) {
      return `₹${val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    }
  };

  const getVariantStyle = () => {
    switch (variant) {
      case 'bold':
        return styles.bold;
      case 'highlight':
        return styles.highlight;
      case 'danger':
        return styles.danger;
      case 'success':
        return styles.success;
      case 'normal':
      default:
        return styles.normal;
    }
  };

  return (
    <Text style={[getVariantStyle(), style]}>
      {formatCurrency(amount)}
    </Text>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  normal: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.text,
  },
  bold: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  highlight: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  danger: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.danger,
  },
  success: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.secondary,
  },
});

export default MoneyText;
