import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '../../hooks/useSettings';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import AppInput from '../../components/ui/AppInput';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { localStorageService } from '../../services/localStorageService';

export default function BillCustomizationScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const router = useRouter();
  const { settings, loading, updateSettings } = useSettings();

  // Form Fields
  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

  // Loading & Submitting states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);

  useEffect(() => {
    if (settings) {
      setPaymentInstructions(settings.paymentInstructions || '');
      setLogoUrl(settings.logoUrl || null);
      setSignatureUrl(settings.signatureUrl || null);
    }
  }, [settings]);

  if (loading) {
    return <LoadingView message="Loading bill customization..." />;
  }

  const handlePickImage = async (type: 'logo' | 'signature') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need access to your gallery to pick attachments.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      aspect: type === 'logo' ? [1, 1] : [3, 1], // Square for logo, wide for signature
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const selectedUri = result.assets[0].uri;
      
      if (type === 'logo') {
        setIsUploadingLogo(true);
        try {
          if (logoUrl) {
            await localStorageService.deleteFile(logoUrl);
          }
          const localPath = await localStorageService.saveFile(selectedUri, 'logos');
          setLogoUrl(localPath);
          Alert.alert('Success', 'Business logo saved locally!');
        } catch (e: any) {
          Alert.alert('Error', e.message || 'Failed to save logo locally.');
        } finally {
          setIsUploadingLogo(false);
        }
      } else {
        setIsUploadingSignature(true);
        try {
          if (signatureUrl) {
            await localStorageService.deleteFile(signatureUrl);
          }
          const localPath = await localStorageService.saveFile(selectedUri, 'signatures');
          setSignatureUrl(localPath);
          Alert.alert('Success', 'Owner signature/photo saved locally!');
        } catch (e: any) {
          Alert.alert('Error', e.message || 'Failed to save signature locally.');
        } finally {
          setIsUploadingSignature(false);
        }
      }
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setIsSubmitting(true);

    try {
      await updateSettings({
        ownerName: settings.ownerName || '',
        businessName: settings.businessName || '',
        phone: settings.phone || '',
        address: settings.address || '',
        upiId: settings.upiId || '',
        paymentInstructions,
        logoUrl: logoUrl || null,
        signatureUrl: signatureUrl || null,
      } as any);

      Alert.alert('Success', 'Invoice bill customization saved successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save bill customization');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Instructions Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Custom Payment Instructions</Text>
        <Text style={styles.cardSubtitle}>
          Add standard payment instructions or thank you notes printed at the bottom of the invoice.
        </Text>

        <AppInput
          label="Invoice Instructions"
          value={paymentInstructions}
          onChangeText={setPaymentInstructions}
          placeholder="e.g. Please transfer to the UPI ID listed. Kindly share payment receipt on WhatsApp."
          icon="document-text-outline"
        />
      </View>

      {/* Signature Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Landlord Signature</Text>
        <Text style={styles.cardSubtitle}>
          Upload your digital signature image to be printed on bills as authorization.
        </Text>

        {isUploadingSignature ? (
          <View style={[styles.uploadBox, { borderStyle: 'solid' }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.uploadProgressText}>Uploading Signature...</Text>
          </View>
        ) : signatureUrl ? (
          <View style={styles.previewContainer}>
            <Image source={{ uri: signatureUrl }} style={styles.signaturePreview} />
            <TouchableOpacity
              style={styles.removeImageBtn}
              onPress={async () => {
                if (signatureUrl) {
                  await localStorageService.deleteFile(signatureUrl);
                }
                setSignatureUrl(null);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle" size={24} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.uploadBox}
            onPress={() => handlePickImage('signature')}
            activeOpacity={0.8}
            disabled={isSubmitting || isUploadingLogo}
          >
            <Ionicons name="create-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.uploadText}>Select Signature Image</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Business Logo Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Business Logo</Text>
        <Text style={styles.cardSubtitle}>
          Upload a square business logo. Shown in the top header section of bills.
        </Text>

        {isUploadingLogo ? (
          <View style={[styles.uploadBoxSquare, { borderStyle: 'solid' }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.uploadProgressText, { fontSize: 10, textAlign: 'center', marginTop: 8 }]}>Uploading Logo...</Text>
          </View>
        ) : logoUrl ? (
          <View style={styles.previewContainerSquare}>
            <Image source={{ uri: logoUrl }} style={styles.logoPreview} />
            <TouchableOpacity
              style={styles.removeImageBtn}
              onPress={async () => {
                if (logoUrl) {
                  await localStorageService.deleteFile(logoUrl);
                }
                setLogoUrl(null);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle" size={24} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.uploadBoxSquare}
            onPress={() => handlePickImage('logo')}
            activeOpacity={0.8}
            disabled={isSubmitting || isUploadingSignature}
          >
            <Ionicons name="image-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.uploadText}>Select Logo Image</Text>
          </TouchableOpacity>
        )}
      </View>

      <AppButton
        title="Save Customizations"
        onPress={handleSave}
        loading={isSubmitting}
        disabled={isSubmitting || isUploadingLogo || isUploadingSignature}
        icon="checkmark-circle-outline"
        style={styles.saveButton}
      />
    </ScrollView>
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...spacing.shadows.light,
  },
  cardTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: typography.lineHeights.sm,
  },
  uploadBox: {
    height: 100,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  uploadBoxSquare: {
    height: 120,
    width: 120,
    alignSelf: 'center',
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  uploadText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginTop: spacing.sm,
  },
  previewContainer: {
    position: 'relative',
    height: 100,
    borderRadius: spacing.borderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewContainerSquare: {
    position: 'relative',
    height: 120,
    width: 120,
    alignSelf: 'center',
    borderRadius: spacing.borderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  signaturePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
    backgroundColor: '#FAFAFA',
  },
  logoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.white,
    borderRadius: 12,
  },
  saveButton: {
    marginTop: spacing.sm,
  },
  uploadProgressText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginTop: spacing.sm,
  },
});
