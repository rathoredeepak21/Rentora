import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { tenantDataService } from '../../services/tenantDataService';
import { Property } from '../../types';
import { RADIUS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PropertyRulesScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [property, setProperty] = useState<Property | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    if (!userProfile?.propertyId) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const unsubscribe = tenantDataService.subscribePropertyDetails(
      userProfile.propertyId,
      (prop) => {
        if (isMounted) {
          setProperty(prop);
          setIsLoading(false);
          setRefreshing(false);
        }
      },
      () => {
        if (isMounted) {
          setIsLoading(false);
          setRefreshing(false);
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [userProfile?.propertyId]);

  const onRefresh = () => {
    setRefreshing(true);
    if (!userProfile?.propertyId) setRefreshing(false);
  };

  const rules: string[] = property?.propertyRules || [];

  return (
    <AppSafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />

      {/* Top Header */}
      <View style={[styles.topHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.iconBackBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.topHeaderTitle, { color: colors.textPrimary }]}>Property Rules</Text>
        <View style={{ width: 32 }} />
      </View>

      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading property rules...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + 40, 60) },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        >
          {/* Property Info Card */}
          <View style={[styles.propertyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.iconBadge, { backgroundColor: colors.primaryGlow }]}>
              <MaterialCommunityIcons name="shield-home-outline" size={26} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.propertyName, { color: colors.textPrimary }]} numberOfLines={1}>
                {property?.name || 'Assigned Property'}
              </Text>
              <Text style={[styles.propertyAddress, { color: colors.textSecondary }]} numberOfLines={2}>
                {property?.address || 'Residential premises'}
              </Text>
              <Text style={[styles.rulesCountBadge, { color: colors.primary }]}>
                {rules.length} {rules.length === 1 ? 'Rule' : 'Rules'} Active
              </Text>
            </View>
          </View>

          {/* Rules List */}
          {rules.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                No property rules have been added yet.
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Your landlord has not added custom guidelines for this property yet. Standard municipal guidelines apply.
              </Text>
            </View>
          ) : (
            <View style={styles.rulesContainer}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                PROPERTY RULES ({rules.length})
              </Text>

              {rules.map((rule, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.ruleCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View style={[styles.numberBadge, { backgroundColor: colors.primaryGlow }]}>
                    <Text style={[styles.numberBadgeText, { color: colors.primary }]}>{idx + 1}</Text>
                  </View>
                  <Text style={[styles.ruleText, { color: colors.textPrimary }]}>{rule}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Footer note */}
          <View style={[styles.footerNote, { backgroundColor: colors.cardSubtle, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="information-outline" size={18} color={colors.primary} />
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              These rules are defined by your property owner. Following them ensures a safe, clean, and peaceful environment for all residents.
            </Text>
          </View>
        </ScrollView>
      )}
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
    padding: 6,
  },
  topHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 14,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  propertyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  propertyName: {
    fontSize: 16,
    fontWeight: '700',
  },
  propertyAddress: {
    fontSize: 12,
    marginTop: 2,
  },
  rulesCountBadge: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  rulesContainer: {
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  ruleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: 12,
  },
  checkBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  ruleText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  emptyCard: {
    padding: SPACING.xl,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: SPACING.md,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginTop: SPACING.lg,
    gap: 8,
  },
  footerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
});
