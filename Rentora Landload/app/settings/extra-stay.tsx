import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '../../hooks/useSettings';
import { useTheme, useStyles, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';
import { ExtraStayPolicy } from '../../types';

export default function ExtraStayPolicyScreen() {
  const { colors } = useTheme();
  const styles = useStyles(getStyles);
  const router = useRouter();
  const { settings, loading, updateSettings } = useSettings();

  const [selectedPolicy, setSelectedPolicy] = useState<ExtraStayPolicy>('fixed30');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings?.extraStayPolicy) {
      setSelectedPolicy(settings.extraStayPolicy);
    }
  }, [settings]);

  if (loading) {
    return <LoadingView message="Loading settings..." />;
  }

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateSettings({
        ...settings,
        extraStayPolicy: selectedPolicy,
      });
      Alert.alert('Saved', 'Extra-stay rent calculation policy updated successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save extra-stay policy');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Extra-Stay Rent Calculation</Text>
          <Text style={styles.subtitle}>
            Choose how daily rent is calculated for extra days when a tenant vacates after their normal paid rent period.
          </Text>
        </View>

        {/* Option 1: Fixed 30-Day Basis */}
        <TouchableOpacity
          style={[
            styles.policyCard,
            selectedPolicy === 'fixed30' && styles.policyCardSelected,
          ]}
          onPress={() => setSelectedPolicy('fixed30')}
          activeOpacity={0.8}
        >
          <View style={styles.policyHeader}>
            <View style={styles.radioOuter}>
              {selectedPolicy === 'fixed30' && <View style={styles.radioInner} />}
            </View>
            <View style={styles.policyTitleContainer}>
              <Text style={styles.policyName}>Fixed 30-day basis (Standard)</Text>
              <Text style={styles.policyFormula}>Daily Rent = Applicable Monthly Rent ÷ 30</Text>
            </View>
          </View>
          
          <Text style={styles.policyDescription}>
            Every month is treated as exactly 30 days regardless of whether the month has 28, 29, 30, or 31 days. Simple, predictable daily rent.
          </Text>

          <View style={styles.exampleBox}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.exampleText}>
              <Text style={{ fontWeight: 'bold' }}>Example:</Text> Monthly rent ₹4,500 gives ₹150/day. Two extra days equal ₹300.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Option 2: Actual Billing-Period Days */}
        <TouchableOpacity
          style={[
            styles.policyCard,
            selectedPolicy === 'actualBillingPeriod' && styles.policyCardSelected,
          ]}
          onPress={() => setSelectedPolicy('actualBillingPeriod')}
          activeOpacity={0.8}
        >
          <View style={styles.policyHeader}>
            <View style={styles.radioOuter}>
              {selectedPolicy === 'actualBillingPeriod' && <View style={styles.radioInner} />}
            </View>
            <View style={styles.policyTitleContainer}>
              <Text style={styles.policyName}>Actual billing-period days</Text>
              <Text style={styles.policyFormula}>Daily Rent = Monthly Rent ÷ Calendar Days in Period</Text>
            </View>
          </View>
          
          <Text style={styles.policyDescription}>
            Uses the actual number of calendar days (28, 29, 30, or 31) in the relevant billing period, including leap years.
          </Text>

          <View style={styles.exampleBox}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.exampleText}>
              <Text style={{ fontWeight: 'bold' }}>Example:</Text> For ₹4,500 rent, a 31-day period yields ₹145.16/day; a 28-day February yields ₹160.71/day.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Policy Guarantee Banner */}
        <View style={styles.guaranteeCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#10B981" />
          <View style={{ flex: 1 }}>
            <Text style={styles.guaranteeTitle}>Historical Record Protection</Text>
            <Text style={styles.guaranteeText}>
              Changing this policy applies only to new settlements. Historical bills and previously confirmed settlements will never be altered.
            </Text>
          </View>
        </View>

        <AppButton
          title="Save Extra-Stay Policy"
          onPress={handleSave}
          loading={isSaving}
          icon="save-outline"
          style={styles.saveButton}
        />
      </ScrollView>
    </View>
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
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.lineHeights.md,
  },
  policyCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 2,
    borderColor: colors.border,
    ...spacing.shadows.light,
  },
  policyCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  policyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  policyTitleContainer: {
    flex: 1,
  },
  policyName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  policyFormula: {
    fontSize: typography.sizes.xs + 1,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
    marginTop: 2,
  },
  policyDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.lineHeights.sm + 2,
    marginBottom: spacing.md,
  },
  exampleBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.background,
    padding: spacing.sm + 2,
    borderRadius: spacing.borderRadius.md,
    gap: spacing.xs,
  },
  exampleText: {
    flex: 1,
    fontSize: typography.sizes.xs + 1,
    color: colors.text,
    lineHeight: 18,
  },
  guaranteeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#10B98115',
    padding: spacing.md,
    borderRadius: spacing.borderRadius.lg,
    marginBottom: spacing.xl,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#10B98130',
  },
  guaranteeTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: '#065F46',
    marginBottom: 2,
  },
  guaranteeText: {
    fontSize: typography.sizes.xs + 1,
    color: '#047857',
    lineHeight: 18,
  },
  saveButton: {
    marginTop: spacing.xs,
  },
});
