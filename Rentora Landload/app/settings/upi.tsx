import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '../../hooks/useSettings';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import AppInput from '../../components/ui/AppInput';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';

export default function UPISettingsScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const router = useRouter();
  const { settings, loading, updateSettings } = useSettings();

  // Form Fields
  const [upiId, setUpiId] = useState('');

  // States
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (settings) {
      setUpiId(settings.upiId || '');
    }
  }, [settings]);

  if (loading) {
    return <LoadingView message="Loading payment configurations..." />;
  }

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!upiId.trim()) {
      newErrors.upiId = 'UPI ID is required';
    } else {
      // Basic UPI ID format check (contains @)
      const upiRegex = /^[\w.\-_]+@[\w\-]+$/;
      if (!upiRegex.test(upiId.trim())) {
        newErrors.upiId = 'Please enter a valid UPI ID (e.g., name@bank)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !settings) return;
    setIsSubmitting(true);

    try {
      await updateSettings({
        ownerName: settings.ownerName || '',
        businessName: settings.businessName || '',
        phone: settings.phone || '',
        address: settings.address || '',
        upiId: upiId.trim(),
        paymentInstructions: settings.paymentInstructions || '',
        logoUrl: settings.logoUrl || undefined,
        signatureUrl: settings.signatureUrl || undefined,
      });

      Alert.alert('Success', 'UPI payment settings updated successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>UPI Payment Configuration</Text>
        <Text style={styles.cardSubtitle}>
          Configure your UPI ID. A payment section with this UPI address will be automatically embedded in generated PDF invoices, enabling easy mobile app transfers for your tenants.
        </Text>

        <AppInput
          label="Your UPI ID *"
          value={upiId}
          onChangeText={setUpiId}
          placeholder="e.g. landlord@upi, 9876543210@paytm"
          error={errors.upiId}
          icon="card-outline"
        />
        
        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>Important Notice</Text>
          <Text style={styles.noteText}>
            Payments remain landlord-controlled. Enabling UPI configuration does not automatically record payments in this app. You must verify actual bank receipts and record the transaction within the app.
          </Text>
        </View>
      </View>

      <AppButton
        title="Save UPI Configuration"
        onPress={handleSave}
        loading={isSubmitting}
        icon="checkmark-circle-outline"
        style={styles.saveButton}
      />
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
    marginBottom: spacing.lg,
    ...spacing.shadows.light,
  },
  cardTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: typography.lineHeights.sm,
  },
  noteBox: {
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: spacing.borderRadius.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '20',
  },
  noteTitle: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    marginBottom: 4,
  },
  noteText: {
    fontSize: typography.sizes.xs,
    color: colors.text,
    lineHeight: 16,
  },
  saveButton: {
    marginTop: spacing.sm,
  },
});
