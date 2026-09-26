import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useProperties } from '../../hooks/useProperties';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import { PropertyType } from '../../types';
import AppInput from '../../components/ui/AppInput';
import AppButton from '../../components/ui/AppButton';
import { PropertyRulesSection } from '../../components/domain/PropertyRulesSection';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function AddPropertyScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const router = useRouter();
  const { addProperty } = useProperties();

  // Form Fields
  const [name, setName] = useState('');
  const [type, setType] = useState<PropertyType>('Flat');
  const [address, setAddress] = useState('');
  const [totalUnits, setTotalUnits] = useState('1');
  const [defaultRent, setDefaultRent] = useState('0');
  const [electricityRate, setElectricityRate] = useState('0');
  const [waterCharge, setWaterCharge] = useState('0');
  const [parkingCharge, setParkingCharge] = useState('0');
  const [propertyRules, setPropertyRules] = useState<string[]>([]);
  const insets = useSafeAreaInsets();

  // Errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const propertyTypes: PropertyType[] = ['Flat', 'Room', 'Shop', 'House', 'Office'];

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Property Name is required';
    if (!type) newErrors.type = 'Property Type is required';
    
    // Numeric validation
    const units = parseInt(totalUnits);
    if (isNaN(units) || units < 1) {
      newErrors.totalUnits = 'Must be at least 1 unit';
    }
    const rent = parseFloat(defaultRent);
    if (isNaN(rent) || rent < 0) {
      newErrors.defaultRent = 'Cannot be negative';
    }
    const elec = parseFloat(electricityRate);
    if (isNaN(elec) || elec < 0) {
      newErrors.electricityRate = 'Cannot be negative';
    }
    const water = parseFloat(waterCharge);
    if (isNaN(water) || water < 0) {
      newErrors.waterCharge = 'Cannot be negative';
    }
    const parking = parseFloat(parkingCharge);
    if (isNaN(parking) || parking < 0) {
      newErrors.parkingCharge = 'Cannot be negative';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      await addProperty({
        name: name.trim(),
        type,
        address: address.trim(),
        totalUnits: parseInt(totalUnits) || 1,
        defaultRent: parseFloat(defaultRent) || 0,
        electricityRate: parseFloat(electricityRate) || 0,
        waterCharge: parseFloat(waterCharge) || 0,
        parkingCharge: parseFloat(parkingCharge) || 0,
        propertyRules,
      });

      Alert.alert('Success', 'Property added successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save property');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPropertyIcon = (pt: PropertyType) => {
    switch (pt) {
      case 'Room': return 'bed-outline';
      case 'Shop': return 'cart-outline';
      case 'Office': return 'desktop-outline';
      case 'House': return 'home-outline';
      case 'Flat':
      default: return 'business-outline';
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Property Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Property Details</Text>
          
          <AppInput
            label="Property Name *"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Shree Apartment, Royal Plaza"
            error={errors.name}
            icon="business-outline"
          />

          {/* Property Type Selector */}
          <Text style={styles.selectorLabel}>Property Type *</Text>
          <View style={styles.typeGrid}>
            {propertyTypes.map((pt) => {
              const isSelected = type === pt;
              return (
                <TouchableOpacity
                  key={pt}
                  style={[styles.typeButton, isSelected && styles.typeButtonSelected]}
                  onPress={() => setType(pt)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={getPropertyIcon(pt) as any}
                    size={18}
                    color={isSelected ? colors.white : colors.textSecondary}
                  />
                  <Text style={[styles.typeButtonText, isSelected && styles.typeButtonTextSelected]}>
                    {pt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <AppInput
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="e.g. 123 Main Street, Sector 4"
            icon="location-outline"
          />

          <AppInput
            label="Total Number of Units *"
            value={totalUnits}
            onChangeText={setTotalUnits}
            placeholder="1"
            keyboardType="numeric"
            error={errors.totalUnits}
            icon="apps-outline"
          />
        </View>

        {/* Default Rent & Charges Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Default Charges (Optional)</Text>
          <Text style={styles.cardSubtitle}>
            These values will automatically prefill when adding units or creating bills, saving you time.
          </Text>

          <AppInput
            label="Default Monthly Rent"
            value={defaultRent}
            onChangeText={setDefaultRent}
            placeholder="0"
            prefix="₹"
            keyboardType="numeric"
            error={errors.defaultRent}
          />

          <AppInput
            label="Electricity Rate (Per Unit)"
            value={electricityRate}
            onChangeText={setElectricityRate}
            placeholder="0"
            prefix="₹"
            keyboardType="numeric"
            error={errors.electricityRate}
          />

          <AppInput
            label="Water Charge (Per Month)"
            value={waterCharge}
            onChangeText={setWaterCharge}
            placeholder="0"
            prefix="₹"
            keyboardType="numeric"
            error={errors.waterCharge}
          />

          <AppInput
            label="Parking Charge (Per Month)"
            value={parkingCharge}
            onChangeText={setParkingCharge}
            placeholder="0"
            prefix="₹"
            keyboardType="numeric"
            error={errors.parkingCharge}
          />
        </View>

        {/* Property Rules Section */}
        <PropertyRulesSection onChange={setPropertyRules} />

        {/* Save Button */}
        <AppButton
          title="Add Property"
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
    paddingBottom: 60,
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
    marginBottom: spacing.sm,
  },
  cardSubtitle: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: typography.lineHeights.sm,
  },
  selectorLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeButtonText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  typeButtonTextSelected: {
    color: colors.white,
  },
  saveButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
});
