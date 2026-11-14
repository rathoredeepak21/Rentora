import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert, 
  Platform, 
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, useStyles, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';
import { Settlement, Tenant, Property, BillSettings, PaymentMethod, SettlementTransaction } from '../../types';
import db from '../../utils/db';
import { settlementService, computeSettlementStatus } from '../../services/settlementService';
import { pdfService } from '../../services/pdfService';
import { shareUtils } from '../../utils/shareUtils';
import { settingsService } from '../../services/settingsService';
import { formatBillDate, formatShortBillDate } from '../../utils/date';

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

  // Record Transaction Modal State
  const [showTxModal, setShowTxModal] = useState(false);
  const [txType, setTxType] = useState<'refund' | 'payment_received'>('refund');
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txDateValue, setTxDateValue] = useState(new Date());
  const [showTxDatePicker, setShowTxDatePicker] = useState(false);
  const [txMethod, setTxMethod] = useState<PaymentMethod>('upi');
  const [txReference, setTxReference] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [isSavingTx, setIsSavingTx] = useState(false);

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

  const statusInfo = computeSettlementStatus(settlement);
  const isPayable = statusInfo.direction === 'payment_by_tenant';
  const isRefundable = statusInfo.direction === 'refund_to_tenant';
  const isZero = statusInfo.direction === 'zero_balance';

  const statusColor = isPayable ? colors.danger : isRefundable ? colors.secondary : colors.textSecondary;

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

  const openRecordRefund = () => {
    setTxType('refund');
    setTxAmount(statusInfo.amountPending > 0 ? String(statusInfo.amountPending) : '');
    setTxDate(new Date().toISOString().split('T')[0]);
    setTxDateValue(new Date());
    setTxMethod('upi');
    setTxReference('');
    setTxNotes('');
    setShowTxModal(true);
  };

  const openRecordPayment = () => {
    setTxType('payment_received');
    setTxAmount(statusInfo.amountPending > 0 ? String(statusInfo.amountPending) : '');
    setTxDate(new Date().toISOString().split('T')[0]);
    setTxDateValue(new Date());
    setTxMethod('upi');
    setTxReference('');
    setTxNotes('');
    setShowTxModal(true);
  };

  const handleSaveTransaction = async () => {
    const enteredAmount = parseFloat(txAmount);
    if (isNaN(enteredAmount) || enteredAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than zero.');
      return;
    }

    if (enteredAmount > statusInfo.amountPending + 0.01) {
      Alert.alert(
        'Amount Exceeds Pending Balance',
        `Entered amount (₹${enteredAmount}) cannot exceed the remaining pending balance of ₹${statusInfo.amountPending.toLocaleString('en-IN')}.`
      );
      return;
    }

    setIsSavingTx(true);
    try {
      const updatedSettlement = await settlementService.recordSettlementTransaction({
        settlementId: settlement.id!,
        type: txType,
        amount: enteredAmount,
        date: txDate,
        paymentMethod: txMethod,
        transactionReference: txReference,
        notes: txNotes,
      });
      setSettlement(updatedSettlement);
      setShowTxModal(false);
      Alert.alert(
        'Transaction Recorded',
        txType === 'refund'
          ? `Refund of ₹${enteredAmount.toLocaleString('en-IN')} recorded successfully.`
          : `Payment of ₹${enteredAmount.toLocaleString('en-IN')} recorded successfully.`
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not record transaction.');
    } finally {
      setIsSavingTx(false);
    }
  };

  const handleDeleteTx = (transactionId: string, amount: number) => {
    Alert.alert(
      'Delete Transaction',
      `Are you sure you want to delete this recorded transaction of ₹${amount.toLocaleString('en-IN')}? The remaining settlement balance will be restored.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = await settlementService.deleteSettlementTransaction(settlement.id!, transactionId);
              setSettlement(updated);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not delete transaction.');
            }
          }
        }
      ]
    );
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
                {statusInfo.statusLabel}
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

        {/* PROMINENT FINAL SETTLEMENT SUMMARY CARD */}
        <View style={[styles.summaryCard, { borderColor: statusColor }]}>
          <View style={styles.summaryTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.summaryDirectionTitle, { color: statusColor }]}>
                {statusInfo.directionTitle}
              </Text>
              <Text style={[styles.summaryTargetAmount, { color: statusColor }]}>
                ₹{statusInfo.targetTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusInfo.statusLabel}
              </Text>
            </View>
          </View>

          <View style={[styles.messageBox, { backgroundColor: statusColor + '12', borderColor: statusColor + '40' }]}>
            <Ionicons 
              name={isZero ? "checkmark-circle" : isRefundable ? "return-down-back" : "arrow-forward-circle"} 
              size={18} 
              color={statusColor} 
            />
            <Text style={[styles.partyMessageText, { color: colors.text }]}>
              {statusInfo.partyMessage}
            </Text>
          </View>

          {/* Structured Financial Points Table */}
          <View style={styles.summaryTable}>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>1. Total Security Deposit:</Text>
              <Text style={styles.tableValue}>₹{settlement.securityDepositOriginal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>2. Refundable Advance Rent:</Text>
              <Text style={styles.tableValue}>₹{settlement.advanceRentOriginal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>3. Total Final Charges:</Text>
              <Text style={[styles.tableValue, { color: colors.danger, fontWeight: '700' }]}>
                ₹{settlement.totalCharges.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={[styles.tableRow, styles.tableRowHighlight]}>
              <Text style={styles.tableLabelBold}>4. Net {isRefundable ? 'Refundable' : 'Payable'} Amount:</Text>
              <Text style={[styles.tableValueBold, { color: statusColor }]}>
                ₹{statusInfo.targetTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>5. Payment Direction:</Text>
              <Text style={styles.tableValue}>
                {isRefundable ? 'Landlord → Tenant' : isPayable ? 'Tenant → Landlord' : 'Zero Balance'}
              </Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>6. Payment Status:</Text>
              <Text style={[styles.tableValue, { fontWeight: '700', color: statusColor }]}>
                {statusInfo.statusLabel}
              </Text>
            </View>

            {statusInfo.amountSettled > 0 && (
              <View style={[styles.tableRow, { backgroundColor: colors.secondary + '12' }]}>
                <Text style={[styles.tableLabel, { color: colors.secondary, fontWeight: '700' }]}>
                  • Amount Already {isRefundable ? 'Refunded' : 'Received'}:
                </Text>
                <Text style={[styles.tableValue, { color: colors.secondary, fontWeight: '700' }]}>
                  ₹{statusInfo.amountSettled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            )}

            {!isZero && (
              <View style={[styles.tableRow, { backgroundColor: statusInfo.amountPending > 0 ? (colors.danger + '10') : (colors.secondary + '10') }]}>
                <Text style={[styles.tableLabelBold, { color: statusInfo.amountPending > 0 ? colors.danger : colors.secondary }]}>
                  • Remaining Balance Pending:
                </Text>
                <Text style={[styles.tableValueBold, { color: statusInfo.amountPending > 0 ? colors.danger : colors.secondary, fontSize: typography.sizes.md }]}>
                  ₹{statusInfo.amountPending.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            )}
          </View>

          {/* Action Trigger */}
          {isRefundable && statusInfo.status !== 'fully_settled' && (
            <AppButton
              title={`Record Refund (${statusInfo.status === 'partially_refunded' ? 'Remaining ₹' + statusInfo.amountPending.toLocaleString('en-IN') : 'Pay ₹' + statusInfo.amountPending.toLocaleString('en-IN')})`}
              onPress={openRecordRefund}
              icon="cash-outline"
              style={{ marginTop: spacing.md, backgroundColor: colors.secondary }}
            />
          )}

          {isPayable && statusInfo.status !== 'fully_settled' && (
            <AppButton
              title={`Record Payment Received (${statusInfo.status === 'partially_paid' ? 'Remaining ₹' + statusInfo.amountPending.toLocaleString('en-IN') : 'Receive ₹' + statusInfo.amountPending.toLocaleString('en-IN')})`}
              onPress={openRecordPayment}
              icon="wallet-outline"
              style={{ marginTop: spacing.md }}
            />
          )}

          {statusInfo.status === 'fully_settled' && (
            <View style={styles.settledCompleteBanner}>
              <Ionicons name="checkmark-done-circle" size={22} color={colors.secondary} />
              <Text style={styles.settledCompleteText}>Final Settlement is Fully Settled</Text>
            </View>
          )}
        </View>

        {/* SETTLEMENT TRANSACTION HISTORY CARD */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="time-outline" size={18} color={colors.primary} />
            <Text style={styles.cardSectionTitle}>Settlement Transaction History</Text>
          </View>

          {(!settlement.transactions || settlement.transactions.length === 0) ? (
            <View style={styles.emptyTxBox}>
              <Ionicons name="receipt-outline" size={32} color={colors.textSecondary} style={{ marginBottom: 4 }} />
              <Text style={styles.emptyTxText}>No settlement payments or refunds recorded yet.</Text>
            </View>
          ) : (
            settlement.transactions.map((tx: SettlementTransaction, idx: number) => {
              const isRef = tx.type === 'refund';
              const txColor = isRef ? colors.secondary : colors.primary;
              const typeLabel = isRef ? 'Refund Paid' : 'Payment Received';

              return (
                <View key={tx.id || idx} style={styles.txItem}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <View style={[styles.txBadge, { backgroundColor: txColor + '20', borderColor: txColor }]}>
                        <Text style={[styles.txBadgeText, { color: txColor }]}>{typeLabel}</Text>
                      </View>
                      <Text style={styles.txDate}>{formatBillDate(tx.date)}</Text>
                    </View>
                    <Text style={styles.txMethod}>
                      Method: <Text style={{ fontWeight: '700', textTransform: 'uppercase' }}>{tx.paymentMethod}</Text>
                      {tx.transactionReference ? ` • Ref: ${tx.transactionReference}` : ''}
                    </Text>
                    {tx.notes ? <Text style={styles.txNotes}>{tx.notes}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', marginLeft: spacing.sm }}>
                    <Text style={[styles.txAmount, { color: txColor }]}>
                      ₹{(Number(tx.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <TouchableOpacity 
                      onPress={() => handleDeleteTx(tx.id, tx.amount)}
                      style={{ marginTop: 4, padding: 4 }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
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
            <Text style={styles.adjustmentHeader}>Explicit Adjustments Applied</Text>

            <View style={styles.summaryItem}>
              <Text style={styles.deductionLabel}>(-) Advance Rent Adjusted</Text>
              <Text style={styles.deductionValue}>-₹{settlement.advanceRentAdjusted.toFixed(2)}</Text>
            </View>

            <View style={styles.summaryItem}>
              <Text style={styles.deductionLabel}>(-) Security Deposit Adjusted</Text>
              <Text style={styles.deductionValue}>-₹{settlement.securityDepositAdjusted.toFixed(2)}</Text>
            </View>

            <View style={styles.summaryItem}>
              <Text style={styles.infoLabel}>Advance Rent Remaining</Text>
              <Text style={styles.infoValue}>₹{(settlement.advanceRentRemaining || 0).toFixed(2)}</Text>
            </View>

            <View style={styles.summaryItem}>
              <Text style={styles.infoLabel}>Security Deposit Remaining</Text>
              <Text style={styles.infoValue}>₹{(settlement.securityDepositRemaining || 0).toFixed(2)}</Text>
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

      {/* RECORD TRANSACTION MODAL */}
      <Modal
        visible={showTxModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTxModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {txType === 'refund' ? 'Record Refund to Tenant' : 'Record Payment Received'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {txType === 'refund' 
                    ? `Refund to ${settlement.tenantName}` 
                    : `Payment from ${settlement.tenantName}`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowTxModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.md }}>
              <View style={[styles.balanceInfoBox, { backgroundColor: statusColor + '15', borderColor: statusColor + '40' }]}>
                <Text style={styles.balanceInfoLabel}>Remaining Pending Balance:</Text>
                <Text style={[styles.balanceInfoVal, { color: statusColor }]}>
                  ₹{statusInfo.amountPending.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
              </View>

              {/* Amount */}
              <Text style={styles.inputLabel}>Transaction Amount (₹) *</Text>
              <TextInput
                style={styles.textInput}
                value={txAmount}
                onChangeText={setTxAmount}
                keyboardType="numeric"
                placeholder={`Enter amount <= ${statusInfo.amountPending}`}
                placeholderTextColor={colors.textSecondary}
              />

              {/* Date */}
              <Text style={styles.inputLabel}>Transaction Date *</Text>
              <TouchableOpacity 
                style={styles.datePickerInput}
                onPress={() => setShowTxDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                <Text style={styles.datePickerText}>{txDate}</Text>
              </TouchableOpacity>
              {showTxDatePicker && (
                <DateTimePicker
                  value={txDateValue}
                  mode="date"
                  display="default"
                  onChange={(e, d) => {
                    setShowTxDatePicker(Platform.OS === 'ios');
                    if (d) {
                      setTxDateValue(d);
                      setTxDate(d.toISOString().split('T')[0]);
                    }
                  }}
                />
              )}

              {/* Payment Method */}
              <Text style={styles.inputLabel}>Payment Method *</Text>
              <View style={styles.methodRow}>
                {(['upi', 'cash', 'bank_transfer', 'other'] as PaymentMethod[]).map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.methodChip, txMethod === m && styles.methodChipActive]}
                    onPress={() => setTxMethod(m)}
                  >
                    <Text style={[styles.methodChipText, txMethod === m && styles.methodChipTextActive]}>
                      {m === 'bank_transfer' ? 'Bank' : m.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Reference */}
              <Text style={styles.inputLabel}>Reference / Transaction ID (Optional)</Text>
              <TextInput
                style={styles.textInput}
                value={txReference}
                onChangeText={setTxReference}
                placeholder="e.g. UPI Ref, IMPS UTR, Cheque No."
                placeholderTextColor={colors.textSecondary}
              />

              {/* Notes */}
              <Text style={styles.inputLabel}>Remarks / Notes (Optional)</Text>
              <TextInput
                style={[styles.textInput, { height: 60, textAlignVertical: 'top' }]}
                value={txNotes}
                onChangeText={setTxNotes}
                multiline
                placeholder="Any additional remarks..."
                placeholderTextColor={colors.textSecondary}
              />

              <View style={styles.modalActions}>
                <AppButton
                  title="Cancel"
                  variant="outline"
                  onPress={() => setShowTxModal(false)}
                  style={{ flex: 1, marginRight: spacing.sm }}
                />
                <AppButton
                  title={txType === 'refund' ? "Save Refund" : "Save Payment"}
                  onPress={handleSaveTransaction}
                  loading={isSavingTx}
                  style={{ flex: 1, backgroundColor: txType === 'refund' ? colors.secondary : colors.primary }}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 2,
    ...spacing.shadows.medium,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  summaryDirectionTitle: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  summaryTargetAmount: {
    fontSize: 28,
    fontWeight: typography.weights.bold,
    marginTop: 2,
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    padding: spacing.sm + 2,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1,
    marginVertical: spacing.sm,
  },
  partyMessageText: {
    fontSize: typography.sizes.xs + 2,
    fontWeight: typography.weights.semibold,
    flex: 1,
  },
  summaryTable: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  tableRowHighlight: {
    backgroundColor: colors.background,
    marginVertical: 2,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  tableLabel: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
  },
  tableLabelBold: {
    fontSize: typography.sizes.xs + 2,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  tableValue: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  tableValueBold: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
  },
  settledCompleteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.secondary + '20',
    paddingVertical: spacing.sm,
    borderRadius: spacing.borderRadius.md,
    marginTop: spacing.md,
  },
  settledCompleteText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.secondary,
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
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyTxBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  emptyTxText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  txItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '60',
  },
  txBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  txBadgeText: {
    fontSize: typography.sizes.xs - 1,
    fontWeight: typography.weights.bold,
  },
  txDate: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  txMethod: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  txNotes: {
    fontSize: typography.sizes.xs,
    color: colors.text,
    fontStyle: 'italic',
    marginTop: 2,
  },
  txAmount: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
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
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: spacing.borderRadius.xl,
    borderTopRightRadius: spacing.borderRadius.xl,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.sizes.md + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  balanceInfoBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  balanceInfoLabel: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  balanceInfoVal: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  inputLabel: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: 4,
    marginTop: spacing.xs,
  },
  textInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sizes.sm,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  datePickerInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  datePickerText: {
    fontSize: typography.sizes.sm,
    color: colors.text,
  },
  methodRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  methodChip: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  methodChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  methodChipText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
  methodChipTextActive: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
});
