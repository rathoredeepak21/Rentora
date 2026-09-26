import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, Modal, FlatList, KeyboardAvoidingView, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useProperties } from '../../hooks/useProperties';
import { useUnits } from '../../hooks/useUnits';
import { useTenants } from '../../hooks/useTenants';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import AppInput from '../../components/ui/AppInput';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';
import StatusBadge from '../../components/ui/StatusBadge';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import db from '../../utils/db';
import { Bill, TenantLoginStatus } from '../../types';
import { tenantAuthService } from '../../services/tenantAuthService';

const billTypeOptions = [
  { label: 'Fixed (Monthly)', value: 'fixed' },
  { label: 'Charge Per Unit', value: 'perUnit' },
  { label: 'None (Self / Included in Rent)', value: 'none' },
];

// Custom Select Dialog Component
interface CustomSelectProps {
  label: string;
  value: string;
  placeholder?: string;
  options: { label: string; value: string }[];
  onSelect: (val: string) => void;
  icon?: string;
  error?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({
  label,
  value,
  placeholder = 'Select Option',
  options,
  onSelect,
  icon,
  error,
}) => {
  const { colors } = useTheme();
  const styles = useStyles(getStyles);
  const [modalVisible, setModalVisible] = useState(false);
  const selectedOption = options.find((o) => o.value === value);

  return (
    <View style={styles.selectContainer}>
      <Text style={styles.selectorLabel}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.selectBox,
          error ? styles.selectBoxError : null,
          modalVisible ? styles.selectBoxFocused : null,
        ]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <View style={styles.selectBoxLeft}>
          {icon && (
            <Ionicons
              name={icon as any}
              size={20}
              color={value ? colors.primary : colors.textSecondary}
              style={styles.selectIcon}
            />
          )}
          <Text style={[styles.selectValueText, !value && styles.placeholderText]}>
            {selectedOption ? selectedOption.label : placeholder}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <TouchableOpacity
                    style={[styles.optionItem, isSelected && styles.optionItemCheck]}
                    onPress={() => {
                      onSelect(item.value);
                      setModalVisible(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                      {item.label}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default function EditTenantScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { properties, loading: propLoading } = useProperties();
  const { tenants, loading: tenantLoading, updateTenant } = useTenants();

  const tenantObj = tenants.find((t) => t.id === id);

  // Selection states
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');

  // Form Fields
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [gender, setGender] = useState('');
  const [occupation, setOccupation] = useState('');
  const [customOccupation, setCustomOccupation] = useState('');
  const [totalMembers, setTotalMembers] = useState(1);
  const [idProofType, setIdProofType] = useState('none');
  const [documentNumber, setDocumentNumber] = useState('');
  const [moveInDate, setMoveInDate] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('0');
  const [initialMeterReading, setInitialMeterReading] = useState('0');

  // Electricity Billing Type
  const [electricityBillType, setElectricityBillType] = useState<'fixed' | 'perUnit' | 'none'>('perUnit');
  const [electricityFixedAmount, setElectricityFixedAmount] = useState('0');
  const [electricityRatePerUnit, setElectricityRatePerUnit] = useState('0');

  // Water Billing Type
  const [waterBillType, setWaterBillType] = useState<'fixed' | 'perUnit' | 'none'>('none');
  const [waterFixedAmount, setWaterFixedAmount] = useState('0');
  const [waterRatePerUnit, setWaterRatePerUnit] = useState('0');

  // Tenant App Access states
  const [loginStatus, setLoginStatus] = useState<TenantLoginStatus>('not_created');
  const [createTenantLogin, setCreateTenantLogin] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [showTempPassword, setShowTempPassword] = useState(false);

  // Guard states
  const [hasBills, setHasBills] = useState(false);
  const [loadingBillsCheck, setLoadingBillsCheck] = useState(true);

  // Units list for selected property
  const { units, loading: unitLoading, refresh: refreshUnits } = useUnits(selectedPropertyId);

  // Date picker visibility
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateValue, setDateValue] = useState(new Date());

  // Errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load tenant properties
  useEffect(() => {
    if (tenantObj) {
      setName(tenantObj.name);
      setMobile(tenantObj.mobile || '');
      setGender(tenantObj.gender || '');
      setTotalMembers(tenantObj.totalMembers || 1);
      setIdProofType(tenantObj.idProofType || 'none');
      setDocumentNumber(tenantObj.documentNumber || '');
      setMoveInDate(tenantObj.moveInDate);
      setMonthlyRent(String(tenantObj.monthlyRent || 0));
      setInitialMeterReading(String(tenantObj.initialMeterReading || 0));
      setLoginStatus(tenantObj.loginStatus || (tenantObj.tenantAuthUid ? 'active' : 'not_created'));

      // Resolve billing type fallbacks
      const eType = tenantObj.electricityBillType || 'perUnit';
      setElectricityBillType(eType);
      setElectricityFixedAmount(String(tenantObj.electricityFixedAmount || 0));
      const defaultElecRate = properties.find(p => p.id === tenantObj.propertyId)?.electricityRate || 0;
      setElectricityRatePerUnit(String(tenantObj.electricityRatePerUnit !== undefined ? tenantObj.electricityRatePerUnit : defaultElecRate));

      const defaultWaterCharge = properties.find(p => p.id === tenantObj.propertyId)?.waterCharge || 0;
      let wType = tenantObj.waterBillType;
      if (!wType) {
        if (defaultWaterCharge > 0 || tenantObj.waterFixedAmount) {
          wType = 'fixed';
        } else {
          wType = 'none';
        }
      }
      setWaterBillType(wType);
      setWaterFixedAmount(String(tenantObj.waterFixedAmount !== undefined ? tenantObj.waterFixedAmount : defaultWaterCharge));
      setWaterRatePerUnit(String(tenantObj.waterRatePerUnit || 0));

      // Resolve occupation
      const isCustomOcc = tenantObj.occupation && ![
        'student', 'employee', 'government_employee', 'private_job', 'business', 
        'self_employed', 'doctor', 'engineer', 'teacher', 'shopkeeper', 
        'driver', 'farmer', 'homemaker'
      ].includes(tenantObj.occupation);

      if (isCustomOcc) {
        setOccupation('other');
        setCustomOccupation(tenantObj.occupation || '');
      } else {
        setOccupation(tenantObj.occupation || '');
        setCustomOccupation('');
      }

      // Avoid resetting Property/Unit on initial render
      setSelectedPropertyId(tenantObj.propertyId);
      setSelectedUnitId(tenantObj.unitId);
      setDateValue(new Date(tenantObj.moveInDate));
    }
  }, [tenantObj, properties]);

  // Load units when property changes
  useEffect(() => {
    if (selectedPropertyId) {
      refreshUnits();
    }
  }, [selectedPropertyId]);

  // Check if tenant has bills
  useEffect(() => {
    const checkBills = async () => {
      if (id) {
        try {
          const allBills = await db.getDocs<Bill>('bills');
          const tenantBills = allBills.filter((b) => b.tenantId === id);
          setHasBills(tenantBills.length > 0);
        } catch (e) {
          console.error(e);
        } finally {
          setLoadingBillsCheck(false);
        }
      }
    };
    checkBills();
  }, [id]);

  if (propLoading || tenantLoading || loadingBillsCheck || !tenantObj) {
    return <LoadingView message="Loading tenant profile..." />;
  }

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Tenant Name is required';
    if (!selectedPropertyId) newErrors.property = 'Property selection is required';
    if (!selectedUnitId) newErrors.unit = 'Unit selection is required';
    if (!moveInDate.trim()) newErrors.moveInDate = 'Move-in Date is required';
    
    // Monthly Rent
    const rent = parseFloat(monthlyRent);
    if (isNaN(rent) || rent < 0) {
      newErrors.monthlyRent = 'Monthly Rent must be a positive number';
    }

    // ID Proof validation
    if (idProofType !== 'none') {
      if (!documentNumber.trim()) {
        newErrors.documentNumber = 'ID Proof Number is required';
      }
    }

    // Initial Meter Reading validation
    if (electricityBillType === 'perUnit') {
      const initMeter = parseFloat(initialMeterReading);
      if (isNaN(initMeter) || initMeter < 0) {
        newErrors.initialMeterReading = 'Initial Meter Reading must be a non-negative number';
      }
    }

    // Custom Occupation validation
    if (occupation === 'other' && !customOccupation.trim()) {
      newErrors.customOccupation = 'Please specify your occupation';
    }

    // Electricity Mode validation
    if (electricityBillType === 'fixed') {
      const amt = parseFloat(electricityFixedAmount);
      if (isNaN(amt) || amt < 0) {
        newErrors.electricityFixedAmount = 'Monthly Electricity Charge must be a positive number';
      }
    } else if (electricityBillType === 'perUnit') {
      const rate = parseFloat(electricityRatePerUnit);
      if (isNaN(rate) || rate < 0) {
        newErrors.electricityRatePerUnit = 'Electricity Rate Per Unit must be a positive number';
      }
    }

    // Water Mode validation
    if (waterBillType === 'fixed') {
      const amt = parseFloat(waterFixedAmount);
      if (isNaN(amt) || amt < 0) {
        newErrors.waterFixedAmount = 'Monthly Water Charge must be a positive number';
      }
    } else if (waterBillType === 'perUnit') {
      const rate = parseFloat(waterRatePerUnit);
      if (isNaN(rate) || rate < 0) {
        newErrors.waterRatePerUnit = 'Water Rate Per Unit must be a positive number';
      }
    }

    // Tenant App Access validation
    if (!tenantObj?.tenantAuthUid && createTenantLogin) {
      if (!mobile.trim()) {
        newErrors.mobile = 'Mobile Number is required for creating a Tenant App login';
      }
      if (!temporaryPassword || temporaryPassword.length < 6) {
        newErrors.temporaryPassword = 'Temporary Password must be at least 6 characters';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      const savedOccupation = occupation === 'other' ? customOccupation.trim() : occupation;

      const tenantPayload: any = {
        name: name.trim(),
        mobile: mobile.trim(),
        gender: gender || undefined,
        occupation: savedOccupation || undefined,
        totalMembers,
        idProofType,
        documentNumber: idProofType !== 'none' ? documentNumber.trim() : null,
        propertyId: selectedPropertyId,
        unitId: selectedUnitId,
        moveInDate,
        monthlyRent: parseFloat(monthlyRent) || 0,
        electricityBillType,
        waterBillType,
      };

      if (electricityBillType === 'fixed') {
        tenantPayload.electricityFixedAmount = parseFloat(electricityFixedAmount) || 0;
      } else if (electricityBillType === 'perUnit') {
        tenantPayload.electricityRatePerUnit = parseFloat(electricityRatePerUnit) || 0;
        tenantPayload.initialMeterReading = parseFloat(initialMeterReading) || 0;
      }

      if (waterBillType === 'fixed') {
        tenantPayload.waterFixedAmount = parseFloat(waterFixedAmount) || 0;
      } else if (waterBillType === 'perUnit') {
        tenantPayload.waterRatePerUnit = parseFloat(waterRatePerUnit) || 0;
      }

      let newAuthUid = tenantObj.tenantAuthUid || null;
      let finalLoginStatus = loginStatus;

      // If creating new login account
      if (!tenantObj.tenantAuthUid && createTenantLogin && temporaryPassword) {
        try {
          const authRes = await tenantAuthService.createTenantAuthAccount({
            tenantId: tenantObj.id!,
            mobile: mobile.trim(),
            temporaryPassword: temporaryPassword.trim(),
            ownerId: tenantObj.ownerId,
            propertyId: selectedPropertyId,
            unitId: selectedUnitId,
            tenantName: name.trim(),
          });
          newAuthUid = authRes.tenantAuthUid;
          finalLoginStatus = 'active';
        } catch (authErr: any) {
          Alert.alert('Auth Error', authErr.message || 'Failed to create tenant login.');
          setIsSubmitting(false);
          return;
        }
      } else if (tenantObj.tenantAuthUid && loginStatus !== tenantObj.loginStatus) {
        // Status toggle
        await tenantAuthService.updateTenantLoginStatus(tenantObj.id!, loginStatus, tenantObj.tenantAuthUid);
      }

      tenantPayload.tenantAuthUid = newAuthUid;
      tenantPayload.loginStatus = finalLoginStatus;
      tenantPayload.mobileNumber = mobile.trim();

      await updateTenant(tenantObj.id!, tenantPayload);

      Alert.alert('Success', 'Tenant profile updated successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update tenant');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDateValue(selectedDate);
      setMoveInDate(selectedDate.toISOString().split('T')[0]);
    }
  };

  // Dropdown Options
  const genderOptions = [
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' },
    { label: 'Prefer not to say', value: 'prefer_not_to_say' },
  ];

  const occupationOptions = [
    { label: 'Student', value: 'student' },
    { label: 'Employee', value: 'employee' },
    { label: 'Government Employee', value: 'government_employee' },
    { label: 'Private Job', value: 'private_job' },
    { label: 'Business', value: 'business' },
    { label: 'Self Employed', value: 'self_employed' },
    { label: 'Doctor', value: 'doctor' },
    { label: 'Engineer', value: 'engineer' },
    { label: 'Teacher', value: 'teacher' },
    { label: 'Shopkeeper', value: 'shopkeeper' },
    { label: 'Driver', value: 'driver' },
    { label: 'Farmer', value: 'farmer' },
    { label: 'Homemaker', value: 'homemaker' },
    { label: 'Other', value: 'other' },
  ];

  const idProofOptions = [
    { label: 'None', value: 'none' },
    { label: 'Aadhaar Card', value: 'aadhaar' },
    { label: 'PAN Card', value: 'pan' },
    { label: 'Voter ID', value: 'voter_id' },
    { label: 'Passport', value: 'passport' },
    { label: 'Driving Licence', value: 'driving_licence' },
    { label: 'Other', value: 'other' },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        
        {/* 1. Tenant Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tenant Details</Text>

          <AppInput
            label="Tenant Full Name *"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ramesh Kumar"
            error={errors.name}
            icon="person-outline"
          />

          <AppInput
            label="Mobile Number"
            value={mobile}
            onChangeText={setMobile}
            placeholder="e.g. +91 98765 43210"
            keyboardType="phone-pad"
            icon="call-outline"
          />

          {/* Gender Dropdown */}
          <CustomSelect
            label="Gender"
            value={gender}
            placeholder="Select Gender (Optional)"
            options={genderOptions}
            onSelect={setGender}
            icon="transgender-outline"
          />

          {/* Occupation Dropdown */}
          <CustomSelect
            label="Occupation"
            value={occupation}
            placeholder="Select Occupation (Optional)"
            options={occupationOptions}
            onSelect={setOccupation}
            icon="briefcase-outline"
          />

          {/* Specify Occupation (If Other is selected) */}
          {occupation === 'other' && (
            <AppInput
              label="Specify Occupation *"
              value={customOccupation}
              onChangeText={setCustomOccupation}
              placeholder="e.g. Designer, Freelancer"
              error={errors.customOccupation}
              icon="create-outline"
            />
          )}

          {/* Total Members Stepper */}
          <View style={styles.stepperSection}>
            <Text style={styles.selectorLabel}>Total Members *</Text>
            <View style={styles.stepperContainerRow}>
              <TouchableOpacity
                style={[styles.stepperBtn, totalMembers <= 1 && styles.stepperBtnDisabled]}
                onPress={() => totalMembers > 1 && setTotalMembers(totalMembers - 1)}
                activeOpacity={0.8}
              >
                <Ionicons name="remove" size={20} color={totalMembers <= 1 ? colors.textSecondary : colors.white} />
              </TouchableOpacity>
              <View style={styles.stepperValueBox}>
                <Text style={styles.stepperValue}>{totalMembers}</Text>
              </View>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setTotalMembers(totalMembers + 1)}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={20} color={colors.white} />
              </TouchableOpacity>
            </View>
            <Text style={styles.stepperSubtitle}>Including the primary tenant</Text>
          </View>
        </View>

        {/* 2. Identification Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Identification</Text>

          <CustomSelect
            label="ID Proof Type"
            value={idProofType}
            options={idProofOptions}
            onSelect={(val) => {
              setIdProofType(val);
              if (val === 'none') {
                setDocumentNumber('');
              }
            }}
            icon="card-outline"
          />

          {idProofType !== 'none' && (
            <AppInput
              label="ID Proof Number *"
              value={documentNumber}
              onChangeText={setDocumentNumber}
              placeholder="e.g. Aadhaar/PAN Card number"
              error={errors.documentNumber}
              icon="document-text-outline"
            />
          )}
        </View>

        {/* 3. Property Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Property Details</Text>
          
          {/* Select Property */}
          <Text style={styles.selectorLabel}>Select Property *</Text>
          {properties.length === 0 ? (
            <Text style={styles.warningText}>No properties added yet. Add a property first.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorRow}>
              {properties.map((p) => {
                const isSelected = selectedPropertyId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.chipButton, isSelected && styles.chipButtonSelected]}
                    onPress={() => setSelectedPropertyId(p.id!)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="business" size={16} color={isSelected ? colors.white : colors.primary} />
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{p.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
          {errors.property && <Text style={styles.errorText}>{errors.property}</Text>}

          {/* Select Unit */}
          {selectedPropertyId ? (
            <View style={styles.unitContainer}>
              <Text style={styles.selectorLabel}>Select Unit *</Text>
              {unitLoading ? (
                <LoadingView message="Loading units..." fullscreen={false} />
              ) : units.length === 0 ? (
                <Text style={styles.warningText}>No units added under this property. Add a unit first.</Text>
              ) : (
                <View style={styles.unitGrid}>
                  {units.map((u) => {
                    const isSelected = selectedUnitId === u.id;
                    const isOccupied = u.status === 'occupied' && u.currentTenantId !== id;
                    
                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={[
                          styles.unitButton,
                          isSelected && styles.unitButtonSelected,
                          isOccupied && styles.unitButtonDisabled
                        ]}
                        onPress={() => {
                          if (!isOccupied) setSelectedUnitId(u.id!);
                        }}
                        disabled={isOccupied}
                        activeOpacity={isOccupied ? 1 : 0.8}
                      >
                        <Text style={[
                          styles.unitText,
                          isSelected && styles.unitTextSelected,
                          isOccupied && styles.unitTextDisabled
                        ]}>
                          {u.unitNumber}
                        </Text>
                        {isOccupied && (
                          <Text style={styles.occupiedLabel}>Occupied</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {errors.unit && <Text style={styles.errorText}>{errors.unit}</Text>}
            </View>
          ) : null}

          {/* Move-in Date Picker */}
          <View style={styles.datePickerContainer}>
            <Text style={styles.selectorLabel}>Move-in Date *</Text>
            <TouchableOpacity
              style={styles.dateValueBox}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={styles.dateValueText}>{moveInDate}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={dateValue}
                mode="date"
                display="default"
                onChange={handleDateChange}
              />
            )}
            {errors.moveInDate && <Text style={styles.errorText}>{errors.moveInDate}</Text>}
          </View>

          <AppInput
            label="Monthly Rent Amount *"
            value={monthlyRent}
            onChangeText={setMonthlyRent}
            placeholder="0"
            prefix="₹"
            keyboardType="numeric"
            error={errors.monthlyRent}
          />
        </View>

        {/* 4. Electricity Bill Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ELECTRICITY BILL</Text>
          
          <CustomSelect
            label="Select Electricity Bill Type"
            value={electricityBillType}
            options={billTypeOptions}
            onSelect={(val) => setElectricityBillType(val as any)}
            icon="flash-outline"
          />

          {electricityBillType === 'fixed' && (
            <AppInput
              label="Monthly Electricity Charge *"
              value={electricityFixedAmount}
              onChangeText={setElectricityFixedAmount}
              placeholder="e.g. 500"
              keyboardType="numeric"
              error={errors.electricityFixedAmount}
              prefix="₹"
              icon="cash-outline"
            />
          )}

          {electricityBillType === 'perUnit' && (
            <View>
              <AppInput
                label="Electricity Rate Per Unit *"
                value={electricityRatePerUnit}
                onChangeText={setElectricityRatePerUnit}
                placeholder="e.g. 10"
                keyboardType="numeric"
                error={errors.electricityRatePerUnit}
                prefix="₹"
                icon="flash-outline"
              />
              {hasBills ? (
                <View style={styles.disabledMeterContainer}>
                  <Text style={styles.disabledMeterLabel}>Initial Meter Reading</Text>
                  <View style={styles.disabledMeterValueBox}>
                    <Ionicons name="bulb-outline" size={20} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
                    <Text style={styles.disabledMeterValue}>{initialMeterReading}</Text>
                  </View>
                  <Text style={styles.disabledMeterNotice}>
                    Initial Meter Reading cannot be edited because bills have already been generated for this tenant.
                  </Text>
                </View>
              ) : (
                <AppInput
                  label="Initial Meter Reading *"
                  value={initialMeterReading}
                  onChangeText={setInitialMeterReading}
                  placeholder="e.g. 0, 1250"
                  keyboardType="numeric"
                  error={errors.initialMeterReading}
                  icon="bulb-outline"
                />
              )}
            </View>
          )}
        </View>

        {/* 5. Water Bill Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>WATER BILL</Text>
          
          <CustomSelect
            label="Select Water Bill Type"
            value={waterBillType}
            options={billTypeOptions}
            onSelect={(val) => setWaterBillType(val as any)}
            icon="water-outline"
          />

          {waterBillType === 'fixed' && (
            <AppInput
              label="Monthly Water Charge *"
              value={waterFixedAmount}
              onChangeText={setWaterFixedAmount}
              placeholder="e.g. 200"
              keyboardType="numeric"
              error={errors.waterFixedAmount}
              prefix="₹"
              icon="cash-outline"
            />
          )}

          {waterBillType === 'perUnit' && (
            <AppInput
              label="Water Rate Per Unit *"
              value={waterRatePerUnit}
              onChangeText={setWaterRatePerUnit}
              placeholder="e.g. 5"
              keyboardType="numeric"
              error={errors.waterRatePerUnit}
              prefix="₹"
              icon="water-outline"
            />
          )}
        </View>

        {/* 6. Tenant App Access Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tenant App Access</Text>
          
          {tenantObj.tenantAuthUid ? (
            <View>
              <View style={styles.statusRow}>
                <View>
                  <Text style={styles.selectorLabel}>Account Status</Text>
                  <Text style={styles.helperText}>Linked Auth: {tenantObj.mobile}</Text>
                </View>
                <View style={[styles.loginBadge, loginStatus === 'active' ? styles.loginBadgeActive : styles.loginBadgeDisabled]}>
                  <Text style={[styles.loginBadgeText, loginStatus === 'active' ? styles.loginBadgeTextActive : styles.loginBadgeTextDisabled]}>
                    {loginStatus === 'active' ? 'Active' : 'Disabled'}
                  </Text>
                </View>
              </View>

              <View style={[styles.switchRow, { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }]}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={[styles.selectorLabel, { marginBottom: 2 }]}>Enable App Access</Text>
                  <Text style={styles.helperText}>Allow tenant to log in and access their bills</Text>
                </View>
                <Switch
                  value={loginStatus === 'active'}
                  onValueChange={(val) => setLoginStatus(val ? 'active' : 'disabled')}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={loginStatus === 'active' ? colors.primary : '#f4f3f4'}
                />
              </View>
            </View>
          ) : (
            <View>
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={[styles.selectorLabel, { marginBottom: 2 }]}>Create Tenant App Login</Text>
                  <Text style={styles.helperText}>Generate login credentials for the Rentora Tenant App</Text>
                </View>
                <Switch
                  value={createTenantLogin}
                  onValueChange={setCreateTenantLogin}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={createTenantLogin ? colors.primary : '#f4f3f4'}
                />
              </View>

              {createTenantLogin && (
                <View style={{ marginTop: spacing.md }}>
                  <AppInput
                    label="Temporary Password *"
                    value={temporaryPassword}
                    onChangeText={setTemporaryPassword}
                    placeholder="Min. 6 characters"
                    secureTextEntry={!showTempPassword}
                    error={errors.temporaryPassword}
                    icon="lock-closed-outline"
                    rightIcon={showTempPassword ? 'eye-off-outline' : 'eye-outline'}
                    onRightIconPress={() => setShowTempPassword(!showTempPassword)}
                  />
                  <View style={styles.infoBanner}>
                    <Ionicons name="information-circle-outline" size={20} color={colors.primary} style={{ marginRight: spacing.sm, marginTop: 1 }} />
                    <Text style={styles.infoBannerText}>
                      The tenant will log in using their mobile number and this temporary password. Upon first login, they will set a permanent password.
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Save Button */}
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
  cardTitle: {
    fontSize: typography.sizes.md + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  selectorLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  selectorRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm - 2,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.borderRadius.round,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  chipButtonSelected: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    marginLeft: spacing.xs,
  },
  chipTextSelected: {
    color: colors.white,
  },
  unitContainer: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
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
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  unitButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  unitButtonDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  unitText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  unitTextSelected: {
    color: colors.primary,
  },
  unitTextDisabled: {
    color: colors.textSecondary,
  },
  occupiedLabel: {
    fontSize: 9,
    color: colors.danger,
    fontWeight: typography.weights.bold,
    marginTop: 2,
  },
  datePickerContainer: {
    marginBottom: spacing.md,
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
  warningText: {
    fontSize: typography.sizes.sm,
    color: colors.warning,
    fontWeight: typography.weights.semibold,
  },
  errorText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.danger,
    marginTop: spacing.xs - 2,
    fontWeight: typography.weights.medium,
  },
  saveButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  // Custom Selector Styles
  selectContainer: {
    width: '100%',
    marginBottom: spacing.md,
  },
  selectBox: {
    width: '100%',
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  selectBoxError: {
    borderColor: colors.danger,
  },
  selectBoxFocused: {
    borderColor: colors.primary,
  },
  selectBoxLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectIcon: {
    marginRight: spacing.sm,
  },
  selectValueText: {
    fontSize: typography.sizes.md - 1,
    fontWeight: typography.weights.medium,
    color: colors.text,
  },
  placeholderText: {
    color: colors.placeholder,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: spacing.borderRadius.lg,
    borderTopRightRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  optionItemCheck: {
    backgroundColor: colors.primaryLight + '10',
  },
  optionText: {
    fontSize: typography.sizes.md - 1,
    color: colors.text,
    fontWeight: typography.weights.medium,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
  },
  // Stepper Styles
  stepperSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  stepperContainerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: spacing.borderRadius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnDisabled: {
    backgroundColor: colors.border,
  },
  stepperValueBox: {
    width: 60,
    alignItems: 'center',
  },
  stepperValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  stepperSubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontWeight: typography.weights.medium,
  },
  // Disabled Meter Box Styles
  disabledMeterContainer: {
    width: '100%',
  },
  disabledMeterLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  disabledMeterValueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: spacing.borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  disabledMeterValue: {
    fontSize: typography.sizes.md - 1,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
  },
  disabledMeterNotice: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
    marginTop: spacing.xs,
    lineHeight: 15,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helperText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: -spacing.xs,
  },
  loginBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.borderRadius.round,
  },
  loginBadgeActive: {
    backgroundColor: colors.success + '20',
  },
  loginBadgeDisabled: {
    backgroundColor: colors.danger + '20',
  },
  loginBadgeText: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
  },
  loginBadgeTextActive: {
    color: colors.success,
  },
  loginBadgeTextDisabled: {
    color: colors.danger,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.primaryLight + '15',
    padding: spacing.md,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primaryLight + '40',
    marginTop: spacing.sm,
  },
  infoBannerText: {
    flex: 1,
    fontSize: typography.sizes.xs + 1,
    color: colors.text,
    lineHeight: 18,
  },
});
