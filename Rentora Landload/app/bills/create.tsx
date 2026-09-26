import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useProperties } from '../../hooks/useProperties';
import { useUnits } from '../../hooks/useUnits';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import AppInput from '../../components/ui/AppInput';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import db from '../../utils/db';
import { Tenant, Bill } from '../../types';
import { billService, decorateBills } from '../../services/billService';
import { formatShortBillDate, parseDateSafely } from '../../utils/date';

export default function CreateBillScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const { tenantId } = useLocalSearchParams<{ tenantId?: string }>();
  const router = useRouter();
  const { properties, loading: propLoading } = useProperties();

  // Wizard Step
  const [step, setStep] = useState(1); // 1: Select Unit/Tenant, 2: Readings & Charges, 3: Review & Generate

  // Selection state
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(false);

  // Form Fields
  const [billingMonth, setBillingMonth] = useState(''); // YYYY-MM
  const [previousMeterReading, setPreviousMeterReading] = useState('0');
  const [currentMeterReading, setCurrentMeterReading] = useState('');
  const [electricityRate, setElectricityRate] = useState('0');
  
  // Custom charges
  const [rent, setRent] = useState('0');
  const [waterCharge, setWaterCharge] = useState('0');
  const [parkingCharge, setParkingCharge] = useState('0');
  const [maintenanceCharge, setMaintenanceCharge] = useState('0');
  const [otherCharges, setOtherCharges] = useState('0');
  const [previousDue, setPreviousDue] = useState('0');

  // Utility Bill Mode Fields
  const [electricityFixedCharge, setElectricityFixedCharge] = useState('0');
  const [waterRate, setWaterRate] = useState('0');

  // Due Date
  const [dueDate, setDueDate] = useState(''); // YYYY-MM-DD
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dueDateValue, setDueDateValue] = useState(new Date());

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

  // Error messages
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);

  const { units, loading: unitLoading, refresh: refreshUnits } = useUnits(selectedPropertyId);

  // 1. Initial settings
  useEffect(() => {
    // Default billing month to current month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setBillingMonth(currentMonth);

    // Default due date to 10 days from now
    const tenDaysLater = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    const formatDateString = (date: Date) => {
      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    };
    setDueDate(formatDateString(tenDaysLater));
    setDueDateValue(tenDaysLater);

    // Default current reading date to today
    setCurrentMeterReadingDate(formatShortBillDate(now));
    setCurrentMeterReadingDateValue(now);
  }, []);

  // 2. Resolve parameters if directed from Tenant details page
  useEffect(() => {
    const resolveTenantShortcut = async () => {
      if (tenantId && properties.length > 0) {
        setLoadingTenant(true);
        try {
          const t = await db.getDoc<Tenant>('tenants', tenantId);
          if (t && t.status === 'active') {
            setActiveTenant(t);
            setSelectedPropertyId(t.propertyId);
            setSelectedUnitId(t.unitId);
            setStep(2); // Jump directly to charges page
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoadingTenant(false);
        }
      }
    };
    resolveTenantShortcut();
  }, [tenantId, properties]);

  // 3. Load units when property changes
  useEffect(() => {
    if (selectedPropertyId && !tenantId) {
      refreshUnits();
      setSelectedUnitId('');
      setActiveTenant(null);
    }
  }, [selectedPropertyId]);

  // 4. Load tenant and previous meter reading when unit is selected
  useEffect(() => {
    const loadUnitTenantAndReadings = async () => {
      if (!selectedUnitId) return;
      setLoadingTenant(true);
      try {
        // Find active tenant for this unit
        const allTenants = await db.getDocs<Tenant>('tenants');
        const unitTenant = allTenants.find(t => t.unitId === selectedUnitId && t.status === 'active');
        
        if (!unitTenant) {
          setActiveTenant(null);
          setLoadingTenant(false);
          return;
        }
        
        setActiveTenant(unitTenant);
        
        const property = properties.find(p => p.id === selectedPropertyId);
        
        // Prefill rent from Tenant lease, fallback to property defaultRent
        const defaultRentVal = unitTenant.monthlyRent || property?.defaultRent || 0;
        setRent(String(defaultRentVal));

        // Prefill charges based on Tenant billing type
        const eType = unitTenant.electricityBillType || 'perUnit';
        const wType = unitTenant.waterBillType || 'none';

        if (eType === 'fixed') {
          setElectricityFixedCharge(String(unitTenant.electricityFixedAmount || 0));
        } else if (eType === 'perUnit') {
          setElectricityRate(String(unitTenant.electricityRatePerUnit !== undefined ? unitTenant.electricityRatePerUnit : (property?.electricityRate || 0)));
        }

        if (wType === 'fixed') {
          setWaterCharge(String(unitTenant.waterFixedAmount !== undefined ? unitTenant.waterFixedAmount : (property?.waterCharge || 0)));
        } else if (wType === 'perUnit') {
          setWaterRate(String(unitTenant.waterRatePerUnit || 0));
        }

        setParkingCharge(String(property?.parkingCharge || 0));

        // Fetch latest bill to get previous meter reading
        const latestBill = await billService.getLatestBillForUnit(
          unitTenant.ownerId,
          selectedPropertyId,
          selectedUnitId
        );

        if (latestBill) {
          setPreviousMeterReading(String(latestBill.currentMeterReading));
          const prevDate = latestBill.currentMeterReadingDate || latestBill.createdAt;
          const parsed = parseDateSafely(prevDate);
          if (parsed) {
            setPreviousMeterReadingDate(formatShortBillDate(parsed));
            setPreviousMeterReadingDateValue(parsed);
          } else {
            setPreviousMeterReadingDate('');
          }
          setCurrentMeterReading('');
        } else {
          setPreviousMeterReading(String(unitTenant.initialMeterReading || 0));
          const parsed = parseDateSafely(unitTenant.moveInDate);
          if (parsed) {
            setPreviousMeterReadingDate(formatShortBillDate(parsed));
            setPreviousMeterReadingDateValue(parsed);
          } else {
            setPreviousMeterReadingDate('');
          }
          setCurrentMeterReading('');
        }

        // Calculate outstanding balance from previous bills
        const tenantBills = await db.queryDocs<Bill>('bills', (doc) => doc.tenantId === unitTenant.id);
        const decorated = decorateBills(tenantBills);
        const outstanding = decorated.reduce((sum, b) => sum + (b.remainingAmount || 0), 0);
        setPreviousDue(String(outstanding));
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingTenant(false);
      }
    };
    
    // Only load if not coming from Tenant details shortcut with data pre-resolved
    if (selectedUnitId && !tenantId) {
      loadUnitTenantAndReadings();
    } else if (selectedUnitId && tenantId && activeTenant) {
      // Shortcut case: we still need to load previous meter readings
      const loadReadingsOnly = async () => {
        const property = properties.find(p => p.id === selectedPropertyId);
        
        // Prefill rent from Tenant lease, fallback to property defaultRent
        const defaultRentVal = activeTenant.monthlyRent || property?.defaultRent || 0;
        setRent(String(defaultRentVal));

        if (property) {
          setElectricityRate(String(property.electricityRate || 0));
          setWaterCharge(String(property.waterCharge || 0));
          setParkingCharge(String(property.parkingCharge || 0));
        }

        const latestBill = await billService.getLatestBillForUnit(
          activeTenant.ownerId,
          selectedPropertyId,
          selectedUnitId
        );
        if (latestBill) {
          setPreviousMeterReading(String(latestBill.currentMeterReading));
          const prevDate = latestBill.currentMeterReadingDate || latestBill.createdAt;
          const parsed = parseDateSafely(prevDate);
          if (parsed) {
            setPreviousMeterReadingDate(formatShortBillDate(parsed));
            setPreviousMeterReadingDateValue(parsed);
          }
          setCurrentMeterReading('');
        } else {
          setPreviousMeterReading(String(activeTenant.initialMeterReading || 0));
          const parsed = parseDateSafely(activeTenant.moveInDate);
          if (parsed) {
            setPreviousMeterReadingDate(formatShortBillDate(parsed));
            setPreviousMeterReadingDateValue(parsed);
          }
          setCurrentMeterReading('');
        }

        // Calculate outstanding balance from previous bills
        const tenantBills = await db.queryDocs<Bill>('bills', (doc) => doc.tenantId === activeTenant.id);
        const decorated = decorateBills(tenantBills);
        const outstanding = decorated.reduce((sum, b) => sum + (b.remainingAmount || 0), 0);
        setPreviousDue(String(outstanding));
      };
      loadReadingsOnly();
    }
  }, [selectedUnitId, properties]);

  if (propLoading || loadingTenant) {
    return <LoadingView message="Resolving details..." />;
  }

  // Intermediate computations
  const eType = activeTenant?.electricityBillType || 'perUnit';
  const wType = activeTenant?.waterBillType || 'none';
  const needsMeter = eType === 'perUnit' || wType === 'perUnit';

  const prevReading = parseFloat(previousMeterReading) || 0;
  const currReading = parseFloat(currentMeterReading) || 0;
  const elecRate = parseFloat(electricityRate) || 0;
  
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

  const rentVal = parseFloat(rent) || 0;
  const parkingVal = parseFloat(parkingCharge) || 0;
  const maintVal = parseFloat(maintenanceCharge) || 0;
  const otherVal = parseFloat(otherCharges) || 0;
  const prevDueVal = parseFloat(previousDue) || 0;

  const subtotal = rentVal + electricityCharge + waterChargeVal + parkingVal + maintVal + otherVal;
  const totalAmount = subtotal + prevDueVal;

  const validateStep1 = () => {
    if (!selectedPropertyId) {
      Alert.alert('Selection Required', 'Please select a property');
      return false;
    }
    if (!selectedUnitId) {
      Alert.alert('Selection Required', 'Please select a unit');
      return false;
    }
    if (!activeTenant) {
      Alert.alert('Cannot Generate Bill', 'This unit is currently vacant. You can only generate bills for occupied units with active tenants.');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    const newErrors: Record<string, string> = {};
    
    if (!billingMonth.trim() || !/^\d{4}-\d{2}$/.test(billingMonth)) {
      newErrors.billingMonth = 'Billing month must be in YYYY-MM format';
    }
    
    if (needsMeter) {
      if (isNaN(prevReading) || prevReading < 0) {
        newErrors.previousMeterReading = 'Must be a positive number';
      }
      if (!currentMeterReading.trim()) {
        newErrors.currentMeterReading = 'Current meter reading is required';
      } else {
        const currReadingNum = parseFloat(currentMeterReading);
        if (isNaN(currReadingNum) || currReadingNum < 0) {
          newErrors.currentMeterReading = 'Must be a positive number';
        } else if (currReadingNum < prevReading) {
          newErrors.currentMeterReading = 'Current reading cannot be lower than previous reading.';
        }
      }
    }

    if (eType === 'perUnit' && (isNaN(elecRate) || elecRate < 0)) {
      newErrors.electricityRate = 'Cannot be negative';
    }
    if (eType === 'fixed') {
      const elecFixed = parseFloat(electricityFixedCharge);
      if (isNaN(elecFixed) || elecFixed < 0) {
        newErrors.electricityFixedCharge = 'Cannot be negative';
      }
    }

    if (wType === 'perUnit') {
      const wRate = parseFloat(waterRate);
      if (isNaN(wRate) || wRate < 0) {
        newErrors.waterRate = 'Cannot be negative';
      }
    }
    if (wType === 'fixed') {
      const waterFixed = parseFloat(waterCharge);
      if (isNaN(waterFixed) || waterFixed < 0) {
        newErrors.water = 'Cannot be negative';
      }
    }

    if (isNaN(rentVal) || rentVal < 0) {
      newErrors.rent = 'Cannot be negative';
    }
    if (isNaN(parkingVal) || parkingVal < 0) {
      newErrors.parking = 'Cannot be negative';
    }
    if (isNaN(maintVal) || maintVal < 0) {
      newErrors.maint = 'Cannot be negative';
    }
    if (isNaN(otherVal) || otherVal < 0) {
      newErrors.other = 'Cannot be negative';
    }
    if (isNaN(prevDueVal) || prevDueVal < 0) {
      newErrors.prevDue = 'Cannot be negative';
    }

    if (!dueDate.trim()) {
      newErrors.dueDate = 'Due date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 1) {
      if (validateStep1()) setStep(2);
    } else if (step === 2) {
      if (validateStep2()) setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      // If came from Tenant details shortcut, back button exits
      if (step === 2 && tenantId) {
        router.back();
      } else {
        setStep(step - 1);
      }
    }
  };

  const handleGenerateBill = async () => {
    if (!activeTenant) return;
    setIsGenerating(true);

    try {
      const billData: any = {
        ownerId: activeTenant.ownerId,
        tenantId: activeTenant.id!,
        propertyId: selectedPropertyId,
        unitId: selectedUnitId,
        billingMonth,
        previousMeterReading: needsMeter ? prevReading : 0,
        currentMeterReading: needsMeter ? currReading : 0,
        electricityUnits: eType === 'perUnit' ? elecUnits : 0,
        electricityRate: eType === 'perUnit' ? elecRate : 0,
        electricityCharge,
        rent: rentVal,
        waterCharge: waterChargeVal,
        parkingCharge: parkingVal,
        maintenanceCharge: maintVal,
        otherCharges: otherVal,
        previousDue: prevDueVal,
        subtotal,
        totalAmount,
        dueDate,
        paidAmount: 0,
        remainingAmount: totalAmount,
        paymentStatus: 'unpaid',

        electricityBillType: eType,
        waterBillType: wType,
      };

      if (eType === 'fixed') {
        billData.electricityFixedAmount = parseFloat(electricityFixedCharge) || 0;
      } else if (eType === 'perUnit') {
        billData.electricityRatePerUnit = elecRate;
      }

      if (wType === 'fixed') {
        billData.waterFixedAmount = parseFloat(waterCharge) || 0;
      } else if (wType === 'perUnit') {
        billData.waterRatePerUnit = parseFloat(waterRate) || 0;
      }

      if (currentMeterReadingDateValue && !isNaN(currentMeterReadingDateValue.getTime())) {
        billData.currentMeterReadingDate = currentMeterReadingDateValue.toISOString().split('T')[0];
      }
      if (previousMeterReadingDateValue && !isNaN(previousMeterReadingDateValue.getTime())) {
        billData.previousMeterReadingDate = previousMeterReadingDateValue.toISOString().split('T')[0];
      }

      const generatedBill = await billService.createBill(billData);

      Alert.alert('Success', 'Bill generated successfully!', [
        {
          text: 'View Details',
          onPress: () => {
            router.replace({ pathname: '/bills/[id]', params: { id: generatedBill.id } });
          }
        }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to generate bill');
    } finally {
      setIsGenerating(false);
    }
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <View style={styles.container}>
        {/* Step Stepper Header */}
        <View style={styles.stepperContainer}>
          {[1, 2, 3].map((s) => (
            <View key={s} style={styles.stepIndicatorWrapper}>
              <View style={[
                styles.stepIndicator,
                step === s && styles.stepIndicatorActive,
                step > s && styles.stepIndicatorDone
              ]}>
                {step > s ? (
                  <Ionicons name="checkmark" size={16} color={colors.white} />
                ) : (
                  <Text style={[styles.stepIndicatorText, step === s && styles.stepIndicatorTextActive]}>{s}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, step === s && styles.stepLabelActive]}>
                {s === 1 ? 'Unit' : s === 2 ? 'Charges' : 'Generate'}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* STEP 1: Select Unit/Tenant */}
          {step === 1 && (
            <View style={styles.stepBox}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Select Property</Text>
                <View style={styles.propertyGrid}>
                  {properties.map((p) => {
                    const isSelected = selectedPropertyId === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.propButton, isSelected && styles.propButtonSelected]}
                        onPress={() => setSelectedPropertyId(p.id!)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="business" size={18} color={isSelected ? colors.white : colors.primary} />
                        <Text style={[styles.propBtnText, isSelected && styles.propBtnTextSelected]}>{p.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {selectedPropertyId ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Select occupied unit</Text>
                  {unitLoading ? (
                    <LoadingView message="Loading units..." fullscreen={false} />
                  ) : units.length === 0 ? (
                    <Text style={styles.infoText}>No units added under this property yet.</Text>
                  ) : (
                    <View style={styles.unitGrid}>
                      {units.map((u) => {
                        const isSelected = selectedUnitId === u.id;
                        const isOccupied = u.status === 'occupied';

                        return (
                          <TouchableOpacity
                            key={u.id}
                            style={[
                              styles.unitButton,
                              isSelected && styles.unitButtonSelected,
                              !isOccupied && styles.unitButtonVacant
                            ]}
                            onPress={() => isOccupied && setSelectedUnitId(u.id!)}
                            disabled={!isOccupied}
                            activeOpacity={isOccupied ? 0.8 : 1}
                          >
                            <Text style={[
                              styles.unitText,
                              isSelected && styles.unitTextSelected,
                              !isOccupied && styles.unitTextVacant
                            ]}>
                              {u.unitNumber}
                            </Text>
                            {!isOccupied && <Text style={styles.unitSubLabel}>Vacant</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : null}

              {activeTenant && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Assigned Tenant</Text>
                  <View style={styles.tenantInfoRow}>
                    <Ionicons name="person-circle-outline" size={32} color={colors.primary} />
                    <View style={styles.tenantDetails}>
                      <Text style={styles.tenantName}>{activeTenant.name}</Text>
                      <Text style={styles.tenantSub}>Move-in: {activeTenant.moveInDate || 'N/A'}</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* STEP 2: Fill Billing Charges */}
          {step === 2 && activeTenant && (
            <View style={styles.stepBox}>
              {/* Electricity/Water Meter Readings Card */}
              {needsMeter && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>ELECTRICITY/WATER METER READINGS</Text>
                  <Text style={styles.cardSubtitle}>
                    Tenant billing type is unit-based. Enter the current meter reading below.
                  </Text>

                  <View style={styles.row}>
                    <View style={styles.col}>
                      <Text style={styles.label}>Prev Reading Date</Text>
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
                      <AppInput
                        label="Prev Reading"
                        value={previousMeterReading}
                        onChangeText={setPreviousMeterReading}
                        keyboardType="numeric"
                        error={errors.previousMeterReading}
                      />
                    </View>
                  </View>

                  <View style={styles.row}>
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
                    <View style={styles.col}>
                      <AppInput
                        label="Current Reading *"
                        value={currentMeterReading}
                        onChangeText={setCurrentMeterReading}
                        keyboardType="numeric"
                        error={errors.currentMeterReading}
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* Utility & General Charges Card */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Utility Charges</Text>

                <AppInput
                  label="Billing Month (YYYY-MM) *"
                  value={billingMonth}
                  onChangeText={setBillingMonth}
                  placeholder="e.g. 2026-08"
                  error={errors.billingMonth}
                />

                {/* Electricity Charge Select Mode */}
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

                {/* Water Charge Select Mode */}
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

                {needsMeter && (
                  <View style={styles.calculationAlert}>
                    <Ionicons name="bulb-outline" size={16} color={colors.primary} />
                    <Text style={styles.calcText}>
                      Units: {elecUnits} {meterDays !== null ? `(${meterDays} Days)` : ''}
                    </Text>
                  </View>
                )}
              </View>

              {/* Other Charges Card */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Rent & Custom Charges</Text>
                
                <AppInput
                  label="Monthly Rent Amount *"
                  value={rent}
                  onChangeText={setRent}
                  prefix="₹"
                  keyboardType="numeric"
                  error={errors.rent}
                />

                <View style={styles.row}>
                  <View style={styles.col}>
                    <AppInput
                      label="Parking Charge"
                      value={parkingCharge}
                      onChangeText={setParkingCharge}
                      prefix="₹"
                      keyboardType="numeric"
                      error={errors.parking}
                    />
                  </View>
                  <View style={styles.col}>
                    <AppInput
                      label="Maintenance"
                      value={maintenanceCharge}
                      onChangeText={setMaintenanceCharge}
                      prefix="₹"
                      keyboardType="numeric"
                      error={errors.maint}
                    />
                  </View>
                </View>

                <AppInput
                  label="Other Charges"
                  value={otherCharges}
                  onChangeText={setOtherCharges}
                  prefix="₹"
                  keyboardType="numeric"
                  error={errors.other}
                />

                <AppInput
                  label="Previous Arrears / Due Amount"
                  value={previousDue}
                  onChangeText={setPreviousDue}
                  prefix="₹"
                  editable={false}
                  keyboardType="numeric"
                  error={errors.prevDue}
                />
              </View>

              {/* Due Date Card */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Invoice Due Date</Text>
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
                {errors.dueDate && <Text style={styles.errorText}>{errors.dueDate}</Text>}
              </View>
            </View>
          )}

          {/* STEP 3: Review & Generate */}
          {step === 3 && activeTenant && (
            <View style={styles.stepBox}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Bill Summary</Text>
                <View style={styles.breakdownList}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Rent</Text>
                    <Text style={styles.breakdownValue}>₹{rentVal}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Electricity</Text>
                    <Text style={styles.breakdownValue}>₹{electricityCharge}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Water</Text>
                    <Text style={styles.breakdownValue}>₹{waterChargeVal}</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>TOTAL</Text>
                    <Text style={styles.totalValue}>₹{totalAmount}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Wizard Navigation Footer */}
          <View style={styles.footerRow}>
            {step > 1 && (
              <AppButton title="Back" onPress={handleBack} variant="outline" style={styles.navButton} />
            )}
            <AppButton
              title={step === 3 ? "Generate Bill" : "Next"}
              onPress={step === 3 ? handleGenerateBill : handleNext}
              loading={isGenerating}
              style={styles.navButton}
            />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  stepperContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepIndicatorWrapper: {
    alignItems: 'center',
    flex: 1,
  },
  stepIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepIndicatorActive: {
    backgroundColor: colors.primary,
  },
  stepIndicatorDone: {
    backgroundColor: colors.secondary,
  },
  stepIndicatorText: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
  },
  stepIndicatorTextActive: {
    color: colors.white,
  },
  stepLabel: {
    fontSize: typography.sizes.xs - 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
  },
  stepLabelActive: {
    color: colors.text,
    fontWeight: typography.weights.bold,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  stepBox: {
    width: '100%',
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
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  cardSubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  propertyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  propButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  propButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  propBtnText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginLeft: spacing.xs,
  },
  propBtnTextSelected: {
    color: colors.white,
  },
  unitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  unitButton: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unitButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unitButtonVacant: {
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  unitText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  unitTextSelected: {
    color: colors.white,
  },
  unitTextVacant: {
    color: colors.textSecondary,
  },
  unitSubLabel: {
    fontSize: 8,
    color: colors.primary,
    fontWeight: typography.weights.bold,
    marginTop: 2,
  },
  unitTextVacantSub: {
    color: colors.textSecondary,
  },
  tenantInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tenantDetails: {
    flex: 1,
  },
  tenantName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  tenantSub: {
    fontSize: typography.sizes.sm - 1,
    color: colors.textSecondary,
    marginTop: 2,
  },
  tenantMiniHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.borderRadius.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  tenantHeaderTitle: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  col: {
    flex: 1,
  },
  calculationAlert: {
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: spacing.borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  calcText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.text,
    fontWeight: typography.weights.medium,
  },
  boldText: {
    fontWeight: typography.weights.bold,
    color: colors.primary,
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
  billBreakdownHeader: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.lg,
  },
  breakdownList: {
    gap: spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  breakdownValue: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  totalValue: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  dueDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    padding: spacing.md,
    borderRadius: spacing.borderRadius.md,
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  dueDateText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.text,
    fontWeight: typography.weights.medium,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
  },
  navButton: {
    flex: 1,
  },
  infoText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.danger,
    marginTop: spacing.xs - 2,
    fontWeight: typography.weights.medium,
  },
  label: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginBottom: spacing.xs,
  },
  inputHelperText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    fontWeight: typography.weights.semibold,
  },
});
