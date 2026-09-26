import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '../../hooks/useSettings';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import AppInput from '../../components/ui/AppInput';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';

export default function ProfileSettingsScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const router = useRouter();
  const { settings, loading, updateSettings } = useSettings();

  // Form Fields
  const [ownerName, setOwnerName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // States
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (settings) {
      setOwnerName(settings.ownerName || '');
      setBusinessName(settings.businessName || '');
      setPhone(settings.phone || '');
      setAddress(settings.address || '');
    }
  }, [settings]);

  if (loading) {
    return <LoadingView message="Loading profile settings..." />;
  }

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!ownerName.trim()) newErrors.ownerName = 'Owner Name is required';
    if (!phone.trim()) newErrors.phone = 'Phone Number is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !settings) return;
    setIsSubmitting(true);

    try {
      await updateSettings({
        ownerName: ownerName.trim(),
        businessName: businessName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        upiId: settings.upiId || '',
        paymentInstructions: settings.paymentInstructions || '',
        logoUrl: settings.logoUrl || undefined,
        signatureUrl: settings.signatureUrl || undefined,
      });

      Alert.alert('Success', 'Profile settings updated successfully!', [
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
        <Text style={styles.cardTitle}>Business Profile Information</Text>
        <Text style={styles.cardSubtitle}>
          These details are displayed on generated invoice bills so tenants can verify your details.
        </Text>

        <AppInput
          label="Landlord / Owner Full Name *"
          value={ownerName}
          onChangeText={setOwnerName}
          placeholder="e.g. Ramesh Kumar"
          error={errors.ownerName}
          icon="person-outline"
        />

        <AppInput
          label="Business / Estate Name"
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="e.g. RK Rentals (Optional)"
          icon="business-outline"
        />

        <AppInput
          label="Billing Contact Phone Number *"
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. +91 98765 43210"
          keyboardType="phone-pad"
          error={errors.phone}
          icon="call-outline"
        />

        <AppInput
          label="Business Address / Billing Address"
          value={address}
          onChangeText={setAddress}
          placeholder="e.g. Flat 101, Main Road, New Delhi"
          icon="location-outline"
        />
      </View>

      <AppButton
        title="Save Profile Settings"
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
  saveButton: {
    marginTop: spacing.sm,
  },
});
