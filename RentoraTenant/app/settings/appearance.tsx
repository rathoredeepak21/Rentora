import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { useTheme, ThemeMode } from '../../context/ThemeContext';
import { RADIUS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AppearanceScreen() {
  const router = useRouter();
  const { themeMode, setThemeMode, colors } = useTheme();
  const insets = useSafeAreaInsets();

  const handleSelect = (mode: ThemeMode) => {
    setThemeMode(mode);
  };

  const themeOptions: { mode: ThemeMode; title: string; subtitle: string; icon: string }[] = [
    {
      mode: 'light',
      title: 'Light Mode',
      subtitle: 'Clean, crisp near-white interface with dark text',
      icon: 'white-balance-sunny',
    },
    {
      mode: 'dark',
      title: 'Dark Mode',
      subtitle: 'Sleek dark slate background comfortable for night viewing',
      icon: 'weather-night',
    },
    {
      mode: 'system',
      title: 'System Default',
      subtitle: 'Automatically matches your Android system display settings',
      icon: 'theme-light-dark',
    },
  ];

  return (
    <AppSafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />

      {/* Top Header */}
      <View style={[styles.topHeader, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.iconBackBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.topHeaderTitle, { color: colors.textPrimary }]}>Appearance</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom + 30, 40) }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DISPLAY THEME</Text>

        {themeOptions.map((opt) => {
          const isSelected = themeMode === opt.mode;
          return (
            <TouchableOpacity
              key={opt.mode}
              style={[
                styles.optionCard,
                {
                  backgroundColor: colors.card,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderWidth: isSelected ? 2 : 1,
                },
              ]}
              onPress={() => handleSelect(opt.mode)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: isSelected ? colors.primaryGlow : colors.cardSubtle },
                ]}
              >
                <MaterialCommunityIcons
                  name={opt.icon as any}
                  size={24}
                  color={isSelected ? colors.primary : colors.textSecondary}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>{opt.title}</Text>
                <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>
                  {opt.subtitle}
                </Text>
              </View>

              <View
                style={[
                  styles.radioOuter,
                  { borderColor: isSelected ? colors.primary : colors.textMuted },
                ]}
              >
                {isSelected ? (
                  <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={[styles.infoCard, { backgroundColor: colors.cardSubtle, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="information-outline" size={20} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Theme updates instantly across all screens. Rent bill PDF downloads remain in official printable format.
          </Text>
        </View>
      </ScrollView>
    </AppSafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
  },
  iconBackBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  container: {
    padding: SPACING.md,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  optionSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: RADIUS.full,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: RADIUS.full,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginTop: SPACING.md,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
});
