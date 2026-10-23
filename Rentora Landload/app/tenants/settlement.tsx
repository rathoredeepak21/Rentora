import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, useStyles, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';
import MoneyText from '../../components/ui/MoneyText';
import { Settlement, Tenant, Property, Unit, BillSettings } from '../../types';
import db from '../../utils/db';
import { settlementService } from '../../services/settlementService';
import { pdfService } from '../../services/pdfService';
import { shareUtils } from '../../utils/shareUtils';
import { settingsService } from '../../services/settingsService';
import { formatBillDate } from '../../utils/date';

export default function SettlementDetailsScreen() {
  const { colors } = useTheme();
  const styles = useStyles(getStyles);
  const router = useRouter();
  const { id, tenantId } = useLocalSearchParams<{ id?: string; tenantId?: string }>();

  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [settings, setSettings] = useState<BillSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    const loadSettlement = async () => {
      setLoading(true);
      try {
        let foundSettlement: Settlement | null = null;
        if (id) {
          foundSettlement = await settlementService.getSettlementById(id);
        } else if (tenantId) {
          foundSettlement = await settlementService.getSettlementByTenantId(tenantId);
        }

        if (!foundSettlement) {
          Alert.alert('Not Found', 'Settlement record not found.', [
            { text: 'Go Back', onPress: () => router.back() }
          ]);
          return;
        }

        setSettlement(foundSettlement);

        // Fetch related tenant, property, settings
        const [tDoc, pDoc, sDoc] = await Promise.all([
          db.getDoc<Tenant>('tenants', foundSettlement.tenantId),
          db.getDoc<Property>('properties', foundSettlement.propertyId),
          settingsService.getSettings(foundSettlement.ownerId),
        ]);

        setTenant(tDoc);
        setProperty(pDoc);
        setSettings(sDoc);
      } catch (err: any) {
        console.error('Error loading settlement:', err);
        Alert.alert('Error', err.message || 'Could not load settlement statement.');
      } finally {
        setLoading(false);
      }
    };

    loadSettlement();
  }, [id, tenantId]);

  if (loading || !settlement) {
    return <LoadingView message="Loading settlement statement..." />;
  }

  const isPayable = settlement.finalStatus === 'payable';
  const isRefundable = settlement.finalStatus === 'refundable';
  const isZero = settlement.finalStatus === 'zero_balance';

  const statusColor = isPayable ? colors.danger : isRefundable ? colors.secondary : colors.textSecondary;
  const statusTitle = isPayable
    ? 'Amount Payable by Tenant'
    : isRefundable
    ? 'Amount Refundable to Tenant'
    : 'Fully Settled (Zero Balance)';

  const handleSharePdf = async () => {
    if (!tenant) return;
    setIsGeneratingPdf(true);
    try {
      const pdfUri = await pdfService.generateSettlementPDF(settlement, tenant, property, settings);
      await shareUtils.shareFile(
        pdfUri, 
        'application/pdf', 
        `Settlement Statement #${settlement.settlementNumber}`
      );
    } catch (e: any) {
      Alert.alert('PDF Error', e.message || 'Failed to generate PDF statement.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Settlement Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.settlementNumber}>{settlement.settlementNumber}</Text>
              <Text style={styles.settlementDate}>Settled on {formatBillDate(settlement.settlementDate)}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {(settlement.finalStatus || 'settled').toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tenantName}>{settlement.tenantName}</Text>
              <Text style={styles.tenantSub}>
                {settlement.propertyName || property?.name || 'Property'} • {settlement.unitNumber ? `Unit ${settlement.unitNumber}` : 'Assigned Unit'}
              </Text>
            </View>
          </View>
        </View>

        {/* Final Net Amount Highlight Box */}
        <View style={[styles.netCard, { borderColor: statusColor }]}>
          <Text style={[styles.netTitle, { color: statusColor }]}>{statusTitle}</Text>
          <Text style={[styles.netAmount, { color: statusColor }]}>
            ₹{Math.abs(settlement.finalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>

        {/* Stay & Period Information Card */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Stay & Period Information</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Move-In Date</Text>
            <Text style={styles.infoValue}>{formatBillDate(settlement.moveInDate)}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Normal Paid Through</Text>
            <Text style={styles.infoValue}>{formatBillDate(settlement.normalPeriodEndDate)}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.danger, fontWeight: '700' }]}>Actual Move-Out Date</Text>
            <Text style={[styles.infoValue, { color: colors.danger, fontWeight: '700' }]}>{formatBillDate(settlement.moveOutDate)}</Text>
          </View>

          <View style={[styles.infoRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
            <Text style={styles.infoLabel}>Eligible Extra-Stay Days</Text>
            <Text style={[styles.infoValue, { color: colors.primary, fontWeight: '700' }]}>
              {settlement.eligibleExtraDays} day(s)
            </Text>
          </View>
        </View>

        {/* Extra-Stay Rent Breakdown */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text style={styles.cardSectionTitle}>Extra-Stay Rent Breakdown</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Calculation Policy</Text>
            <Text style={styles.infoValue}>
              {settlement.extraStayPolicy === 'fixed30' ? 'Fixed 30-day basis' : 'Actual billing-period days'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Period Divisor</Text>
            <Text style={styles.infoValue}>{settlement.periodDays} days in period</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Applicable Monthly Rent</Text>
            <Text style={styles.infoValue}>₹{settlement.monthlyRent.toLocaleString('en-IN')}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Daily Rent Basis</Text>
            <Text style={styles.infoValue}>₹{settlement.dailyRateBasis.toFixed(2)} / day</Text>
          </View>

          <View style={[styles.infoRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
            <Text style={[styles.infoLabel, { fontWeight: '700', color: colors.text }]}>Total Extra-Stay Rent</Text>
            <Text style={[styles.infoValue, { fontWeight: '700', color: colors.primary }]}>
              ₹{settlement.extraStayAmount.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Final Electricity Breakdown */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="flash-outline" size={18} color="#F59E0B" />
            <Text style={styles.cardSectionTitle}>Final Electricity Details</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Billing Mode</Text>
            <Text style={styles.infoValue}>
              {settlement.electricityBillType === 'perUnit'
                ? 'Per Unit'
                : settlement.electricityBillType === 'fixed'
                ? 'Fixed Amount'
                : 'None / Included in Rent'}
            </Text>
          </View>

          {settlement.electricityBillType === 'perUnit' && (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Previous Meter Reading</Text>
                <Text style={styles.infoValue}>{settlement.previousMeterReading} units</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Final Meter Reading</Text>
                <Text style={styles.infoValue}>{settlement.finalMeterReading} units</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Units Consumed</Text>
                <Text style={styles.infoValue}>{settlement.electricityUnits} units</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Electricity Rate</Text>
                <Text style={styles.infoValue}>₹{settlement.electricityRate} / unit</Text>
              </View>
            </>
          )}

          <View style={[styles.infoRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
            <Text style={[styles.infoLabel, { fontWeight: '700', color: colors.text }]}>Final Electricity Charge</Text>
            <Text style={[styles.infoValue, { fontWeight: '700', color: colors.primary }]}>
              ₹{settlement.electricityCharge.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Financial Summary & Adjustments Table */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Complete Financial Summary</Text>

          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Outstanding Bills & Arrears</Text>
            <Text style={styles.summaryValue}>₹{settlement.outstandingBillsBalance.toFixed(2)}</Text>
          </View>

          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Final Electricity Charge</Text>
            <Text style={styles.summaryValue}>₹{settlement.electricityCharge.toFixed(2)}</Text>
          </View>

          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Extra-Stay Rent ({settlement.eligibleExtraDays} days)</Text>
            <Text style={styles.summaryValue}>₹{settlement.extraStayAmount.toFixed(2)}</Text>
          </View>

          {settlement.otherCharges > 0 && (
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>
                Other Charges {settlement.otherChargesNotes ? `(${settlement.otherChargesNotes})` : ''}
              </Text>
              <Text style={styles.summaryValue}>₹{settlement.otherCharges.toFixed(2)}</Text>
            </View>
          )}

          <View style={[styles.summaryItem, styles.subtotalRow]}>
            <Text style={styles.subtotalLabel}>Total Charges</Text>
            <Text style={styles.subtotalValue}>₹{settlement.totalCharges.toFixed(2)}</Text>
          </View>

          {/* Adjustments */}
          <View style={styles.adjustmentsSection}>
            <Text style={styles.adjustmentHeader}>Explicit Landlord Adjustments</Text>

            <View style={styles.summaryItem}>
              <Text style={styles.deductionLabel}>(-) Advance Rent Adjusted</Text>
              <Text style={styles.deductionValue}>-₹{settlement.advanceRentAdjusted.toFixed(2)}</Text>
            </View>

            <View style={styles.summaryItem}>
              <Text style={styles.deductionLabel}>(-) Security Deposit Adjusted</Text>
              <Text style={styles.deductionValue}>-₹{settlement.securityDepositAdjusted.toFixed(2)}</Text>
            </View>

            <View style={styles.summaryItem}>
              <Text style={styles.infoLabel}>Advance Rent Remaining / Refunded</Text>
              <Text style={styles.infoValue}>₹{(settlement.advanceRentRemaining + settlement.advanceRentRefunded).toFixed(2)}</Text>
            </View>

            <View style={styles.summaryItem}>
              <Text style={styles.infoLabel}>Security Deposit Remaining / Refunded</Text>
              <Text style={styles.infoValue}>₹{(settlement.securityDepositRemaining + settlement.securityDepositRefunded).toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Settlement Notes */}
        {settlement.notes ? (
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Settlement Notes</Text>
            <Text style={styles.notesText}>{settlement.notes}</Text>
          </View>
        ) : null}

        {/* Action Buttons */}
        <AppButton
          title="Download & Share PDF Statement"
          onPress={handleSharePdf}
          loading={isGeneratingPdf}
          icon="share-social-outline"
          style={styles.actionButton}
        />

        <AppButton
          title="Back to Tenant Profile"
          onPress={() => router.replace({ pathname: '/tenants/[id]', params: { id: settlement.tenantId } })}
          variant="outline"
          icon="arrow-back-outline"
          style={styles.actionButton}
        />
      </ScrollView>
    </View>
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
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...spacing.shadows.light,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  settlementNumber: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  settlementDate: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: spacing.borderRadius.sm,
    borderWidth: 1,
  },
  statusText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tenantName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  tenantSub: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    marginTop: 2,
  },
  netCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 2,
    alignItems: 'center',
    ...spacing.shadows.medium,
  },
  netTitle: {
    fontSize: typography.sizes.xs + 2,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  netAmount: {
    fontSize: 32,
    fontWeight: typography.weights.bold,
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
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  cardSectionTitle: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '60',
  },
  infoLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: typography.sizes.sm,
    color: colors.text,
    fontWeight: typography.weights.medium,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
  },
  summaryLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: typography.sizes.sm,
    color: colors.text,
    fontWeight: typography.weights.semibold,
  },
  subtotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  subtotalLabel: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  subtotalValue: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  adjustmentsSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  adjustmentHeader: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  deductionLabel: {
    fontSize: typography.sizes.sm,
    color: colors.secondary,
    fontWeight: typography.weights.medium,
  },
  deductionValue: {
    fontSize: typography.sizes.sm,
    color: colors.secondary,
    fontWeight: typography.weights.bold,
  },
  notesText: {
    fontSize: typography.sizes.sm,
    color: colors.text,
    lineHeight: 20,
  },
  actionButton: {
    marginBottom: spacing.md,
  },
});
