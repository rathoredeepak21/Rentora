import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useProperties } from '../../hooks/useProperties';
import { useUnits } from '../../hooks/useUnits';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import AppInput from '../../components/ui/AppInput';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';

export default function AddUnitScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  
  const { properties, loading: propLoading } = useProperties();
  const { addUnit } = useUnits(propertyId);
  const property = properties.find(p => p.id === propertyId);

  // Form Fields
  const [unitNumber, setUnitNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [defaultRent, setDefaultRent] = useState('0');
  const [meterNumber, setMeterNumber] = useState('');

  // Errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Prefill default rent from property
  useEffect(() => {
    if (property) {
      setDefaultRent(String(property.defaultRent || 0));
    }
  }, [property]);

  if (propLoading || !property) {
    return <LoadingView message="Loading property details..." />;
  }

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!unitNumber.trim()) newErrors.unitNumber = 'Unit/Room Number is required';
    
    const rent = parseFloat(defaultRent);
    if (isNaN(rent) || rent < 0) {
      newErrors.defaultRent = 'Cannot be negative';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      await addUnit({
        unitNumber: unitNumber.trim(),
        floor: floor.trim() || 'Ground',
        defaultRent: parseFloat(defaultRent) || 0,
        meterNumber: meterNumber.trim(),
      }, propertyId);

      Alert.alert('Success', 'Unit added successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add unit');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Unit Info — {property.name}</Text>
          <Text style={styles.cardSubtitle}>Create a new room or flat under this property.</Text>

          <AppInput
            label="Unit / Room Number *"
            value={unitNumber}
            onChangeText={setUnitNumber}
            placeholder="e.g. 101, Room A, Shop 3"
            error={errors.unitNumber}
            icon="key-outline"
          />

          <AppInput
            label="Floor"
            value={floor}
            onChangeText={setFloor}
            placeholder="e.g. Ground, 1st, 2nd"
            icon="layers-outline"
          />

          <AppInput
            label="Monthly Rent for this Unit"
            value={defaultRent}
            onChangeText={setDefaultRent}
            placeholder="0"
            prefix="₹"
            keyboardType="numeric"
            error={errors.defaultRent}
          />

          <AppInput
            label="Electricity Meter Number"
            value={meterNumber}
            onChangeText={setMeterNumber}
            placeholder="e.g. ELEC-987654 (Optional)"
            icon="speedometer-outline"
          />
        </View>

        <AppButton
          title="Add Unit"
          onPress={handleSave}
          loading={isSubmitting}
          icon="checkmark-circle-outline"
          style={styles.saveButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
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
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...spacing.shadows.light,
  },
  cardTitle: {
    fontSize: typography.sizes.md + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  saveButton: {
    marginTop: spacing.sm,
  },
});
