import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, Modal, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useProperties } from '../../hooks/useProperties';
import { useTheme, useStyles, typography, spacing } from '../../theme';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';
import { Ionicons } from '@expo/vector-icons';
import { excelReportService } from '../../services/excelReportService';

// Custom Select Dialog Component
interface CustomSelectProps {
  label: string;
  value: string;
  placeholder?: string;
  options: { label: string; value: string }[];
  onSelect: (val: string) => void;
  icon?: string;
  error?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({
  label,
  value,
  placeholder = 'Select Option',
  options,
  onSelect,
  icon,
  error,
}) => {
  const { colors } = useTheme();
  const styles = useStyles(getStyles);
  const [modalVisible, setModalVisible] = useState(false);
  const selectedOption = options.find((o) => o.value === value);

  return (
    <View style={styles.selectContainer}>
      <Text style={styles.selectorLabel}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.selectBox,
          error ? styles.selectBoxError : null,
          modalVisible ? styles.selectBoxFocused : null,
        ]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <View style={styles.selectBoxLeft}>
          {icon && (
            <Ionicons
              name={icon as any}
              size={20}
              color={value ? colors.primary : colors.textSecondary}
              style={styles.selectIcon}
            />
          )}
          <Text style={[styles.selectValueText, !value && styles.placeholderText]}>
            {selectedOption ? selectedOption.label : placeholder}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <TouchableOpacity
                    style={[styles.optionItem, isSelected && styles.optionItemCheck]}
                    onPress={() => {
                      onSelect(item.value);
                      setModalVisible(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                      {item.label}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default function ReportsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { properties, loading: loadingProperties } = useProperties();
  const { colors } = useTheme();
  const styles = useStyles(getStyles);

  // Selected states
  const [selectedPropertyId, setSelectedPropertyId] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Generate Month Options dynamically going 24 months back
  const monthOptions = React.useMemo(() => {
    const options = [];
    const currentDate = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const value = `${year}-${month}`;
      options.push({ label, value });
    }
    return options;
  }, []);

  useEffect(() => {
    if (monthOptions.length > 0 && !selectedMonth) {
      setSelectedMonth(monthOptions[0].value); // default to current month
    }
  }, [monthOptions, selectedMonth]);

  if (loadingProperties) {
    return <LoadingView message="Loading properties..." />;
  }

  // Properties selector options list
  const propertyOptions = [
    { label: 'All Properties', value: 'all' },
    ...properties.map((p) => ({ label: p.name, value: p.id! })),
  ];

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!selectedPropertyId) {
      newErrors.property = 'Property selection is required';
    }
    if (!selectedMonth) {
      newErrors.month = 'Month selection is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleExportExcel = async () => {
    if (!validate() || !user) return;
    setIsExporting(true);

    try {
      const monthObj = monthOptions.find(m => m.value === selectedMonth);
      const monthLabel = monthObj ? monthObj.label : 'Month';

      await excelReportService.generateReport(
        user.uid,
        selectedPropertyId,
        selectedMonth,
        monthLabel
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert('Export Failed', e.message || 'Could not export Excel report. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <View style={styles.iconHeadingRow}>
          <Ionicons name="document-text" size={28} color={colors.primary} />
          <Text style={styles.cardTitle}>Monthly Business Reports</Text>
        </View>
        <Text style={styles.cardSubtitle}>
          Generate detailed, custom-formatted multi-sheet Excel workbooks for your properties. The workbook consolidates overall summaries, tenant listings, bills, date-wise collections, utility modes, and occupancy rates.
        </Text>

        <CustomSelect
          label="Select Property *"
          value={selectedPropertyId}
          options={propertyOptions}
          onSelect={setSelectedPropertyId}
          placeholder="All Properties"
          icon="business-outline"
          error={errors.property}
        />

        <CustomSelect
          label="Select Reporting Month *"
          value={selectedMonth}
          options={monthOptions}
          onSelect={setSelectedMonth}
          placeholder="Select Month"
          icon="calendar-outline"
          error={errors.month}
        />

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>Sheet Structure Included</Text>
          <Text style={styles.noteText}>
            • Summary Dashboard & Property Details{"\n"}
            • Active Tenants, New Move-ins, and Vacates{"\n"}
            • Billing History, Outstanding Balance & Overdue Days{"\n"}
            • Mode-aware Electricity & Water Breakdown{"\n"}
            • Daily Collections & Proportional Category Summaries
          </Text>
        </View>
      </View>

      <AppButton
        title="Export Excel"
        onPress={handleExportExcel}
        loading={isExporting}
        icon="download-outline"
        style={styles.exportButton}
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
  iconHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginLeft: spacing.sm,
  },
  cardSubtitle: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: typography.lineHeights.sm,
  },
  noteBox: {
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: spacing.borderRadius.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '20',
  },
  noteTitle: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    marginBottom: 6,
  },
  noteText: {
    fontSize: typography.sizes.xs,
    color: colors.text,
    lineHeight: 18,
  },
  exportButton: {
    marginTop: spacing.sm,
  },
  // Custom Select Styles
  selectContainer: {
    width: '100%',
    marginBottom: spacing.md,
  },
  selectorLabel: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs - 2,
  },
  selectBox: {
    width: '100%',
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  selectBoxError: {
    borderColor: colors.danger,
  },
  selectBoxFocused: {
    borderColor: colors.primary,
  },
  selectBoxLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectIcon: {
    marginRight: spacing.sm,
  },
  selectValueText: {
    fontSize: typography.sizes.md - 1,
    fontWeight: typography.weights.medium,
    color: colors.text,
  },
  placeholderText: {
    color: colors.placeholder,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: spacing.borderRadius.lg,
    borderTopRightRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  optionItemCheck: {
    backgroundColor: colors.primaryLight + '10',
  },
  optionText: {
    fontSize: typography.sizes.md - 1,
    color: colors.text,
    fontWeight: typography.weights.medium,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
  },
  errorText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.danger,
    marginTop: spacing.xs - 2,
    fontWeight: typography.weights.medium,
  },
});
