import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme, useStyles, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TermsAndConditionsScreen() {
  const { colors } = useTheme();
  const styles = useStyles(getStyles);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 40, 60) }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header Banner */}
      <View style={styles.headerCard}>
        <View style={styles.headerIconBox}>
          <Ionicons name="document-text" size={28} color={colors.primary} />
        </View>
        <Text style={styles.headerTitle}>Rentora — Terms & Conditions</Text>
        <Text style={styles.updatedDate}>Last Updated: 25/09/2026</Text>
        <Text style={styles.introText}>
          These Terms & Conditions (“Terms”) govern your use of the Rentora Landlord App (“App”). By creating an
          account or using the App, you agree to these Terms.
        </Text>
        <Text style={[styles.introText, { marginTop: spacing.sm, fontWeight: typography.weights.semibold, color: colors.danger }]}>
          If you do not agree with these Terms, please do not use the App.
        </Text>
      </View>

      {/* Section 1 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>1. About Rentora</Text>
        <Text style={styles.paragraph}>
          Rentora is a property-management application designed to help landlords and property owners manage
          information such as:
        </Text>
        <Text style={styles.bulletItem}>• Properties</Text>
        <Text style={styles.bulletItem}>• Rooms/units</Text>
        <Text style={styles.bulletItem}>• Tenants</Text>
        <Text style={styles.bulletItem}>• Rent</Text>
        <Text style={styles.bulletItem}>• Utility charges</Text>
        <Text style={styles.bulletItem}>• Bills</Text>
        <Text style={styles.bulletItem}>• Payments</Text>
        <Text style={styles.bulletItem}>• Outstanding dues</Text>
        <Text style={styles.bulletItem}>• Property rules</Text>
        <Text style={styles.bulletItem}>• Reports and related records</Text>
        <Text style={[styles.paragraph, { marginTop: spacing.xs, fontWeight: typography.weights.medium }]}>
          Rentora is a management tool and does not replace your legal, financial, tax or professional
          obligations.
        </Text>
      </View>

      {/* Section 2 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>2. Account Registration</Text>
        <Text style={styles.paragraph}>
          You must provide accurate information when creating your account. You are responsible for:
        </Text>
        <Text style={styles.bulletItem}>• Maintaining the confidentiality of your account</Text>
        <Text style={styles.bulletItem}>• Keeping your login credentials secure</Text>
        <Text style={styles.bulletItem}>• Preventing unauthorized access</Text>
        <Text style={styles.bulletItem}>• Providing accurate information</Text>
        <Text style={[styles.paragraph, { marginTop: spacing.xs }]}>
          You must not knowingly create an account using false or misleading information.
        </Text>
      </View>

      {/* Section 3 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>3. Property and Tenant Information</Text>
        <Text style={styles.paragraph}>
          You are responsible for the information you enter into the App. This includes information relating to:
        </Text>
        <Text style={styles.bulletItem}>• Properties</Text>
        <Text style={styles.bulletItem}>• Tenants</Text>
        <Text style={styles.bulletItem}>• Rent</Text>
        <Text style={styles.bulletItem}>• Bills</Text>
        <Text style={styles.bulletItem}>• Meter readings</Text>
        <Text style={styles.bulletItem}>• Payments</Text>
        <Text style={styles.bulletItem}>• Outstanding amounts</Text>
        <Text style={styles.bulletItem}>• Property rules</Text>
        <Text style={[styles.paragraph, { marginTop: spacing.xs }]}>
          You should review important information before relying on it for billing, collection or record-keeping
          purposes.
        </Text>
      </View>

      {/* Section 4 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>4. Billing and Calculations</Text>
        <Text style={styles.paragraph}>
          Rentora may provide tools for calculating and generating bills based on information entered by the user.
          You remain responsible for verifying:
        </Text>
        <Text style={styles.bulletItem}>• Rent amounts</Text>
        <Text style={styles.bulletItem}>• Utility rates</Text>
        <Text style={styles.bulletItem}>• Meter readings</Text>
        <Text style={styles.bulletItem}>• Previous dues</Text>
        <Text style={styles.bulletItem}>• Payment amounts</Text>
        <Text style={styles.bulletItem}>• Due dates</Text>
        <Text style={styles.bulletItem}>• Discounts or adjustments</Text>
        <Text style={styles.bulletItem}>• Final outstanding amounts</Text>
        <Text style={[styles.paragraph, { marginTop: spacing.xs }]}>
          Rentora should not be considered responsible for errors caused by incorrect or incomplete information
          entered by the user.
        </Text>
      </View>

      {/* Section 5 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>5. Payment Verification</Text>
        <Text style={styles.paragraph}>
          Where tenants submit payment information, including transaction IDs or UTRs, the landlord is
          responsible for verifying the payment before marking it as approved.
        </Text>
        <Text style={styles.paragraph}>
          A payment submission does not automatically mean that payment has been received or verified.
        </Text>
        <Text style={styles.paragraph}>
          The landlord should independently verify the relevant transaction before confirming payment.
        </Text>
      </View>

      {/* Section 6 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>6. Partial Payments</Text>
        <Text style={styles.paragraph}>
          The App may support partial payments. The landlord is responsible for verifying the actual amount
          received and ensuring that the outstanding balance is accurate.
        </Text>
        <Text style={styles.paragraph}>Users should not intentionally enter false payment information.</Text>
      </View>

      {/* Section 7 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>7. Tenant Access</Text>
        <Text style={styles.paragraph}>
          Where a landlord connects a tenant to the App, the landlord is responsible for providing appropriate
          tenant information and managing access correctly.
        </Text>
        <Text style={styles.paragraph}>
          You should not provide access to a person who is not authorized to access the relevant tenant/property
          information.
        </Text>
      </View>

      {/* Section 8 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>8. Property Rules</Text>
        <Text style={styles.paragraph}>
          Landlords may create or manage property rules through the App. Landlords are responsible for ensuring that
          their property rules:
        </Text>
        <Text style={styles.bulletItem}>• Are lawful</Text>
        <Text style={styles.bulletItem}>• Are accurate</Text>
        <Text style={styles.bulletItem}>• Do not violate applicable rights</Text>
        <Text style={styles.bulletItem}>• Are appropriate for their property and tenants</Text>
        <Text style={[styles.paragraph, { marginTop: spacing.xs }]}>
          Rentora does not independently verify the legality or fairness of individual property rules entered by
          users.
        </Text>
      </View>

      {/* Section 9 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>9. Prohibited Use</Text>
        <Text style={styles.paragraph}>You must not use Rentora to:</Text>
        <Text style={styles.bulletItem}>• Commit or facilitate illegal activities</Text>
        <Text style={styles.bulletItem}>• Store knowingly false or fraudulent information</Text>
        <Text style={styles.bulletItem}>• Gain unauthorized access to another person's account</Text>
        <Text style={styles.bulletItem}>• Attempt to bypass security measures</Text>
        <Text style={styles.bulletItem}>• Abuse or disrupt the App</Text>
        <Text style={styles.bulletItem}>• Upload malicious software or harmful content</Text>
        <Text style={styles.bulletItem}>• Misuse another person's personal information</Text>
        <Text style={styles.bulletItem}>• Use the App for purposes prohibited by applicable law</Text>
      </View>

      {/* Section 10 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>10. User Responsibility</Text>
        <Text style={styles.paragraph}>
          You are responsible for maintaining accurate records and using the App appropriately.
        </Text>
        <Text style={styles.paragraph}>
          Rentora does not independently verify the accuracy of information entered by users.
        </Text>
        <Text style={styles.paragraph}>
          You should maintain appropriate backup or alternative records for important information.
        </Text>
      </View>

      {/* Section 11 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>11. Availability of the App</Text>
        <Text style={styles.paragraph}>
          We aim to keep Rentora available and functional, but we do not guarantee uninterrupted or error-free
          operation. The App may occasionally be unavailable because of:
        </Text>
        <Text style={styles.bulletItem}>• Maintenance</Text>
        <Text style={styles.bulletItem}>• Technical problems</Text>
        <Text style={styles.bulletItem}>• Security issues</Text>
        <Text style={styles.bulletItem}>• Network problems</Text>
        <Text style={styles.bulletItem}>• Device-related problems</Text>
        <Text style={styles.bulletItem}>• Third-party service interruptions</Text>
        <Text style={styles.bulletItem}>• Circumstances beyond our reasonable control</Text>
      </View>

      {/* Section 12 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>12. Account Suspension or Termination</Text>
        <Text style={styles.paragraph}>
          We may suspend or terminate access where reasonably necessary, including if:
        </Text>
        <Text style={styles.bulletItem}>• These Terms are violated</Text>
        <Text style={styles.bulletItem}>• The App is misused</Text>
        <Text style={styles.bulletItem}>• Fraudulent or unauthorized activity is suspected</Text>
        <Text style={styles.bulletItem}>• Required by law</Text>
        <Text style={styles.bulletItem}>• Continued access creates a security or operational risk</Text>
        <Text style={[styles.paragraph, { marginTop: spacing.xs }]}>
          You may also stop using the App at any time.
        </Text>
      </View>

      {/* Section 13 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>13. Intellectual Property</Text>
        <Text style={styles.paragraph}>
          The Rentora name, branding, logos, design, software, interface and related materials may be protected by
          applicable intellectual-property laws.
        </Text>
        <Text style={styles.paragraph}>
          You may not copy, reproduce, modify, distribute, sell or commercially exploit Rentora's proprietary
          materials without appropriate authorization.
        </Text>
      </View>

      {/* Section 14 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>14. Limitation of Liability</Text>
        <Text style={styles.paragraph}>
          To the extent permitted by applicable law, Rentora shall not be responsible for losses arising from:
        </Text>
        <Text style={styles.bulletItem}>• Incorrect information entered by users</Text>
        <Text style={styles.bulletItem}>• Incorrect meter readings</Text>
        <Text style={styles.bulletItem}>• Incorrect rent or billing information</Text>
        <Text style={styles.bulletItem}>• Incorrect payment information</Text>
        <Text style={styles.bulletItem}>
          • Unauthorized use of an account caused by failure to protect credentials
        </Text>
        <Text style={styles.bulletItem}>• Internet or network failures</Text>
        <Text style={styles.bulletItem}>• Device failures</Text>
        <Text style={styles.bulletItem}>• Third-party service interruptions</Text>
        <Text style={styles.bulletItem}>• Events beyond our reasonable control</Text>
        <Text style={[styles.paragraph, { marginTop: spacing.xs, fontWeight: typography.weights.semibold }]}>
          Nothing in these Terms excludes liability that cannot legally be excluded under applicable law.
        </Text>
      </View>

      {/* Section 15 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>15. No Professional Advice</Text>
        <Text style={styles.paragraph}>
          Rentora is a software tool for property management. Information or calculations provided through the App
          should not be treated as legal, tax, accounting or financial advice.
        </Text>
        <Text style={styles.paragraph}>Users should obtain professional advice where required.</Text>
      </View>

      {/* Section 16 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>16. Changes to These Terms</Text>
        <Text style={styles.paragraph}>
          We may update these Terms from time to time. Updated Terms may be displayed within the App.
        </Text>
        <Text style={styles.paragraph}>
          Continued use of the App after the updated Terms become effective means that you accept the updated Terms.
        </Text>
      </View>

      {/* Section 17 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>17. Governing Law</Text>
        <Text style={styles.paragraph}>
          These Terms shall be governed by the applicable laws of India. Any disputes shall be subject to the
          jurisdiction of the appropriate courts, subject to applicable law.
        </Text>
      </View>

      {/* Section 18 */}
      <View style={[styles.sectionCard, styles.contactCard]}>
        <Text style={styles.sectionHeading}>18. Contact Us</Text>
        <Text style={styles.paragraph}>For questions regarding these Terms, contact:</Text>
        <View style={styles.contactInfoRow}>
          <Text style={styles.contactLabel}>Email:</Text>
          <Text style={styles.contactValue}>gotoptechnology26@gmail.com</Text>
        </View>
        <View style={styles.contactInfoRow}>
          <Text style={styles.contactLabel}>App:</Text>
          <Text style={styles.contactValue}>Rentora</Text>
        </View>
        <View style={styles.contactInfoRow}>
          <Text style={styles.contactLabel}>Company / Owner:</Text>
          <Text style={styles.contactValue}>Deepak Rathore</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: spacing.md,
    },
    headerCard: {
      backgroundColor: colors.surface,
      borderRadius: spacing.borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'flex-start',
      ...spacing.shadows.light,
    },
    headerIconBox: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    headerTitle: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold,
      color: colors.text,
      marginBottom: 2,
    },
    updatedDate: {
      fontSize: typography.sizes.xs,
      color: colors.textSecondary,
      marginBottom: spacing.md,
      fontWeight: typography.weights.medium,
    },
    introText: {
      fontSize: typography.sizes.sm,
      color: colors.text,
      lineHeight: 21,
    },
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: spacing.borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...spacing.shadows.light,
    },
    sectionHeading: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.bold,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    paragraph: {
      fontSize: typography.sizes.sm,
      color: colors.text,
      lineHeight: 21,
      marginBottom: spacing.xs,
    },
    bulletItem: {
      fontSize: typography.sizes.sm,
      color: colors.text,
      lineHeight: 22,
      paddingLeft: spacing.xs,
      marginBottom: 2,
    },
    contactCard: {
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    contactInfoRow: {
      flexDirection: 'row',
      marginTop: spacing.xs + 2,
      alignItems: 'center',
    },
    contactLabel: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.bold,
      color: colors.text,
      width: 140,
    },
    contactValue: {
      fontSize: typography.sizes.sm,
      color: colors.primary,
      fontWeight: typography.weights.semibold,
      flex: 1,
    },
  });
