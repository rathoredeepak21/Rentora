import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../../context/AuthContext';
import { tenantDataService } from '../../services/tenantDataService';
import { NotificationPreferences } from '../../types';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function SettingsMainScreen() {
  const { userProfile, user, logout } = useAuth();
  const router = useRouter();

  const [prefs, setPrefs] = useState<NotificationPreferences>({
    enabled: true,
    billNotifications: true,
    paymentNotifications: true,
    reminderNotifications: true,
  });

  useEffect(() => {
    if (userProfile?.notificationPreferences) {
      setPrefs(userProfile.notificationPreferences);
    }
  }, [userProfile?.notificationPreferences]);

  const handleTogglePref = async (key: keyof NotificationPreferences, value: boolean) => {
    const updated = { ...prefs, [key]: value };
    if (key === 'enabled' && !value) {
      updated.billNotifications = false;
      updated.paymentNotifications = false;
      updated.reminderNotifications = false;
    } else if (key === 'enabled' && value) {
      updated.billNotifications = true;
      updated.paymentNotifications = true;
      updated.reminderNotifications = true;
    }
    setPrefs(updated);

    if (user?.uid) {
      try {
        await tenantDataService.updateNotificationPreferences(user.uid, updated, userProfile?.tenantId);
      } catch (e) {
        console.warn('Could not save notification preferences:', e);
      }
    }
  };

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

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  return (
    <AppSafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.iconBackBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topHeaderTitle}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Section 1: Account */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeaderTitle}>Account</Text>

          {/* Account Status Badge */}
          <View style={styles.itemRow}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="shield-check-outline" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemLabel}>Account Status</Text>
              <Text style={styles.itemSubLabel}>Managed by Landlord</Text>
            </View>
            {userProfile?.loginStatus === 'disabled' ? (
              <View style={[styles.statusBadge, styles.statusBadgeDisabled]}>
                <View style={[styles.statusDot, { backgroundColor: COLORS.danger }]} />
                <Text style={[styles.statusText, { color: COLORS.danger }]}>Access Disabled</Text>
              </View>
            ) : (
              <View style={[styles.statusBadge, styles.statusBadgeActive]}>
                <View style={[styles.statusDot, { backgroundColor: COLORS.success }]} />
                <Text style={[styles.statusText, { color: COLORS.success }]}>Active</Text>
              </View>
            )}
          </View>

          {/* My Profile */}
          <TouchableOpacity
            style={styles.itemRowLink}
            onPress={() => router.push('/(tabs)/profile')}
            activeOpacity={0.7}
          >
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="account-outline" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>My Profile</Text>
              <Text style={styles.itemSubLabel}>View tenant details and housing info</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>

          {/* Appearance (Theme) */}
          <TouchableOpacity
            style={styles.itemRowLink}
            onPress={() => router.push('/settings/appearance')}
            activeOpacity={0.7}
          >
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="palette-outline" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Appearance (Theme)</Text>
              <Text style={styles.itemSubLabel}>Light, Dark, or System Default</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>

          {/* Change Password */}
          <TouchableOpacity
            style={styles.itemRowLink}
            onPress={() => router.push('/profile/change-password')}
            activeOpacity={0.7}
          >
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="key-outline" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Change Password</Text>
              <Text style={styles.itemSubLabel}>Update account credentials securely</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Section 2: Notifications */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeaderTitle}>Notification Preferences</Text>

          {/* Master Notifications Switch */}
          <View style={styles.itemRowSwitch}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="bell-outline" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Notifications</Text>
              <Text style={styles.itemSubLabel}>Master notification toggle</Text>
            </View>
            <Switch
              value={prefs.enabled}
              onValueChange={(val: boolean) => handleTogglePref('enabled', val)}
              trackColor={{ false: COLORS.borderLight, true: COLORS.primaryLight }}
              thumbColor={prefs.enabled ? COLORS.primary : COLORS.bgCard}
            />
          </View>

          {/* Bill Notifications Switch */}
          <View style={[styles.itemRowSwitch, !prefs.enabled && styles.disabledRow]}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="file-document-outline" size={20} color={COLORS.textSecondary} />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Bill Notifications</Text>
              <Text style={styles.itemSubLabel}>New bill generation alerts</Text>
            </View>
            <Switch
              value={prefs.enabled && prefs.billNotifications}
              onValueChange={(val: boolean) => handleTogglePref('billNotifications', val)}
              disabled={!prefs.enabled}
              trackColor={{ false: COLORS.borderLight, true: COLORS.primaryLight }}
              thumbColor={prefs.enabled && prefs.billNotifications ? COLORS.primary : COLORS.bgCard}
            />
          </View>

          {/* Payment Notifications Switch */}
          <View style={[styles.itemRowSwitch, !prefs.enabled && styles.disabledRow]}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="check-circle-outline" size={20} color={COLORS.textSecondary} />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Payment Notifications</Text>
              <Text style={styles.itemSubLabel}>Landlord verification & status updates</Text>
            </View>
            <Switch
              value={prefs.enabled && prefs.paymentNotifications}
              onValueChange={(val: boolean) => handleTogglePref('paymentNotifications', val)}
              disabled={!prefs.enabled}
              trackColor={{ false: COLORS.borderLight, true: COLORS.primaryLight }}
              thumbColor={prefs.enabled && prefs.paymentNotifications ? COLORS.primary : COLORS.bgCard}
            />
          </View>

          {/* Due Reminder Notifications Switch */}
          <View style={[styles.itemRowSwitch, !prefs.enabled && styles.disabledRow]}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.textSecondary} />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Due Reminders</Text>
              <Text style={styles.itemSubLabel}>Upcoming bill due date reminders</Text>
            </View>
            <Switch
              value={prefs.enabled && prefs.reminderNotifications}
              onValueChange={(val: boolean) => handleTogglePref('reminderNotifications', val)}
              disabled={!prefs.enabled}
              trackColor={{ false: COLORS.borderLight, true: COLORS.primaryLight }}
              thumbColor={prefs.enabled && prefs.reminderNotifications ? COLORS.primary : COLORS.bgCard}
            />
          </View>
        </View>

        {/* Section 3: Support */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeaderTitle}>Support</Text>

          {/* Help & Support */}
          <TouchableOpacity
            style={styles.itemRowLink}
            onPress={() => router.push('/settings/help')}
            activeOpacity={0.7}
          >
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="help-circle-outline" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Help & Support</Text>
              <Text style={styles.itemSubLabel}>Billing & payment guidance center</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>

          {/* Contact Landlord */}
          <TouchableOpacity
            style={styles.itemRowLink}
            onPress={() => router.push('/settings/contact-landlord')}
            activeOpacity={0.7}
          >
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="phone-outline" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Contact Landlord</Text>
              <Text style={styles.itemSubLabel}>Call, message, or email landlord</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Section 4: About */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeaderTitle}>About</Text>

          {/* App Version Display */}
          <TouchableOpacity
            style={styles.itemRowLink}
            onPress={() => router.push('/settings/about')}
            activeOpacity={0.7}
          >
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="information-outline" size={20} color={COLORS.textSecondary} />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>App Version</Text>
              <Text style={styles.itemSubLabel}>v{appVersion}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>

          {/* About Rentora & Privacy */}
          <TouchableOpacity
            style={styles.itemRowLink}
            onPress={() => router.push('/settings/about')}
            activeOpacity={0.7}
          >
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="shield-lock-outline" size={20} color={COLORS.textSecondary} />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Privacy & Data Information</Text>
              <Text style={styles.itemSubLabel}>Data protection & verification policy</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleConfirmLogout} activeOpacity={0.8}>
          <MaterialCommunityIcons name="logout" size={20} color={COLORS.textWhite} />
          <Text style={styles.logoutBtnText}>Log Out from Settings</Text>
        </TouchableOpacity>
      </ScrollView>
    </AppSafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bgLight,
  },
  topHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  iconBackBtn: {
    padding: 6,
  },
  topHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  container: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  sectionCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  itemRowLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  itemRowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  disabledRow: {
    opacity: 0.5,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  itemTextCol: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  itemLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  itemSubLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 6,
  },
  statusBadgeActive: {
    backgroundColor: COLORS.successBg,
  },
  statusBadgeDisabled: {
    backgroundColor: COLORS.dangerBg,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
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
