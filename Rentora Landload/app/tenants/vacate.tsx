import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTenants } from '../../hooks/useTenants';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function VacateTenantScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { tenants, loading, vacateTenant } = useTenants();

  const tenant = tenants.find((t) => t.id === id);

  const [moveOutDate, setMoveOutDate] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateValue, setDateValue] = useState(new Date());
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (loading || !tenant) {
    return <LoadingView message="Loading tenant profile..." />;
  }

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDateValue(selectedDate);
      setMoveOutDate(selectedDate.toISOString().split('T')[0]);
    }
  };

  const handleVacate = () => {
    // Validation: Move-out date must be after move-in date
    if (moveOutDate < tenant.moveInDate) {
      setError(`Move-out date cannot be earlier than Move-in date (${tenant.moveInDate})`);
      return;
    }

    setError('');
    Alert.alert(
      'Confirm Vacate',
      `Are you sure you want to mark ${tenant.name} as Vacated? This will make the assigned unit vacant immediately. Historical financial records will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Vacate Tenant',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await vacateTenant(tenant.id!, moveOutDate);
              Alert.alert('Success', 'Tenant vacated successfully!', [
                {
                  text: 'OK',
                  onPress: () => {
                    // Redirect to tenants tab
                    router.replace('/(tabs)/tenants');
                  }
                }
              ]);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to vacate tenant');
            } finally {
              setIsSubmitting(false);
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
          <View style={styles.header}>
            <Ionicons name="exit-outline" size={24} color={colors.danger} />
            <Text style={styles.cardTitle}>Vacate {tenant.name}</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Assigned Unit will be set back to Vacant. Historical invoices and payments remain unchanged.
          </Text>

          {/* Date Selector */}
          <View style={styles.datePickerContainer}>
            <Text style={styles.label}>Move-out Date *</Text>
            <TouchableOpacity
              style={styles.dateValueBox}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.danger} />
              <Text style={styles.dateValueText}>{moveOutDate}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={dateValue}
                mode="date"
                display="default"
                onChange={handleDateChange}
              />
            )}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        </View>

        <AppButton
          title="Confirm Vacate Tenant"
          onPress={handleVacate}
          loading={isSubmitting}
          variant="danger"
          icon="exit"
          style={styles.vacateButton}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: typography.sizes.md + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: typography.lineHeights.sm,
  },
  datePickerContainer: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  dateValueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  dateValueText: {
    marginLeft: spacing.sm,
    fontSize: typography.sizes.md - 1,
    fontWeight: typography.weights.medium,
    color: colors.text,
  },
  errorText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.danger,
    marginTop: spacing.xs - 2,
    fontWeight: typography.weights.medium,
  },
  vacateButton: {
    marginTop: spacing.sm,
  },
});
