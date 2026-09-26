import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { AppSafeAreaView } from '../../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { tenantDataService } from '../../services/tenantDataService';
import { BillSettings, Property } from '../../types';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function ContactLandlordScreen() {
  const { userProfile } = useAuth();
  const router = useRouter();

  const [settings, setSettings] = useState<BillSettings | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const loadDetails = async () => {
      if (userProfile?.ownerId) {
        const s = await tenantDataService.fetchLandlordSettings(userProfile.ownerId);
        if (isMounted) setSettings(s);
      }
      if (userProfile?.propertyId) {
        const p = await tenantDataService.fetchPropertyDetails(userProfile.propertyId);
        if (isMounted) setProperty(p);
      }
      if (isMounted) setIsLoading(false);
    };

    loadDetails();

    return () => {
      isMounted = false;
    };
  }, [userProfile?.ownerId, userProfile?.propertyId]);

  const ownerName = settings?.ownerName || settings?.businessName || property?.name || 'Property Landlord';
  const phone = settings?.phone || '';
  const cleanPhone = phone.replace(/[^0-9+]/g, '');

  const handleCall = () => {
    if (!cleanPhone) {
      alert('Landlord phone number is not available.');
      return;
    }
    Linking.openURL(`tel:${cleanPhone}`).catch(() => alert('Could not initiate phone call.'));
  };

  const handleWhatsApp = () => {
    if (!cleanPhone) {
      alert('Landlord phone number is not available.');
      return;
    }
    const cleanNum = cleanPhone.replace(/[^0-9]/g, '');
    const waUrl = `whatsapp://send?phone=${cleanNum}&text=${encodeURIComponent(
      `Hello ${ownerName}, I am contacting you regarding my rental unit.`
    )}`;
    Linking.openURL(waUrl).catch(() => {
      // Fallback to SMS if WhatsApp fails
      Linking.openURL(`sms:${cleanPhone}`).catch(() => alert('Could not open messaging app.'));
    });
  };

  if (isLoading) {
    return (
      <AppSafeAreaView style={styles.centerSafeArea}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Fetching landlord contact details...</Text>
      </AppSafeAreaView>
    );
  }

  return (
    <AppSafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.iconBackBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topHeaderTitle}>Contact Landlord</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Landlord Card Header */}
        <View style={styles.landlordCard}>
          <View style={styles.avatarBig}>
            <MaterialCommunityIcons name="office-building" size={40} color={COLORS.primary} />
          </View>
          <Text style={styles.landlordName}>{ownerName}</Text>
          {settings?.businessName && settings.businessName !== ownerName ? (
            <Text style={styles.businessSub}>{settings.businessName}</Text>
          ) : null}
          <Text style={styles.propertySub}>{property?.name || 'Assigned Property'}</Text>
        </View>

        {phone ? (
          /* Direct Contact Actions */
          <View style={styles.actionsSection}>
            <Text style={styles.sectionHeaderTitle}>Direct Contact Actions</Text>

            <TouchableOpacity style={styles.actionBtnCall} onPress={handleCall} activeOpacity={0.8}>
              <View style={styles.actionBtnIconBox}>
                <MaterialCommunityIcons name="phone" size={24} color={COLORS.textWhite} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionBtnTitle}>Call Landlord</Text>
                <Text style={styles.actionBtnSubtitle}>{phone}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textWhite} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtnWhatsApp} onPress={handleWhatsApp} activeOpacity={0.8}>
              <View style={[styles.actionBtnIconBox, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
                <MaterialCommunityIcons name="whatsapp" size={24} color={COLORS.textWhite} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionBtnTitle}>Message via WhatsApp / SMS</Text>
                <Text style={styles.actionBtnSubtitle}>Send text message to landlord</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textWhite} />
            </TouchableOpacity>
          </View>
        ) : (
          /* Missing Contact Info Warning */
          <View style={styles.missingCard}>
            <MaterialCommunityIcons name="phone-off-outline" size={36} color={COLORS.warning} />
            <Text style={styles.missingTitle}>Landlord contact information is not available.</Text>
            <Text style={styles.missingSubtitle}>
              Your landlord has not configured a direct contact phone number in their settings.
            </Text>
          </View>
        )}

        {/* Landlord Address & Instructions Card */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeaderTitle}>Landlord Information & Instructions</Text>

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <MaterialCommunityIcons name="map-marker-outline" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>Property Address</Text>
              <Text style={styles.infoValue}>{settings?.address || property?.address || 'Not specified'}</Text>
            </View>
          </View>

          {settings?.paymentInstructions ? (
            <View style={styles.infoRow}>
              <View style={styles.infoIconBox}>
                <MaterialCommunityIcons name="note-text-outline" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.infoTextCol}>
                <Text style={styles.infoLabel}>Landlord Payment Instructions</Text>
                <Text style={styles.infoValue}>{settings.paymentInstructions}</Text>
              </View>
            </View>
          ) : null}
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
  centerSafeArea: {
    flex: 1,
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 14,
    color: COLORS.textSecondary,
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
  landlordCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  avatarBig: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  landlordName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  businessSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  propertySub: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 4,
  },
  actionsSection: {
    marginBottom: SPACING.md,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  actionBtnCall: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    gap: 12,
    ...SHADOWS.md,
  },
  actionBtnWhatsApp: {
    backgroundColor: '#25D366',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    gap: 12,
    ...SHADOWS.md,
  },
  actionBtnIconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textWhite,
  },
  actionBtnSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  missingCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  missingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginTop: SPACING.sm,
    marginBottom: 4,
  },
  missingSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  infoIconBox: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  infoTextCol: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 2,
    lineHeight: 18,
  },
});
