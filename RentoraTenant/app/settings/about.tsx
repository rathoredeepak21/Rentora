import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function AboutScreen() {
  const router = useRouter();
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  return (
    <AppSafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.iconBackBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topHeaderTitle}>About & Privacy</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* App Identity Banner */}
        <View style={styles.identityCard}>
          <View style={styles.appLogoBox}>
            <MaterialCommunityIcons name="home-city" size={44} color={COLORS.primary} />
          </View>
          <Text style={styles.appName}>Rentora Tenant</Text>
          <Text style={styles.appVersionText}>Version {appVersion}</Text>
          <Text style={styles.appDescription}>
            The official tenant management and billing portal for Rentora properties. Designed for seamless statement tracking, instant UPI payments, and real-time landlord verification.
          </Text>
        </View>

        {/* Privacy & Data Information Card */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeaderTitle}>Privacy & Security Information</Text>

          <View style={styles.infoBlock}>
            <View style={styles.infoTitleRow}>
              <MaterialCommunityIcons name="shield-lock-outline" size={20} color={COLORS.primary} />
              <Text style={styles.blockTitle}>Secure Firebase Authentication</Text>
            </View>
            <Text style={styles.blockBody}>
              Your account identity is secured via Firebase Authentication. Permanent passwords are encrypted by Firebase Auth APIs and are never stored in Firestore documents or local device storage.
            </Text>
          </View>

          <View style={styles.infoBlock}>
            <View style={styles.infoTitleRow}>
              <MaterialCommunityIcons name="database-eye-outline" size={20} color={COLORS.primary} />
            </View>
            <Text style={styles.blockTitle}>Restricted Data Authorization</Text>
            <Text style={styles.blockBody}>
              Firestore security rules strictly isolate tenant data. You can only read bills, payment submissions, and housing details explicitly authorized for your authenticated account UID and Tenant ID.
            </Text>
          </View>

          <View style={styles.infoBlock}>
            <View style={styles.infoTitleRow}>
              <MaterialCommunityIcons name="check-decagram-outline" size={20} color={COLORS.primary} />
            </View>
            <Text style={styles.blockTitle}>Server-Side Verification Trust</Text>
            <Text style={styles.blockBody}>
              Opening a UPI payment app or submitting a UTR reference creates a pending payment record. Final payment approval and statement balance allocation are managed exclusively by your landlord through the Landlord App.
            </Text>
          </View>

          <View style={styles.infoBlock}>
            <View style={styles.infoTitleRow}>
              <MaterialCommunityIcons name="bell-ring-outline" size={20} color={COLORS.primary} />
            </View>
            <Text style={styles.blockTitle}>Notification Rights & Control</Text>
            <Text style={styles.blockBody}>
              You have full control over your push notification preferences in Settings. Disabling push notification alerts will never affect your access to statements, receipts, or account features.
            </Text>
          </View>
        </View>

        {/* Copyright Footer */}
        <View style={styles.footerBox}>
          <Text style={styles.copyrightText}>© 2026 Rentora Tenant Management Platform</Text>
          <Text style={styles.rightsText}>All Rights Reserved.</Text>
        </View>
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
  identityCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  appLogoBox: {
    width: 76,
    height: 76,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  appVersionText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  appDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
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
  infoBlock: {
    marginBottom: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  infoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  blockTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  blockBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  footerBox: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  copyrightText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  rightsText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
