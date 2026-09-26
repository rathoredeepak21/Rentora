import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl, Linking } from 'react-native';
import { formatBillDate, formatShortBillDate } from '../../utils/date';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import LoadingView from '../../components/ui/LoadingView';
import StatusBadge from '../../components/ui/StatusBadge';
import MoneyText from '../../components/ui/MoneyText';
import AppButton from '../../components/ui/AppButton';
import db from '../../utils/db';
import { Bill, Tenant, Property, Unit, BillSettings, Payment } from '../../types';
import { pdfService } from '../../services/pdfService';
import { shareUtils } from '../../utils/shareUtils';
import { billService } from '../../services/billService';
import { settingsService } from '../../services/settingsService';
import { paymentService } from '../../services/paymentService';

export default function BillDetailsScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [bill, setBill] = useState<Bill | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);

  const handleDeleteBill = () => {
    Alert.alert(
      "Delete Bill?",
      "Are you sure you want to delete this bill permanently? Any payment records associated with this bill will also be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (bill) {
                await billService.deleteBill(bill.id!);
                Alert.alert("Success", "Bill deleted successfully!", [
                  { text: "OK", onPress: () => router.back() }
                ]);
              }
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete bill");
            }
          }
        }
      ]
    );
  };

  const handleApprovePayment = async (payment: Payment) => {
    Alert.alert(
      'Approve Payment?',
      `Approve ₹${payment.amount} submission (Txn: ${payment.transactionId || 'N/A'})? This will verify the payment and update the bill status.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setProcessingPaymentId(payment.id!);
            try {
              await paymentService.approvePayment(payment.id!);
              Alert.alert('Success', 'Payment verified and applied successfully!');
              await fetchBillDetails();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to approve payment.');
            } finally {
              setProcessingPaymentId(null);
            }
          }
        }
      ]
    );
  };

  const handleRejectPayment = async (payment: Payment) => {
    Alert.alert(
      'Reject Payment?',
      `Reject ₹${payment.amount} submission? The invoice balance will remain untouched.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setProcessingPaymentId(payment.id!);
            try {
              await paymentService.rejectPayment(payment.id!, 'Payment unverified by landlord.');
              Alert.alert('Rejected', 'Payment submission marked as rejected.');
              await fetchBillDetails();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to reject payment.');
            } finally {
              setProcessingPaymentId(null);
            }
          }
        }
      ]
    );
  };

  const fetchBillDetails = useCallback(async () => {
    if (!id) return;
    try {
      const b = await billService.getBillById(id);
      if (!b) {
        setLoading(false);
        return;
      }
      setBill(b);

      const [t, prop, u, allPayments] = await Promise.all([
        db.getDoc<Tenant>('tenants', b.tenantId),
        db.getDoc<Property>('properties', b.propertyId),
        db.getDoc<Unit>('units', b.unitId),
        db.getDocs<Payment>('payments')
      ]);

      setTenant(t);
      setProperty(prop);
      setUnit(u);
      
      const billPayments = allPayments.filter(p => p.billId === id);
      billPayments.sort((a,b) => b.paymentDate.localeCompare(a.paymentDate));
      setPayments(billPayments);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load invoice details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBillDetails();
  }, [fetchBillDetails]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchBillDetails();
    setRefreshing(false);
  };

  const handleGenerateAndSharePDF = async (action: 'share' | 'download') => {
    if (!bill || !tenant || !property || !unit) return;
    setIsGeneratingPDF(true);
    try {
      // Get bill settings
      const settings = await settingsService.getSettings(bill.ownerId);

      const pdfUri = await pdfService.generateBillPDF(bill, tenant, property, unit, settings);

      if (action === 'share') {
        const shared = await shareUtils.shareFile(pdfUri);
        if (!shared) {
          Alert.alert('Failed to Share', 'Unable to open share dialogue. Try downloading the file first.');
        }
      } else {
        // Since expo-print printToFileAsync saves it locally, we can just share it,
        // or tell the user the URI location. In Expo, Sharing is the primary way to download/save files.
        await shareUtils.shareFile(pdfUri);
      }
    } catch (e: any) {
      Alert.alert('PDF Error', e.message || 'Failed to generate PDF bill');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleShareTextSummary = async () => {
    if (!bill || !tenant || !property || !unit) return;

    const summaryText = `*RENT INVOICE SUMMARY*
Property: ${property.name}
Room/Unit: Unit ${unit.unitNumber}
Tenant: ${tenant.name}
Billing Month: ${bill.billingMonth}
Bill Number: ${bill.billNumber}

*Charges Breakdown:*
- Room Rent: ₹${bill.rent}
- Electricity: ₹${bill.electricityCharge} (${bill.electricityUnits} units)
- Water Charges: ₹${bill.waterCharge}
- Parking Charge: ₹${bill.parkingCharge}
- Maintenance: ₹${bill.maintenanceCharge}
- Other Charges: ₹${bill.otherCharges}
- Previous Dues: ₹${bill.previousDue}

*TOTAL AMOUNT DUE: ₹${bill.totalAmount}*
Paid: ₹${bill.paidAmount}
Remaining Balance: ₹${bill.remainingAmount}

Payment Status: *${bill.paymentStatus.toUpperCase()}*
Due Date: *${formatBillDate(bill.dueDate)}*

_Generated via Rentora App._`;

    await shareUtils.shareText(summaryText, `Invoice ${bill.billNumber} Summary`);
  };

  if (loading) {
    return <LoadingView message="Loading invoice..." />;
  }

  if (!bill || !tenant || !property || !unit) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={styles.errorText}>Bill details could not be loaded or document deleted.</Text>
        <AppButton title="Go Back" onPress={() => router.back()} style={styles.errBtn} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
        }
      >
        {/* Bill Overview Header */}
        <View style={styles.cardHeader}>
          <View style={styles.headerRow}>
            <Text style={styles.billNumberText}>{bill.billNumber}</Text>
            <StatusBadge status={bill.paymentStatus} type="bill" />
          </View>
          <Text style={styles.monthText}>Billing Month: {bill.billingMonth}</Text>
          <View style={styles.dueRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.dueDateText}>Due Date: {formatBillDate(bill.dueDate)}</Text>
          </View>
          <View style={styles.totalBlock}>
            <Text style={styles.totalLabel}>Total Payable</Text>
            <MoneyText amount={bill.totalAmount} style={styles.totalValue} variant="highlight" />
            {bill.previousDue > 0 && (
              <View style={styles.totalBreakdownSubBlock}>
                <Text style={styles.totalBreakdownSubText}>
                  Current Bill: ₹{bill.subtotal || (bill.totalAmount - bill.previousDue)} + Previous Due: ₹{bill.previousDue}
                </Text>
              </View>
            )}
          </View>

          {bill.paidAmount > 0 && (
            <View style={styles.balanceSummary}>
              <View style={styles.balRow}>
                <Text style={styles.balLabel}>Paid Amount:</Text>
                <MoneyText amount={bill.paidAmount} variant="success" style={styles.balValue} />
              </View>
              <View style={styles.balRow}>
                <Text style={styles.balLabel}>Remaining Balance:</Text>
                <MoneyText amount={bill.remainingAmount} variant="danger" style={styles.balValue} />
              </View>
            </View>
          )}
        </View>

        {/* Quick actions panel */}
        <View style={styles.actionsPanel}>
          <TouchableOpacity
            style={styles.actionIconButton}
            onPress={() => handleGenerateAndSharePDF('share')}
            disabled={isGeneratingPDF}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="share-social" size={20} color={colors.primary} />
            </View>
            <Text style={styles.actionIconLabel}>Share PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionIconButton}
            onPress={() => handleGenerateAndSharePDF('download')}
            disabled={isGeneratingPDF}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: '#ECE5FD' }]}>
              <Ionicons name="download-outline" size={20} color="#8B5CF6" />
            </View>
            <Text style={styles.actionIconLabel}>Save Invoice</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionIconButton}
            onPress={handleShareTextSummary}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: colors.secondaryLight }]}>
              <Ionicons name="chatbox-ellipses-outline" size={20} color={colors.secondary} />
            </View>
            <Text style={styles.actionIconLabel}>Share Text</Text>
          </TouchableOpacity>

          {bill.paymentStatus !== 'paid' && (
            <TouchableOpacity
              style={styles.actionIconButton}
              onPress={() => router.push({ pathname: '/bills/payment', params: { billId: bill.id } })}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="cash-outline" size={20} color={colors.warning} />
              </View>
              <Text style={styles.actionIconLabel}>Pay Bill</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Pending Payment Verification Banner / Card */}
        {payments.filter(p => p.status === 'pending').length > 0 && (
          <View style={styles.pendingVerificationCard}>
            <View style={styles.pendingCardHeader}>
              <Ionicons name="alert-circle" size={22} color={colors.warning} />
              <Text style={styles.pendingCardTitle}>Pending Payment Submissions</Text>
            </View>
            <Text style={styles.pendingCardDesc}>
              Tenant has submitted payment for verification. Review and approve to apply to invoice:
            </Text>

            {payments.filter(p => p.status === 'pending').map(pendingItem => (
              <View key={pendingItem.id} style={styles.pendingItemBox}>
                <View style={styles.pendingItemRow}>
                  <Text style={styles.pendingItemLabel}>Amount Submitted:</Text>
                  <MoneyText amount={pendingItem.amount} style={styles.pendingAmount} />
                </View>
                <View style={styles.pendingItemRow}>
                  <Text style={styles.pendingItemLabel}>Txn / UTR:</Text>
                  <Text style={styles.pendingTxnText}>{pendingItem.transactionId || 'N/A'}</Text>
                </View>
                <View style={styles.pendingItemRow}>
                  <Text style={styles.pendingItemLabel}>Date:</Text>
                  <Text style={styles.pendingDateText}>{pendingItem.paymentDate}</Text>
                </View>

                {pendingItem.screenshotUrl && (
                  <TouchableOpacity
                    style={styles.receiptLinkBtn}
                    onPress={() => Alert.alert('Receipt', 'Open receipt URL in browser?\n\n' + pendingItem.screenshotUrl, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Open', onPress: () => Linking.openURL(pendingItem.screenshotUrl!) }
                    ])}
                  >
                    <Ionicons name="document-attach-outline" size={14} color={colors.primary} />
                    <Text style={styles.receiptLinkText}>View Receipt Attachment</Text>
                  </TouchableOpacity>
                )}

                <View style={styles.pendingActionsRow}>
                  <AppButton
                    title="Reject"
                    variant="danger"
                    size="sm"
                    icon="close-outline"
                    onPress={() => handleRejectPayment(pendingItem)}
                    loading={processingPaymentId === pendingItem.id}
                    style={{ flex: 1 }}
                  />
                  <AppButton
                    title="Approve"
                    variant="primary"
                    size="sm"
                    icon="checkmark-outline"
                    onPress={() => handleApprovePayment(pendingItem)}
                    loading={processingPaymentId === pendingItem.id}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Administrative Actions */}
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
          <AppButton
            title="Edit Bill"
            onPress={() => router.push({ pathname: '/bills/edit', params: { billId: bill.id } })}
            icon="create-outline"
            variant="outline"
            size="sm"
            style={{ flex: 1 }}
          />
          <AppButton
            title="Delete Bill"
            onPress={handleDeleteBill}
            icon="trash-outline"
            variant="danger"
            size="sm"
            style={{ flex: 1 }}
          />
        </View>

        {/* Tenant Information Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tenant Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Tenant Name</Text>
            <Text style={styles.detailValue}>{tenant.name}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Mobile Phone</Text>
            <Text style={styles.detailValue}>{tenant.mobile || 'N/A'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Property Address</Text>
            <Text style={styles.detailValue} numberOfLines={1}>{property.name} (Unit {unit.unitNumber})</Text>
          </View>
        </View>

        {/* Meter reading details card */}
        {((bill.electricityBillType || 'perUnit') === 'perUnit') && (bill.electricityUnits > 0 || bill.electricityCharge > 0) && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Electricity Meter Reading</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Previous Reading</Text>
              <Text style={styles.detailValue}>{bill.previousMeterReading}</Text>
            </View>
            {bill.previousMeterReadingDate && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Last Reading Date</Text>
                <Text style={styles.detailValue}>{formatShortBillDate(bill.previousMeterReadingDate)}</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Current Reading</Text>
              <Text style={styles.detailValue}>{bill.currentMeterReading}</Text>
            </View>
            {bill.currentMeterReadingDate && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Current Reading Date</Text>
                <Text style={styles.detailValue}>{formatShortBillDate(bill.currentMeterReadingDate)}</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Consumed Units</Text>
              <Text style={styles.detailValue}>{bill.electricityUnits} Units</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Electricity Rate</Text>
              <Text style={styles.detailValue}>₹{bill.electricityRate} / Unit</Text>
            </View>
            <View style={[styles.detailRow, styles.highlightRow]}>
              <Text style={[styles.detailLabel, styles.boldLabel]}>Electricity Charge</Text>
              <MoneyText amount={bill.electricityCharge} style={styles.boldValue} />
            </View>
          </View>
        )}

        {/* Invoiced Items Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Charges Breakdown</Text>
          
          <View style={styles.itemRow}>
            <Text style={styles.itemLabel}>Base Room Rent</Text>
            <MoneyText amount={bill.rent} />
          </View>

          {(() => {
            const eType = bill.electricityBillType || 'perUnit';
            let label = 'Electricity Charges';
            if (eType === 'fixed') {
              label = 'Electricity (Fixed Monthly)';
            } else if (eType === 'perUnit') {
              label = `Electricity (${bill.electricityUnits} Units × ₹${bill.electricityRate})`;
            } else if (eType === 'none') {
              label = 'Electricity (Included / Self)';
            }

            if (eType === 'none' || bill.electricityCharge > 0 || eType === 'fixed') {
              return (
                <View style={styles.itemRow}>
                  <Text style={styles.itemLabel}>{label}</Text>
                  <MoneyText amount={bill.electricityCharge || 0} />
                </View>
              );
            }
            return null;
          })()}

          {(() => {
            const wType = bill.waterBillType || (bill.waterCharge > 0 ? 'fixed' : 'none');
            let label = 'Water Charge';
            if (wType === 'fixed') {
              label = 'Water (Fixed Monthly)';
            } else if (wType === 'perUnit') {
              const wRate = bill.waterRatePerUnit || 0;
              label = `Water (${bill.electricityUnits} Units × ₹${wRate})`;
            } else if (wType === 'none') {
              label = 'Water (Included / Self)';
            }

            if (wType === 'none' || bill.waterCharge > 0 || wType === 'fixed') {
              return (
                <View style={styles.itemRow}>
                  <Text style={styles.itemLabel}>{label}</Text>
                  <MoneyText amount={bill.waterCharge || 0} />
                </View>
              );
            }
            return null;
          })()}

          {bill.parkingCharge > 0 && (
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>Parking Charge</Text>
              <MoneyText amount={bill.parkingCharge} />
            </View>
          )}

          {bill.maintenanceCharge > 0 && (
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>Maintenance</Text>
              <MoneyText amount={bill.maintenanceCharge} />
            </View>
          )}

          {bill.otherCharges > 0 && (
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>Other Misc Charges</Text>
              <MoneyText amount={bill.otherCharges} />
            </View>
          )}

          {bill.previousDue > 0 && (
            <View style={styles.itemRow}>
              <Text style={[styles.itemLabel, { color: colors.danger }]}>Previous Arrears / Dues</Text>
              <MoneyText amount={bill.previousDue} style={{ color: colors.danger }} />
            </View>
          )}

          <View style={styles.itemDivider} />
          
          <View style={styles.totalRow}>
            <Text style={styles.totalBreakdownLabel}>Grand Total</Text>
            <MoneyText amount={bill.totalAmount} style={styles.totalBreakdownValue} />
          </View>
        </View>

        {/* Payments list card */}
        {payments.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Transaction Payments History</Text>
            {payments.map((payment) => {
              const status = payment.status || 'approved';
              return (
                <View key={payment.id} style={styles.paymentRecord}>
                  <View style={styles.paymentHeader}>
                    <Text style={styles.paymentDate}>{payment.paymentDate}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[
                        styles.paymentStatusBadge,
                        status === 'approved' ? styles.statusApproved : status === 'rejected' ? styles.statusRejected : styles.statusPending
                      ]}>
                        <Text style={[
                          styles.paymentStatusText,
                          status === 'approved' ? styles.statusApprovedText : status === 'rejected' ? styles.statusRejectedText : styles.statusPendingText
                        ]}>
                          {status === 'approved' ? 'VERIFIED' : status === 'rejected' ? 'REJECTED' : 'PENDING'}
                        </Text>
                      </View>
                      <Text style={styles.paymentMethod}>{payment.paymentMethod.toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={styles.paymentFooter}>
                    <Text style={styles.paymentTxn}>Txn: {payment.transactionId || 'N/A'}</Text>
                    <MoneyText
                      amount={payment.amount}
                      variant={status === 'rejected' ? 'normal' : 'success'}
                      style={status === 'rejected' ? { ...styles.paymentAmount, textDecorationLine: 'line-through', color: colors.textSecondary } : styles.paymentAmount}
                    />
                  </View>
                  {payment.screenshotUrl && (
                    <View style={styles.screenshotLinkContainer}>
                      <Ionicons name="document-attach-outline" size={14} color={colors.primary} />
                      <TouchableOpacity onPress={() => Alert.alert('Payment Receipt', 'Open screenshot URL in browser?\n\n' + payment.screenshotUrl, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Open URL', onPress: () => Linking.openURL(payment.screenshotUrl!) }
                      ])}>
                        <Text style={styles.screenshotLinkText}>View Receipt Attachment</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
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
  cardHeader: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    alignItems: 'center',
    ...spacing.shadows.light,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  billNumberText: {
    fontSize: typography.sizes.md + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  monthText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    width: '100%',
    textAlign: 'left',
    marginTop: 2,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: spacing.xs,
    gap: 4,
  },
  dueDateText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
  },
  totalBlock: {
    marginTop: spacing.lg,
    alignItems: 'center',
    width: '100%',
    backgroundColor: colors.background,
    paddingVertical: spacing.md,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  totalLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: typography.sizes.xxl,
    marginTop: 4,
  },
  totalBreakdownSubBlock: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  totalBreakdownSubText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
    textAlign: 'center',
  },
  balanceSummary: {
    width: '100%',
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  balRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balLabel: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
  },
  balValue: {
    fontSize: typography.sizes.sm + 1,
  },
  actionsPanel: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: spacing.borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...spacing.shadows.light,
  },
  actionIconButton: {
    alignItems: 'center',
    flex: 1,
  },
  actionIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  actionIconLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...spacing.shadows.light,
  },
  sectionTitle: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm - 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  detailLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
  },
  detailValue: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  highlightRow: {
    backgroundColor: colors.primaryLight + '50',
    paddingHorizontal: spacing.sm,
    borderRadius: 4,
    marginTop: spacing.sm,
  },
  boldLabel: {
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  boldValue: {
    fontWeight: typography.weights.bold,
    color: colors.primary,
    fontSize: typography.sizes.sm + 1,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  itemLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
  },
  itemDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  totalBreakdownLabel: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  totalBreakdownValue: {
    fontSize: typography.sizes.md + 1,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  paymentRecord: {
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
    paddingVertical: spacing.sm,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  paymentDate: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  paymentMethod: {
    fontSize: 9,
    fontWeight: typography.weights.bold,
    color: colors.secondary,
    backgroundColor: colors.secondaryLight,
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  paymentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentTxn: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  paymentAmount: {
    fontSize: typography.sizes.sm + 1,
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
    lineHeight: typography.lineHeights.md,
  },
  errBtn: {
    paddingHorizontal: spacing.xxl,
  },
  screenshotLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  screenshotLinkText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
    marginLeft: 4,
  },
  pendingVerificationCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    marginBottom: spacing.lg,
    ...spacing.shadows.light,
  },
  pendingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pendingCardTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: '#92400E',
    marginLeft: spacing.xs,
  },
  pendingCardDesc: {
    fontSize: typography.sizes.xs + 1,
    color: '#78350F',
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  pendingItemBox: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  pendingItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  pendingItemLabel: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
  },
  pendingAmount: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  pendingTxnText: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  pendingDateText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  receiptLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  receiptLinkText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
    marginLeft: 4,
  },
  pendingActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  paymentStatusBadge: {
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 3,
  },
  statusApproved: {
    backgroundColor: colors.secondary + '20',
  },
  statusRejected: {
    backgroundColor: colors.danger + '20',
  },
  statusPending: {
    backgroundColor: colors.warning + '20',
  },
  paymentStatusText: {
    fontSize: 8,
    fontWeight: typography.weights.bold,
  },
  statusApprovedText: {
    color: colors.secondary,
  },
  statusRejectedText: {
    color: colors.danger,
  },
  statusPendingText: {
    color: colors.warning,
  },
});
