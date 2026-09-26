import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { tenantDataService } from '../../services/tenantDataService';
import { Property, Unit, TenantDetails } from '../../types';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import SwipeableTabWrapper from '../../components/ui/SwipeableTabWrapper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';

export default function ProfileScreen() {
  const { userProfile, user, logout } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [property, setProperty] = useState<Property | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [tenantDoc, setTenantDoc] = useState<TenantDetails | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadHousingAndTenant = async () => {
      if (userProfile?.tenantId) {
        const t = await tenantDataService.fetchTenantDetails(userProfile.tenantId);
        if (isMounted) setTenantDoc(t);
      }
      if (userProfile?.propertyId) {
        const p = await tenantDataService.fetchPropertyDetails(userProfile.propertyId);
        if (isMounted) setProperty(p);
      }
      if (userProfile?.unitId) {
        const u = await tenantDataService.fetchUnitDetails(userProfile.unitId);
        if (isMounted) setUnit(u);
      }
    };
    loadHousingAndTenant();

    return () => {
      isMounted = false;
    };
  }, [userProfile?.tenantId, userProfile?.propertyId, userProfile?.unitId]);

  const handleConfirmLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to sign out from your tenant account?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: logout },
      ]
    );
  };

  return (
    <SwipeableTabWrapper currentTab="profile">
      <AppSafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
        <StatusBar style={colors.statusBarStyle} />
        <ScrollView
          contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom + 90, 110) }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerTitleRow}>
            <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>My Profile</Text>
            <TouchableOpacity
              style={[styles.settingsIconBtn, { backgroundColor: colors.cardSubtle }]}
              onPress={() => router.push('/settings')}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="cog-outline" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Profile Card Header */}
          <View style={[styles.profileHeaderCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={[styles.avatarBig, { backgroundColor: colors.primaryGlow }]}>
              <MaterialCommunityIcons name="account" size={44} color={colors.primary} />
            </View>
            <Text style={[styles.profileName, { color: colors.textPrimary }]}>{userProfile?.name || tenantDoc?.name || 'Tenant'}</Text>
            <Text style={[styles.profilePhone, { color: colors.textSecondary }]}>{userProfile?.phone || userProfile?.mobileNumber || 'N/A'}</Text>

            <View style={[styles.roleBadge, { backgroundColor: colors.successBg }]}>
              <MaterialCommunityIcons name="shield-check" size={14} color={colors.success} />
              <Text style={[styles.roleText, { color: colors.success }]}>Verified Tenant Account</Text>
            </View>
          </View>

          {/* Housing & Landlord-Controlled Information */}
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeaderTitle, { color: colors.textPrimary }]}>Housing & Rental Details</Text>
              <View style={styles.landlordBadge}>
                <MaterialCommunityIcons name="lock-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.landlordBadgeText, { color: colors.textMuted }]}>Landlord Managed</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={[styles.detailIconBox, { backgroundColor: colors.primaryGlow }]}>
                <MaterialCommunityIcons name="office-building" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailTextCol}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Property Name</Text>
                <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{property?.name || 'Loading...'}</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={[styles.detailIconBox, { backgroundColor: colors.primaryGlow }]}>
                <MaterialCommunityIcons name="door" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailTextCol}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Room / Unit Number</Text>
                <Text style={[styles.detailValue, { color: colors.textPrimary }]}>Unit {unit?.unitNumber || 'N/A'}</Text>
              </View>
            </View>

            {tenantDoc?.monthlyRent ? (
              <View style={styles.detailRow}>
                <View style={[styles.detailIconBox, { backgroundColor: colors.primaryGlow }]}>
                  <MaterialCommunityIcons name="currency-inr" size={20} color={colors.primary} />
                </View>
                <View style={styles.detailTextCol}>
                  <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Monthly Rent Amount</Text>
                  <Text style={[styles.detailValue, { color: colors.textPrimary }]}>₹{tenantDoc.monthlyRent.toLocaleString('en-IN')}</Text>
                </View>
              </View>
            ) : null}

            {tenantDoc?.moveInDate ? (
              <View style={styles.detailRow}>
                <View style={[styles.detailIconBox, { backgroundColor: colors.primaryGlow }]}>
                  <MaterialCommunityIcons name="calendar-import" size={20} color={colors.primary} />
                </View>
                <View style={styles.detailTextCol}>
                  <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Move-in Date</Text>
                  <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{tenantDoc.moveInDate}</Text>
                </View>
              </View>
            ) : null}

            {property?.address ? (
              <View style={styles.detailRow}>
                <View style={[styles.detailIconBox, { backgroundColor: colors.primaryGlow }]}>
                  <MaterialCommunityIcons name="map-marker-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.detailTextCol}>
                  <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Property Address</Text>
                  <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{property.address}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Tenant Information */}
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={[styles.sectionHeaderTitle, { color: colors.textPrimary }]}>Tenant Information</Text>

            <View style={styles.detailRow}>
              <View style={[styles.detailIconBox, { backgroundColor: colors.cardSubtle }]}>
                <MaterialCommunityIcons name="briefcase-outline" size={20} color={colors.textSecondary} />
              </View>
              <View style={styles.detailTextCol}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Occupation</Text>
                <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{tenantDoc?.occupation || 'Not specified'}</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={[styles.detailIconBox, { backgroundColor: colors.cardSubtle }]}>
                <MaterialCommunityIcons name="account-group-outline" size={20} color={colors.textSecondary} />
              </View>
              <View style={styles.detailTextCol}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Total Members</Text>
                <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{tenantDoc?.totalMembers || '1 Member'}</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={[styles.detailIconBox, { backgroundColor: colors.cardSubtle }]}>
                <MaterialCommunityIcons name="card-account-details-outline" size={20} color={colors.textSecondary} />
              </View>
              <View style={styles.detailTextCol}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>ID Proof Type</Text>
                <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                  {tenantDoc?.idProofType && tenantDoc.idProofType !== 'none'
                    ? tenantDoc.idProofType.toUpperCase()
                    : 'Not provided'}
                </Text>
              </View>
            </View>
          </View>

          {/* Security & Account Settings */}
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={[styles.sectionHeaderTitle, { color: colors.textPrimary }]}>Account & Security Settings</Text>

            {/* My Documents Option */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push('/documents')}
              activeOpacity={0.7}
            >
              <View style={[styles.detailIconBox, { backgroundColor: colors.primaryGlow }]}>
                <MaterialCommunityIcons name="folder-text-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailTextCol}>
                <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>My Documents</Text>
                <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>View shared agreements, KYC & property rules</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Property Rules Direct Option */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push('/documents/property-rules')}
              activeOpacity={0.7}
            >
              <View style={[styles.detailIconBox, { backgroundColor: colors.primaryGlow }]}>
                <MaterialCommunityIcons name="shield-check-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailTextCol}>
                <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>Property Rules</Text>
                <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>
                  View rules for {property?.name || 'your property'}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Change Password Option */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push('/profile/change-password')}
              activeOpacity={0.7}
            >
              <View style={[styles.detailIconBox, { backgroundColor: colors.primaryGlow }]}>
                <MaterialCommunityIcons name="shield-key-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailTextCol}>
                <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>Change Password</Text>
                <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>Update your permanent account password</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Payment Submissions History Option */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push('/payments/history')}
              activeOpacity={0.7}
            >
              <View style={[styles.detailIconBox, { backgroundColor: colors.primaryGlow }]}>
                <MaterialCommunityIcons name="history" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailTextCol}>
                <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>Payment Submissions History</Text>
                <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>Track UTR submission verification statuses</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Mobile Number Row */}
            <View style={styles.infoStaticRow}>
              <View style={[styles.detailIconBox, { backgroundColor: colors.cardSubtle }]}>
                <MaterialCommunityIcons name="phone-outline" size={20} color={colors.textSecondary} />
              </View>
              <View style={styles.detailTextCol}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Registered Mobile Number</Text>
                <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                  {userProfile?.phone || userProfile?.mobileNumber || 'Registered Contact'}
                </Text>
              </View>
            </View>

            {/* Account Status Row */}
            <View style={styles.infoStaticRow}>
              <View style={[styles.detailIconBox, { backgroundColor: colors.successBg }]}>
                <MaterialCommunityIcons name="shield-check-outline" size={20} color={colors.success} />
              </View>
              <View style={styles.detailTextCol}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Account Security Status</Text>
                <Text style={[styles.detailValue, { color: colors.success, fontWeight: '700' }]}>
                  Verified & Active
                </Text>
              </View>
            </View>
          </View>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleConfirmLogout} activeOpacity={0.8}>
            <MaterialCommunityIcons name="logout" size={20} color={COLORS.textWhite} />
            <Text style={styles.logoutBtnText}>Sign Out from Account</Text>
          </TouchableOpacity>
        </ScrollView>
      </AppSafeAreaView>
    </SwipeableTabWrapper>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    padding: SPACING.md,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  settingsIconBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  profileHeaderCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  avatarBig: {
    width: 76,
    height: 76,
    borderRadius: RADIUS.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
  },
  profilePhone: {
    fontSize: 14,
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 6,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  landlordBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    gap: 4,
  },
  landlordBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.md,
  },
  infoStaticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: SPACING.xs,
  },
  detailIconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  detailTextCol: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  actionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  monospaceText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
  },
  logoutBtn: {
    backgroundColor: COLORS.danger,
    height: 52,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: SPACING.sm,
    ...SHADOWS.md,
  },
  logoutBtnText: {
    color: COLORS.textWhite,
    fontSize: 15,
    fontWeight: '700',
  },
});
