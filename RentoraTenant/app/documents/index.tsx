import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { tenantDataService } from '../../services/tenantDataService';
import { TenantDocument, DocumentCategory, Property } from '../../types';
import { RADIUS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FilterType = 'all' | DocumentCategory;

export default function MyDocumentsListScreen() {
  const { userProfile } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [documents, setDocuments] = useState<TenantDocument[]>([]);
  const [property, setProperty] = useState<Property | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    if (!userProfile?.tenantId && !userProfile?.propertyId) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    // 1. Subscribe to Tenant Documents
    const unsubscribeDocs = tenantDataService.subscribeTenantDocuments(
      userProfile.tenantId,
      userProfile.propertyId,
      (list) => {
        if (isMounted) {
          setDocuments(list);
          setIsLoading(false);
          setRefreshing(false);
        }
      },
      () => {
        if (isMounted) {
          setIsLoading(false);
          setRefreshing(false);
        }
      }
    );

    // 2. Subscribe to current property details (for Property Rules)
    let unsubscribeProp = () => {};
    if (userProfile.propertyId) {
      unsubscribeProp = tenantDataService.subscribePropertyDetails(
        userProfile.propertyId,
        (prop) => {
          if (isMounted) {
            setProperty(prop);
          }
        }
      );
    }

    return () => {
      isMounted = false;
      unsubscribeDocs();
      unsubscribeProp();
    };
  }, [userProfile?.tenantId, userProfile?.propertyId]);

  const onRefresh = () => {
    setRefreshing(true);
    if (!userProfile?.tenantId) setRefreshing(false);
  };

  const propertyRules: string[] = property?.propertyRules || [];

  const filteredDocs = documents.filter((d) => {
    if (filter === 'all') return true;
    return d.category === filter;
  });

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

  const getFileIcon = (fileType?: string) => {
    switch (fileType) {
      case 'image':
        return <MaterialCommunityIcons name="file-image-outline" size={24} color={colors.primary} />;
      case 'pdf':
        return <MaterialCommunityIcons name="file-pdf-box" size={24} color={colors.danger} />;
      case 'doc':
        return <MaterialCommunityIcons name="file-word-box" size={24} color={colors.primary} />;
      default:
        return <MaterialCommunityIcons name="file-document-outline" size={24} color={colors.primary} />;
    }
  };

  const renderItem = ({ item }: { item: TenantDocument }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/documents/${item.id}`)}
      activeOpacity={0.75}
    >
      <View style={styles.cardRow}>
        <View style={[styles.iconBox, { backgroundColor: colors.cardSubtle }]}>{getFileIcon(item.fileType)}</View>

        <View style={styles.contentCol}>
          <View style={styles.titleRow}>
            <Text style={[styles.docTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.title}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <View style={[styles.categoryBadge, { backgroundColor: colors.primaryGlow }]}>
              <Text style={[styles.categoryText, { color: colors.primary }]}>{getCategoryLabel(item.category)}</Text>
            </View>

            {item.propertyId && !item.tenantId ? (
              <View style={[styles.propertyBadge, { backgroundColor: colors.cardSubtle }]}>
                <Text style={[styles.propertyBadgeText, { color: colors.textSecondary }]}>Property Document</Text>
              </View>
            ) : null}

            <Text style={[styles.dateText, { color: colors.textMuted }]}>
              {item.uploadedAt ? item.uploadedAt.split('T')[0] : 'N/A'}
            </Text>
          </View>
        </View>

        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );

  return (
    <AppSafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />

      {/* Top Header */}
      <View style={[styles.topHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.iconBackBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.topHeaderTitle, { color: colors.textPrimary }]}>My Documents</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filterContainer, { backgroundColor: colors.bg }]}
      >
        <TouchableOpacity
          style={[
            styles.filterPill,
            { backgroundColor: filter === 'all' ? colors.primary : colors.card, borderColor: filter === 'all' ? colors.primary : colors.border },
          ]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterPillText, { color: filter === 'all' ? '#FFFFFF' : colors.textSecondary }]}>
            All ({documents.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterPill,
            { backgroundColor: filter === 'property' ? colors.primary : colors.card, borderColor: filter === 'property' ? colors.primary : colors.border },
          ]}
          onPress={() => setFilter('property')}
        >
          <Text style={[styles.filterPillText, { color: filter === 'property' ? '#FFFFFF' : colors.textSecondary }]}>
            Property Rules {propertyRules.length > 0 ? `(${propertyRules.length})` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterPill,
            { backgroundColor: filter === 'agreement' ? colors.primary : colors.card, borderColor: filter === 'agreement' ? colors.primary : colors.border },
          ]}
          onPress={() => setFilter('agreement')}
        >
          <Text style={[styles.filterPillText, { color: filter === 'agreement' ? '#FFFFFF' : colors.textSecondary }]}>
            Agreements
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterPill,
            { backgroundColor: filter === 'kyc' ? colors.primary : colors.card, borderColor: filter === 'kyc' ? colors.primary : colors.border },
          ]}
          onPress={() => setFilter('kyc')}
        >
          <Text style={[styles.filterPillText, { color: filter === 'kyc' ? '#FFFFFF' : colors.textSecondary }]}>
            ID / KYC
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterPill,
            { backgroundColor: filter === 'notice' ? colors.primary : colors.card, borderColor: filter === 'notice' ? colors.primary : colors.border },
          ]}
          onPress={() => setFilter('notice')}
        >
          <Text style={[styles.filterPillText, { color: filter === 'notice' ? '#FFFFFF' : colors.textSecondary }]}>
            Notices
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Property Rules Direct Action Card if viewing 'all' */}
      {filter === 'all' && (
        <TouchableOpacity
          style={[styles.propertyRulesBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push('/documents/property-rules')}
          activeOpacity={0.8}
        >
          <View style={[styles.bannerIconBox, { backgroundColor: colors.primaryGlow }]}>
            <MaterialCommunityIcons name="shield-check" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: colors.textPrimary }]}>Property Rules</Text>
            <Text style={[styles.bannerSubtitle, { color: colors.textSecondary }]}>
              {property?.name || 'Property'} • {propertyRules.length > 0 ? `${propertyRules.length} Guidelines Active` : 'View guidelines'}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* When 'property' filter is active, show the live Property Rules directly */}
      {filter === 'property' ? (
        <ScrollView
          contentContainerStyle={[styles.rulesListContent, { paddingBottom: Math.max(insets.bottom + 40, 60) }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        >
          <View style={[styles.propertyHeaderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.propertyHeaderTitle, { color: colors.textPrimary }]}>
              {property?.name || 'Property'} Guidelines
            </Text>
            <Text style={[styles.propertyHeaderSub, { color: colors.textSecondary }]}>
              {property?.address || 'Residential premises'}
            </Text>
          </View>

          {propertyRules.length === 0 ? (
            <View style={[styles.emptyContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No property rules have been added yet.</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Your landlord has not added custom guidelines for this property yet.
              </Text>
            </View>
          ) : (
            <View style={styles.rulesStack}>
              {propertyRules.map((rule, idx) => (
                <View
                  key={idx}
                  style={[styles.ruleItemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={[styles.checkCircle, { backgroundColor: colors.primaryGlow }]}>
                    <MaterialCommunityIcons name="check" size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.ruleItemText, { color: colors.textPrimary }]}>{rule}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Any uploaded documents tagged as property category */}
          {filteredDocs.length > 0 && (
            <View style={{ marginTop: SPACING.lg }}>
              <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>ATTACHED DOCUMENTS</Text>
              {filteredDocs.map((docItem) => (
                <View key={docItem.id} style={{ marginBottom: SPACING.sm }}>
                  {renderItem({ item: docItem })}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Fetching shared documents...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredDocs}
          keyExtractor={(item: TenantDocument) => item.id || String(Math.random())}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 40, 60) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="folder-open-outline" size={56} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Documents Yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Important documents shared by your landlord (Rent Agreement, Property Rules, KYC, Notices) will appear here.
              </Text>
            </View>
          }
        />
      )}
    </AppSafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
  },
  iconBackBtn: {
    padding: 6,
  },
  topHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  propertyRulesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    gap: 12,
  },
  bannerIconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  bannerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  rulesListContent: {
    padding: SPACING.md,
  },
  propertyHeaderCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  propertyHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  propertyHeaderSub: {
    fontSize: 12,
    marginTop: 2,
  },
  rulesStack: {
    gap: SPACING.sm,
  },
  ruleItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: 12,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ruleItemText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  listContent: {
    padding: SPACING.md,
  },
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentCol: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  docTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700',
  },
  propertyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  propertyBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 11,
    marginLeft: 'auto',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 14,
  },
  emptyContainer: {
    padding: SPACING.xl,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: SPACING.md,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
});
