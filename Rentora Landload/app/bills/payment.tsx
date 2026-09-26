import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, Image, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import AppInput from '../../components/ui/AppInput';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { billService } from '../../services/billService';
import { paymentService } from '../../services/paymentService';
import { Bill, PaymentMethod } from '../../types';
import * as ImagePicker from 'expo-image-picker';
import { localStorageService } from '../../services/localStorageService';

export default function RecordPaymentScreen() {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const { billId } = useLocalSearchParams<{ billId: string }>();
  const router = useRouter();

  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);

  // Form Fields
  const [amount, setAmount] = useState('0');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [transactionId, setTransactionId] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  // Date picker visibility
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateValue, setDateValue] = useState(new Date());

  // Errors & submitting state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const loadBill = async () => {
      if (billId) {
        try {
          const b = await billService.getBillById(billId);
          if (b) {
            setBill(b);
            setAmount(String(b.remainingAmount)); // Default to remaining amount due
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }
    };
    loadBill();
  }, [billId]);

  if (loading) {
    return <LoadingView message="Loading invoice details..." />;
  }

  if (!bill) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={styles.errorText}>Invoice not found or has been deleted.</Text>
        <AppButton title="Go Back" onPress={() => router.back()} style={styles.errBtn} />
      </View>
    );
  }

  const validate = () => {
    const newErrors: Record<string, string> = {};
    const amt = parseFloat(amount);
    
    if (isNaN(amt) || amt <= 0) {
      newErrors.amount = 'Amount must be greater than zero';
    }

    if (!paymentDate.trim()) {
      newErrors.paymentDate = 'Payment date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDateValue(selectedDate);
      setPaymentDate(selectedDate.toISOString().split('T')[0]);
    }
  };

  const handlePickImage = async () => {
    // Request media library permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need access to your gallery to attach screenshots.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setScreenshotUrl(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!validate()) return;
    if (isSubmitting || isUploading) return;

    let finalUrl = screenshotUrl;

    if (screenshotUrl && (screenshotUrl.startsWith('file://') || screenshotUrl.startsWith('content://'))) {
      setIsUploading(true);
      try {
        const localPath = await localStorageService.saveFile(screenshotUrl, 'receipts');
        finalUrl = localPath;
      } catch (uploadError: any) {
        Alert.alert('Save Error', `Failed to save payment receipt locally: ${uploadError.message || 'Please check configuration.'}`);
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    setIsSubmitting(true);
    try {
      const paymentPayload: any = {
        ownerId: bill.ownerId,
        billId: bill.id!,
        tenantId: bill.tenantId,
        amount: parseFloat(amount) || 0,
        paymentDate,
        paymentMethod,
      };

      if (transactionId.trim()) {
        paymentPayload.transactionId = transactionId.trim();
      }
      if (finalUrl) {
        paymentPayload.screenshotUrl = finalUrl;
      }

      await paymentService.recordPayment(paymentPayload);

      Alert.alert('Success', 'Payment transaction recorded successfully!', [
        {
          text: 'OK',
          onPress: () => {
            // Replace details page to trigger refresh
            router.replace({ pathname: '/bills/[id]', params: { id: bill.id } });
          }
        }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to record payment transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const paymentMethods: { label: string; value: PaymentMethod; icon: string }[] = [
    { label: 'UPI', value: 'upi', icon: 'phone-portrait-outline' },
    { label: 'Cash', value: 'cash', icon: 'cash-outline' },
    { label: 'Bank Transfer', value: 'bank_transfer', icon: 'swap-horizontal-outline' },
    { label: 'Other', value: 'other', icon: 'ellipsis-horizontal-circle-outline' },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Invoice Overview Card */}
        <View style={styles.billOverviewCard}>
          <Text style={styles.overviewLabel}>Record Payment For</Text>
          <Text style={styles.billNumber}>{bill.billNumber}</Text>
          <View style={styles.gridRow}>
            <Text style={styles.gridLabel}>Remaining Due:</Text>
            <Text style={styles.gridValue}>₹{bill.remainingAmount}</Text>
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.gridLabel}>Total Bill Amount:</Text>
            <Text style={styles.gridValue}>₹{bill.totalAmount}</Text>
          </View>
        </View>

        {/* Transaction details card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment Details</Text>

          <AppInput
            label="Payment Amount *"
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            prefix="₹"
            keyboardType="numeric"
            error={errors.amount}
          />

          {/* Date Selector */}
          <View style={styles.datePickerContainer}>
            <Text style={styles.label}>Payment Date *</Text>
            <TouchableOpacity
              style={styles.dateValueBox}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={styles.dateValueText}>{paymentDate}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={dateValue}
                mode="date"
                display="default"
                onChange={handleDateChange}
              />
            )}
            {errors.paymentDate && <Text style={styles.errorText}>{errors.paymentDate}</Text>}
          </View>

          {/* Method Chips */}
          <Text style={styles.label}>Payment Method *</Text>
          <View style={styles.methodGrid}>
            {paymentMethods.map((pm) => {
              const isSelected = paymentMethod === pm.value;
              return (
                <TouchableOpacity
                  key={pm.value}
                  style={[styles.methodButton, isSelected && styles.methodButtonSelected]}
                  onPress={() => setPaymentMethod(pm.value)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={pm.icon as any} size={16} color={isSelected ? colors.white : colors.primary} />
                  <Text style={[styles.methodButtonText, isSelected && styles.methodButtonTextSelected]}>
                    {pm.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <AppInput
            label="Transaction / Reference ID"
            value={transactionId}
            onChangeText={setTransactionId}
            placeholder="e.g. UPI Ref / NEFT ID (Optional)"
            icon="document-text-outline"
          />
        </View>

        {/* Attachment Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Screenshot Attachment</Text>
          <Text style={styles.cardSubtitle}>Attach receipt or digital payment screenshot for records.</Text>
          
          {screenshotUrl ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: screenshotUrl }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeImageBtn}
                onPress={() => setScreenshotUrl(null)}
                activeOpacity={0.8}
              >
                <Ionicons name="close-circle" size={24} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.uploadBox}
              onPress={handlePickImage}
              activeOpacity={0.8}
            >
              <Ionicons name="image-outline" size={32} color={colors.textSecondary} />
              <Text style={styles.uploadText}>Select Screenshot Receipt</Text>
            </TouchableOpacity>
          )}
        </View>

        <AppButton
          title={isUploading ? "Uploading Screenshot..." : "Record Payment Transaction"}
          onPress={handleSave}
          loading={isSubmitting || isUploading}
          disabled={isSubmitting || isUploading}
          icon="cash-outline"
          style={styles.saveButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
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
  billOverviewCard: {
    backgroundColor: colors.primary,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...spacing.shadows.medium,
  },
  overviewLabel: {
    fontSize: typography.sizes.xs,
    color: colors.white + '90',
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
  },
  billNumber: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.white,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  gridLabel: {
    fontSize: typography.sizes.sm,
    color: colors.white + '90',
    fontWeight: typography.weights.medium,
  },
  gridValue: {
    fontSize: typography.sizes.sm + 1,
    color: colors.white,
    fontWeight: typography.weights.bold,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...spacing.shadows.light,
  },
  cardTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  cardSubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  datePickerContainer: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  dateValueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  dateValueText: {
    marginLeft: spacing.sm,
    fontSize: typography.sizes.md - 1,
    fontWeight: typography.weights.medium,
    color: colors.text,
  },
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  methodButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  methodButtonText: {
    fontSize: typography.sizes.sm - 1,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  methodButtonTextSelected: {
    color: colors.white,
  },
  uploadBox: {
    height: 120,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  uploadText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginTop: spacing.sm,
  },
  previewContainer: {
    position: 'relative',
    height: 160,
    borderRadius: spacing.borderRadius.md,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.white,
    borderRadius: 12,
  },
  saveButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  errBtn: {
    paddingHorizontal: spacing.xxl,
  },
});
