import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useProperties } from '../../hooks/useProperties';
import { useTheme, useStyles, typography, spacing } from '../../theme';
import AppButton from '../../components/ui/AppButton';
import LoadingView from '../../components/ui/LoadingView';
import { Ionicons } from '@expo/vector-icons';
import { excelReportService } from '../../services/excelReportService';
import { pdfService } from '../../services/pdfService';
import { tenantService } from '../../services/tenantService';
import { settlementService } from '../../services/settlementService';
import { billService } from '../../services/billService';
import { paymentService } from '../../services/paymentService';
import { unitService } from '../../services/unitService';
import { settingsService } from '../../services/settingsService';
import { Tenant, Settlement, Bill, Payment, Unit, BillSettings } from '../../types';
import * as Sharing from 'expo-sharing';

// 30 Days in milliseconds (30 * 24 * 60 * 60 * 1000)
const REPORT_ACCESS_MS = 30 * 24 * 60 * 60 * 1000;

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

  // Tab State: 'property' = Property-Wise Monthly Report, 'tenant' = Tenant-Wise Historical Report
  const [activeTab, setActiveTab] = useState<'property' | 'tenant'>('property');

  // --- TAB 1: PROPERTY-WISE MONTHLY REPORT STATES ---
  const [selectedPropertyId, setSelectedPropertyId] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- TAB 2: TENANT-WISE HISTORICAL REPORT STATES ---
  const [tenantReportPropertyId, setTenantReportPropertyId] = useState('');
  const [vacatedTenants, setVacatedTenants] = useState<Tenant[]>([]);
  const [settlementsByTenantId, setSettlementsByTenantId] = useState<Record<string, Settlement>>({});
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [loadingTenants, setLoadingTenants] = useState(false);

  // Selected Tenant Data Snapshot
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [tenantBills, setTenantBills] = useState<Bill[]>([]);
  const [tenantPayments, setTenantPayments] = useState<Payment[]>([]);
  const [tenantUnit, setTenantUnit] = useState<Unit | null>(null);
  const [billSettings, setBillSettings] = useState<BillSettings | null>(null);
  const [loadingTenantData, setLoadingTenantData] = useState(false);

  // Export Loading States
  const [isExportingTenantExcel, setIsExportingTenantExcel] = useState(false);
  const [isExportingTenantPdf, setIsExportingTenantPdf] = useState(false);

  // Generate Month Options dynamically going 24 months back (for Property-Wise)
  const monthOptions = useMemo(() => {
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

  // Set default property for Tenant Report when properties load
  useEffect(() => {
    if (properties.length > 0 && !tenantReportPropertyId) {
      setTenantReportPropertyId(properties[0].id!);
    }
  }, [properties, tenantReportPropertyId]);

  // Fetch Vacated Tenants whenever Tenant Report Property changes
  useEffect(() => {
    const fetchVacatedTenants = async () => {
      if (!user || !tenantReportPropertyId) return;
      setLoadingTenants(true);
      setSelectedTenantId('');
      setSelectedTenant(null);
      setSelectedSettlement(null);

      try {
        const allTenants = await tenantService.getTenants(user.uid);
        const allSettlements = await settlementService.getSettlements(user.uid);

        const settlementMap: Record<string, Settlement> = {};
        allSettlements.forEach((s) => {
          if (s.tenantId) {
            settlementMap[s.tenantId] = s;
          }
        });
        setSettlementsByTenantId(settlementMap);

        // Filter: belong to selected property AND status === 'vacated'
        const filtered = allTenants.filter(
          (t) => t.propertyId === tenantReportPropertyId && t.status === 'vacated'
        );
        setVacatedTenants(filtered);
      } catch (e: any) {
        console.error('Error fetching vacated tenants:', e);
      } finally {
        setLoadingTenants(false);
      }
    };

    if (activeTab === 'tenant') {
      fetchVacatedTenants();
    }
  }, [user, tenantReportPropertyId, activeTab]);

  // Fetch full details of selected tenant (Bills, Payments, Unit, Settings)
  useEffect(() => {
    const fetchSelectedTenantDetails = async () => {
      if (!selectedTenantId || !user) return;
      setLoadingTenantData(true);

      try {
        const tenant = vacatedTenants.find((t) => t.id === selectedTenantId) || null;
        setSelectedTenant(tenant);

        const settlement = settlementsByTenantId[selectedTenantId] || null;
        setSelectedSettlement(settlement);

        // Fetch bills strictly for this tenant
        const allBills = await billService.getBills(user.uid);
        const tBills = allBills.filter((b) => b.tenantId === selectedTenantId);
        setTenantBills(tBills);

        // Fetch payments strictly for this tenant
        const tPayments = await paymentService.getPaymentsForTenant(selectedTenantId);
        setTenantPayments(tPayments);

        // Fetch unit if available
        if (tenant?.unitId) {
          const u = await unitService.getUnitById(tenant.unitId);
          setTenantUnit(u);
        } else {
          setTenantUnit(null);
        }

        // Fetch BillSettings
        const s = await settingsService.getSettings(user.uid);
        setBillSettings(s);
      } catch (e: any) {
        console.error('Error fetching tenant details:', e);
        Alert.alert('Error', 'Could not load tenant historical data.');
      } finally {
        setLoadingTenantData(false);
      }
    };

    fetchSelectedTenantDetails();
  }, [selectedTenantId, user, vacatedTenants, settlementsByTenantId]);

  if (loadingProperties) {
    return <LoadingView message="Loading properties..." />;
  }

  // Properties selector options list (for Property-Wise)
  const propertyOptions = [
    { label: 'All Properties', value: 'all' },
    ...properties.map((p) => ({ label: p.name, value: p.id! })),
  ];

  // Properties selector options list (for Tenant-Wise: single property selection)
  const tenantPropertyOptions = properties.map((p) => ({
    label: p.name,
    value: p.id!,
  }));

  // -------------------------------------------------------------
  // 30-Day Expiry Check Logic
  // -------------------------------------------------------------
  const getExpiryDetails = (settlement?: Settlement | null) => {
    if (!settlement || !settlement.createdAt) {
      return {
        hasSettlement: false,
        isExpired: false,
        expiryDate: null,
        remainingMs: 0,
        formattedRemaining: 'No Settlement',
      };
    }

    const createdTime = new Date(settlement.createdAt).getTime();
    const expiryTime = createdTime + REPORT_ACCESS_MS;
    const now = Date.now();
    const remainingMs = expiryTime - now;
    const isExpired = remainingMs <= 0;

    const expiryDate = new Date(expiryTime);

    let formattedRemaining = 'Expired';
    if (!isExpired) {
      const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      if (days > 0) {
        formattedRemaining = `${days}d ${hours}h left`;
      } else {
        formattedRemaining = `${hours}h left`;
      }
    }

    return {
      hasSettlement: true,
      isExpired,
      expiryDate,
      remainingMs,
      formattedRemaining,
    };
  };

  // -------------------------------------------------------------
  // TAB 1 EXPORT: Property-Wise Monthly Report
  // -------------------------------------------------------------
  const validatePropertyReport = () => {
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
    if (!validatePropertyReport() || !user) return;
    setIsExporting(true);

    try {
      const monthObj = monthOptions.find((m) => m.value === selectedMonth);
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

  // -------------------------------------------------------------
  // TAB 2 EXPORT: Tenant-Wise Historical Excel (.xlsx)
  // -------------------------------------------------------------
  const handleExportTenantExcel = async () => {
    if (!selectedTenant || !selectedSettlement) {
      Alert.alert('Selection Required', 'Please select an eligible vacated tenant with a final settlement.');
      return;
    }

    const expiry = getExpiryDetails(selectedSettlement);
    if (!expiry.hasSettlement) {
      Alert.alert(
        'Settlement Required',
        'A Final Settlement must be generated first to unlock report generation.'
      );
      return;
    }

    if (expiry.isExpired) {
      Alert.alert(
        'Report Access Expired',
        `Tenant report access has expired. The 30-day window from the final settlement closed on ${expiry.expiryDate?.toLocaleDateString('en-IN')}.`
      );
      return;
    }

    setIsExportingTenantExcel(true);
    try {
      const currentProp = properties.find((p) => p.id === selectedTenant.propertyId);
      await excelReportService.generateTenantHistoricalReport(
        selectedTenant,
        selectedSettlement,
        currentProp,
        tenantUnit,
        tenantBills,
        tenantPayments
      );
    } catch (e: any) {
      console.error('Tenant Excel Export Error:', e);
      Alert.alert('Export Failed', e.message || 'Could not export Tenant Historical Excel report.');
    } finally {
      setIsExportingTenantExcel(false);
    }
  };

  // -------------------------------------------------------------
  // TAB 2 EXPORT: Tenant-Wise Historical PDF (.pdf)
  // -------------------------------------------------------------
  const handleExportTenantPdf = async () => {
    if (!selectedTenant || !selectedSettlement) {
      Alert.alert('Selection Required', 'Please select an eligible vacated tenant with a final settlement.');
      return;
    }

    const expiry = getExpiryDetails(selectedSettlement);
    if (!expiry.hasSettlement) {
      Alert.alert(
        'Settlement Required',
        'A Final Settlement must be generated first to unlock report generation.'
      );
      return;
    }

    if (expiry.isExpired) {
      Alert.alert(
        'Report Access Expired',
        `Tenant report access has expired. The 30-day window from the final settlement closed on ${expiry.expiryDate?.toLocaleDateString('en-IN')}.`
      );
      return;
    }

    setIsExportingTenantPdf(true);
    try {
      const currentProp = properties.find((p) => p.id === selectedTenant.propertyId);
      const pdfUri = await pdfService.generateTenantHistoricalPDF(
        selectedTenant,
        selectedSettlement,
        currentProp,
        tenantUnit,
        tenantBills,
        tenantPayments,
        billSettings
      );

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Tenant Historical Report — ${selectedTenant.name}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF Ready', `Report generated successfully:\n${pdfUri}`);
      }
    } catch (e: any) {
      console.error('Tenant PDF Export Error:', e);
      Alert.alert('Export Failed', e.message || 'Could not export Tenant Historical PDF report.');
    } finally {
      setIsExportingTenantPdf(false);
    }
  };

  // Render Tenant Selection Row item
  const renderTenantRow = (tenant: Tenant) => {
    const settlement = settlementsByTenantId[tenant.id!];
    const expiry = getExpiryDetails(settlement);
    const isSelected = tenant.id === selectedTenantId;

    let badgeText = 'No Settlement';
    let badgeBg = '#FEF3C7';
    let badgeColor = '#92400E';

    if (expiry.hasSettlement) {
      if (expiry.isExpired) {
        badgeText = 'Access Expired';
        badgeBg = '#FEE2E2';
        badgeColor = '#991B1B';
      } else {
        badgeText = `Active (${expiry.formattedRemaining})`;
        badgeBg = '#DCFCE7';
        badgeColor = '#166534';
      }
    }

    return (
      <TouchableOpacity
        key={tenant.id}
        style={[
          styles.tenantCard,
          isSelected ? styles.tenantCardSelected : null,
          (!expiry.hasSettlement || expiry.isExpired) ? styles.tenantCardDisabled : null,
        ]}
        onPress={() => {
          if (!expiry.hasSettlement) {
            Alert.alert(
              'No Settlement Generated',
              'This vacated tenant does not have a final settlement yet. Please generate a settlement in the Settlements section first to activate the 30-day report window.'
            );
            return;
          }
          if (expiry.isExpired) {
            Alert.alert(
              'Access Expired',
              `Tenant report access has expired on ${expiry.expiryDate?.toLocaleDateString('en-IN')}. Historical report generation is blocked after 30 days.`
            );
            return;
          }
          setSelectedTenantId(tenant.id!);
        }}
        activeOpacity={0.8}
      >
        <View style={styles.tenantCardLeft}>
          <View style={styles.tenantAvatar}>
            <Ionicons name="person" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.tenantNameRow}>
              <Text style={styles.tenantName}>{tenant.name}</Text>
              <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                <Text style={[styles.statusBadgeText, { color: badgeColor }]}>{badgeText}</Text>
              </View>
            </View>
            <Text style={styles.tenantSub}>
              {tenant.mobileNumber || tenant.mobile || 'No Phone'} • Rent: ₹{(tenant.monthlyRent || 0).toLocaleString('en-IN')}
            </Text>
            <Text style={styles.tenantDates}>
              Move-In: {tenant.moveInDate || '—'} | Vacated: {tenant.moveOutDate || settlement?.moveOutDate || '—'}
            </Text>
          </View>
        </View>

        {isSelected && (
          <Ionicons name="checkmark-circle" size={24} color={colors.primary} style={{ marginLeft: spacing.sm }} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Top Segmented Tab Switcher */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'property' && styles.tabButtonActive]}
          onPress={() => setActiveTab('property')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="business-outline"
            size={18}
            color={activeTab === 'property' ? colors.primary : colors.textSecondary}
          />
          <Text style={[styles.tabButtonText, activeTab === 'property' && styles.tabButtonTextActive]}>
            Property-Wise Report
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'tenant' && styles.tabButtonActive]}
          onPress={() => setActiveTab('tenant')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="person-outline"
            size={18}
            color={activeTab === 'tenant' ? colors.primary : colors.textSecondary}
          />
          <Text style={[styles.tabButtonText, activeTab === 'tenant' && styles.tabButtonTextActive]}>
            Tenant-Wise Report
          </Text>
        </TouchableOpacity>
      </View>

      {/* ========================================================= */}
      {/* TAB 1: PROPERTY-WISE MONTHLY REPORT (EXISTING FEATURE)    */}
      {/* ========================================================= */}
      {activeTab === 'property' && (
        <View>
          <View style={styles.card}>
            <View style={styles.iconHeadingRow}>
              <Ionicons name="document-text" size={28} color={colors.primary} />
              <Text style={styles.cardTitle}>Monthly Business Reports</Text>
            </View>
            <Text style={styles.cardSubtitle}>
              Generate detailed, custom-formatted multi-sheet Excel workbooks for your properties. The workbook
              consolidates overall summaries, tenant listings, bills, date-wise collections, utility modes, and occupancy rates.
            </Text>

            <CustomSelect
              label="Select Property *"
              value={selectedPropertyId}
              options={propertyOptions}
              onSelect={setSelectedPropertyId}
              placeholder="Select Property"
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
        </View>
      )}

      {/* ========================================================= */}
      {/* TAB 2: TENANT-WISE HISTORICAL REPORT (NEW FEATURE)        */}
      {/* ========================================================= */}
      {activeTab === 'tenant' && (
        <View>
          {/* Card 1: Step 1 - Select Property */}
          <View style={styles.card}>
            <View style={styles.iconHeadingRow}>
              <Ionicons name="folder-open" size={26} color={colors.primary} />
              <Text style={styles.cardTitle}>Tenant Financial History Report</Text>
            </View>
            <Text style={styles.cardSubtitle}>
              Generate a full financial history of a vacated tenant from their move-in date through their final settlement.
              Report access is strictly available for 30 days from the settlement generation date.
            </Text>

            {tenantPropertyOptions.length > 0 ? (
              <CustomSelect
                label="Step 1: Select Property *"
                value={tenantReportPropertyId}
                options={tenantPropertyOptions}
                onSelect={(val) => {
                  setTenantReportPropertyId(val);
                  setSelectedTenantId('');
                }}
                placeholder="Select Property"
                icon="business-outline"
              />
            ) : (
              <Text style={styles.placeholderText}>No properties found. Please create a property first.</Text>
            )}
          </View>

          {/* Card 2: Step 2 - Select Vacated Tenant */}
          <View style={styles.card}>
            <View style={styles.stepHeaderRow}>
              <Text style={styles.stepTitle}>Step 2: Select Vacated Tenant</Text>
              {loadingTenants && <ActivityIndicator size="small" color={colors.primary} />}
            </View>
            <Text style={styles.cardSubtitle}>
              Only tenants marked as Vacated with an active settlement within the 30-day window are eligible for download.
            </Text>

            {vacatedTenants.length === 0 && !loadingTenants ? (
              <View style={styles.emptyStateBox}>
                <Ionicons name="information-circle-outline" size={28} color={colors.textSecondary} />
                <Text style={styles.emptyStateText}>
                  No vacated tenants found under this property.
                </Text>
              </View>
            ) : (
              vacatedTenants.map(renderTenantRow)
            )}
          </View>

          {/* Card 3: Step 3 - Preview & Download Actions */}
          {selectedTenant && selectedSettlement && (
            <View style={styles.card}>
              <Text style={styles.stepTitle}>Step 3: Tenant Report Overview & Export</Text>
              <Text style={styles.cardSubtitle}>
                Verified snapshot of tenancy, historical bills, payments, and final settlement calculation.
              </Text>

              {loadingTenantData ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing.md }} />
              ) : (
                <>
                  {/* 30-Day Window Status Banner */}
                  {(() => {
                    const expiry = getExpiryDetails(selectedSettlement);
                    return (
                      <View
                        style={[
                          styles.expiryBanner,
                          {
                            backgroundColor: expiry.isExpired ? '#FEE2E2' : '#DCFCE7',
                            borderColor: expiry.isExpired ? '#DC2626' : '#16A34A',
                          },
                        ]}
                      >
                        <Ionicons
                          name={expiry.isExpired ? 'alert-circle' : 'time-outline'}
                          size={20}
                          color={expiry.isExpired ? '#DC2626' : '#16A34A'}
                        />
                        <View style={{ flex: 1, marginLeft: spacing.sm }}>
                          <Text
                            style={[
                              styles.expiryBannerTitle,
                              { color: expiry.isExpired ? '#991B1B' : '#166534' },
                            ]}
                          >
                            {expiry.isExpired ? 'Report Access Has Expired' : 'Report Access Active (30-Day Policy)'}
                          </Text>
                          <Text
                            style={[
                              styles.expiryBannerText,
                              { color: expiry.isExpired ? '#991B1B' : '#166534' },
                            ]}
                          >
                            {expiry.isExpired
                              ? `The 30-day window expired on ${expiry.expiryDate?.toLocaleDateString('en-IN')}.`
                              : `Access valid until ${expiry.expiryDate?.toLocaleDateString('en-IN')} (${expiry.formattedRemaining})`}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}

                  {/* Summary Grid */}
                  <View style={styles.summaryGrid}>
                    <View style={styles.summaryCol}>
                      <Text style={styles.summaryLabel}>TENANT</Text>
                      <Text style={styles.summaryVal}>{selectedTenant.name}</Text>
                      <Text style={styles.summarySub}>{selectedTenant.mobileNumber || selectedTenant.mobile || '—'}</Text>
                    </View>

                    <View style={styles.summaryCol}>
                      <Text style={styles.summaryLabel}>UNIT</Text>
                      <Text style={styles.summaryVal}>Unit {tenantUnit?.unitNumber || selectedTenant.unitId || '—'}</Text>
                      <Text style={styles.summarySub}>{properties.find((p) => p.id === selectedTenant.propertyId)?.name || '—'}</Text>
                    </View>

                    <View style={styles.summaryCol}>
                      <Text style={styles.summaryLabel}>TENANCY</Text>
                      <Text style={styles.summaryVal}>{selectedTenant.moveInDate || '—'}</Text>
                      <Text style={styles.summarySub}>to {selectedTenant.moveOutDate || selectedSettlement.moveOutDate || '—'}</Text>
                    </View>

                    <View style={styles.summaryCol}>
                      <Text style={styles.summaryLabel}>SETTLEMENT ID</Text>
                      <Text style={styles.summaryVal}>{selectedSettlement.settlementNumber}</Text>
                      <Text style={styles.summarySub}>{selectedSettlement.finalStatus.toUpperCase()}</Text>
                    </View>
                  </View>

                  {/* Financial Mini Totals */}
                  <View style={styles.miniStatsRow}>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatLabel}>BILLS COUNT</Text>
                      <Text style={styles.miniStatVal}>{tenantBills.length}</Text>
                    </View>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatLabel}>PAYMENTS COUNT</Text>
                      <Text style={styles.miniStatVal}>{tenantPayments.length}</Text>
                    </View>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatLabel}>FINAL AMOUNT</Text>
                      <Text
                        style={[
                          styles.miniStatVal,
                          {
                            color:
                              selectedSettlement.finalStatus === 'payable'
                                ? colors.danger
                                : '#16A34A',
                          },
                        ]}
                      >
                        ₹{Math.abs(selectedSettlement.finalAmount || 0).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>

                  {/* Export Buttons */}
                  <View style={styles.exportButtonGroup}>
                    <AppButton
                      title="Download Excel (.xlsx)"
                      onPress={handleExportTenantExcel}
                      loading={isExportingTenantExcel}
                      icon="document-outline"
                      style={styles.actionBtn}
                      disabled={getExpiryDetails(selectedSettlement).isExpired}
                    />

                    <AppButton
                      title="Download PDF (.pdf)"
                      onPress={handleExportTenantPdf}
                      loading={isExportingTenantPdf}
                      icon="download-outline"
                      style={styles.actionBtnSecondary}
                      variant="secondary"
                      disabled={getExpiryDetails(selectedSettlement).isExpired}
                    />
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      )}
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
      padding: spacing.lg,
    },
    // Top Tab Switcher
    tabSwitcher: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: spacing.borderRadius.lg,
      padding: 4,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm + 2,
      borderRadius: spacing.borderRadius.md,
      gap: 6,
    },
    tabButtonActive: {
      backgroundColor: colors.primaryLight + '25',
    },
    tabButtonText: {
      fontSize: typography.sizes.xs + 1,
      fontWeight: typography.weights.semibold,
      color: colors.textSecondary,
    },
    tabButtonTextActive: {
      color: colors.primary,
      fontWeight: typography.weights.bold,
    },
    // Cards
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
    stepHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    stepTitle: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.bold,
      color: colors.text,
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
    // Tenant Card
    tenantCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.md,
      borderRadius: spacing.borderRadius.md,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    tenantCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight + '12',
    },
    tenantCardDisabled: {
      opacity: 0.65,
    },
    tenantCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    tenantAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primaryLight + '30',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm + 2,
    },
    tenantNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    tenantName: {
      fontSize: typography.sizes.sm + 1,
      fontWeight: typography.weights.bold,
      color: colors.text,
    },
    tenantSub: {
      fontSize: typography.sizes.xs,
      color: colors.textSecondary,
      marginTop: 2,
    },
    tenantDates: {
      fontSize: typography.sizes.xs - 1,
      color: colors.textSecondary,
      marginTop: 1,
    },
    statusBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 10,
    },
    statusBadgeText: {
      fontSize: 9.5,
      fontWeight: typography.weights.bold,
    },
    emptyStateBox: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
      gap: spacing.xs,
    },
    emptyStateText: {
      fontSize: typography.sizes.sm,
      color: colors.textSecondary,
    },
    // Expiry Banner
    expiryBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: spacing.borderRadius.md,
      borderWidth: 1,
      marginBottom: spacing.md,
    },
    expiryBannerTitle: {
      fontSize: typography.sizes.xs + 1,
      fontWeight: typography.weights.bold,
    },
    expiryBannerText: {
      fontSize: typography.sizes.xs,
      marginTop: 2,
    },
    // Summary Grid
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      backgroundColor: colors.background,
      padding: spacing.md,
      borderRadius: spacing.borderRadius.md,
      marginBottom: spacing.md,
    },
    summaryCol: {
      width: '47%',
    },
    summaryLabel: {
      fontSize: 9,
      fontWeight: typography.weights.bold,
      color: colors.textSecondary,
    },
    summaryVal: {
      fontSize: typography.sizes.xs + 1,
      fontWeight: typography.weights.bold,
      color: colors.text,
      marginTop: 2,
    },
    summarySub: {
      fontSize: typography.sizes.xs - 1,
      color: colors.textSecondary,
    },
    miniStatsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    miniStat: {
      flex: 1,
      backgroundColor: colors.background,
      padding: spacing.sm,
      borderRadius: spacing.borderRadius.sm,
      alignItems: 'center',
    },
    miniStatLabel: {
      fontSize: 8.5,
      fontWeight: typography.weights.bold,
      color: colors.textSecondary,
    },
    miniStatVal: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.bold,
      color: colors.text,
      marginTop: 3,
    },
    exportButtonGroup: {
      marginTop: spacing.xs,
    },
    actionBtn: {
      width: '100%',
    },
    actionBtnSecondary: {
      width: '100%',
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
