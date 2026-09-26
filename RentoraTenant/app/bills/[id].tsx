import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tenantDataService } from '../../services/tenantDataService';
import { pdfService } from '../../services/pdfService';
import { Bill, Property, Unit, BillSettings, PaymentStatus, PaymentSubmission } from '../../types';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { calculateBillAllocation } from '../../utils/billingAllocation';

export default function BillDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userProfile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [bill, setBill] = useState<Bill | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [settings, setSettings] = useState<BillSettings | null>(null);
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Compute approved payments total (only approved status reduces balance)
  const approvedPaymentsTotal = payments
    .filter((p) => p.status === 'approved')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // If approvedPaymentsTotal is > 0 use it; otherwise use bill.paidAmount if already verified on bill doc
  const effectivePaid = approvedPaymentsTotal > 0
    ? approvedPaymentsTotal
    : (Number(bill?.paidAmount) || 0);

  const allocation = bill ? calculateBillAllocation(bill, effectivePaid) : null;

  useEffect(() => {
    if (!id) {
      setErrorMsg('Bill ID not provided.');
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const fetchBillAndDetails = async () => {
      try {
        const billData = await tenantDataService.fetchBillDetails(id as string);
        if (!billData) {
          if (isMounted) setErrorMsg('Bill not found or has been removed.');
          return;
        }

        // Security check: tenant must match
        if (userProfile && billData.tenantId !== userProfile.tenantId) {
          if (isMounted) setErrorMsg('You are not authorized to view this bill.');
          return;
        }

        if (isMounted) setBill(billData);

        // Fetch property, unit, settings in parallel
        if (billData.propertyId) {
          tenantDataService.fetchPropertyDetails(billData.propertyId).then((p) => {
            if (isMounted) setProperty(p);
          });
        }
        if (billData.unitId) {
          tenantDataService.fetchUnitDetails(billData.unitId).then((u) => {
            if (isMounted) setUnit(u);
          });
        }
        if (billData.ownerId) {
          tenantDataService.fetchLandlordSettings(billData.ownerId).then((s) => {
            if (isMounted) setSettings(s);
          });
        }
      } catch (err: any) {
        if (isMounted) setErrorMsg('Failed to load bill details.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchBillAndDetails();

    // Subscribe to payments for this bill
    const unsubscribePayments = tenantDataService.subscribeBillPayments(
      id as string,
      (updatedPayments) => {
        if (isMounted) setPayments(updatedPayments);
      }
    );

    return () => {
      isMounted = false;
      unsubscribePayments();
    };
  }, [id, userProfile?.tenantId]);

  const handleViewPDF = async () => {
    if (!bill || !allocation) return;
    setIsGeneratingPDF(true);
    try {
      await pdfService.viewBillPDF({
        bill: {
          ...bill,
          subtotal: allocation.subtotal,
          previousDue: allocation.previousDue,
          totalAmount: allocation.totalPayable,
          paidAmount: allocation.totalApprovedPaid,
          remainingAmount: allocation.totalOutstanding,
          paymentStatus: allocation.paymentStatus,
          previousDuePaid: allocation.previousDuePaid,
          previousDueRemaining: allocation.previousDueRemaining,
          currentBillPaid: allocation.currentBillPaid,
          currentBillRemaining: allocation.currentBillRemaining,
        },
        tenantName: userProfile?.name || 'Tenant',
        tenantPhone: userProfile?.phone || userProfile?.mobileNumber,
        propertyName: property?.name,
        propertyAddress: property?.address,
        unitNumber: unit?.unitNumber,
        settings,
      });
    } catch (err: any) {
      alert(err.message || 'Could not open PDF viewer.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const renderStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'paid':
        return (
          <View style={[styles.badge, styles.badgePaid]}>
            <View style={[styles.badgeDot, { backgroundColor: COLORS.success }]} />
            <Text style={[styles.badgeText, { color: COLORS.success }]}>PAID</Text>
          </View>
        );
      case 'partial':
        return (
          <View style={[styles.badge, styles.badgePartial]}>
            <View style={[styles.badgeDot, { backgroundColor: COLORS.warning }]} />
            <Text style={[styles.badgeText, { color: COLORS.warning }]}>PARTIALLY PAID</Text>
          </View>
        );
      case 'unpaid':
      default:
        return (
          <View style={[styles.badge, styles.badgeUnpaid]}>
            <View style={[styles.badgeDot, { backgroundColor: COLORS.danger }]} />
            <Text style={[styles.badgeText, { color: COLORS.danger }]}>UNPAID</Text>
          </View>
        );
    }
  };

  const formatMonthTitle = (monthStr?: string) => {
    if (!monthStr) return 'Bill Statement';
    try {
      const [year, month] = monthStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    } catch (e) {
      return monthStr;
    }
  };

  const pendingPayments = payments.filter((p) => p.status === 'pending');

  if (isLoading) {
    return (
      <AppSafeAreaView style={styles.centerSafeArea}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading statement...</Text>
      </AppSafeAreaView>
    );
  }

  if (errorMsg || !bill) {
    return (
      <AppSafeAreaView style={styles.centerSafeArea}>
        <StatusBar style="dark" />
        <MaterialCommunityIcons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Error Loading Bill</Text>
        <Text style={[styles.errorSubtitle, { color: colors.textMuted }]}>{errorMsg || 'Bill details could not be retrieved.'}</Text>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </AppSafeAreaView>
    );
  }

  return (
    <AppSafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />
      {/* App Header */}
      <View style={[styles.topHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.iconBackBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.topHeaderTitle, { color: colors.textPrimary }]}>Bill Details</Text>
        <TouchableOpacity style={styles.pdfIconButton} onPress={handleViewPDF} disabled={isGeneratingPDF}>
          {isGeneratingPDF ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <MaterialCommunityIcons name="file-pdf-box" size={26} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom + 40, 60) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Bill Overview Header Card */}
        <View style={[styles.overviewCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <View style={styles.overviewTopRow}>
            <View>
              <Text style={[styles.billingMonthText, { color: colors.textPrimary }]}>{formatMonthTitle(bill.billingMonth)}</Text>
              <Text style={[styles.billNoText, { color: colors.textMuted }]}>Statement #{bill.billNumber}</Text>
            </View>
            {renderStatusBadge(
              allocation?.monthWiseAccounting?.hasPreviousDue
                ? allocation.monthWiseAccounting.currentMonthStatus
                : (allocation?.paymentStatus || bill.paymentStatus)
            )}
          </View>

          <View style={[styles.overviewDivider, { backgroundColor: colors.border }]} />

          <View style={styles.datesRow}>
            <View style={styles.dateCol}>
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>Issue Date</Text>
              <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{bill.createdAt ? bill.createdAt.split('T')[0] : 'N/A'}</Text>
            </View>

            <View style={styles.dateCol}>
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>Due Date</Text>
              <Text style={[styles.dateValue, { color: colors.danger, fontWeight: '700' }]}>
                {bill.dueDate || 'N/A'}
              </Text>
            </View>

            <View style={styles.dateCol}>
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>Unit / Room</Text>
              <Text style={[styles.dateValue, { color: colors.textPrimary }]}>Unit {unit?.unitNumber || 'N/A'}</Text>
            </View>
          </View>
        </View>

        {/* Pending Payment Verification Banner */}
        {pendingPayments.length > 0 ? (
          <View style={styles.pendingNoticeBanner}>
            <MaterialCommunityIcons name="clock-alert-outline" size={24} color={COLORS.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingNoticeTitle}>Payment Verification Pending</Text>
              <Text style={styles.pendingNoticeText}>
                Submitted ₹{pendingPayments[0].amount.toLocaleString('en-IN')} (UTR: {pendingPayments[0].transactionId}) on{' '}
                {pendingPayments[0].submittedAt ? pendingPayments[0].submittedAt.split('T')[0] : 'today'}. Awaiting landlord verification.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Itemized Charges Breakdown */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Itemized Charges</Text>

          {/* Rent */}
          <View style={styles.chargeRow}>
            <View style={styles.chargeLeft}>
              <MaterialCommunityIcons name="home-outline" size={20} color={COLORS.primary} />
              <Text style={styles.chargeName}>Monthly Rent</Text>
            </View>
            <Text style={styles.chargeAmount}>₹{bill.rent.toLocaleString('en-IN')}</Text>
          </View>

          {/* Electricity */}
          <View style={styles.chargeBoxBlock}>
            <View style={styles.chargeRow}>
              <View style={styles.chargeLeft}>
                <MaterialCommunityIcons name="flash-outline" size={20} color={COLORS.warning} />
                <Text style={styles.chargeName}>Electricity Charges</Text>
              </View>
              <Text style={styles.chargeAmount}>₹{bill.electricityCharge.toLocaleString('en-IN')}</Text>
            </View>

            {/* Electricity Detail Note */}
            {bill.electricityBillType === 'perUnit' ? (
              <View style={styles.meterReadingBox}>
                <Text style={styles.meterText}>
                  Units Consumed: <Text style={styles.meterBold}>{bill.electricityUnits} Units</Text>
                </Text>
                <Text style={styles.meterText}>
                  Meter Readings: {bill.previousMeterReading} → {bill.currentMeterReading} (@ ₹
                  {bill.electricityRate}/unit)
                </Text>
              </View>
            ) : bill.electricityBillType === 'fixed' ? (
              <Text style={styles.subNoteText}>Fixed monthly rate</Text>
            ) : (
              <Text style={styles.subNoteText}>Electricity: Included in Rent</Text>
            )}
          </View>

          {/* Water */}
          <View style={styles.chargeBoxBlock}>
            <View style={styles.chargeRow}>
              <View style={styles.chargeLeft}>
                <MaterialCommunityIcons name="water-outline" size={20} color="#0284C7" />
                <Text style={styles.chargeName}>Water Charges</Text>
              </View>
              <Text style={styles.chargeAmount}>₹{bill.waterCharge.toLocaleString('en-IN')}</Text>
            </View>
            {bill.waterBillType === 'none' ? (
              <Text style={styles.subNoteText}>Water: Included in Rent</Text>
            ) : bill.waterBillType === 'fixed' ? (
              <Text style={styles.subNoteText}>Fixed monthly water charge</Text>
            ) : null}
          </View>

          {/* Maintenance */}
          {bill.maintenanceCharge > 0 ? (
            <View style={styles.chargeRow}>
              <View style={styles.chargeLeft}>
                <MaterialCommunityIcons name="wrench-outline" size={20} color={COLORS.textSecondary} />
                <Text style={styles.chargeName}>Maintenance Charges</Text>
              </View>
              <Text style={styles.chargeAmount}>₹{bill.maintenanceCharge.toLocaleString('en-IN')}</Text>
            </View>
          ) : null}

          {/* Parking */}
          {bill.parkingCharge > 0 ? (
            <View style={styles.chargeRow}>
              <View style={styles.chargeLeft}>
                <MaterialCommunityIcons name="car-outline" size={20} color={COLORS.textSecondary} />
                <Text style={styles.chargeName}>Parking Charges</Text>
              </View>
              <Text style={styles.chargeAmount}>₹{bill.parkingCharge.toLocaleString('en-IN')}</Text>
            </View>
          ) : null}

          {/* Other Charges */}
          {bill.otherCharges > 0 ? (
            <View style={styles.chargeRow}>
              <View style={styles.chargeLeft}>
                <MaterialCommunityIcons name="dots-horizontal-circle-outline" size={20} color={COLORS.textSecondary} />
                <Text style={styles.chargeName}>Other Charges</Text>
              </View>
              <Text style={styles.chargeAmount}>₹{bill.otherCharges.toLocaleString('en-IN')}</Text>
            </View>
          ) : null}
        </View>

        {/* Dedicated Month-Wise Accounting Card */}
        {allocation?.monthWiseAccounting?.hasPreviousDue ? (
          <View style={[styles.monthAccountingCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.monthAccountingHeader}>
              <View style={styles.monthAccountingTitleRow}>
                <MaterialCommunityIcons name="layers-outline" size={20} color={colors.primary} />
                <Text style={[styles.monthAccountingTitle, { color: colors.textPrimary }]}>Month-Wise Payment Allocation</Text>
              </View>
              <Text style={[styles.monthAccountingSubtitle, { color: colors.textSecondary }]}>
                Payments are strictly allocated to the oldest outstanding bill first.
              </Text>
            </View>

            {/* PREVIOUS MONTH */}
            <View style={[styles.accountingBlock, { backgroundColor: colors.cardSubtle, borderColor: colors.border }]}>
              <View style={styles.accountingBlockHeader}>
                <View style={styles.accountingBlockTitleRow}>
                  <MaterialCommunityIcons name="history" size={16} color={colors.warning} />
                  <Text style={[styles.accountingBlockTitle, { color: colors.textPrimary }]}>
                    {allocation.monthWiseAccounting.previousMonthLabel.toUpperCase()}
                  </Text>
                </View>
                {renderStatusBadge(allocation.monthWiseAccounting.previousMonthStatus)}
              </View>

              <View style={styles.accountingRow}>
                <Text style={[styles.accountingLabel, { color: colors.textSecondary }]}>Original Bill / Outstanding:</Text>
                <Text style={[styles.accountingVal, { color: colors.textPrimary }]}>
                  ₹{allocation.monthWiseAccounting.previousMonthOriginal.toLocaleString('en-IN')}
                </Text>
              </View>

              <View style={styles.accountingRow}>
                <Text style={[styles.accountingLabel, { color: colors.textSecondary }]}>Paid from Payment:</Text>
                <Text style={[styles.accountingVal, { color: colors.success, fontWeight: '700' }]}>
                  ₹{allocation.monthWiseAccounting.previousMonthPaid.toLocaleString('en-IN')}
                </Text>
              </View>

              <View style={styles.accountingRow}>
                <Text style={[styles.accountingLabel, { color: colors.textSecondary }]}>Remaining:</Text>
                <Text
                  style={[
                    styles.accountingVal,
                    {
                      color: allocation.monthWiseAccounting.previousMonthRemaining > 0 ? colors.danger : colors.success,
                      fontWeight: '700',
                    },
                  ]}
                >
                  ₹{allocation.monthWiseAccounting.previousMonthRemaining.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>

            {/* CURRENT MONTH */}
            <View style={[styles.accountingBlock, { backgroundColor: colors.cardSubtle, borderColor: colors.border, marginTop: 12 }]}>
              <View style={styles.accountingBlockHeader}>
                <View style={styles.accountingBlockTitleRow}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={16} color={colors.primary} />
                  <Text style={[styles.accountingBlockTitle, { color: colors.textPrimary }]}>
                    {allocation.monthWiseAccounting.currentMonthLabel.toUpperCase()}
                  </Text>
                </View>
                {renderStatusBadge(allocation.monthWiseAccounting.currentMonthStatus)}
              </View>

              <View style={styles.accountingRow}>
                <Text style={[styles.accountingLabel, { color: colors.textSecondary }]}>Current Month Bill:</Text>
                <Text style={[styles.accountingVal, { color: colors.textPrimary }]}>
                  ₹{allocation.monthWiseAccounting.currentMonthOriginal.toLocaleString('en-IN')}
                </Text>
              </View>

              <View style={styles.accountingRow}>
                <Text style={[styles.accountingLabel, { color: colors.textSecondary }]}>Paid:</Text>
                <Text style={[styles.accountingVal, { color: colors.success, fontWeight: '700' }]}>
                  ₹{allocation.monthWiseAccounting.currentMonthPaid.toLocaleString('en-IN')}
                </Text>
              </View>

              <View style={styles.accountingRow}>
                <Text style={[styles.accountingLabel, { color: colors.textSecondary }]}>Remaining:</Text>
                <Text
                  style={[
                    styles.accountingVal,
                    {
                      color: allocation.monthWiseAccounting.currentMonthRemaining > 0 ? colors.danger : colors.success,
                      fontWeight: '700',
                    },
                  ]}
                >
                  ₹{allocation.monthWiseAccounting.currentMonthRemaining.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>

            {/* OVERALL SUMMARY */}
            <View style={[styles.accountingOverallBlock, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
              <Text style={[styles.accountingOverallTitle, { color: colors.textPrimary }]}>OVERALL SUMMARY</Text>

              <View style={styles.accountingRow}>
                <Text style={[styles.accountingLabel, { color: colors.textSecondary }]}>Total Payable:</Text>
                <Text style={[styles.accountingValHero, { color: colors.textPrimary }]}>
                  ₹{allocation.monthWiseAccounting.overallTotalPayable.toLocaleString('en-IN')}
                </Text>
              </View>

              <View style={styles.accountingRow}>
                <Text style={[styles.accountingLabel, { color: colors.textSecondary }]}>Total Paid:</Text>
                <Text style={[styles.accountingValHero, { color: colors.success }]}>
                  ₹{allocation.monthWiseAccounting.overallTotalPaid.toLocaleString('en-IN')}
                </Text>
              </View>

              <View style={styles.accountingRow}>
                <Text style={[styles.accountingLabel, { color: colors.textSecondary }]}>Total Remaining:</Text>
                <Text
                  style={[
                    styles.accountingValHero,
                    {
                      color: allocation.monthWiseAccounting.overallTotalRemaining > 0 ? colors.danger : colors.success,
                    },
                  ]}
                >
                  ₹{allocation.monthWiseAccounting.overallTotalRemaining.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Calculation Summary Card */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={[styles.summaryCardTitle, { color: colors.textPrimary }]}>Statement Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Current Month Charges</Text>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
              ₹{(allocation ? allocation.subtotal : bill.subtotal).toLocaleString('en-IN')}
            </Text>
          </View>

          {(allocation ? allocation.previousDue : bill.previousDue) > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.danger }]}>Previous Unpaid Arrears</Text>
              <Text style={[styles.summaryValue, { color: colors.danger }]}>
                +₹{(allocation ? allocation.previousDue : bill.previousDue).toLocaleString('en-IN')}
              </Text>
            </View>
          ) : null}

          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />

          <View style={styles.summaryRowHero}>
            <Text style={[styles.summaryLabelHero, { color: colors.textPrimary }]}>Total Payable</Text>
            <Text style={[styles.summaryValueHero, { color: colors.textPrimary }]}>
              ₹{(allocation ? allocation.totalPayable : bill.totalAmount).toLocaleString('en-IN')}
            </Text>
          </View>

          {(allocation ? allocation.totalApprovedPaid : bill.paidAmount) > 0 ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.success }]}>Amount Paid</Text>
                <Text style={[styles.summaryValue, { color: colors.success }]}>
                  -₹{(allocation ? allocation.totalApprovedPaid : bill.paidAmount).toLocaleString('en-IN')}
                </Text>
              </View>

              {allocation && allocation.previousDue > 0 ? (
                <View style={[styles.allocationBox, { backgroundColor: colors.cardSubtle, borderColor: colors.border }]}>
                  <View style={styles.allocationRow}>
                    <Text style={[styles.allocationLabel, { color: colors.textSecondary }]}>• Previous Due Paid:</Text>
                    <Text style={[styles.allocationValue, { color: colors.textPrimary }]}>
                      ₹{allocation.previousDuePaid.toLocaleString('en-IN')}
                      {allocation.previousDueRemaining === 0 ? ' (Cleared)' : ` (Due: ₹${allocation.previousDueRemaining.toLocaleString('en-IN')})`}
                    </Text>
                  </View>
                  <View style={styles.allocationRow}>
                    <Text style={[styles.allocationLabel, { color: colors.textSecondary }]}>• Current Month Paid:</Text>
                    <Text style={[styles.allocationValue, { color: colors.textPrimary }]}>
                      ₹{allocation.currentBillPaid.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          <View style={[styles.summaryRowHeroHighlight, { backgroundColor: colors.cardSubtle }]}>
            <Text style={[styles.remainingLabel, { color: colors.textPrimary }]}>Remaining Balance Due</Text>
            <Text
              style={[
                styles.remainingValue,
                { color: (allocation ? allocation.totalOutstanding : bill.remainingAmount) > 0 ? colors.danger : colors.success },
              ]}
            >
              ₹{(allocation ? allocation.totalOutstanding : bill.remainingAmount).toLocaleString('en-IN')}
            </Text>
          </View>
        </View>

        {/* Payment Submissions List for this Bill */}
        {payments.length > 0 ? (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Payment Submissions ({payments.length})</Text>
            {payments.map((p) => (
              <View key={p.id} style={styles.paymentRecordRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.paymentRecordAmount, { color: colors.textPrimary }]}>₹{p.amount.toLocaleString('en-IN')}</Text>
                  <Text style={[styles.paymentRecordUtr, { color: colors.textSecondary }]}>UTR: {p.transactionId}</Text>
                  <Text style={[styles.paymentRecordDate, { color: colors.textMuted }]}>
                    {p.submittedAt ? p.submittedAt.split('T')[0] : 'N/A'}
                  </Text>
                </View>
                <View style={styles.paymentRecordStatusCol}>
                  {p.status === 'approved' ? (
                    <View style={[styles.subBadge, styles.badgePaid]}>
                      <Text style={[styles.subBadgeText, { color: colors.success }]}>APPROVED</Text>
                    </View>
                  ) : p.status === 'rejected' ? (
                    <View style={[styles.subBadge, styles.badgeUnpaid]}>
                      <Text style={[styles.subBadgeText, { color: colors.danger }]}>REJECTED</Text>
                    </View>
                  ) : (
                    <View style={[styles.subBadge, styles.badgePartial]}>
                      <Text style={[styles.subBadgeText, { color: COLORS.warning }]}>PENDING</Text>
                    </View>
                  )}
                  {p.status === 'rejected' && p.rejectionReason ? (
                    <Text style={styles.rejectionReasonText}>{p.rejectionReason}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Landlord Notes */}
        {bill.notes ? (
          <View style={[styles.notesCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.notesHeader}>
              <MaterialCommunityIcons name="note-text-outline" size={18} color={colors.primary} />
              <Text style={[styles.notesTitle, { color: colors.textPrimary }]}>Landlord Notes</Text>
            </View>
            <Text style={[styles.notesBody, { color: colors.textSecondary }]}>{bill.notes}</Text>
          </View>
        ) : null}

        {/* ACTION BUTTONS */}
        <View style={styles.actionsContainer}>
          {/* Active Pay Bill Button - ONLY if remainingAmount > 0 */}
          {(allocation ? allocation.totalOutstanding : bill.remainingAmount) > 0 ? (
            <TouchableOpacity
              style={[styles.payBillBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push(`/bills/pay/${bill.id}`)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="credit-card-outline" size={22} color={COLORS.textWhite} />
              <Text style={styles.payBillBtnText}>
                Pay Bill (₹{(allocation ? allocation.totalOutstanding : bill.remainingAmount).toLocaleString('en-IN')})
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.fullyPaidBanner}>
              <MaterialCommunityIcons name="check-circle-outline" size={22} color={colors.success} />
              <Text style={[styles.fullyPaidText, { color: colors.success }]}>Bill Fully Paid & Cleared</Text>
            </View>
          )}

          {/* View Bill PDF Button */}
          <TouchableOpacity
            style={[styles.pdfBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={handleViewPDF}
            disabled={isGeneratingPDF}
            activeOpacity={0.8}
          >
            {isGeneratingPDF ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <View style={styles.btnRow}>
                <MaterialCommunityIcons name="file-pdf-box" size={20} color={colors.primary} />
                <Text style={[styles.pdfBtnText, { color: colors.textPrimary }]}>View Bill PDF</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </AppSafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  centerSafeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 14,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: SPACING.md,
    marginBottom: 4,
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  backBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  topHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
  },
  iconBackBtn: {
    padding: 6,
  },
  topHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  pdfIconButton: {
    padding: 6,
  },
  container: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  overviewCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  overviewTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billingMonthText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  billNoText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 6,
  },
  badgePaid: { backgroundColor: COLORS.successBg },
  badgePartial: { backgroundColor: COLORS.warningBg },
  badgeUnpaid: { backgroundColor: COLORS.dangerBg },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  overviewDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: SPACING.md,
  },
  datesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateCol: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  pendingNoticeBanner: {
    flexDirection: 'row',
    backgroundColor: COLORS.warningBg,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    gap: 10,
    alignItems: 'center',
  },
  pendingNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.warning,
  },
  pendingNoticeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  sectionCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  chargeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  chargeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chargeName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  chargeAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  chargeBoxBlock: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingBottom: 6,
    marginBottom: 4,
  },
  subNoteText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginLeft: 30,
    marginTop: -2,
    marginBottom: 4,
  },
  meterReadingBox: {
    backgroundColor: COLORS.bgLight,
    padding: 8,
    borderRadius: RADIUS.sm,
    marginLeft: 30,
    marginTop: 2,
    marginBottom: 4,
    gap: 2,
  },
  meterText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  meterBold: {
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  summaryCard: {
    backgroundColor: COLORS.bgDark,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  summaryCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textWhite,
    marginBottom: SPACING.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: SPACING.sm,
  },
  summaryRowHero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabelHero: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  summaryValueHero: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textWhite,
  },
  summaryRowHeroHighlight: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
  },
  remainingLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  remainingValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  paymentRecordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  paymentRecordAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  paymentRecordUtr: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  paymentRecordDate: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  paymentRecordStatusCol: {
    alignItems: 'flex-end',
  },
  subBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  subBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  rejectionReasonText: {
    fontSize: 11,
    color: COLORS.danger,
    marginTop: 4,
    maxWidth: 140,
    textAlign: 'right',
  },
  notesCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  notesTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  notesBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  actionsContainer: {
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  payBillBtn: {
    backgroundColor: COLORS.success,
    height: 52,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.md,
  },
  payBillBtnText: {
    color: COLORS.textWhite,
    fontSize: 16,
    fontWeight: '800',
  },
  needHelpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.md,
    paddingVertical: 6,
  },
  needHelpText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  fullyPaidBanner: {
    backgroundColor: COLORS.successBg,
    height: 52,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  fullyPaidText: {
    color: COLORS.success,
    fontSize: 15,
    fontWeight: '700',
  },
  pdfBtn: {
    backgroundColor: COLORS.bgCard,
    height: 48,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pdfBtnText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  allocationBox: {
    padding: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    marginVertical: 4,
    gap: 4,
  },
  allocationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  allocationLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  allocationValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  monthAccountingCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
  },
  monthAccountingHeader: {
    marginBottom: SPACING.sm,
  },
  monthAccountingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthAccountingTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  monthAccountingSubtitle: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  accountingBlock: {
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  accountingBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(156, 163, 175, 0.3)',
  },
  accountingBlockTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accountingBlockTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  accountingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  accountingLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  accountingVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  accountingOverallBlock: {
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  accountingOverallTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(156, 163, 175, 0.3)',
  },
  accountingValHero: {
    fontSize: 14,
    fontWeight: '800',
  },
});
