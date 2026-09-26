import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useUnits } from '../../hooks/useUnits';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import AppInput from '../../components/ui/AppInput';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';
import { Ionicons } from '@expo/vector-icons';

export default function EditUnitScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const { id, propertyId } = useLocalSearchParams<{ id: string; propertyId: string }>();
  const router = useRouter();
  
  const { units, loading, updateUnit, deleteUnit } = useUnits(propertyId);
  const unit = units.find(u => u.id === id);

  // Form Fields
  const [unitNumber, setUnitNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [defaultRent, setDefaultRent] = useState('0');
  const [meterNumber, setMeterNumber] = useState('');

  // Errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (unit) {
      setUnitNumber(unit.unitNumber);
      setFloor(unit.floor || '');
      setDefaultRent(String(unit.defaultRent || 0));
      setMeterNumber(unit.meterNumber || '');
    }
  }, [unit]);

  if (loading || !unit) {
    return <LoadingView message="Loading unit details..." />;
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
      await updateUnit(unit.id!, {
        unitNumber: unitNumber.trim(),
        floor: floor.trim() || 'Ground',
        defaultRent: parseFloat(defaultRent) || 0,
        meterNumber: meterNumber.trim(),
      });

      Alert.alert('Success', 'Unit updated successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update unit');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (unit.status === 'occupied') {
      Alert.alert(
        'Cannot Delete Unit',
        'This unit is currently occupied by an active tenant. You must vacate the tenant before deleting the unit.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Delete Unit',
      'Are you sure you want to delete this unit? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteUnit(unit.id!);
              Alert.alert('Success', 'Unit deleted successfully!', [
                { text: 'OK', onPress: () => router.back() }
              ]);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete unit');
            } finally {
              setIsDeleting(false);
            }
          }
        }
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Unit Info</Text>
            <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} disabled={isDeleting}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
          <Text style={styles.cardSubtitle}>Update flat or room details.</Text>

          <AppInput
            label="Unit / Room Number *"
            value={unitNumber}
            onChangeText={setUnitNumber}
            placeholder="e.g. 101, Room A"
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
          title="Save Changes"
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: typography.sizes.md + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: spacing.borderRadius.sm,
    backgroundColor: colors.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
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
