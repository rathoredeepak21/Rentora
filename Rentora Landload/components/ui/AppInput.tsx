import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ViewStyle, KeyboardTypeOptions, TouchableOpacity } from 'react-native';
import { useStyles, useTheme, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';

interface AppInputProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  error?: string;
  icon?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
  prefix?: string;
  style?: ViewStyle;
  editable?: boolean;
}

export const AppInput: React.FC<AppInputProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  secureTextEntry = false,
  error,
  icon,
  rightIcon,
  onRightIconPress,
  prefix,
  style,
  editable = true,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const styles = useStyles(getStyles);
  const { colors } = useTheme();

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      
      <View
        style={[
          styles.inputWrapper,
          !editable && styles.disabledWrapper,
          isFocused && styles.focusedWrapper,
          error ? styles.errorWrapper : null,
        ]}
      >
        {icon && (
          <Ionicons
            name={icon as any}
            size={20}
            color={isFocused ? colors.primary : colors.textSecondary}
            style={styles.icon}
          />
        )}
        
        {prefix && (
          <Text style={styles.prefix}>{prefix}</Text>
        )}

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          editable={editable}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={[styles.input, !editable && styles.disabledInput]}
        />

        {rightIcon && (
          <TouchableOpacity onPress={onRightIconPress} activeOpacity={0.7} style={styles.rightIcon}>
            <Ionicons
              name={rightIcon as any}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
      
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    width: '100%',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  focusedWrapper: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '20', // Very light overlay
  },
  disabledWrapper: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  errorWrapper: {
    borderColor: colors.danger,
  },
  icon: {
    marginRight: spacing.sm,
  },
  prefix: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginRight: spacing.xs,
  },
  input: {
    flex: 1,
    height: '100%',
    color: colors.text,
    fontSize: typography.sizes.md - 1,
    fontWeight: typography.weights.medium,
  },
  disabledInput: {
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.danger,
    marginTop: spacing.xs - 2,
    fontWeight: typography.weights.medium,
  },
  rightIcon: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
});

export default AppInput;
