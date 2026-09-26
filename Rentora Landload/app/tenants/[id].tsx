import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl, Linking, Modal, Clipboard, TextInput, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTenants } from '../../hooks/useTenants';
import { useProperties } from '../../hooks/useProperties';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import LoadingView from '../../components/ui/LoadingView';
import StatusBadge from '../../components/ui/StatusBadge';
import MoneyText from '../../components/ui/MoneyText';
import AppButton from '../../components/ui/AppButton';
import db from '../../utils/db';
import { Bill, Payment, Unit } from '../../types';
import { decorateBills } from '../../services/billService';
import { tenantAuthService } from '../../services/tenantAuthService';

export default function TenantDetailsScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { tenants, loading: tenantLoading, deleteTenant } = useTenants();
  const { properties } = useProperties();

  const tenant = tenants.find((t) => t.id === id);
  const property = tenant ? properties.find((p) => p.id === tenant.propertyId) : null;

  const [unitNumber, setUnitNumber] = useState('');
  const [activeSegment, setActiveSegment] = useState<'info' | 'bills' | 'payments'>('info');
  
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [changePassModalVisible, setChangePassModalVisible] = useState(false);
  const [newPassInput, setNewPassInput] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let rand = 'Rent@';
    for (let i = 0; i < 4; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassInput(rand);
  };

  const handleSaveNewPassword = async () => {
    if (!tenant) return;
    if (!newPassInput || newPassInput.length < 6) {
      Alert.alert('Invalid Password', 'Password must be at least 6 characters long.');
      return;
    }
    setIsSavingPassword(true);
    try {
      await tenantAuthService.changeTenantPassword(
        tenant.id!,
        newPassInput,
        tenant.tenantAuthUid || undefined,
        tenant.ownerId
      );
      Alert.alert('Success', `Tenant password updated successfully to: ${newPassInput}`);
      setChangePassModalVisible(false);
      setNewPassInput('');
      handleRefresh();
    } catch (err: any) {
      Alert.alert('Change Failed', err.message || 'Unable to update password in Firebase Authentication. Please try again.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleDeleteTenant = () => {
    Alert.alert(
      "Remove Tenant Profile?",
      "This will remove the active tenant profile, revoke app access, and make the room vacant. All historical bills and payment records are preserved for accounting and reports.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove Tenant", 
          style: "destructive", 
          onPress: async () => {
            try {
              if (tenant) {
                await deleteTenant(tenant.id!);
                Alert.alert("Success", "Tenant removed successfully!", [
                  { text: "OK", onPress: () => router.back() }
                ]);
              }
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to remove tenant");
            }
          } 
        }
      ]
    );
  };

  // Fetch unit details
  useEffect(() => {
    const fetchUnit = async () => {
      if (tenant) {
        try {
          const unit = await db.getDoc<Unit>('units', tenant.unitId);
          if (unit) {
            setUnitNumber(unit.unitNumber);
          }
        } catch (e) {
          console.error(e);
        }
      }
    };
    fetchUnit();
  }, [tenant]);

  // Fetch Bills & Payments history for this tenant
  const fetchHistory = useCallback(async () => {
    if (!id) return;
    setLoadingHistory(true);
    try {
      const allBills = await db.getDocs<Bill>('bills');
      const rawTenantBills = allBills.filter((b) => b.tenantId === id);
      const tenantBills = decorateBills(rawTenantBills);
      // Sort bills by month desc
      tenantBills.sort((a, b) => b.billingMonth.localeCompare(a.billingMonth));
      setBills(tenantBills);

      const allPayments = await db.getDocs<Payment>('payments');
      const tenantPayments = allPayments.filter((p) => p.tenantId === id);
      // Sort payments by date desc
      tenantPayments.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
      setPayments(tenantPayments);
    } catch (e) {
      console.error('Error fetching tenant history', e);
    } finally {
      setLoadingHistory(false);
    }
  }, [id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  };

  const handleWhatsApp = async () => {
    if (!tenant?.mobile) {
      Alert.alert('No Mobile Number', 'Tenant does not have a mobile number saved.');
      return;
    }
    let digits = tenant.mobile.replace(/[^\d]/g, '');
    if (!digits) {
      Alert.alert('Invalid Mobile Number', 'Tenant mobile number is invalid.');
      return;
    }
    if (digits.length === 10) {
      digits = '91' + digits;
    }
    const whatsappUrl = `whatsapp://send?phone=${digits}`;
    const webWhatsappUrl = `https://wa.me/${digits}`;

    try {
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        const supportedWeb = await Linking.canOpenURL(webWhatsappUrl);
        if (supportedWeb) {
          await Linking.openURL(webWhatsappUrl);
        } else {
          Alert.alert('WhatsApp Not Installed', 'Could not open WhatsApp. Please check if WhatsApp is installed on your device.');
        }
      }
    } catch (error) {
      Alert.alert('WhatsApp Error', 'Could not open WhatsApp. Please check if WhatsApp is installed on your device.');
    }
  };

  const handleCall = async () => {
    if (!tenant?.mobile) {
      Alert.alert('No Mobile Number', 'Tenant does not have a mobile number saved.');
      return;
    }
    const rawNumber = tenant.mobile.trim();
    if (!rawNumber) {
      Alert.alert('Invalid Mobile Number', 'Tenant mobile number is invalid.');
      return;
    }
    const telUrl = `tel:${rawNumber}`;
    try {
      await Linking.openURL(telUrl);
    } catch (error) {
      Alert.alert('Call Error', 'Unable to open phone dialer on this device.');
    }
  };

  if (tenantLoading || !tenant) {
    return <LoadingView message="Loading tenant details..." />;
  }

  return (
    <View style={styles.container}>
      {/* Header Profile Section */}
      <View style={styles.headerProfile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {tenant.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{tenant.name}</Text>
          <View style={styles.profileSub}>
            <StatusBadge status={tenant.status} type="tenant" />
            <Text style={styles.profileSubText}>
              Rent: <Text style={styles.boldRent}>₹{tenant.monthlyRent}</Text>/mo
            </Text>
          </View>
        </View>
        {/* Header Quick Actions: WhatsApp & Call */}
        <View style={styles.headerQuickActions}>
          <TouchableOpacity
            style={[styles.quickActionButton, styles.whatsappButton]}
            onPress={handleWhatsApp}
            activeOpacity={0.7}
            accessibilityLabel="Chat on WhatsApp"
          >
            <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickActionButton, styles.callButton]}
            onPress={handleCall}
            activeOpacity={0.7}
            accessibilityLabel="Call Tenant"
          >
            <Ionicons name="call" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Segmented Control */}
      <View style={styles.segmentContainer}>
        {(['info', 'bills', 'payments'] as const).map((segment) => (
          <TouchableOpacity
            key={segment}
            style={[styles.segmentButton, activeSegment === segment && styles.segmentButtonActive]}
            onPress={() => setActiveSegment(segment)}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeSegment === segment && styles.segmentTextActive]}>
              {segment === 'info' ? 'Details' : segment === 'bills' ? 'Bills' : 'Payments'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
        }
      >
        {activeSegment === 'info' && (
          <View style={styles.infoTab}>
            {/* Primary Actions */}
            <View style={styles.actionsGrid}>
              {tenant.status === 'active' && (
                <>
                  <AppButton
                    title="Create Bill"
                    onPress={() => router.push({ pathname: '/bills/create', params: { tenantId: tenant.id } })}
                    icon="receipt-outline"
                    size="sm"
                    style={styles.actionBtn}
                  />
                  <AppButton
                    title="Vacate Tenant"
                    onPress={() => router.push({ pathname: '/tenants/vacate', params: { id: tenant.id } })}
                    icon="exit-outline"
                    variant="outline"
                    size="sm"
                    style={styles.actionBtn}
                  />
                </>
              )}
              <AppButton
                title="Edit Profile"
                onPress={() => router.push({ pathname: '/tenants/edit', params: { id: tenant.id } })}
                icon="create-outline"
                variant="outline"
                size="sm"
                style={styles.actionBtn}
              />
              <AppButton
                title="Delete Tenant"
                onPress={handleDeleteTenant}
                icon="trash-outline"
                variant="danger"
                size="sm"
                style={styles.actionBtn}
              />
            </View>

            {/* Login Password Card */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.cardTitle}>Login Password</Text>
                <TouchableOpacity
                  onPress={() => setChangePassModalVisible(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="key-outline" size={16} color={colors.primary} />
                  <Text style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.primary }}>
                    Change Password
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.infoItem, { marginTop: spacing.sm, borderBottomWidth: 0, paddingBottom: 0 }]}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
                <View style={styles.infoTextWrapper}>
                  <Text style={styles.infoLabel}>Current Password</Text>
                  <Text style={[styles.infoValue, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 16, letterSpacing: showPassword ? 0.5 : 2 }]}>
                    {showPassword ? (tenant.loginPassword || tenant.authSecret || '••••••••') : '••••••••'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={{ paddingHorizontal: spacing.xs, paddingVertical: 4 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Profile Info Details */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Tenant Profile Details</Text>
              
              <View style={styles.infoItem}>
                <Ionicons name="call-outline" size={18} color={colors.textSecondary} />
                <View style={styles.infoTextWrapper}>
                  <Text style={styles.infoLabel}>Mobile Number</Text>
                  <Text style={styles.infoValue}>{tenant.mobile || 'Not provided'}</Text>
                </View>
              </View>

              <View style={styles.infoItem}>
                <Ionicons name="transgender-outline" size={18} color={colors.textSecondary} />
                <View style={styles.infoTextWrapper}>
                  <Text style={styles.infoLabel}>Gender</Text>
                  <Text style={styles.infoValue}>
                    {tenant.gender ? tenant.gender.charAt(0).toUpperCase() + tenant.gender.slice(1).replace(/_/g, ' ') : 'Not provided'}
                  </Text>
                </View>
              </View>

              <View style={styles.infoItem}>
                <Ionicons name="briefcase-outline" size={18} color={colors.textSecondary} />
                <View style={styles.infoTextWrapper}>
                  <Text style={styles.infoLabel}>Occupation</Text>
                  <Text style={styles.infoValue}>
                    {tenant.occupation ? tenant.occupation.charAt(0).toUpperCase() + tenant.occupation.slice(1).replace(/_/g, ' ') : 'Not provided'}
                  </Text>
                </View>
              </View>

              <View style={styles.infoItem}>
                <Ionicons name="people-outline" size={18} color={colors.textSecondary} />
                <View style={styles.infoTextWrapper}>
                  <Text style={styles.infoLabel}>Total Members</Text>
                  <Text style={styles.infoValue}>{tenant.totalMembers || 1}</Text>
                </View>
              </View>

              <View style={styles.infoItem}>
                <Ionicons name="card-outline" size={18} color={colors.textSecondary} />
                <View style={styles.infoTextWrapper}>
                  <Text style={styles.infoLabel}>ID Proof Type</Text>
                  <Text style={styles.infoValue}>
                    {!tenant.idProofType || tenant.idProofType === 'none' ? 'None' : tenant.idProofType.charAt(0).toUpperCase() + tenant.idProofType.slice(1).replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>

              {tenant.idProofType && tenant.idProofType !== 'none' && (
                <View style={styles.infoItem}>
                  <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
                  <View style={styles.infoTextWrapper}>
                    <Text style={styles.infoLabel}>ID Proof Number</Text>
                    <Text style={styles.infoValue}>{tenant.documentNumber || 'Not provided'}</Text>
                  </View>
                </View>
              )}

              <View style={styles.infoItem}>
                <Ionicons name="business-outline" size={18} color={colors.textSecondary} />
                <View style={styles.infoTextWrapper}>
                  <Text style={styles.infoLabel}>Assigned Property</Text>
                  <Text style={styles.infoValue}>{property?.name || 'Unknown Property'}</Text>
                </View>
              </View>

              <View style={styles.infoItem}>
                <Ionicons name="key-outline" size={18} color={colors.textSecondary} />
                <View style={styles.infoTextWrapper}>
                  <Text style={styles.infoLabel}>Assigned Unit / Room</Text>
                  <Text style={styles.infoValue}>Unit {unitNumber || '...'}</Text>
                </View>
              </View>

              <View style={styles.infoItem}>
                <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                <View style={styles.infoTextWrapper}>
                  <Text style={styles.infoLabel}>Move-in Date</Text>
                  <Text style={styles.infoValue}>{tenant.moveInDate}</Text>
                </View>
              </View>

              <View style={styles.infoItem}>
                <Ionicons name="wallet-outline" size={18} color={colors.textSecondary} />
                <View style={styles.infoTextWrapper}>
                  <Text style={styles.infoLabel}>Monthly Rent</Text>
                  <Text style={styles.infoValue}>₹{tenant.monthlyRent}</Text>
                </View>
              </View>

              <View style={styles.infoItem}>
                <Ionicons name="bulb-outline" size={18} color={colors.textSecondary} />
                <View style={styles.infoTextWrapper}>
                  <Text style={styles.infoLabel}>Initial Meter Reading</Text>
                  <Text style={styles.infoValue}>{tenant.initialMeterReading || 0}</Text>
                </View>
              </View>

              {tenant.status === 'vacated' && tenant.moveOutDate && (
                <View style={styles.infoItem}>
                  <Ionicons name="exit-outline" size={18} color={colors.danger} />
                  <View style={styles.infoTextWrapper}>
                    <Text style={[styles.infoLabel, { color: colors.danger }]}>Move-out Date</Text>
                    <Text style={[styles.infoValue, { color: colors.danger }]}>{tenant.moveOutDate}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Tenant App Access Card */}
            <View style={styles.card}>
              <View style={styles.appAccessHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Tenant App Access</Text>
                  <Text style={styles.appAccessSub}>
                    Mobile ID: <Text style={styles.appAccessMobile}>{tenant.mobile || 'Not provided'}</Text>
                  </Text>
                </View>
                <View
                  style={[
                    styles.loginStatusTag,
                    tenant.loginStatus === 'active'
                      ? styles.loginStatusActive
                      : tenant.loginStatus === 'disabled'
                      ? styles.loginStatusDisabled
                      : styles.loginStatusNone,
                  ]}
                >
                  <Text
                    style={[
                      styles.loginStatusTagText,
                      tenant.loginStatus === 'active'
                        ? styles.loginStatusTagTextActive
                        : tenant.loginStatus === 'disabled'
                        ? styles.loginStatusTagTextDisabled
                        : styles.loginStatusTagTextNone,
                    ]}
                  >
                    {tenant.loginStatus === 'active'
                      ? 'Active'
                      : tenant.loginStatus === 'disabled'
                      ? 'Disabled'
                      : 'Not Created'}
                  </Text>
                </View>
              </View>

              {tenant.passwordResetRequested && (
                <View style={styles.resetRequestBanner}>
                  <Ionicons name="alert-circle-outline" size={20} color="#D97706" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resetRequestTitle}>Password Reset Requested</Text>
                    <Text style={styles.resetRequestSub}>
                      Tenant requested a password reset. Tap below to generate a new temporary password.
                    </Text>
                  </View>
                </View>
              )}

              {tenant.tenantAuthUid ? (
                <View style={styles.appAccessActions}>

                  <AppButton
                    title={tenant.loginStatus === 'active' ? 'Disable Login Access' : 'Enable Login Access'}
                    variant={tenant.loginStatus === 'active' ? 'danger' : 'primary'}
                    size="sm"
                    icon={tenant.loginStatus === 'active' ? 'lock-closed-outline' : 'checkmark-circle-outline'}
                    onPress={async () => {
                      const newStatus = tenant.loginStatus === 'active' ? 'disabled' : 'active';
                      try {
                        await tenantAuthService.updateTenantLoginStatus(tenant.id!, newStatus, tenant.tenantAuthUid);
                        tenant.loginStatus = newStatus;
                        Alert.alert('Updated', `Tenant login access ${newStatus === 'active' ? 'enabled' : 'disabled'}.`);
                        handleRefresh();
                      } catch (e: any) {
                        Alert.alert('Error', e.message || 'Failed to update access status.');
                      }
                    }}
                  />
                </View>
              ) : (
                <View style={styles.appAccessActions}>
                  <AppButton
                    title="Setup Tenant App Login"
                    size="sm"
                    icon="key-outline"
                    onPress={() => router.push({ pathname: '/tenants/edit', params: { id: tenant.id } })}
                  />
                </View>
              )}
            </View>
          </View>
        )}

        {activeSegment === 'bills' && (
          <View style={styles.listTab}>
            {loadingHistory ? (
              <LoadingView message="Loading bills..." fullscreen={false} />
            ) : bills.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="receipt-outline" size={40} color={colors.textSecondary} />
                <Text style={styles.emptyText}>No bills generated yet</Text>
              </View>
            ) : (
              bills.map((bill) => (
                <TouchableOpacity
                  key={bill.id}
                  style={styles.historyCard}
                  onPress={() => router.push({ pathname: '/bills/[id]', params: { id: bill.id } })}
                  activeOpacity={0.8}
                >
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyTitle}>{bill.billingMonth}</Text>
                    <StatusBadge status={bill.paymentStatus} type="bill" />
                  </View>
                  <View style={styles.historyFooter}>
                    <Text style={styles.historySub}>No: {bill.billNumber}</Text>
                    <MoneyText amount={bill.totalAmount} style={styles.historyAmount} />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {activeSegment === 'payments' && (
          <View style={styles.listTab}>
            {loadingHistory ? (
              <LoadingView message="Loading payments..." fullscreen={false} />
            ) : payments.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="cash-outline" size={40} color={colors.textSecondary} />
                <Text style={styles.emptyText}>No payments recorded yet</Text>
              </View>
            ) : (
              payments.map((payment) => (
                <View key={payment.id} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyTitle}>{payment.paymentDate}</Text>
                    <Text style={styles.methodBadge}>{payment.paymentMethod.toUpperCase()}</Text>
                  </View>
                  <View style={styles.historyFooter}>
                    <Text style={styles.historySub}>Txn ID: {payment.transactionId || 'N/A'}</Text>
                    <MoneyText amount={payment.amount} variant="success" />
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
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Change Password Modal */}
      <Modal
        visible={changePassModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setChangePassModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconBox}>
              <Ionicons name="key" size={32} color={colors.primary} />
            </View>

            <Text style={styles.modalTitle}>Change Tenant Password</Text>
            <Text style={styles.modalSubtitle}>
              Set a new login password for <Text style={{ fontWeight: 'bold', color: colors.text }}>{tenant?.name}</Text>
            </Text>

            <View style={{ width: '100%', marginBottom: spacing.md }}>
              <Text style={{ fontSize: typography.sizes.xs, color: colors.textSecondary, fontWeight: '600', marginBottom: 6 }}>
                NEW PASSWORD
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={{
                    flex: 1,
                    height: 48,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: spacing.borderRadius.md,
                    paddingHorizontal: 12,
                    fontSize: typography.sizes.md,
                    color: colors.text,
                    backgroundColor: colors.background,
                    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                  }}
                  placeholder="Enter new password"
                  placeholderTextColor={colors.textSecondary}
                  value={newPassInput}
                  onChangeText={setNewPassInput}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.primary + '18',
                    borderWidth: 1,
                    borderColor: colors.primary,
                    borderRadius: spacing.borderRadius.md,
                    height: 48,
                    paddingHorizontal: 14,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                  onPress={handleGeneratePassword}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: colors.primary }}>
                    Generate
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={styles.modalDoneButton}
                onPress={() => {
                  setChangePassModalVisible(false);
                  setNewPassInput('');
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.modalDoneButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalCopyButton, isSavingPassword && { opacity: 0.7 }]}
                onPress={handleSaveNewPassword}
                disabled={isSavingPassword}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCopyButtonText}>
                  {isSavingPassword ? "Saving..." : "Save Password"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: spacing.borderRadius.round,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...spacing.shadows.light,
  },
  avatarText: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.white,
  },
  profileInfo: {
    marginLeft: spacing.lg,
    flex: 1,
  },
  profileName: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  profileSub: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.md,
  },
  profileSubText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  headerQuickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.sm,
  },
  quickActionButton: {
    width: 40,
    height: 40,
    borderRadius: spacing.borderRadius.round,
    justifyContent: 'center',
    alignItems: 'center',
    ...spacing.shadows.light,
  },
  whatsappButton: {
    backgroundColor: '#25D366',
  },
  callButton: {
    backgroundColor: colors.primary,
  },
  boldRent: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: spacing.md - 2,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: colors.transparent,
  },
  segmentButtonActive: {
    borderBottomColor: colors.primary,
  },
  segmentText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  infoTab: {},
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    flex: 1,
    minWidth: 120,
  },
  actionBtnFull: {
    width: '100%',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...spacing.shadows.light,
  },
  cardTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.lg,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  infoTextWrapper: {
    marginLeft: spacing.lg,
    flex: 1,
  },
  infoLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: typography.sizes.md - 1,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  listTab: {
    gap: spacing.md,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 120,
  },
  emptyText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    fontWeight: typography.weights.medium,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...spacing.shadows.light,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  historyTitle: {
    fontSize: typography.sizes.md - 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  historyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historySub: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  historyAmount: {
    fontSize: typography.sizes.md - 1,
  },
  methodBadge: {
    fontSize: typography.sizes.xs - 1,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    backgroundColor: colors.background,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
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
  appAccessHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  appAccessSub: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    marginTop: 2,
  },
  appAccessMobile: {
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  loginStatusTag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.borderRadius.round,
  },
  loginStatusActive: {
    backgroundColor: colors.success + '20',
  },
  loginStatusDisabled: {
    backgroundColor: colors.danger + '20',
  },
  loginStatusNone: {
    backgroundColor: colors.textSecondary + '20',
  },
  loginStatusTagText: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
  },
  loginStatusTagTextActive: {
    color: colors.success,
  },
  loginStatusTagTextDisabled: {
    color: colors.danger,
  },
  loginStatusTagTextNone: {
    color: colors.textSecondary,
  },
  appAccessActions: {
    marginTop: spacing.md,
  },
  resetRequestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: spacing.borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  resetRequestTitle: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    color: '#B45309',
  },
  resetRequestSub: {
    fontSize: typography.sizes.xs,
    color: '#92400E',
    marginTop: 2,
    lineHeight: 16,
  },
  resetPasswordBtn: {
    marginBottom: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...spacing.shadows.medium,
  },
  modalIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  tempPassBox: {
    width: '100%',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  tempPassLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tempPassValue: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    letterSpacing: 1.5,
  },
  modalNotice: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  modalCopyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md - 2,
    borderRadius: spacing.borderRadius.md,
    gap: spacing.xs,
  },
  modalCopyButtonSuccess: {
    backgroundColor: colors.success,
  },
  modalCopyButtonText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: '#FFFFFF',
  },
  modalDoneButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md - 2,
    borderRadius: spacing.borderRadius.md,
  },
  modalDoneButtonText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
});
