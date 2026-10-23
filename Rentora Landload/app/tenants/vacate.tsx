import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert, 
  Platform, 
  KeyboardAvoidingView, 
  TextInput,
  ActivityIndicator
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTenants } from '../../hooks/useTenants';
import { useProperties } from '../../hooks/useProperties';
import { useSettings } from '../../hooks/useSettings';
import { useTheme, useStyles, typography, spacing } from '../../theme';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import db from '../../utils/db';
import { Bill, Unit, ExtraStayPolicy, Settlement, Tenant } from '../../types';
import { calculateTenantOutstanding } from '../../services/billService';
import { 
  calculateEligibleExtraDays, 
  getRelevantBillingPeriod, 
  calculateExtraStayRent, 
  calculateFinalElectricity,
  deriveNormalPeriodDates,
  settlementService 
} from '../../services/settlementService';
import { formatBillDate, formatShortBillDate, parseDateSafely } from '../../utils/date';

import { tenantService } from '../../services/tenantService';

export default function MoveOutSettlementScreen() {
  const { colors } = useTheme();
  const styles = useStyles(getStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { tenants, loading: tenantLoading } = useTenants();
  const { properties } = useProperties();
  const { settings, loading: settingsLoading } = useSettings();

  const [directTenant, setDirectTenant] = useState<Tenant | null>(null);
  const [directTenantLoading, setDirectTenantLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setDirectTenantLoading(true);
    tenantService.getTenantById(id).then((t: Tenant | null) => {
      if (t) setDirectTenant(t);
    }).catch((e: any) => {
      console.error('Error fetching tenant directly in vacate screen:', e);
    }).finally(() => {
      setDirectTenantLoading(false);
    });
  }, [id]);

  const tenant = tenants.find((t) => t.id === id) || directTenant;
  const property = tenant ? properties.find((p) => p.id === tenant.propertyId) : null;

  const [unitNumber, setUnitNumber] = useState('');
  const [bills, setBills] = useState<Bill[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [existingSettlement, setExistingSettlement] = useState<Settlement | null>(null);

  const todayIso = new Date().toISOString().split('T')[0];

  // Form State: Dates
  const [moveOutDate, setMoveOutDate] = useState(todayIso);
  const [moveOutDateValue, setMoveOutDateValue] = useState(new Date());
  const [showMoveOutDatePicker, setShowMoveOutDatePicker] = useState(false);

  const [normalPeriodEndDate, setNormalPeriodEndDate] = useState(todayIso);
  const [normalPeriodEndDateValue, setNormalPeriodEndDateValue] = useState(new Date());
  const [showNormalDatePicker, setShowNormalDatePicker] = useState(false);

  // Electricity
  const [previousMeterReading, setPreviousMeterReading] = useState(0);
  const [previousMeterReadingDate, setPreviousMeterReadingDate] = useState('');
  const [finalMeterReadingInput, setFinalMeterReadingInput] = useState('');
  const [finalMeterReadingDate, setFinalMeterReadingDate] = useState(todayIso);
  const [finalMeterReadingDateValue, setFinalMeterReadingDateValue] = useState(new Date());
  const [showMeterDatePicker, setShowMeterDatePicker] = useState(false);

  // Extra-Stay Policy override/toggle
  const [selectedPolicy, setSelectedPolicy] = useState<ExtraStayPolicy>('fixed30');

  // Other Charges
  const [otherChargesInput, setOtherChargesInput] = useState('0');
  const [otherChargesNotes, setOtherChargesNotes] = useState('');

  // Advance Rent & Security Deposit Adjustments
  const [advanceAction, setAdvanceAction] = useState<'keep' | 'adjust' | 'refund'>('keep');
  const [advanceAdjustAmountInput, setAdvanceAdjustAmountInput] = useState('0');

  const [depositAction, setDepositAction] = useState<'keep' | 'adjust' | 'refund'>('keep');
  const [depositAdjustAmountInput, setDepositAdjustAmountInput] = useState('0');

  // Notes
  const [settlementNotes, setSettlementNotes] = useState('');

  // Submitting
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 1. Initial Load: Bills, Unit, Existing Settlement, Prefill
  useEffect(() => {
    let isMounted = true;
    const initData = async () => {
      if (!tenant) {
        if (!tenantLoading && !directTenantLoading) {
          setLoadingData(false);
        }
        return;
      }
      setLoadingData(true);
      try {
        const [unitDoc, allBills, settlementDoc] = await Promise.all([
          db.getDoc<Unit>('units', tenant.unitId).catch(() => null),
          db.queryDocs<Bill>('bills', (doc) => doc.tenantId === tenant.id).catch(() => []),
          settlementService.getSettlementByTenantId(tenant.id!).catch(() => null),
        ]);

        if (!isMounted) return;

        if (unitDoc) setUnitNumber(unitDoc.unitNumber);
        setBills(allBills || []);
        if (settlementDoc) setExistingSettlement(settlementDoc);

        // Derive Normal Paid-Through Date
        const derived = deriveNormalPeriodDates(tenant, allBills || []);
        setNormalPeriodEndDate(derived.normalPeriodEndDate);
        const parsedEnd = parseDateSafely(derived.normalPeriodEndDate);
        if (parsedEnd) setNormalPeriodEndDateValue(parsedEnd);

        // Prefill Electricity Previous Reading
        const sortedBills = [...(allBills || [])].sort((a, b) => ((b && b.billingMonth) || '').localeCompare((a && a.billingMonth) || ''));
        const latestBill = sortedBills[0];
        if (latestBill && latestBill.currentMeterReading !== undefined) {
          setPreviousMeterReading(latestBill.currentMeterReading);
          setPreviousMeterReadingDate(latestBill.currentMeterReadingDate || latestBill.billingMonth || '');
        } else {
          setPreviousMeterReading(tenant.initialMeterReading || 0);
          setPreviousMeterReadingDate(tenant.moveInDate || '');
        }

        // Policy
        if (settings?.extraStayPolicy) {
          setSelectedPolicy(settings.extraStayPolicy);
        }
      } catch (e) {
        console.error('Failed to load initial vacate details:', e);
      } finally {
        if (isMounted) {
          setLoadingData(false);
        }
      }
    };

    initData();
    return () => {
      isMounted = false;
    };
  }, [tenant, settings, tenantLoading, directTenantLoading]);

  // Derived Calculations
  const calculations = useMemo(() => {
    if (!tenant) {
      return {
        eligibleDays: 0,
        periodDays: 30,
        dailyRate: 0,
        extraStayAmount: 0,
        electricityCharge: 0,
        electricityUnits: 0,
        electricityValid: true,
        outstandingBillsBalance: 0,
        otherCharges: 0,
        totalCharges: 0,
        advanceAdjusted: 0,
        advanceRefunded: 0,
        advanceRemaining: 0,
        depositAdjusted: 0,
        depositRefunded: 0,
        depositRemaining: 0,
        netFinalAmount: 0,
        finalStatus: 'zero_balance' as const,
      };
    }

    // 1. Extra Days & Period
    const safeEnd = normalPeriodEndDate || moveOutDate || todayIso;
    const safeOut = moveOutDate || todayIso;
    const eligibleDays = calculateEligibleExtraDays(safeOut, safeEnd);
    const relevantPeriod = getRelevantBillingPeriod(safeEnd);
    const periodDays = selectedPolicy === 'actualBillingPeriod' ? relevantPeriod.daysInPeriod : 30;

    const extraStay = calculateExtraStayRent({
      monthlyRent: tenant.monthlyRent || 0,
      policy: selectedPolicy,
      eligibleExtraDays: eligibleDays,
      daysInPeriod: relevantPeriod.daysInPeriod,
    });

    // 2. Final Electricity
    const eType = tenant.electricityBillType || 'perUnit';
    const rate = tenant.electricityRatePerUnit !== undefined ? tenant.electricityRatePerUnit : (property?.electricityRate || 0);
    const fixedAmt = tenant.electricityFixedAmount || 0;
    const finalReadingNum = finalMeterReadingInput.trim() !== '' ? parseFloat(finalMeterReadingInput) : undefined;

    const elecCalc = calculateFinalElectricity({
      billType: eType,
      previousReading: previousMeterReading,
      finalReading: finalReadingNum,
      ratePerUnit: rate,
      fixedAmount: fixedAmt,
    });

    // 3. Outstanding Bills Balance (canonical true arrears from latest bill)
    const outstandingBillsBalance = calculateTenantOutstanding(bills);

    // 4. Other Charges
    const otherCharges = Math.max(0, parseFloat(otherChargesInput) || 0);

    // Subtotal Charges
    const totalCharges = Math.round((outstandingBillsBalance + elecCalc.charge + extraStay.extraStayAmount + otherCharges) * 100) / 100;

    // 5. Advance Rent Adjustments
    const currentAdvance = tenant.advanceAmount || 0;
    let advanceAdjusted = 0;
    let advanceRefunded = 0;
    if (advanceAction === 'adjust') {
      const entered = parseFloat(advanceAdjustAmountInput) || 0;
      advanceAdjusted = Math.min(currentAdvance, Math.max(0, entered));
    } else if (advanceAction === 'refund') {
      const entered = parseFloat(advanceAdjustAmountInput) || 0;
      advanceRefunded = Math.min(currentAdvance, Math.max(0, entered));
    }
    const advanceRemaining = Math.max(0, currentAdvance - advanceAdjusted - advanceRefunded);

    // 6. Security Deposit Adjustments
    const currentDeposit = tenant.securityDeposit || 0;
    let depositAdjusted = 0;
    let depositRefunded = 0;
    if (depositAction === 'adjust') {
      const entered = parseFloat(depositAdjustAmountInput) || 0;
      depositAdjusted = Math.min(currentDeposit, Math.max(0, entered));
    } else if (depositAction === 'refund') {
      const entered = parseFloat(depositAdjustAmountInput) || 0;
      depositRefunded = Math.min(currentDeposit, Math.max(0, entered));
    }
    const depositRemaining = Math.max(0, currentDeposit - depositAdjusted - depositRefunded);

    // Net Final Amount
    // net = totalCharges - deductions
    const totalDeductions = advanceAdjusted + depositAdjusted;
    const netFinalAmount = Math.round((totalCharges - totalDeductions) * 100) / 100;

    let finalStatus: 'payable' | 'refundable' | 'zero_balance' = 'zero_balance';
    if (netFinalAmount > 0) {
      finalStatus = 'payable';
    } else if (netFinalAmount < 0) {
      finalStatus = 'refundable';
    } else {
      finalStatus = 'zero_balance';
    }

    return {
      eligibleDays,
      periodDays,
      dailyRate: extraStay.dailyRateBasis,
      extraStayAmount: extraStay.extraStayAmount,
      electricityCharge: elecCalc.charge,
      electricityUnits: elecCalc.units,
      electricityValid: elecCalc.isValid,
      electricityError: elecCalc.error,
      outstandingBillsBalance,
      otherCharges,
      totalCharges,
      advanceAdjusted,
      advanceRefunded,
      advanceRemaining,
      depositAdjusted,
      depositRefunded,
      depositRemaining,
      netFinalAmount,
      finalStatus,
    };
  }, [
    tenant,
    property,
    bills,
    moveOutDate,
    normalPeriodEndDate,
    selectedPolicy,
    finalMeterReadingInput,
    previousMeterReading,
    otherChargesInput,
    advanceAction,
    advanceAdjustAmountInput,
    depositAction,
    depositAdjustAmountInput,
  ]);

  if (!tenantLoading && !directTenantLoading && !loadingData && !tenant) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: spacing.xl }]}>
        <Ionicons name="alert-circle-outline" size={56} color={colors.danger} />
        <Text style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text, marginTop: spacing.md }}>
          Tenant Profile Not Found
        </Text>
        <Text style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.xl }}>
          This tenant profile does not exist or may have been deleted.
        </Text>
        <AppButton title="Go Back" onPress={() => router.back()} />
      </View>
    );
  }

  if (tenantLoading || settingsLoading || loadingData || !tenant) {
    return <LoadingView message="Loading move-out & settlement details..." />;
  }

  // If already vacated, show direct view options
  if (tenant.status === 'vacated') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.vacatedBanner}>
            <Ionicons name="information-circle-outline" size={32} color={colors.primary} />
            <Text style={styles.vacatedTitle}>{tenant.name} is Vacated</Text>
            <Text style={styles.vacatedSub}>
              Tenant marked vacated on {tenant.moveOutDate ? formatBillDate(tenant.moveOutDate) : 'record'}.
            </Text>
          </View>

          {existingSettlement ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Final Settlement Statement</Text>
              <Text style={styles.settlementSub}>
                Settlement ID: <Text style={{ fontWeight: 'bold' }}>{existingSettlement.settlementNumber}</Text>
              </Text>
              <Text style={styles.settlementSub}>
                Settled Date: {formatBillDate(existingSettlement.settlementDate)}
              </Text>

              <View style={[styles.netCardPreview, { borderColor: existingSettlement.finalStatus === 'payable' ? colors.danger : colors.secondary }]}>
                <Text style={styles.netCardLabel}>
                  {existingSettlement.finalStatus === 'payable' ? 'Amount Payable by Tenant' : existingSettlement.finalStatus === 'refundable' ? 'Amount Refundable to Tenant' : 'Fully Settled'}
                </Text>
                <Text style={[styles.netCardValue, { color: existingSettlement.finalStatus === 'payable' ? colors.danger : colors.secondary }]}>
                  ₹{Math.abs(existingSettlement.finalAmount).toFixed(2)}
                </Text>
              </View>

              <AppButton
                title="View Full Settlement Statement"
                onPress={() => router.push({ pathname: '/tenants/settlement', params: { tenantId: tenant.id } })}
                icon="document-text-outline"
                style={{ marginTop: spacing.md }}
              />
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardSubtitle}>
                No settlement statement was generated during previous exit.
              </Text>
            </View>
          )}

          <AppButton
            title="Back to Tenant Profile"
            onPress={() => router.back()}
            variant="outline"
            icon="arrow-back-outline"
          />
        </ScrollView>
      </View>
    );
  }

  const handleMoveOutDateChange = (event: any, selectedDate?: Date) => {
    setShowMoveOutDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setMoveOutDateValue(selectedDate);
      setMoveOutDate(selectedDate.toISOString().split('T')[0]);
    }
  };

  const handleNormalDateChange = (event: any, selectedDate?: Date) => {
    setShowNormalDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setNormalPeriodEndDateValue(selectedDate);
      setNormalPeriodEndDate(selectedDate.toISOString().split('T')[0]);
    }
  };

  const handleMeterDateChange = (event: any, selectedDate?: Date) => {
    setShowMeterDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setFinalMeterReadingDateValue(selectedDate);
      setFinalMeterReadingDate(selectedDate.toISOString().split('T')[0]);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!moveOutDate) {
      newErrors.moveOutDate = 'Move-out date is required.';
    } else if (moveOutDate < tenant.moveInDate) {
      newErrors.moveOutDate = `Move-out date cannot be earlier than Move-in date (${formatBillDate(tenant.moveInDate)}).`;
    }

    if (!normalPeriodEndDate) {
      newErrors.normalPeriodEndDate = 'Normal rent period end date is required.';
    }

    const eType = tenant.electricityBillType || 'perUnit';
    if (eType === 'perUnit') {
      if (finalMeterReadingInput.trim() === '') {
        newErrors.finalMeterReading = 'Final meter reading is required for per-unit electricity.';
      } else {
        const val = parseFloat(finalMeterReadingInput);
        if (isNaN(val)) {
          newErrors.finalMeterReading = 'Final meter reading must be a valid number.';
        } else if (val < previousMeterReading) {
          newErrors.finalMeterReading = `Final reading (${val}) cannot be lower than previous reading (${previousMeterReading}).`;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConfirmSettlement = () => {
    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please correct the issues highlighted in red before proceeding.');
      return;
    }

    const netAmountFormatted = Math.abs(calculations.netFinalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const netTitle = calculations.finalStatus === 'payable' 
      ? `Tenant owes: ₹${netAmountFormatted}` 
      : calculations.finalStatus === 'refundable' 
      ? `Refund to tenant: ₹${netAmountFormatted}` 
      : 'Settled with zero balance';

    Alert.alert(
      'Confirm Final Settlement',
      `Are you sure you want to finalize move-out settlement for ${tenant.name}?\n\n` +
      `• Move-Out Date: ${formatBillDate(moveOutDate)}\n` +
      `• Extra-Stay Rent: ₹${calculations.extraStayAmount.toFixed(2)} (${calculations.eligibleDays} days)\n` +
      `• Final Electricity: ₹${calculations.electricityCharge.toFixed(2)}\n` +
      `• Outstanding Dues: ₹${calculations.outstandingBillsBalance.toFixed(2)}\n` +
      `• Adjustments Applied: -₹${(calculations.advanceAdjusted + calculations.depositAdjusted).toFixed(2)}\n\n` +
      `Net Result: ${netTitle}\n\n` +
      `Unit ${unitNumber || tenant.unitId} will immediately become Vacant. Historical invoices will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Vacate',
          style: 'destructive',
          onPress: async () => {
            if (isSubmitting) return; // duplicate submit protection
            setIsSubmitting(true);
            try {
              const eType = tenant.electricityBillType || 'perUnit';
              const rate = tenant.electricityRatePerUnit !== undefined ? tenant.electricityRatePerUnit : (property?.electricityRate || 0);

              const adjustments: any[] = [];
              if (calculations.advanceAdjusted > 0) {
                adjustments.push({
                  type: 'advance_rent',
                  label: 'Advance Rent Adjustment',
                  amount: calculations.advanceAdjusted,
                  action: 'applied_to_dues',
                  reason: 'Applied against settlement dues',
                });
              }
              if (calculations.advanceRefunded > 0) {
                adjustments.push({
                  type: 'advance_rent',
                  label: 'Advance Rent Refund',
                  amount: calculations.advanceRefunded,
                  action: 'refunded',
                  reason: 'Refunded to tenant upon move-out',
                });
              }
              if (calculations.depositAdjusted > 0) {
                adjustments.push({
                  type: 'security_deposit',
                  label: 'Security Deposit Adjustment',
                  amount: calculations.depositAdjusted,
                  action: 'applied_to_dues',
                  reason: 'Applied against settlement dues',
                });
              }
              if (calculations.depositRefunded > 0) {
                adjustments.push({
                  type: 'security_deposit',
                  label: 'Security Deposit Refund',
                  amount: calculations.depositRefunded,
                  action: 'refunded',
                  reason: 'Refunded to tenant upon move-out',
                });
              }

              const finalized = await settlementService.finalizeSettlement({
                ownerId: tenant.ownerId,
                tenantId: tenant.id!,
                propertyId: tenant.propertyId,
                unitId: tenant.unitId,
                tenantName: tenant.name,
                unitNumber,
                propertyName: property?.name,

                moveInDate: tenant.moveInDate,
                moveOutDate,
                normalPeriodEndDate,
                finalMeterReadingDate,

                extraStayPolicy: selectedPolicy,
                dailyRateBasis: calculations.dailyRate,
                periodDays: calculations.periodDays,
                eligibleExtraDays: calculations.eligibleDays,
                monthlyRent: tenant.monthlyRent,
                extraStayAmount: calculations.extraStayAmount,

                electricityBillType: eType,
                previousMeterReading,
                finalMeterReading: eType === 'perUnit' ? parseFloat(finalMeterReadingInput) || 0 : 0,
                electricityUnits: calculations.electricityUnits,
                electricityRate: rate,
                electricityCharge: calculations.electricityCharge,

                outstandingBillsBalance: calculations.outstandingBillsBalance,
                otherCharges: calculations.otherCharges,
                otherChargesNotes,
                totalCharges: calculations.totalCharges,

                advanceRentOriginal: tenant.advanceAmount || 0,
                advanceRentAdjusted: calculations.advanceAdjusted,
                advanceRentRefunded: calculations.advanceRefunded,
                advanceRentRemaining: calculations.advanceRemaining,

                securityDepositOriginal: tenant.securityDeposit || 0,
                securityDepositAdjusted: calculations.depositAdjusted,
                securityDepositRefunded: calculations.depositRefunded,
                securityDepositRemaining: calculations.depositRemaining,

                adjustments,

                finalAmount: calculations.netFinalAmount,
                finalStatus: calculations.finalStatus,

                notes: settlementNotes,
                settlementDate: new Date().toISOString().split('T')[0],
              });

              Alert.alert('Tenant Vacated', 'Move-out & final settlement completed successfully!', [
                {
                  text: 'View Statement & PDF',
                  onPress: () => {
                    router.replace({ pathname: '/tenants/settlement', params: { id: finalized.id, tenantId: tenant.id } });
                  }
                },
                {
                  text: 'Tenants List',
                  onPress: () => {
                    router.replace('/(tabs)/tenants');
                  }
                }
              ]);
            } catch (e: any) {
              Alert.alert('Settlement Failed', e.message || 'Could not complete settlement.');
            } finally {
              setIsSubmitting(false);
            }
          }
        }
      ]
    );
  };

  const eType = tenant.electricityBillType || 'perUnit';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={styles.scrollContent} 
        keyboardShouldPersistTaps="handled"
      >
        {/* Header Profile Card */}
        <View style={styles.card}>
          <View style={styles.header}>
            <Ionicons name="exit-outline" size={24} color={colors.danger} />
            <Text style={styles.cardTitle}>Move-Out & Final Settlement</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Finalize tenant departure, extra-stay rent, meter readings, and deposit settlement.
          </Text>

          <View style={styles.tenantInfoBox}>
            <Text style={styles.tenantName}>{tenant.name}</Text>
            <Text style={styles.tenantMeta}>
              {property?.name || 'Property'} • {unitNumber ? `Unit ${unitNumber}` : 'Room'} • Monthly Rent: ₹{tenant.monthlyRent}
            </Text>
            <Text style={styles.tenantMeta}>
              Move-in Date: {formatBillDate(tenant.moveInDate)}
            </Text>
          </View>
        </View>

        {/* 1. Dates Section */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. Key Move-Out Dates</Text>

          {/* Actual Move-Out Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Actual Move-Out Date *</Text>
            <TouchableOpacity
              style={[styles.dateBox, errors.moveOutDate && styles.inputErrorBorder]}
              onPress={() => setShowMoveOutDatePicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.danger} />
              <Text style={styles.dateText}>{moveOutDate}</Text>
            </TouchableOpacity>
            {showMoveOutDatePicker && (
              <DateTimePicker
                value={moveOutDateValue}
                mode="date"
                display="default"
                onChange={handleMoveOutDateChange}
              />
            )}
            {errors.moveOutDate && <Text style={styles.errorText}>{errors.moveOutDate}</Text>}
          </View>

          {/* Normal Period End Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Normal Rent Period Paid Through *</Text>
            <TouchableOpacity
              style={styles.dateBox}
              onPress={() => setShowNormalDatePicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar" size={18} color={colors.primary} />
              <Text style={styles.dateText}>{normalPeriodEndDate}</Text>
            </TouchableOpacity>
            {showNormalDatePicker && (
              <DateTimePicker
                value={normalPeriodEndDateValue}
                mode="date"
                display="default"
                onChange={handleNormalDateChange}
              />
            )}
            <Text style={styles.helpText}>
              Identifies when the tenant's normally billed rent cycle ended. Extra stay is counted only after this date.
            </Text>
          </View>
        </View>

        {/* 2. Extra-Stay Rent Policy & Calculation */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <Text style={styles.sectionTitle}>2. Extra-Stay Rent</Text>
            <TouchableOpacity 
              onPress={() => setSelectedPolicy(selectedPolicy === 'fixed30' ? 'actualBillingPeriod' : 'fixed30')}
              style={styles.policyToggleBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal" size={14} color={colors.primary} />
              <Text style={styles.policyToggleText}>
                {selectedPolicy === 'fixed30' ? 'Using Fixed 30' : 'Using Actual Days'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.calcSummaryBox}>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Eligible Extra Stay:</Text>
              <Text style={[styles.calcValue, { color: calculations.eligibleDays > 0 ? colors.danger : colors.text }]}>
                {calculations.eligibleDays} day(s)
              </Text>
            </View>

            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Divisor Basis:</Text>
              <Text style={styles.calcValue}>
                {selectedPolicy === 'fixed30' ? '30 days (Fixed policy)' : `${calculations.periodDays} days (Actual calendar period)`}
              </Text>
            </View>

            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Daily Rent Rate:</Text>
              <Text style={styles.calcValue}>
                ₹{calculations.dailyRate.toFixed(2)} / day
              </Text>
            </View>

            <View style={[styles.calcRow, styles.calcRowTotal]}>
              <Text style={styles.calcLabelBold}>Extra-Stay Rent:</Text>
              <Text style={styles.calcValueBold}>
                ₹{calculations.extraStayAmount.toFixed(2)}
              </Text>
            </View>
          </View>

          {calculations.eligibleDays === 0 ? (
            <View style={styles.infoBanner}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
              <Text style={styles.infoBannerText}>
                Tenant is leaving on or before their normal paid period. No extra-stay rent is charged.
              </Text>
            </View>
          ) : null}
        </View>

        {/* 3. Final Electricity Meter Reading */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>3. Final Electricity Reading</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Electricity Billing Mode</Text>
            <Text style={styles.readOnlyText}>
              {eType === 'perUnit'
                ? `Per Unit (₹${tenant.electricityRatePerUnit !== undefined ? tenant.electricityRatePerUnit : (property?.electricityRate || 0)} / unit)`
                : eType === 'fixed'
                ? `Fixed Monthly Charge (₹${tenant.electricityFixedAmount || 0})`
                : 'None / Included in Rent'}
            </Text>
          </View>

          {eType === 'perUnit' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Previous Meter Reading (Recorded: {formatShortBillDate(previousMeterReadingDate)})</Text>
                <Text style={styles.readOnlyText}>{previousMeterReading} units</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Final Electricity Meter Reading *</Text>
                <TextInput
                  style={[styles.textInput, errors.finalMeterReading && styles.inputErrorBorder]}
                  value={finalMeterReadingInput}
                  onChangeText={setFinalMeterReadingInput}
                  keyboardType="numeric"
                  placeholder={`Enter reading >= ${previousMeterReading}`}
                  placeholderTextColor={colors.textSecondary}
                />
                {errors.finalMeterReading && <Text style={styles.errorText}>{errors.finalMeterReading}</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Final Reading Date</Text>
                <TouchableOpacity
                  style={styles.dateBox}
                  onPress={() => setShowMeterDatePicker(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                  <Text style={styles.dateText}>{finalMeterReadingDate}</Text>
                </TouchableOpacity>
                {showMeterDatePicker && (
                  <DateTimePicker
                    value={finalMeterReadingDateValue}
                    mode="date"
                    display="default"
                    onChange={handleMeterDateChange}
                  />
                )}
              </View>

              <View style={styles.calcSummaryBox}>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Consumption Units:</Text>
                  <Text style={styles.calcValue}>{calculations.electricityUnits} units</Text>
                </View>
                <View style={[styles.calcRow, styles.calcRowTotal]}>
                  <Text style={styles.calcLabelBold}>Final Electricity Charge:</Text>
                  <Text style={styles.calcValueBold}>₹{calculations.electricityCharge.toFixed(2)}</Text>
                </View>
              </View>
            </>
          )}

          {eType === 'fixed' && (
            <View style={styles.calcSummaryBox}>
              <View style={[styles.calcRow, styles.calcRowTotal]}>
                <Text style={styles.calcLabelBold}>Fixed Electricity Charge:</Text>
                <Text style={styles.calcValueBold}>₹{calculations.electricityCharge.toFixed(2)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* 4. Other Charges / Deductions */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>4. Other Charges or Deductions (Optional)</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Charge Amount (₹)</Text>
            <TextInput
              style={styles.textInput}
              value={otherChargesInput}
              onChangeText={setOtherChargesInput}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Reason / Description</Text>
            <TextInput
              style={styles.textInput}
              value={otherChargesNotes}
              onChangeText={setOtherChargesNotes}
              placeholder="e.g. Painting deduction, repair, cleaning"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>

        {/* 5. Advance Rent & Security Deposit Confirmation */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>5. Advance Rent & Security Deposit</Text>
          <Text style={styles.cardSubtitle}>
            Balances remain completely independent. Require explicit landlord confirmation for any adjustment or refund.
          </Text>

          {/* Advance Rent */}
          <View style={styles.depositBox}>
            <View style={styles.depositHeader}>
              <Text style={styles.depositTitle}>Advance Rent Balance</Text>
              <Text style={styles.depositBalance}>₹{tenant.advanceAmount || 0}</Text>
            </View>

            <View style={styles.actionButtonGroup}>
              {(['keep', 'adjust', 'refund'] as const).map((act) => (
                <TouchableOpacity
                  key={act}
                  style={[styles.toggleBtn, advanceAction === act && styles.toggleBtnActive]}
                  onPress={() => {
                    setAdvanceAction(act);
                    if (act === 'adjust') {
                      const maxDues = calculations.totalCharges;
                      const maxPossible = Math.min(tenant.advanceAmount || 0, maxDues);
                      setAdvanceAdjustAmountInput(String(maxPossible));
                    } else if (act === 'refund') {
                      setAdvanceAdjustAmountInput(String(tenant.advanceAmount || 0));
                    } else {
                      setAdvanceAdjustAmountInput('0');
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.toggleBtnText, advanceAction === act && styles.toggleBtnTextActive]}>
                    {act === 'keep' ? 'Keep Separate' : act === 'adjust' ? 'Adjust Towards Dues' : 'Refund'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {advanceAction !== 'keep' && (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={styles.label}>
                  {advanceAction === 'adjust' ? 'Amount to Adjust Against Dues (₹)' : 'Amount to Refund (₹)'}
                </Text>
                <TextInput
                  style={styles.textInput}
                  value={advanceAdjustAmountInput}
                  onChangeText={setAdvanceAdjustAmountInput}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            )}
          </View>

          {/* Security Deposit */}
          <View style={[styles.depositBox, { marginTop: spacing.md }]}>
            <View style={styles.depositHeader}>
              <Text style={styles.depositTitle}>Security Deposit Balance</Text>
              <Text style={styles.depositBalance}>₹{tenant.securityDeposit || 0}</Text>
            </View>

            <View style={styles.actionButtonGroup}>
              {(['keep', 'adjust', 'refund'] as const).map((act) => (
                <TouchableOpacity
                  key={act}
                  style={[styles.toggleBtn, depositAction === act && styles.toggleBtnActive]}
                  onPress={() => {
                    setDepositAction(act);
                    if (act === 'adjust') {
                      const remainingDues = Math.max(0, calculations.totalCharges - calculations.advanceAdjusted);
                      const maxPossible = Math.min(tenant.securityDeposit || 0, remainingDues);
                      setDepositAdjustAmountInput(String(maxPossible));
                    } else if (act === 'refund') {
                      setDepositAdjustAmountInput(String(tenant.securityDeposit || 0));
                    } else {
                      setDepositAdjustAmountInput('0');
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.toggleBtnText, depositAction === act && styles.toggleBtnTextActive]}>
                    {act === 'keep' ? 'Keep Separate' : act === 'adjust' ? 'Adjust Towards Dues' : 'Refund'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {depositAction !== 'keep' && (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={styles.label}>
                  {depositAction === 'adjust' ? 'Amount to Adjust Against Dues (₹)' : 'Amount to Refund (₹)'}
                </Text>
                <TextInput
                  style={styles.textInput}
                  value={depositAdjustAmountInput}
                  onChangeText={setDepositAdjustAmountInput}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            )}
          </View>
        </View>

        {/* 6. Settlement Notes */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>6. Optional Settlement Notes</Text>
          <TextInput
            style={[styles.textInput, { height: 70, textAlignVertical: 'top' }]}
            value={settlementNotes}
            onChangeText={setSettlementNotes}
            multiline
            placeholder="Add any handover notes or remarks..."
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {/* 7. Complete Settlement Preview Card */}
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Final Settlement Preview</Text>

          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>Historical Unpaid Bills / Arrears</Text>
            <Text style={styles.previewValue}>₹{calculations.outstandingBillsBalance.toFixed(2)}</Text>
          </View>

          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>Final Electricity Charge</Text>
            <Text style={styles.previewValue}>₹{calculations.electricityCharge.toFixed(2)}</Text>
          </View>

          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>Extra-Stay Rent ({calculations.eligibleDays} days)</Text>
            <Text style={styles.previewValue}>₹{calculations.extraStayAmount.toFixed(2)}</Text>
          </View>

          {calculations.otherCharges > 0 && (
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Other Charges</Text>
              <Text style={styles.previewValue}>₹{calculations.otherCharges.toFixed(2)}</Text>
            </View>
          )}

          <View style={[styles.previewRow, styles.previewDivider]}>
            <Text style={styles.previewLabelBold}>Subtotal Payable Charges</Text>
            <Text style={styles.previewValueBold}>₹{calculations.totalCharges.toFixed(2)}</Text>
          </View>

          {calculations.advanceAdjusted > 0 && (
            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, { color: colors.secondary }]}>(-) Advance Rent Adjusted</Text>
              <Text style={[styles.previewValue, { color: colors.secondary }]}>-₹{calculations.advanceAdjusted.toFixed(2)}</Text>
            </View>
          )}

          {calculations.depositAdjusted > 0 && (
            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, { color: colors.secondary }]}>(-) Security Deposit Adjusted</Text>
              <Text style={[styles.previewValue, { color: colors.secondary }]}>-₹{calculations.depositAdjusted.toFixed(2)}</Text>
            </View>
          )}

          <View style={[styles.netResultBox, { borderColor: calculations.finalStatus === 'payable' ? colors.danger : colors.secondary }]}>
            <Text style={[styles.netResultLabel, { color: calculations.finalStatus === 'payable' ? colors.danger : colors.secondary }]}>
              {calculations.finalStatus === 'payable' ? 'AMOUNT PAYABLE BY TENANT' : calculations.finalStatus === 'refundable' ? 'AMOUNT REFUNDABLE TO TENANT' : 'FULLY SETTLED (ZERO BALANCE)'}
            </Text>
            <Text style={[styles.netResultAmount, { color: calculations.finalStatus === 'payable' ? colors.danger : colors.secondary }]}>
              ₹{Math.abs(calculations.netFinalAmount).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Action Button */}
        <AppButton
          title="Confirm & Finalize Settlement"
          onPress={handleConfirmSettlement}
          loading={isSubmitting}
          variant="danger"
          icon="checkmark-circle-outline"
          style={styles.submitButton}
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
    paddingBottom: spacing.xxl * 2,
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
    marginBottom: spacing.xs,
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
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  tenantInfoBox: {
    backgroundColor: colors.primary + '10',
    padding: spacing.md,
    borderRadius: spacing.borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  tenantName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: 2,
  },
  tenantMeta: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  dateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  dateText: {
    fontSize: typography.sizes.md - 1,
    fontWeight: typography.weights.medium,
    color: colors.text,
  },
  textInput: {
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    fontSize: typography.sizes.md - 1,
    color: colors.text,
  },
  readOnlyText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    backgroundColor: colors.background,
    padding: spacing.sm,
    borderRadius: spacing.borderRadius.sm,
  },
  helpText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  errorText: {
    fontSize: typography.sizes.xs,
    color: colors.danger,
    marginTop: 4,
    fontWeight: typography.weights.medium,
  },
  inputErrorBorder: {
    borderColor: colors.danger,
  },
  policyToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: spacing.borderRadius.sm,
  },
  policyToggleText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  calcSummaryBox: {
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: spacing.borderRadius.md,
    marginTop: spacing.xs,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  calcLabel: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
  },
  calcValue: {
    fontSize: typography.sizes.xs + 1,
    color: colors.text,
    fontWeight: typography.weights.medium,
  },
  calcRowTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  calcLabelBold: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  calcValueBold: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#10B98115',
    padding: spacing.sm,
    borderRadius: spacing.borderRadius.sm,
    marginTop: spacing.sm,
  },
  infoBannerText: {
    flex: 1,
    fontSize: typography.sizes.xs,
    color: '#047857',
  },
  depositBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  depositHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  depositTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  depositBalance: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  actionButtonGroup: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: spacing.borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  toggleBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  toggleBtnText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
    textAlign: 'center',
  },
  toggleBtnTextActive: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 2,
    borderColor: colors.primary,
    ...spacing.shadows.medium,
  },
  previewTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  previewLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  previewValue: {
    fontSize: typography.sizes.sm,
    color: colors.text,
    fontWeight: typography.weights.medium,
  },
  previewDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  previewLabelBold: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  previewValueBold: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  netResultBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 2,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  netResultLabel: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  netResultAmount: {
    fontSize: 26,
    fontWeight: typography.weights.bold,
  },
  submitButton: {
    marginBottom: spacing.xl,
  },
  vacatedBanner: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vacatedTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginTop: spacing.sm,
  },
  vacatedSub: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  settlementSub: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  netCardPreview: {
    borderWidth: 1.5,
    borderRadius: spacing.borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginVertical: spacing.md,
    backgroundColor: colors.background,
  },
  netCardLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
  },
  netCardValue: {
    fontSize: 24,
    fontWeight: typography.weights.bold,
    marginTop: 2,
  },
});
