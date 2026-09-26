import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme, useStyles, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PrivacyPolicyScreen() {
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
          <Ionicons name="shield-checkmark" size={28} color={colors.primary} />
        </View>
        <Text style={styles.headerTitle}>Rentora — Privacy Policy</Text>
        <Text style={styles.updatedDate}>Last Updated: 25/09/2026</Text>
        <Text style={styles.introText}>
          Rentora (“we”, “us”, “our” or “Rentora”) respects your privacy and is committed to protecting the
          information you provide while using the Rentora Landlord App (“App”). This Privacy Policy explains what
          information we may collect, how we use it, how we protect it, and what choices you have regarding your
          information.
        </Text>
        <Text style={[styles.introText, { marginTop: spacing.sm, fontWeight: typography.weights.semibold }]}>
          By using the App, you agree to the practices described in this Privacy Policy.
        </Text>
      </View>

      {/* Section 1 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>1. Information We Collect</Text>
        <Text style={styles.paragraph}>
          Depending on how you use the App, we may collect or allow you to provide the following information:
        </Text>

        <Text style={styles.subHeading}>Account Information</Text>
        <Text style={styles.bulletItem}>• Name</Text>
        <Text style={styles.bulletItem}>• Mobile number</Text>
        <Text style={styles.bulletItem}>• Email address, where applicable</Text>
        <Text style={styles.bulletItem}>• Account and login-related information</Text>

        <Text style={styles.subHeading}>Property Information</Text>
        <Text style={styles.bulletItem}>• Property name</Text>
        <Text style={styles.bulletItem}>• Property address</Text>
        <Text style={styles.bulletItem}>• Property type</Text>
        <Text style={styles.bulletItem}>• Number of units/rooms</Text>
        <Text style={styles.bulletItem}>• Rent information</Text>
        <Text style={styles.bulletItem}>• Electricity, water and other applicable charges</Text>
        <Text style={styles.bulletItem}>• Property rules and related information</Text>

        <Text style={styles.subHeading}>Tenant Information</Text>
        <Text style={styles.paragraph}>
          The landlord may enter information about tenants, such as:
        </Text>
        <Text style={styles.bulletItem}>• Tenant name</Text>
        <Text style={styles.bulletItem}>• Mobile number</Text>
        <Text style={styles.bulletItem}>• Identification details provided by the landlord</Text>
        <Text style={styles.bulletItem}>• Room/unit information</Text>
        <Text style={styles.bulletItem}>• Move-in and move-out information</Text>
        <Text style={styles.bulletItem}>• Rent and billing information</Text>
        <Text style={styles.bulletItem}>• Meter readings</Text>
        <Text style={styles.bulletItem}>• Payment-related information</Text>

        <Text style={styles.subHeading}>Billing and Payment Information</Text>
        <Text style={styles.paragraph}>The App may process information related to:</Text>
        <Text style={styles.bulletItem}>• Rent bills</Text>
        <Text style={styles.bulletItem}>• Electricity/water charges</Text>
        <Text style={styles.bulletItem}>• Previous dues</Text>
        <Text style={styles.bulletItem}>• Payments and partial payments</Text>
        <Text style={styles.bulletItem}>• Transaction IDs/UTRs submitted for payment verification</Text>
        <Text style={styles.bulletItem}>• Payment status</Text>
        <Text style={styles.bulletItem}>• Due dates and outstanding amounts</Text>

        <Text style={styles.subHeading}>Uploaded Information</Text>
        <Text style={styles.paragraph}>If you choose to upload information such as:</Text>
        <Text style={styles.bulletItem}>• Property/business logo</Text>
        <Text style={styles.bulletItem}>• Signature</Text>
        <Text style={styles.bulletItem}>• Documents</Text>
        <Text style={styles.bulletItem}>• Images</Text>
        <Text style={styles.bulletItem}>• Other information supported by the App</Text>
        <Text style={[styles.paragraph, { marginTop: spacing.xs }]}>
          we may process that information to provide the related App functionality.
        </Text>
      </View>

      {/* Section 2 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>2. How We Use Your Information</Text>
        <Text style={styles.paragraph}>We may use the information provided through the App to:</Text>
        <Text style={styles.bulletItem}>• Create and manage your account</Text>
        <Text style={styles.bulletItem}>• Manage properties and units</Text>
        <Text style={styles.bulletItem}>• Manage tenant information</Text>
        <Text style={styles.bulletItem}>• Generate rent and utility bills</Text>
        <Text style={styles.bulletItem}>• Track payments and outstanding amounts</Text>
        <Text style={styles.bulletItem}>• Generate reports and billing documents</Text>
        <Text style={styles.bulletItem}>• Provide payment-related functionality</Text>
        <Text style={styles.bulletItem}>• Display property rules to connected tenants</Text>
        <Text style={styles.bulletItem}>• Maintain account and property records</Text>
        <Text style={styles.bulletItem}>• Improve App functionality and reliability</Text>
        <Text style={styles.bulletItem}>• Protect the App against unauthorized or fraudulent activity</Text>
        <Text style={styles.bulletItem}>• Provide customer support when required</Text>
        <Text style={styles.bulletItem}>• Comply with applicable legal obligations</Text>
      </View>

      {/* Section 3 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>3. Tenant Information</Text>
        <Text style={styles.paragraph}>
          The Rentora Landlord App allows landlords to enter and manage information relating to their tenants.
        </Text>
        <Text style={styles.paragraph}>
          If you enter another person's information into the App, you are responsible for ensuring that you have
          the necessary permission or lawful basis to collect and use that information.
        </Text>
        <Text style={styles.paragraph}>
          Landlords should only provide information that is necessary for legitimate property-management purposes.
        </Text>
      </View>

      {/* Section 4 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>4. How We Share Information</Text>
        <Text style={[styles.paragraph, { fontWeight: typography.weights.bold, color: colors.primary }]}>
          We do not sell your personal information or tenant information for money.
        </Text>
        <Text style={styles.paragraph}>Information may be processed or shared where reasonably necessary to:</Text>
        <Text style={styles.bulletItem}>• Provide App functionality</Text>
        <Text style={styles.bulletItem}>• Maintain and secure the App</Text>
        <Text style={styles.bulletItem}>• Process data required for services requested by you</Text>
        <Text style={styles.bulletItem}>• Comply with applicable laws or legal requests</Text>
        <Text style={styles.bulletItem}>• Protect the rights, safety and security of Rentora, its users or others</Text>
        <Text style={[styles.paragraph, { marginTop: spacing.sm }]}>
          We do not permit information to be used for purposes unrelated to the App's legitimate functionality
          without an appropriate basis.
        </Text>
      </View>

      {/* Section 5 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>5. Data Security</Text>
        <Text style={styles.paragraph}>
          We take reasonable technical and organizational measures to protect information from unauthorized
          access, alteration, disclosure or destruction.
        </Text>
        <Text style={styles.paragraph}>
          However, no online service can guarantee absolute security. You are also responsible for protecting your
          account credentials and keeping your device secure.
        </Text>
      </View>

      {/* Section 6 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>6. Account and Password Security</Text>
        <Text style={styles.paragraph}>You are responsible for:</Text>
        <Text style={styles.bulletItem}>• Keeping your login credentials confidential</Text>
        <Text style={styles.bulletItem}>• Not sharing your account unnecessarily</Text>
        <Text style={styles.bulletItem}>• Using a secure password</Text>
        <Text style={styles.bulletItem}>
          • Informing us if you believe your account has been accessed without authorization
        </Text>
        <Text style={[styles.paragraph, { marginTop: spacing.xs }]}>
          You should log out or secure your device when necessary.
        </Text>
      </View>

      {/* Section 7 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>7. Data Retention</Text>
        <Text style={styles.paragraph}>
          We may retain information for as long as reasonably necessary to provide the App's services, maintain
          records, resolve disputes, comply with legal obligations, and protect legitimate interests.
        </Text>
        <Text style={styles.paragraph}>
          When information is no longer reasonably required, it may be deleted or anonymized, subject to applicable
          legal and operational requirements.
        </Text>
      </View>

      {/* Section 8 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>8. Data Deletion</Text>
        <Text style={styles.paragraph}>
          You may request deletion of your account and associated information, subject to applicable legal
          requirements and legitimate record-retention needs.
        </Text>
        <Text style={styles.paragraph}>
          Certain information may need to be retained where required by law or reasonably necessary for legitimate
          business, security or dispute-resolution purposes.
        </Text>
      </View>

      {/* Section 9 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>9. Third-Party Services</Text>
        <Text style={styles.paragraph}>
          The App may rely on external service providers or technology partners to provide certain technical,
          storage, authentication, communication or other functionality.
        </Text>
        <Text style={styles.paragraph}>
          Such providers may process information only as necessary to provide their services or as otherwise
          permitted by applicable law.
        </Text>
      </View>

      {/* Section 10 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>10. Children's Privacy</Text>
        <Text style={styles.paragraph}>
          Rentora is intended for property owners, landlords and other adult users.
        </Text>
        <Text style={styles.paragraph}>
          We do not knowingly design the App to collect personal information directly from children.
        </Text>
      </View>

      {/* Section 11 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>11. Changes to This Privacy Policy</Text>
        <Text style={styles.paragraph}>We may update this Privacy Policy from time to time.</Text>
        <Text style={styles.paragraph}>
          When changes are made, the updated version will be made available through the App or another
          appropriate method.
        </Text>
        <Text style={styles.paragraph}>
          Your continued use of the App after an update means that you acknowledge the updated Privacy Policy.
        </Text>
      </View>

      {/* Section 12 */}
      <View style={[styles.sectionCard, styles.contactCard]}>
        <Text style={styles.sectionHeading}>12. Contact Us</Text>
        <Text style={styles.paragraph}>
          If you have questions, concerns, or requests regarding this Privacy Policy or your personal information,
          you may contact us at:
        </Text>
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
    subHeading: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.bold,
      color: colors.primary,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
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
