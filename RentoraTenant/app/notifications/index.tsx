import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { notificationService } from '../../services/notificationService';
import { TenantNotification } from '../../types';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

type FilterType = 'all' | 'unread';

export default function NotificationsCenterScreen() {
  const { userProfile } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  const [notifications, setNotifications] = useState<TenantNotification[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    if (!userProfile?.tenantId) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = notificationService.subscribeTenantNotifications(
      userProfile.tenantId,
      (list) => {
        setNotifications(list);
        setIsLoading(false);
        setRefreshing(false);
      },
      () => {
        setIsLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, [userProfile?.tenantId]);

  const onRefresh = () => {
    setRefreshing(true);
    if (!userProfile?.tenantId) setRefreshing(false);
  };

  const handleMarkAllRead = async () => {
    if (userProfile?.tenantId) {
      await notificationService.markAllNotificationsAsRead(userProfile.tenantId);
    }
  };

  const handleNotificationPress = async (item: TenantNotification) => {
    if (item.id && !item.isRead) {
      await notificationService.markNotificationAsRead(item.id);
    }

    // Deep link navigation guard
    if (item.billId) {
      try {
        const snap = await getDoc(doc(db, 'bills', item.billId));
        if (snap.exists()) {
          router.push(`/bills/${item.billId}`);
          return;
        }
      } catch (e) {}
    }

    if (item.paymentId) {
      try {
        const snap = await getDoc(doc(db, 'payments', item.paymentId));
        if (snap.exists()) {
          router.push(`/payments/${item.paymentId}`);
          return;
        }
      } catch (e) {}
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.isRead;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const renderIcon = (type: string) => {
    switch (type) {
      case 'new_bill':
        return <MaterialCommunityIcons name="receipt-text-outline" size={24} color={COLORS.primary} />;
      case 'payment_submitted':
        return <MaterialCommunityIcons name="credit-card-clock-outline" size={24} color={COLORS.warning} />;
      case 'bill_paid':
      case 'payment_approved':
        return <MaterialCommunityIcons name="check-circle-outline" size={24} color={COLORS.success} />;
      case 'payment_rejected':
        return <MaterialCommunityIcons name="alert-circle-outline" size={24} color={COLORS.danger} />;
      case 'bill_due':
      case 'bill_overdue':
        return <MaterialCommunityIcons name="clock-alert-outline" size={24} color={COLORS.warning} />;
      case 'bill_status_update':
      default:
        return <MaterialCommunityIcons name="bell-outline" size={24} color={COLORS.primary} />;
    }
  };

  const renderItem = ({ item }: { item: TenantNotification }) => (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
        !item.isRead && { backgroundColor: colors.cardSubtle, borderColor: colors.primary },
      ]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.75}
    >
      <View style={styles.cardRow}>
        <View style={[styles.iconBox, { backgroundColor: colors.primaryGlow }]}>
          {renderIcon(item.notificationType)}
        </View>

        <View style={styles.contentCol}>
          <View style={styles.titleRow}>
            <Text style={[styles.itemTitle, { color: colors.textPrimary }, !item.isRead && { fontWeight: '800' }]}>
              {item.title}
            </Text>
            {!item.isRead ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}
          </View>

          <Text style={[styles.itemBody, { color: colors.textSecondary }]}>{item.body}</Text>
          <Text style={[styles.itemDate, { color: colors.textMuted }]}>
            {item.createdAt ? item.createdAt.split('T')[0] : 'N/A'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <AppSafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />
      {/* Top Header */}
      <View style={[styles.topHeader, { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
        <TouchableOpacity style={styles.iconBackBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.topHeaderTitle, { color: colors.textPrimary }]}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity style={styles.readAllBtn} onPress={handleMarkAllRead}>
            <Text style={[styles.readAllBtnText, { color: colors.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterPill, { backgroundColor: colors.cardSubtle }, filter === 'all' && { backgroundColor: colors.primary }]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterPillText, { color: colors.textSecondary }, filter === 'all' && { color: '#FFFFFF', fontWeight: '700' }]}>
            All ({notifications.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, { backgroundColor: colors.cardSubtle }, filter === 'unread' && { backgroundColor: colors.primary }]}
          onPress={() => setFilter('unread')}
        >
          <Text style={[styles.filterPillText, { color: colors.textSecondary }, filter === 'unread' && { color: '#FFFFFF', fontWeight: '700' }]}>
            Unread ({unreadCount})
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Syncing notification history...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item: TenantNotification) => item.id || String(Math.random())}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="bell-off-outline" size={56} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No Notifications</Text>
              <Text style={styles.emptySubtitle}>
                You're all caught up. Important updates will appear here.
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
  readAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  readAllBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 8,
    backgroundColor: COLORS.bgLight,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  filterPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  filterPillTextActive: {
    color: COLORS.textWhite,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.sm,
  },
  cardUnread: {
    borderColor: COLORS.primaryLight,
    backgroundColor: '#FAF5FF',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBoxUnread: {
    backgroundColor: COLORS.primaryGlow,
  },
  contentCol: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  itemTitleUnread: {
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  itemBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  itemDate: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
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
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    padding: SPACING.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
});
