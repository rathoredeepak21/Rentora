import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useTheme, useStyles, typography, spacing } from '../../theme';
import { notificationService } from '../../services/notificationService';
import { LandlordNotification } from '../../types';
import EmptyState from '../../components/ui/EmptyState';

type FilterType = 'all' | 'unread';

export default function LandlordNotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useStyles(getStyles);

  const [notifications, setNotifications] = useState<LandlordNotification[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const unsubscribe = notificationService.subscribeLandlordNotifications(
      user.uid,
      (list) => {
        setNotifications(list);
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.warn('Error fetching landlord notifications:', err);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  const handleMarkAllRead = async () => {
    if (!user?.uid) return;
    await notificationService.markAllNotificationsAsRead(user.uid);
  };

  const handleNotificationPress = async (item: LandlordNotification) => {
    if (item.id && !item.isRead) {
      await notificationService.markNotificationAsRead(item.id);
    }

    const type = item.type || item.notificationType;
    if (type === 'payment_submitted' || item.relatedPaymentId) {
      router.push('/bills/payment-verifications');
      return;
    }

    if (item.relatedBillId) {
      router.push({
        pathname: '/bills/[id]',
        params: { id: item.relatedBillId },
      });
      return;
    }
  };

  const filteredList = notifications.filter((n) => {
    if (filter === 'unread') return !n.isRead;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const getIconInfo = (type?: string) => {
    switch (type) {
      case 'payment_submitted':
        return { name: 'cash-outline' as const, bg: '#FEF3C7', color: '#D97706' };
      case 'payment_approved':
        return { name: 'checkmark-circle-outline' as const, bg: '#DCFCE7', color: '#16A34A' };
      case 'payment_rejected':
        return { name: 'close-circle-outline' as const, bg: '#FEE2E2', color: '#DC2626' };
      case 'new_bill':
        return { name: 'receipt-outline' as const, bg: '#DBEAFE', color: '#2563EB' };
      case 'bill_paid':
        return { name: 'trophy-outline' as const, bg: '#DCFCE7', color: '#16A34A' };
      default:
        return { name: 'notifications-outline' as const, bg: '#E0E7FF', color: '#4F46E5' };
    }
  };

  const formatTimestamp = (isoDate?: string) => {
    if (!isoDate) return '';
    try {
      const d = new Date(isoDate);
      const now = new Date();
      const diffSecs = Math.floor((now.getTime() - d.getTime()) / 1000);

      if (diffSecs < 60) return 'Just now';
      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
      if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
      if (diffSecs < 604800) return `${Math.floor(diffSecs / 86400)}d ago`;

      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  const renderItem = ({ item }: { item: LandlordNotification }) => {
    const iconInfo = getIconInfo(item.type || item.notificationType);
    const timeStr = formatTimestamp(item.createdAt);

    return (
      <TouchableOpacity
        style={[
          styles.notifCard,
          !item.isRead && styles.unreadCard,
        ]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.75}
      >
        <View style={[styles.iconBox, { backgroundColor: iconInfo.bg }]}>
          <Ionicons name={iconInfo.name} size={22} color={iconInfo.color} />
        </View>

        <View style={styles.contentBox}>
          <View style={styles.topRow}>
            <Text style={[styles.notifTitle, !item.isRead && styles.unreadTitle]} numberOfLines={1}>
              {item.title}
            </Text>
            {timeStr ? <Text style={styles.timeText}>{timeStr}</Text> : null}
          </View>

          <Text style={styles.notifBody} numberOfLines={3}>
            {item.message || item.body}
          </Text>
        </View>

        {!item.isRead && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header controls: Filter chips & Mark all read */}
      <View style={styles.controlBar}>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]}>
              All ({notifications.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filter === 'unread' && styles.filterChipActive]}
            onPress={() => setFilter('unread')}
          >
            <Text style={[styles.filterChipText, filter === 'unread' && styles.filterChipTextActive]}>
              Unread ({unreadCount})
            </Text>
          </TouchableOpacity>
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAllRead}>
            <Ionicons name="checkmark-done" size={16} color={colors.primary} />
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredList.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title={filter === 'unread' ? 'No Unread Notifications' : 'No Notifications Yet'}
          description={
            filter === 'unread'
              ? 'You are all caught up! No unread notifications.'
              : 'You will receive updates when tenants submit payments or perform key actions.'
          }
        />
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={(item, index) => item.id || String(index)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    controlBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    filterRow: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.surfaceVariant || '#F1F5F9',
    },
    filterChipActive: {
      backgroundColor: colors.primary,
    },
    filterChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    filterChipTextActive: {
      color: '#FFFFFF',
    },
    markAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    markAllText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    listContent: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    notifCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      position: 'relative',
    },
    unreadCard: {
      backgroundColor: colors.surface,
      borderColor: colors.primary + '33',
    },
    iconBox: {
      width: 44,
      height: 44,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: spacing.sm,
    },
    contentBox: {
      flex: 1,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    notifTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
      marginRight: 8,
    },
    unreadTitle: {
      fontWeight: '700',
      color: colors.text,
    },
    timeText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    notifBody: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
      marginLeft: 6,
      alignSelf: 'center',
    },
  });
