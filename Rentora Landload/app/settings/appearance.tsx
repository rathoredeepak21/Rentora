import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme, useStyles, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';

export default function AppearanceScreen() {
  const { themeMode, setThemeMode, colors } = useTheme();
  const styles = useStyles(getStyles);

  const options = [
    {
      id: 'light' as const,
      label: 'Light Mode',
      icon: 'sunny-outline',
      description: 'Preserves the clean, classic Rentora look.',
    },
    {
      id: 'dark' as const,
      label: 'Dark Mode',
      icon: 'moon-outline',
      description: 'A dark appearance for comfortable nighttime viewing.',
    },
    {
      id: 'system' as const,
      label: 'System Default',
      icon: 'phone-portrait-outline',
      description: 'Automatically follows your Android system Light/Dark mode.',
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Choose Theme</Text>
        <Text style={styles.cardSubtitle}>
          Select how you want Rentora to look. The app theme will update immediately.
        </Text>

        <View style={styles.optionsList}>
          {options.map((opt) => {
            const isSelected = themeMode === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.optionItem,
                  isSelected && styles.optionItemCheck
                ]}
                onPress={() => setThemeMode(opt.id)}
                activeOpacity={0.8}
              >
                <View style={styles.optionLeft}>
                  <View style={[
                    styles.iconContainer,
                    { backgroundColor: isSelected ? colors.primary + '15' : colors.border + '50' }
                  ]}>
                    <Ionicons
                      name={opt.icon as any}
                      size={22}
                      color={isSelected ? colors.primary : colors.textSecondary}
                    />
                  </View>
                  <View style={styles.optionTextWrapper}>
                    <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.optionDesc}>{opt.description}</Text>
                  </View>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...spacing.shadows.light,
  },
  cardTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: typography.lineHeights.sm,
  },
  optionsList: {
    width: '100%',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  optionItemCheck: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '10',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  optionTextWrapper: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  optionLabel: {
    fontSize: typography.sizes.md - 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: 2,
  },
  optionLabelSelected: {
    color: colors.primary,
  },
  optionDesc: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
