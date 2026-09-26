import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import AppInput from '../../components/ui/AppInput';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import db from '../../utils/db';
import { Bill } from '../../types';
import { billService } from '../../services/billService';
import { formatShortBillDate, parseDateSafely } from '../../utils/date';

export default function EditBillScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const { billId } = useLocalSearchParams<{ billId?: string }>();
  const router = useRouter();

  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);

  // Form Fields
  const [rent, setRent] = useState('0');
  const [previousMeterReading, setPreviousMeterReading] = useState('0');
  const [currentMeterReading, setCurrentMeterReading] = useState('0');
  const [electricityRate, setElectricityRate] = useState('0');
  const [waterCharge, setWaterCharge] = useState('0');
  const [parkingCharge, setParkingCharge] = useState('0');
  const [maintenanceCharge, setMaintenanceCharge] = useState('0');
  const [otherCharges, setOtherCharges] = useState('0');
  const [previousDue, setPreviousDue] = useState('0');
  const [dueDate, setDueDate] = useState(''); // YYYY-MM-DD
  const [notes, setNotes] = useState('');

  // Utility Bill Mode Fields
  const [electricityFixedCharge, setElectricityFixedCharge] = useState('0');
  const [waterRate, setWaterRate] = useState('0');

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dueDateValue, setDueDateValue] = useState(new Date());

  // Submitting state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Meter Reading Dates
  const [previousMeterReadingDate, setPreviousMeterReadingDate] = useState('');
  const [previousMeterReadingDateValue, setPreviousMeterReadingDateValue] = useState(new Date());
  const [showPrevDatePicker, setShowPrevDatePicker] = useState(false);

  const [currentMeterReadingDate, setCurrentMeterReadingDate] = useState('');
  const [currentMeterReadingDateValue, setCurrentMeterReadingDateValue] = useState(new Date());
  const [showCurrDatePicker, setShowCurrDatePicker] = useState(false);

  const calculateMeterDays = (start: Date, end: Date): number | null => {
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays : null;
  };

  useEffect(() => {
    const loadBill = async () => {
      if (billId) {
        try {
          const b = await billService.getBillById(billId);
          if (b) {
            setBill(b);
            setRent(String(b.rent || 0));
            setPreviousMeterReading(String(b.previousMeterReading || 0));
            setCurrentMeterReading(String(b.currentMeterReading || 0));
            setElectricityRate(String(b.electricityRate || 0));
            setWaterCharge(String(b.waterCharge || 0));
            setParkingCharge(String(b.parkingCharge || 0));
            setMaintenanceCharge(String(b.maintenanceCharge || 0));
            setOtherCharges(String(b.otherCharges || 0));
            setPreviousDue(String(b.previousDue || 0));
            setDueDate(b.dueDate || '');
            setNotes(b.notes || '');

            // Backward-compatible fallback
            const eType = b.electricityBillType || 'perUnit';
            const wType = b.waterBillType || 'none';

            if (eType === 'fixed') {
              setElectricityFixedCharge(String(b.electricityFixedAmount !== undefined ? b.electricityFixedAmount : b.electricityCharge));
            } else if (eType === 'perUnit') {
              setElectricityRate(String(b.electricityRatePerUnit !== undefined ? b.electricityRatePerUnit : b.electricityRate));
            }

            if (wType === 'fixed') {
              setWaterCharge(String(b.waterFixedAmount !== undefined ? b.waterFixedAmount : b.waterCharge));
            } else if (wType === 'perUnit') {
              setWaterRate(String(b.waterRatePerUnit || 0));
            }
            
            const prevParsed = parseDateSafely(b.previousMeterReadingDate || b.createdAt);
            if (prevParsed) {
              setPreviousMeterReadingDate(formatShortBillDate(prevParsed));
              setPreviousMeterReadingDateValue(prevParsed);
            } else {
              setPreviousMeterReadingDate('');
            }

            const currParsed = parseDateSafely(b.currentMeterReadingDate || b.createdAt);
            if (currParsed) {
              setCurrentMeterReadingDate(formatShortBillDate(currParsed));
              setCurrentMeterReadingDateValue(currParsed);
            } else {
              setCurrentMeterReadingDate('');
            }

            if (b.dueDate) {
              try {
                // Try to parse existing dueDate
                const d = new Date(b.dueDate);
                if (!isNaN(d.getTime())) {
                  setDueDateValue(d);
                }
              } catch (e) {}
            }
          }
        } catch (e) {
          console.error(e);
          Alert.alert('Error', 'Failed to load bill details');
        } finally {
          setLoading(false);
        }
      }
    };
    loadBill();
  }, [billId]);

  if (loading) {
    return <LoadingView message="Loading bill details..." />;
  }

  if (!bill) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={styles.errorText}>Invoice not found or deleted.</Text>
        <AppButton title="Go Back" onPress={() => router.back()} style={styles.errBtn} />
      </View>
    );
  }

  // Intermediary computations
  const eType = bill.electricityBillType || 'perUnit';
  const wType = bill.waterBillType || 'none';
  const needsMeter = eType === 'perUnit' || wType === 'perUnit';

  const rentVal = parseFloat(rent) || 0;
  const prevReading = parseFloat(previousMeterReading) || 0;
  const currReading = parseFloat(currentMeterReading) || 0;
  const elecRate = parseFloat(electricityRate) || 0;
  const parkingVal = parseFloat(parkingCharge) || 0;
  const maintVal = parseFloat(maintenanceCharge) || 0;
  const otherVal = parseFloat(otherCharges) || 0;
  const prevDueVal = parseFloat(previousDue) || 0;

  // Calculate electricity units & charge
  const elecUnits = Math.max(0, currReading - prevReading);
  
  const electricityCharge = eType === 'fixed'
    ? (parseFloat(electricityFixedCharge) || 0)
    : eType === 'none'
      ? 0
      : elecUnits * elecRate;

  const waterChargeVal = wType === 'fixed'
    ? (parseFloat(waterCharge) || 0)
    : wType === 'none'
      ? 0
      : elecUnits * (parseFloat(waterRate) || 0);

  const meterDays = calculateMeterDays(previousMeterReadingDateValue, currentMeterReadingDateValue);

  // Subtotal & Grand Total
  const subtotal = rentVal + electricityCharge + waterChargeVal + parkingVal + maintVal + otherVal;
  const totalAmount = subtotal + prevDueVal;
  const remainingAmount = Math.max(0, totalAmount - bill.paidAmount);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (needsMeter && currReading < prevReading) {
      newErrors.currentMeterReading = `Must be greater than or equal to previous reading (${prevReading})`;
    }
    
    if (eType === 'fixed') {
      const elecFixed = parseFloat(electricityFixedCharge);
      if (isNaN(elecFixed) || elecFixed < 0) {
        newErrors.electricityFixedCharge = 'Cannot be negative';
      }
    } else if (eType === 'perUnit') {
      if (elecRate < 0) newErrors.electricityRate = 'Cannot be negative';
    }

    if (wType === 'fixed') {
      const waterVal = parseFloat(waterCharge);
      if (isNaN(waterVal) || waterVal < 0) {
        newErrors.water = 'Cannot be negative';
      }
    } else if (wType === 'perUnit') {
      const wRate = parseFloat(waterRate);
      if (isNaN(wRate) || wRate < 0) {
        newErrors.waterRate = 'Cannot be negative';
      }
    }

    if (rentVal < 0) newErrors.rent = 'Cannot be negative';
    if (parkingVal < 0) newErrors.parking = 'Cannot be negative';
    if (maintVal < 0) newErrors.maintenance = 'Cannot be negative';
    if (otherVal < 0) newErrors.other = 'Cannot be negative';
    if (!dueDate.trim()) newErrors.dueDate = 'Due date is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDueDateValue(selectedDate);
      const formatDateString = (date: Date) => {
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      };
      setDueDate(formatDateString(selectedDate));
    }
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);

    try {
      let newStatus = bill.paymentStatus;
      if (remainingAmount === 0) {
        newStatus = 'paid';
      } else if (bill.paidAmount > 0) {
        newStatus = 'partial';
      } else {
        newStatus = 'unpaid';
      }

      const updatePayload: any = {
        rent: rentVal,
        previousMeterReading: needsMeter ? prevReading : 0,
        currentMeterReading: needsMeter ? currReading : 0,
        electricityRate: eType === 'perUnit' ? elecRate : 0,
        electricityUnits: eType === 'perUnit' ? elecUnits : 0,
        electricityCharge,
        waterCharge: waterChargeVal,
        parkingCharge: parkingVal,
        maintenanceCharge: maintVal,
        otherCharges: otherVal,
        previousDue: prevDueVal,
        subtotal,
        totalAmount,
        remainingAmount,
        paymentStatus: newStatus,
        dueDate,

        electricityBillType: eType,
        waterBillType: wType,
      };

      if (eType === 'fixed') {
        updatePayload.electricityFixedAmount = parseFloat(electricityFixedCharge) || 0;
      } else if (eType === 'perUnit') {
        updatePayload.electricityRatePerUnit = elecRate;
      }

      if (wType === 'fixed') {
        updatePayload.waterFixedAmount = parseFloat(waterCharge) || 0;
      } else if (wType === 'perUnit') {
        updatePayload.waterRatePerUnit = parseFloat(waterRate) || 0;
      }

      if (currentMeterReadingDateValue && !isNaN(currentMeterReadingDateValue.getTime())) {
        updatePayload.currentMeterReadingDate = currentMeterReadingDateValue.toISOString().split('T')[0];
      }
      if (previousMeterReadingDateValue && !isNaN(previousMeterReadingDateValue.getTime())) {
        updatePayload.previousMeterReadingDate = previousMeterReadingDateValue.toISOString().split('T')[0];
      }

      await billService.updateBill(bill.id!, updatePayload);

      Alert.alert('Success', 'Invoice updated successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update invoice');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Edit Invoice — {bill.billNumber}</Text>
        <Text style={styles.cardSubtitle}>Update charges and recalculate totals below.</Text>

        <AppInput
          label="Rent"
          value={rent}
          onChangeText={setRent}
          placeholder="0"
          prefix="₹"
          keyboardType="numeric"
          error={errors.rent}
        />

        {/* Meter Readings section */}
        {needsMeter && (
          <View>
            <View style={styles.meterRow}>
              <View style={styles.col}>
                <AppInput
                  label="Prev Reading"
                  value={previousMeterReading}
                  onChangeText={() => {}}
                  editable={false}
                  prefix="kWh"
                  style={{ backgroundColor: colors.background }}
                />
              </View>
              <View style={styles.col}>
                <AppInput
                  label="Current Reading"
                  value={currentMeterReading}
                  onChangeText={setCurrentMeterReading}
                  placeholder="0"
                  prefix="kWh"
                  keyboardType="numeric"
                  error={errors.currentMeterReading}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Last Reading Date</Text>
                <TouchableOpacity
                  style={styles.dateValueBox}
                  onPress={() => setShowPrevDatePicker(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                  <Text style={styles.dateValueText}>{previousMeterReadingDate || 'N/A'}</Text>
                </TouchableOpacity>
                {showPrevDatePicker && (
                  <DateTimePicker
                    value={previousMeterReadingDateValue}
                    mode="date"
                    display="default"
                    onChange={(e, d) => {
                      setShowPrevDatePicker(Platform.OS === 'ios');
                      if (d) {
                        setPreviousMeterReadingDateValue(d);
                        setPreviousMeterReadingDate(formatShortBillDate(d));
                      }
                    }}
                  />
                )}
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Current Reading Date</Text>
                <TouchableOpacity
                  style={styles.dateValueBox}
                  onPress={() => setShowCurrDatePicker(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                  <Text style={styles.dateValueText}>{currentMeterReadingDate || 'Select Date'}</Text>
                </TouchableOpacity>
                {showCurrDatePicker && (
                  <DateTimePicker
                    value={currentMeterReadingDateValue}
                    mode="date"
                    display="default"
                    onChange={(e, d) => {
                      setShowCurrDatePicker(Platform.OS === 'ios');
                      if (d) {
                        setCurrentMeterReadingDateValue(d);
                        setCurrentMeterReadingDate(formatShortBillDate(d));
                      }
                    }}
                  />
                )}
              </View>
            </View>
          </View>
        )}

        {/* Utility Inputs */}
        {eType === 'fixed' && (
          <AppInput
            label="Monthly Electricity Charge *"
            value={electricityFixedCharge}
            onChangeText={setElectricityFixedCharge}
            placeholder="e.g. 500"
            prefix="₹"
            keyboardType="numeric"
            error={errors.electricityFixedCharge}
          />
        )}
        {eType === 'perUnit' && (
          <AppInput
            label="Electricity Rate (Per Unit) *"
            value={electricityRate}
            onChangeText={setElectricityRate}
            placeholder="0"
            prefix="₹"
            keyboardType="numeric"
            error={errors.electricityRate}
          />
        )}

        {wType === 'fixed' && (
          <AppInput
            label="Water Charge *"
            value={waterCharge}
            onChangeText={setWaterCharge}
            prefix="₹"
            keyboardType="numeric"
            error={errors.water}
          />
        )}
        {wType === 'perUnit' && (
          <AppInput
            label="Water Rate (Per Unit) *"
            value={waterRate}
            onChangeText={setWaterRate}
            prefix="₹"
            keyboardType="numeric"
            error={errors.waterRate}
          />
        )}

        <AppInput
          label="Parking Charges"
          value={parkingCharge}
          onChangeText={setParkingCharge}
          placeholder="0"
          prefix="₹"
          keyboardType="numeric"
          error={errors.parking}
        />

        <AppInput
          label="Maintenance Charges"
          value={maintenanceCharge}
          onChangeText={setMaintenanceCharge}
          placeholder="0"
          prefix="₹"
          keyboardType="numeric"
          error={errors.maintenance}
        />

        <AppInput
          label="Other Miscellaneous Charges"
          value={otherCharges}
          onChangeText={setOtherCharges}
          placeholder="0"
          prefix="₹"
          keyboardType="numeric"
          error={errors.other}
        />

        <AppInput
          label="Previous Dues (Arrears)"
          value={previousDue}
          onChangeText={() => {}}
          editable={false}
          prefix="₹"
          style={{ backgroundColor: colors.background }}
        />

        {/* Due Date Selector */}
        <View style={styles.datePickerContainer}>
          <Text style={styles.dateLabel}>Due Date *</Text>
          <TouchableOpacity
            style={styles.dateValueBox}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text style={styles.dateValueText}>{dueDate}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={dueDateValue}
              mode="date"
              display="default"
              onChange={handleDateChange}
            />
          )}
          {errors.dueDate && <Text style={styles.fieldErrorText}>{errors.dueDate}</Text>}
        </View>
      </View>

      {/* Recalculation Summary Panel */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Recalculated Invoice Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal (Current Charges):</Text>
          <Text style={styles.summaryValue}>₹{subtotal}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Previous Dues:</Text>
          <Text style={[styles.summaryValue, prevDueVal > 0 && { color: colors.danger }]}>₹{prevDueVal}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, styles.grandLabel]}>Grand Total:</Text>
          <Text style={[styles.summaryValue, styles.grandValue]}>₹{totalAmount}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Already Paid Amount:</Text>
          <Text style={[styles.summaryValue, { color: colors.secondary }]}>₹{bill.paidAmount}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, styles.grandLabel]}>Remaining Balance:</Text>
          <Text style={[styles.summaryValue, styles.grandValue, { color: colors.primary }]}>₹{remainingAmount}</Text>
        </View>
      </View>

      <AppButton
        title="Save Changes"
        onPress={handleSave}
        loading={isSaving}
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
    paddingBottom: spacing.xxl * 2,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  errBtn: {
    paddingHorizontal: spacing.xxl,
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
  meterRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  datePickerContainer: {
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  dateLabel: {
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
  fieldErrorText: {
    fontSize: typography.sizes.xs,
    color: colors.danger,
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...spacing.shadows.light,
  },
  summaryTitle: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  summaryValue: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  grandLabel: {
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  grandValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  saveButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  calculationAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: spacing.borderRadius.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  calcText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    flex: 1,
  },
  boldText: {
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  row: {
    flexDirection: 'row',
    marginHorizontal: -spacing.xs,
  },
  col: {
    flex: 1,
    paddingHorizontal: spacing.xs,
  },
  label: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginBottom: spacing.xs,
  },
});
