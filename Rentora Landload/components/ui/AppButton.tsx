import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View, ViewStyle, TextStyle } from 'react-native';
import { useTheme, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';

interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'text';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  iconPosition?: 'left' | 'right';
  style?: ViewStyle;
}

export const AppButton: React.FC<AppButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  style,
}) => {
  const { colors } = useTheme();

  const getButtonStyles = () => {
    let buttonStyle: ViewStyle = styles.btnBase;
    let textStyle: TextStyle = styles.txtBase;
    let iconColor = colors.white;

    // Sizing
    if (size === 'sm') {
      buttonStyle = { ...buttonStyle, height: 38, paddingHorizontal: spacing.md, borderRadius: spacing.borderRadius.sm };
      textStyle = { ...textStyle, fontSize: typography.sizes.xs + 1 };
    } else if (size === 'lg') {
      buttonStyle = { ...buttonStyle, height: 56, paddingHorizontal: spacing.xxl, borderRadius: spacing.borderRadius.lg };
      textStyle = { ...textStyle, fontSize: typography.sizes.md + 1 };
    } else {
      buttonStyle = { ...buttonStyle, height: 48, paddingHorizontal: spacing.xl, borderRadius: spacing.borderRadius.md };
      textStyle = { ...textStyle, fontSize: typography.sizes.sm + 1 };
    }

    // Variants
    switch (variant) {
      case 'secondary':
        buttonStyle = { ...buttonStyle, backgroundColor: colors.secondary };
        textStyle = { ...textStyle, color: colors.white };
        iconColor = colors.white;
        break;
      case 'danger':
        buttonStyle = { ...buttonStyle, backgroundColor: colors.danger };
        textStyle = { ...textStyle, color: colors.white };
        iconColor = colors.white;
        break;
      case 'outline':
        buttonStyle = { ...buttonStyle, backgroundColor: colors.transparent, borderWidth: 1.5, borderColor: colors.primary };
        textStyle = { ...textStyle, color: colors.primary };
        iconColor = colors.primary;
        break;
      case 'text':
        buttonStyle = { ...buttonStyle, backgroundColor: colors.transparent, paddingHorizontal: spacing.sm, height: 'auto' };
        textStyle = { ...textStyle, color: colors.primary, fontWeight: typography.weights.bold };
        iconColor = colors.primary;
        break;
      case 'primary':
      default:
        buttonStyle = { ...buttonStyle, backgroundColor: colors.primary };
        textStyle = { ...textStyle, color: colors.white };
        iconColor = colors.white;
        break;
    }

    if (disabled) {
      buttonStyle = { ...buttonStyle, backgroundColor: variant === 'outline' || variant === 'text' ? colors.transparent : colors.border, borderColor: colors.border };
      textStyle = { ...textStyle, color: colors.textSecondary };
      iconColor = colors.textSecondary;
    }

    return { buttonStyle, textStyle, iconColor };
  };

  const { buttonStyle, textStyle, iconColor } = getButtonStyles();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[buttonStyle, style]}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={textStyle.color} size="small" />
      ) : (
        <View style={styles.contentRow}>
          {icon && iconPosition === 'left' && (
            <Ionicons name={icon as any} size={size === 'sm' ? 16 : 20} color={iconColor} style={styles.leftIcon} />
          )}
          <Text style={textStyle}>{title}</Text>
          {icon && iconPosition === 'right' && (
            <Ionicons name={icon as any} size={size === 'sm' ? 16 : 20} color={iconColor} style={styles.rightIcon} />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btnBase: {
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  txtBase: {
    fontWeight: typography.weights.bold,
    textAlign: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftIcon: {
    marginRight: spacing.sm - 2,
  },
  rightIcon: {
    marginLeft: spacing.sm - 2,
  },
});

export default AppButton;
