import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

interface HelpTopic {
  id: string;
  title: string;
  category: string;
  icon: string;
  content: string;
}

const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'bills-1',
    category: 'Bills',
    title: 'Where do I find my rent bills?',
    icon: 'file-document-outline',
    content:
      'Your latest active bill is prominently displayed on your Home Dashboard. To view your full statement history, tap the "My Bills" tab at the bottom of the screen. You can filter by All, Pending/Due, or Paid statements.',
  },
  {
    id: 'bills-2',
    category: 'Bills',
    title: 'How does Previous Due / Arrears work?',
    icon: 'calculator-variant-outline',
    content:
      'If a previous statement was not fully paid by the new billing cycle, any remaining unpaid amount is automatically added as "Previous Due" to your new statement total. Your total payable amount equals (Current Month Charges + Previous Due).',
  },
  {
    id: 'bills-3',
    category: 'Bills',
    title: 'How are Electricity and Water calculated?',
    icon: 'flash-outline',
    content:
      'Electricity and water charges follow the configuration set by your landlord (Fixed Rate, Per Unit Reading, or Included in Rent). In per-unit billing, total units consumed (Current Reading minus Previous Reading) are multiplied by your landlord rate per unit.',
  },
  {
    id: 'payments-1',
    category: 'Payments',
    title: 'How do I pay my bill using UPI or QR code?',
    icon: 'qrcode-scan',
    content:
      'Open the Bill Details screen and tap "Pay Bill". Choose "Pay via Installed UPI App" to open GPay, PhonePe, Paytm, or BHIM directly, or choose "Pay via Landlord QR Code" to scan the landlord QR using your UPI app camera.',
  },
  {
    id: 'payments-2',
    category: 'Payments',
    title: 'Where do I enter the Transaction ID / UTR?',
    icon: 'numeric',
    content:
      'After completing payment in your UPI app, return to the Rentora Tenant App. Enter the 12-digit UTR or Transaction ID from your payment receipt into the "Transaction ID / UTR" field and tap "Submit Payment".',
  },
  {
    id: 'payments-3',
    category: 'Payments',
    title: 'Understanding Payment Verification Statuses',
    icon: 'shield-check-outline',
    content:
      '• PENDING VERIFICATION 🟡: Your UTR submission was received and is awaiting landlord review.\n\n• APPROVED 🟢: Your landlord verified the payment and your bill balance has been credited.\n\n• PARTIALLY PAID 🟠: A verified payment was applied, but some balance remains due.\n\n• PAID 🟢: Your statement balance is completely cleared (₹0 remaining).\n\n• REJECTED 🔴: Your submitted UTR could not be verified by the landlord. Check the rejection reason or re-submit.',
  },
  {
    id: 'account-1',
    category: 'Account',
    title: 'How do I change my account password?',
    icon: 'key-outline',
    content:
      'Go to Profile or Settings and tap "Change Password". Enter your current password for security re-authentication, followed by your new permanent password (minimum 6 characters).',
  },
  {
    id: 'account-2',
    category: 'Account',
    title: 'What happens if my account status becomes disabled?',
    icon: 'account-cancel-outline',
    content:
      'If your landlord vacates or disables your tenant access, the app will block protected tenant data displays and prompt you to contact your landlord. Your historical bill records remain safely stored in the system.',
  },
];

export default function HelpAndSupportScreen() {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>('payments-3');

  const toggleTopic = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <AppSafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.iconBackBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topHeaderTitle}>Help & Support</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Banner Card */}
        <View style={styles.bannerCard}>
          <View style={styles.bannerIconBox}>
            <MaterialCommunityIcons name="help-circle" size={36} color={COLORS.primary} />
          </View>
          <Text style={styles.bannerTitle}>How can we help you?</Text>
          <Text style={styles.bannerSubtitle}>
            Find quick answers about bills, UPI payments, UTR submissions, and account security.
          </Text>
        </View>

        {/* Categories / Accordion Topics */}
        {['Bills', 'Payments', 'Account'].map((cat) => (
          <View key={cat} style={styles.sectionCard}>
            <Text style={styles.sectionHeaderTitle}>{cat} Assistance</Text>

            {HELP_TOPICS.filter((t) => t.category === cat).map((topic) => {
              const isExpanded = expandedId === topic.id;
              return (
                <View key={topic.id} style={styles.topicWrapper}>
                  <TouchableOpacity
                    style={styles.topicHeaderRow}
                    onPress={() => toggleTopic(topic.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.topicIconBox}>
                      <MaterialCommunityIcons name={topic.icon as any} size={20} color={COLORS.primary} />
                    </View>
                    <Text style={styles.topicTitle}>{topic.title}</Text>
                    <MaterialCommunityIcons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={22}
                      color={COLORS.textSecondary}
                    />
                  </TouchableOpacity>

                  {isExpanded ? (
                    <View style={styles.topicContentBox}>
                      <Text style={styles.topicContentText}>{topic.content}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}

        {/* Contact Landlord Link Banner */}
        <TouchableOpacity
          style={styles.contactBanner}
          onPress={() => router.push('/settings/contact-landlord')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="phone-outline" size={24} color={COLORS.textWhite} />
          <View style={{ flex: 1 }}>
            <Text style={styles.contactBannerTitle}>Still need assistance?</Text>
            <Text style={styles.contactBannerSub}>Contact your landlord directly for personal support</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textWhite} />
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
  bannerCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  bannerIconBox: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  bannerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  bannerSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
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
    marginBottom: SPACING.sm,
  },
  topicWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingVertical: 4,
  },
  topicHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  topicIconBox: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topicTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  topicContentBox: {
    backgroundColor: COLORS.bgLight,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    marginLeft: 46,
  },
  topicContentText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  contactBanner: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: SPACING.xs,
    ...SHADOWS.md,
  },
  contactBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textWhite,
  },
  contactBannerSub: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
});
