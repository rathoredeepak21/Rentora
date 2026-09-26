import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Linking,
  Share,
} from 'react-native';
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { tenantDataService } from '../../services/tenantDataService';
import { TenantDocument, DocumentCategory } from '../../types';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function DocumentViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userProfile } = useAuth();

  const [document, setDocument] = useState<TenantDocument | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setErrorMsg('Document ID not specified.');
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const fetchDoc = async () => {
      try {
        const docData = await tenantDataService.fetchDocumentDetails(id as string);
        if (!docData) {
          if (isMounted) setErrorMsg('This document is no longer available.');
          return;
        }

        // Security Authorization Check: Tenant or Property match
        const isTenantAuth = userProfile && docData.tenantId === userProfile.tenantId;
        const isPropertyAuth = userProfile && docData.propertyId === userProfile.propertyId;

        if (!isTenantAuth && !isPropertyAuth) {
          if (isMounted) setErrorMsg('You are not authorized to access this document.');
          return;
        }

        if (isMounted) setDocument(docData);
      } catch (err) {
        if (isMounted) setErrorMsg('Unable to open this document. Please try again.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchDoc();

    return () => {
      isMounted = false;
    };
  }, [id, userProfile?.tenantId, userProfile?.propertyId]);

  const handleOpenExternal = () => {
    if (!document?.fileUrl) return;
    Linking.openURL(document.fileUrl).catch(() => {
      alert('Could not open document link.');
    });
  };

  const handleShare = async () => {
    if (!document?.fileUrl) return;
    try {
      await Share.share({
        title: document.title,
        url: document.fileUrl,
        message: `View document: ${document.title} - ${document.fileUrl}`,
      });
    } catch (e) {
      console.warn('Share error:', e);
    }
  };

  const getCategoryLabel = (category: DocumentCategory) => {
    switch (category) {
      case 'agreement':
        return 'Rent Agreement';
      case 'kyc':
        return 'ID / KYC';
      case 'property':
        return 'Property Rules';
      case 'notice':
        return 'Notice';
      case 'other':
      default:
        return 'Document';
    }
  };

  if (isLoading) {
    return (
      <AppSafeAreaView style={styles.centerSafeArea}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Opening document...</Text>
      </AppSafeAreaView>
    );
  }

  if (errorMsg || !document) {
    return (
      <AppSafeAreaView style={styles.centerSafeArea}>
        <StatusBar style="dark" />
        <MaterialCommunityIcons name="file-alert-outline" size={52} color={COLORS.danger} />
        <Text style={styles.errorTitle}>Document Unavailable</Text>
        <Text style={styles.errorSubtitle}>
          {errorMsg || 'This document is no longer available.'}
        </Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </AppSafeAreaView>
    );
  }

  const isImage = document.fileType === 'image' || document.fileUrl.match(/\.(jpeg|jpg|png|webp)/i);

  return (
    <AppSafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.iconBackBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topHeaderTitle} numberOfLines={1}>
          {document.title}
        </Text>
        <TouchableOpacity style={styles.iconBackBtn} onPress={handleShare}>
          <MaterialCommunityIcons name="share-variant-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Document Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.titleRow}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons
                name={isImage ? 'file-image-outline' : 'file-document-outline'}
                size={28}
                color={COLORS.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.docTitle}>{document.title}</Text>
              <Text style={styles.docCategory}>{getCategoryLabel(document.category)}</Text>
            </View>
          </View>

          <View style={styles.metaDivider} />

          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Uploaded Date</Text>
              <Text style={styles.metaValue}>
                {document.uploadedAt ? document.uploadedAt.split('T')[0] : 'N/A'}
              </Text>
            </View>

            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>File Format</Text>
              <Text style={styles.metaValue}>{(document.fileType || 'PDF').toUpperCase()}</Text>
            </View>

            {document.fileSize ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>File Size</Text>
                <Text style={styles.metaValue}>{document.fileSize}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Image Preview Container (if image) */}
        {isImage ? (
          <View style={styles.imagePreviewBox}>
            <Image
              source={{ uri: document.fileUrl }}
              style={styles.imagePreview}
              resizeMode="contain"
            />
          </View>
        ) : (
          /* PDF / Document Download Hero Box */
          <View style={styles.pdfHeroBox}>
            <MaterialCommunityIcons name="file-pdf-box" size={64} color={COLORS.danger} />
            <Text style={styles.pdfHeroTitle}>PDF Document</Text>
            <Text style={styles.pdfHeroSub}>
              Tap the button below to view or download this document safely.
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <TouchableOpacity style={styles.openBtn} onPress={handleOpenExternal} activeOpacity={0.8}>
          <MaterialCommunityIcons name="open-in-new" size={20} color={COLORS.textWhite} />
          <Text style={styles.openBtnText}>Open Document</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.7}>
          <MaterialCommunityIcons name="share-variant-outline" size={20} color={COLORS.primary} />
          <Text style={styles.shareBtnText}>Share Link</Text>
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
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
    marginBottom: 4,
  },
  errorSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  backBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
  },
  backBtnText: {
    color: COLORS.textWhite,
    fontWeight: '700',
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
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  container: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  headerCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  docTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  docCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 2,
  },
  metaDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: SPACING.md,
  },
  metaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaItem: {
    alignItems: 'flex-start',
  },
  metaLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  imagePreviewBox: {
    width: '100%',
    height: 320,
    backgroundColor: COLORS.bgDark,
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  pdfHeroBox: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.xxl,
    alignItems: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  pdfHeroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
  },
  pdfHeroSub: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  openBtn: {
    backgroundColor: COLORS.primary,
    height: 52,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.sm,
    ...SHADOWS.md,
  },
  openBtnText: {
    color: COLORS.textWhite,
    fontSize: 15,
    fontWeight: '700',
  },
  shareBtn: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    height: 48,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  shareBtnText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
