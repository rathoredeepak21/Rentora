import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { tenantDataService } from '../../services/tenantDataService';
import { notificationService } from '../../services/notificationService';
import { Bill, Property, Unit, PaymentStatus, PaymentSubmission, TenantNotification } from '../../types';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import SwipeableTabWrapper from '../../components/ui/SwipeableTabWrapper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppSafeAreaView from '../../components/ui/AppSafeAreaView';

export default function TenantDashboardScreen() {
  const { userProfile, logout } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [property, setProperty] = useState<Property | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [notifications, setNotifications] = useState<TenantNotification[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    if (!userProfile?.tenantId) {
      setIsLoadingData(false);
      return;
    }

    let isMounted = true;

    // 1. Fetch Property & Unit details
    const loadHousingDetails = async () => {
      try {
        if (userProfile.propertyId) {
          const prop = await tenantDataService.fetchPropertyDetails(userProfile.propertyId);
          if (isMounted) setProperty(prop);
        }
        if (userProfile.unitId) {
          const u = await tenantDataService.fetchUnitDetails(userProfile.unitId);
          if (isMounted) setUnit(u);
        }
      } catch (e) {
        console.log('Error fetching housing details:', e);
      }
    };
    loadHousingDetails();

    // 2. Subscribe to Notifications for unread badge & timeline
    const unsubscribeNotifs = notificationService.subscribeTenantNotifications(
      userProfile.tenantId,
      (list) => {
        if (isMounted) setNotifications(list);
      }
    );

    // 3. Subscribe to Real-Time Payments for Latest Activity card
    const unsubscribePayments = tenantDataService.subscribeTenantPayments(
      userProfile.tenantId,
      (list) => {
        if (isMounted) setPayments(list);
      }
    );

    // 4. Subscribe Real-Time to Tenant Bills
    const unsubscribeBills = tenantDataService.subscribeTenantBills(
      userProfile.tenantId,
      (updatedBills) => {
        if (isMounted) {
          setBills(updatedBills);
          setIsLoadingData(false);
          setRefreshing(false);
          setHasError(false);
        }
      },
      (err) => {
        if (isMounted) {
          setIsLoadingData(false);
          setRefreshing(false);
          setHasError(true);
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribeNotifs();
      unsubscribePayments();
      unsubscribeBills();
    };
  }, [userProfile?.tenantId, userProfile?.propertyId, userProfile?.unitId]);

  const onRefresh = () => {
    setRefreshing(true);
    setHasError(false);
    if (!userProfile?.tenantId) {
      setRefreshing(false);
    }
  };

  const currentBill = bills.length > 0 ? bills[0] : null;
  const latestPayment = payments.length > 0 ? payments[0] : null;
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const outstandingBillsCount = bills.filter((b) => b.remainingAmount > 0).length;

  const isBillOverdue = (dueDateStr?: string) => {
    if (!dueDateStr) return false;
    try {
      const due = new Date(dueDateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return due < today;
    } catch (e) {
      return false;
    }
  };

  const renderStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'paid':
        return (
          <View style={[styles.badge, styles.badgePaid]}>
            <View style={[styles.badgeDot, { backgroundColor: COLORS.success }]} />
            <Text style={[styles.badgeText, { color: COLORS.success }]}>PAID</Text>
          </View>
        );
      case 'partial':
        return (
          <View style={[styles.badge, styles.badgePartial]}>
            <View style={[styles.badgeDot, { backgroundColor: COLORS.warning }]} />
            <Text style={[styles.badgeText, { color: COLORS.warning }]}>PARTIALLY PAID</Text>
          </View>
        );
      case 'unpaid':
      default:
        return (
          <View style={[styles.badge, styles.badgeUnpaid]}>
            <View style={[styles.badgeDot, { backgroundColor: COLORS.danger }]} />
            <Text style={[styles.badgeText, { color: COLORS.danger }]}>UNPAID</Text>
          </View>
        );
    }
  };

  const renderPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <View style={[styles.badge, styles.badgePaid]}>
            <View style={[styles.badgeDot, { backgroundColor: COLORS.success }]} />
            <Text style={[styles.badgeText, { color: COLORS.success }]}>VERIFIED</Text>
          </View>
        );
      case 'rejected':
        return (
          <View style={[styles.badge, styles.badgeUnpaid]}>
            <View style={[styles.badgeDot, { backgroundColor: COLORS.danger }]} />
            <Text style={[styles.badgeText, { color: COLORS.danger }]}>REJECTED</Text>
          </View>
        );
      case 'pending':
      default:
        return (
          <View style={[styles.badge, styles.badgePartial]}>
            <View style={[styles.badgeDot, { backgroundColor: COLORS.warning }]} />
            <Text style={[styles.badgeText, { color: COLORS.warning }]}>PENDING VERIFICATION</Text>
          </View>
        );
    }
  };

  const formatMonthTitle = (monthStr?: string) => {
    if (!monthStr) return 'Current Bill Statement';
    try {
      const [year, month] = monthStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    } catch (e) {
      return monthStr;
    }
  };

  const getCountdownInfo = (bill: Bill | null) => {
    if (!bill) {
      return {
        type: 'no_bill',
        icon: 'calendar-blank-outline',
        iconColor: colors.primary,
        headerTitle: 'Rent Status',
        headline: 'No active bill generated',
        subtext: 'Your next rent statement will appear here as soon as issued.',
        badgeBg: colors.cardSubtle,
        badgeText: 'NEUTRAL',
        badgeColor: colors.textSecondary,
      };
    }

    if (bill.remainingAmount <= 0 || bill.paymentStatus === 'paid') {
      return {
        type: 'paid',
        icon: 'check-decagram',
        iconColor: colors.success,
        headerTitle: 'Rent Paid',
        headline: `${formatMonthTitle(bill.billingMonth)} rent fully paid`,
        subtext: 'Outstanding Balance: ₹0 • Thank you for your payment',
        badgeBg: colors.successBg,
        badgeText: 'PAID',
        badgeColor: colors.success,
      };
    }

    if (!bill.dueDate) {
      return {
        type: 'no_due_date',
        icon: 'file-document-outline',
        iconColor: colors.primary,
        headerTitle: 'Current Rent Bill',
        headline: `Remaining Due: ₹${bill.remainingAmount.toLocaleString('en-IN')}`,
        subtext: 'Tap to view bill details for payment instructions.',
        badgeBg: colors.primaryGlow,
        badgeText: 'ACTIVE',
        badgeColor: colors.primary,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueParts = bill.dueDate.split('-').map(Number);
    let due: Date;
    if (dueParts.length === 3 && !isNaN(dueParts[0]) && !isNaN(dueParts[1]) && !isNaN(dueParts[2])) {
      due = new Date(dueParts[0], dueParts[1] - 1, dueParts[2]);
    } else {
      due = new Date(bill.dueDate);
    }
    due.setHours(0, 0, 0, 0);

    const diffMs = due.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const overdueDays = Math.abs(diffDays);
      return {
        type: 'overdue',
        icon: 'alert-circle',
        iconColor: colors.danger,
        headerTitle: '🔴 Rent Overdue',
        headline: `Overdue by ${overdueDays} ${overdueDays === 1 ? 'day' : 'days'}`,
        subtext: `Due Date: ${bill.dueDate} • Remaining: ₹${bill.remainingAmount.toLocaleString('en-IN')}`,
        badgeBg: colors.dangerBg,
        badgeText: 'OVERDUE',
        badgeColor: colors.danger,
      };
    } else if (diffDays === 0) {
      return {
        type: 'today',
        icon: 'clock-alert-outline',
        iconColor: colors.warning,
        headerTitle: '⚠️ Rent Due Today',
        headline: 'Rent Payment Due Today',
        subtext: `Remaining: ₹${bill.remainingAmount.toLocaleString('en-IN')}`,
        badgeBg: colors.warningBg,
        badgeText: 'DUE TODAY',
        badgeColor: colors.warning,
      };
    } else if (diffDays <= 7) {
      return {
        type: 'soon',
        icon: 'clock-outline',
        iconColor: colors.warning,
        headerTitle: '📅 Rent Due',
        headline: `Rent due in ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`,
        subtext: `Due Date: ${bill.dueDate} • Remaining: ₹${bill.remainingAmount.toLocaleString('en-IN')}`,
        badgeBg: colors.warningBg,
        badgeText: 'DUE SOON',
        badgeColor: colors.warning,
      };
    } else {
      return {
        type: 'upcoming',
        icon: 'calendar-clock-outline',
        iconColor: colors.primary,
        headerTitle: '📅 Rent Due',
        headline: `Rent due in ${diffDays} days`,
        subtext: `Due Date: ${bill.dueDate} • Remaining: ₹${bill.remainingAmount.toLocaleString('en-IN')}`,
        badgeBg: colors.primaryGlow,
        badgeText: 'UPCOMING',
        badgeColor: colors.primary,
      };
    }
  };

  return (
    <SwipeableTabWrapper currentTab="index">
      <AppSafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
        <StatusBar style={colors.statusBarStyle} />
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 90, 110) }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        >
        {/* Header Profile & Quick Controls Card */}
        <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <View style={styles.userInfoRow}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.primaryGlow }]}>
              <MaterialCommunityIcons name="account" size={30} color={colors.primary} />
            </View>

            <View style={styles.userTextCol}>
              <Text style={[styles.welcomeLabel, { color: colors.textMuted }]}>Welcome,</Text>
              <Text style={[styles.userName, { color: colors.textPrimary }]}>{userProfile?.name || 'Tenant'}</Text>
              <View style={styles.housingInfoRow}>
                <MaterialCommunityIcons name="home-city-outline" size={13} color={colors.textSecondary} />
                <Text style={[styles.housingText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {property?.name || 'Property'} • Room {unit?.unitNumber || 'Unit'}
                </Text>
              </View>
            </View>

            {/* Notification Bell with Badge */}
            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: colors.cardSubtle }]}
              onPress={() => router.push('/notifications')}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="bell-outline" size={22} color={colors.textPrimary} />
              {unreadCount > 0 ? (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>

            {/* Settings Gear Icon */}
            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: colors.cardSubtle }]}
              onPress={() => router.push('/settings')}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="cog-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* RENT DUE COUNTDOWN CARD */}
        {!isLoadingData && currentBill ? (
          (() => {
            const countdown = getCountdownInfo(currentBill);
            return (
              <TouchableOpacity
                style={[
                  styles.countdownCard,
                  { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                  countdown.type === 'overdue' && { borderColor: colors.danger, borderWidth: 1.5 },
                  countdown.type === 'today' && { borderColor: colors.warning, borderWidth: 1.5 },
                ]}
                onPress={() => router.push(`/bills/${currentBill.id}`)}
                activeOpacity={0.85}
              >
                <View style={styles.countdownRow}>
                  <View style={[styles.countdownIconBox, { backgroundColor: countdown.badgeBg }]}>
                    <MaterialCommunityIcons name={countdown.icon as any} size={28} color={countdown.iconColor} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.countdownHeaderRow}>
                      <Text style={[styles.countdownTitle, { color: colors.textPrimary }]}>
                        {countdown.headerTitle}
                      </Text>

                      <View style={[styles.countdownBadge, { backgroundColor: countdown.badgeBg }]}>
                        <Text style={[styles.countdownBadgeText, { color: countdown.badgeColor }]}>
                          {countdown.badgeText}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.countdownHeadline, { color: colors.textPrimary }]}>
                      {countdown.headline}
                    </Text>

                    <Text style={[styles.countdownSubtext, { color: colors.textSecondary }]}>
                      {countdown.subtext}
                    </Text>
                  </View>

                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            );
          })()
        ) : null}

        {/* Network Error Card */}
        {hasError ? (
          <View style={styles.errorCard}>
            <MaterialCommunityIcons name="wifi-off" size={28} color={COLORS.danger} />
            <Text style={styles.errorTitle}>Unable to load latest statement</Text>
            <Text style={styles.errorSubtitle}>Please check your internet connection and try again.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : isLoadingData ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Syncing your statement records...</Text>
          </View>
        ) : currentBill ? (
          <>
            {/* Multiple Outstanding Bills Alert Pill */}
            {outstandingBillsCount > 1 ? (
              <TouchableOpacity
                style={styles.alertPill}
                onPress={() => router.push('/(tabs)/bills')}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={COLORS.warning} />
                <Text style={styles.alertPillText}>
                  {outstandingBillsCount} Bills Outstanding — View All Statements
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.warning} />
              </TouchableOpacity>
            ) : null}

            {/* HERO CURRENT BILL CARD */}
            <View style={styles.currentBillCard}>
              <View style={styles.cardTopBar}>
                <View style={styles.monthBox}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={18} color={COLORS.primaryLight} />
                  <Text style={styles.monthTitle}>{formatMonthTitle(currentBill.billingMonth)}</Text>
                </View>
                {renderStatusBadge(currentBill.paymentStatus)}
              </View>

              {currentBill.remainingAmount === 0 || currentBill.paymentStatus === 'paid' ? (
                /* All Paid Up Banner View */
                <View style={styles.allPaidUpBox}>
                  <MaterialCommunityIcons name="check-decagram" size={44} color={COLORS.success} />
                  <Text style={styles.allPaidTitle}>You're all paid up! 🎉</Text>
                  <Text style={styles.allPaidSub}>
                    Outstanding Balance: ₹0 • Thank you for your payment
                  </Text>
                </View>
              ) : (
                /* Active Payable Hero Display */
                <View style={styles.heroAmountBox}>
                  <Text style={styles.totalPayableLabel}>Remaining Amount Due</Text>
                  <Text style={styles.totalPayableValue}>₹{currentBill.remainingAmount.toLocaleString('en-IN')}</Text>
                  <Text style={styles.totalBillSubText}>
                    Total Bill Statement: ₹{currentBill.totalAmount.toLocaleString('en-IN')}
                  </Text>
                </View>
              )}

              {/* Previous Due Arrears Breakdown Note */}
              {currentBill.previousDue > 0 ? (
                <View style={styles.previousDueNote}>
                  <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.warning} />
                  <Text style={styles.previousDueNoteText}>
                    {currentBill.previousDueRemaining === 0 && (currentBill.previousDuePaid || 0) > 0
                      ? `Previous Arrears (₹${currentBill.previousDue.toLocaleString('en-IN')}) Cleared • Remaining Current Bill: ₹${(currentBill.currentBillRemaining !== undefined ? currentBill.currentBillRemaining : currentBill.remainingAmount).toLocaleString('en-IN')}`
                      : `Includes Current Bill (₹${currentBill.subtotal.toLocaleString('en-IN')}) + Previous Arrears (₹${currentBill.previousDue.toLocaleString('en-IN')})`}
                  </Text>
                </View>
              ) : null}

              {/* Financial Breakdown Grid */}
              <View style={styles.breakdownGrid}>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Statement Total</Text>
                  <Text style={styles.gridValue}>₹{currentBill.totalAmount.toLocaleString('en-IN')}</Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Already Paid</Text>
                  <Text style={[styles.gridValue, { color: COLORS.success }]}>
                    ₹{currentBill.paidAmount.toLocaleString('en-IN')}
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Remaining Due</Text>
                  <Text
                    style={[
                      styles.gridValue,
                      {
                        color: currentBill.remainingAmount > 0 ? COLORS.danger : COLORS.success,
                        fontWeight: '800',
                      },
                    ]}
                  >
                    ₹{currentBill.remainingAmount.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

              {/* Due Date & Action Row */}
              <View style={styles.cardFooterRow}>
                <View style={styles.dueDateRow}>
                  <MaterialCommunityIcons
                    name="clock-outline"
                    size={16}
                    color={isBillOverdue(currentBill.dueDate) ? COLORS.danger : COLORS.textMuted}
                  />
                  <Text
                    style={[
                      styles.dueDateText,
                      isBillOverdue(currentBill.dueDate) && currentBill.remainingAmount > 0 && styles.overdueText,
                    ]}
                  >
                    {isBillOverdue(currentBill.dueDate) && currentBill.remainingAmount > 0
                      ? `OVERDUE (${currentBill.dueDate})`
                      : `Due: ${currentBill.dueDate || 'N/A'}`}
                  </Text>
                </View>

                <View style={styles.footerActionGroup}>
                  <TouchableOpacity
                    style={styles.viewBillSecondaryBtn}
                    onPress={() => router.push(`/bills/${currentBill.id}`)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.viewBillSecondaryBtnText}>Details</Text>
                  </TouchableOpacity>

                  {currentBill.remainingAmount > 0 ? (
                    <TouchableOpacity
                      style={styles.payBillHeroBtn}
                      onPress={() => router.push(`/bills/pay/${currentBill.id}`)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.payBillHeroBtnText}>Pay Bill Now</Text>
                      <MaterialCommunityIcons name="arrow-right" size={16} color={COLORS.textWhite} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          </>
        ) : (
          /* Empty State when no bills exist */
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="file-document-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No current bill generated</Text>
            <Text style={styles.emptySubtitle}>
              Your latest rent statement will appear here automatically as soon as your landlord issues it.
            </Text>
          </View>
        )}

        {/* QUICK ACTIONS GRID */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>

        <View style={styles.quickGrid}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(tabs)/bills')}
            activeOpacity={0.7}
          >
            <View style={[styles.quickIconBox, { backgroundColor: COLORS.primaryGlow }]}>
              <MaterialCommunityIcons name="file-document-outline" size={22} color={COLORS.primary} />
            </View>
            <Text style={styles.quickTitle}>My Bills</Text>
            <Text style={styles.quickSub}>Statements</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(tabs)/history')}
            activeOpacity={0.7}
          >
            <View style={[styles.quickIconBox, { backgroundColor: COLORS.successBg }]}>
              <MaterialCommunityIcons name="history" size={22} color={COLORS.success} />
            </View>
            <Text style={styles.quickTitle}>History</Text>
            <Text style={styles.quickSub}>UTR Verification</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/notifications')}
            activeOpacity={0.7}
          >
            <View style={[styles.quickIconBox, { backgroundColor: COLORS.warningBg }]}>
              <MaterialCommunityIcons name="bell-outline" size={22} color={COLORS.warning} />
            </View>
            <Text style={styles.quickTitle}>Notifications</Text>
            <Text style={styles.quickSub}>Updates ({unreadCount})</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(tabs)/profile')}
            activeOpacity={0.7}
          >
            <View style={[styles.quickIconBox, { backgroundColor: COLORS.bgLight }]}>
              <MaterialCommunityIcons name="account-outline" size={22} color={COLORS.textPrimary} />
            </View>
            <Text style={styles.quickTitle}>My Profile</Text>
            <Text style={styles.quickSub}>Housing Info</Text>
          </TouchableOpacity>
        </View>

        {/* LATEST PAYMENT ACTIVITY CARD */}
        {latestPayment ? (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Latest Payment Submission</Text>
              <TouchableOpacity onPress={() => router.push('/payments/history')} activeOpacity={0.7}>
                <Text style={styles.seeAllText}>View All History</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.latestPaymentCard}
              onPress={() => router.push(`/payments/${latestPayment.id}`)}
              activeOpacity={0.8}
            >
              <View style={styles.latestPaymentRow}>
                <View style={styles.latestPaymentIconBox}>
                  <MaterialCommunityIcons name="receipt-text-outline" size={22} color={COLORS.primary} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.latestPaymentAmount}>₹{latestPayment.amount.toLocaleString('en-IN')}</Text>
                  <Text style={styles.latestPaymentUtr}>UTR: {latestPayment.transactionId || 'N/A'}</Text>
                  <Text style={styles.latestPaymentDate}>
                    Submitted: {latestPayment.submittedAt ? latestPayment.submittedAt.split('T')[0] : 'N/A'}
                  </Text>
                </View>

                {renderPaymentStatusBadge(latestPayment.status)}
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* RECENT ACTIVITY TIMELINE FEED (3-5 Items) */}
        {notifications.length > 0 ? (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <TouchableOpacity onPress={() => router.push('/notifications')} activeOpacity={0.7}>
                <Text style={styles.seeAllText}>View All ({notifications.length})</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.timelineCard}>
              {notifications.slice(0, 4).map((notif, index) => (
                <TouchableOpacity
                  key={notif.id || String(index)}
                  style={[
                    styles.timelineRow,
                    index === notifications.slice(0, 4).length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => {
                    if (notif.billId) router.push(`/bills/${notif.billId}`);
                    else if (notif.paymentId) router.push(`/payments/${notif.paymentId}`);
                    else router.push('/notifications');
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.timelineDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.timelineTitle} numberOfLines={1}>
                      {notif.title}
                    </Text>
                    <Text style={styles.timelineBody} numberOfLines={1}>
                      {notif.body}
                    </Text>
                  </View>
                  <Text style={styles.timelineDate}>
                    {notif.createdAt ? notif.createdAt.split('T')[0] : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </AppSafeAreaView>
  </SwipeableTabWrapper>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bgLight,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  headerCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  countdownCard: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  countdownIconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  countdownTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  countdownBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  countdownBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  countdownHeadline: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  countdownSubtext: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  userTextCol: {
    flex: 1,
  },
  welcomeLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  housingInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  housingText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    color: COLORS.textWhite,
    fontSize: 9,
    fontWeight: '800',
  },
  errorCard: {
    backgroundColor: COLORS.dangerBg,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.danger,
    marginTop: 6,
  },
  errorSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  retryBtn: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
  },
  retryBtnText: {
    color: COLORS.textWhite,
    fontWeight: '700',
    fontSize: 13,
  },
  loadingBox: {
    padding: SPACING.xxl,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  alertPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    gap: 8,
  },
  alertPillText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.warning,
  },
  currentBillCard: {
    backgroundColor: COLORS.bgDark,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  cardTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  monthBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  allPaidUpBox: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  allPaidTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textWhite,
    marginTop: SPACING.xs,
  },
  allPaidSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  heroAmountBox: {
    marginBottom: SPACING.md,
  },
  totalPayableLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  totalPayableValue: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.textWhite,
    marginTop: 2,
  },
  totalBillSubText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  previousDueNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    gap: 6,
  },
  previousDueNoteText: {
    flex: 1,
    fontSize: 11,
    color: COLORS.warning,
    fontWeight: '600',
  },
  breakdownGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  gridItem: {
    alignItems: 'flex-start',
  },
  gridLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  gridValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textWhite,
    marginTop: 2,
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: 10,
    columnGap: 8,
    paddingTop: SPACING.xs,
  },
  dueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  dueDateText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  overdueText: {
    color: COLORS.danger,
    fontWeight: '800',
  },
  footerActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginLeft: 'auto',
    maxWidth: '100%',
  },
  viewBillSecondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewBillSecondaryBtnText: {
    color: COLORS.textWhite,
    fontSize: 12,
    fontWeight: '600',
  },
  payBillHeroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    gap: 4,
    flexShrink: 0,
    ...SHADOWS.sm,
  },
  payBillHeroBtnText: {
    color: COLORS.textWhite,
    fontSize: 12,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.xxl,
    alignItems: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
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
    lineHeight: 18,
  },
  sectionContainer: {
    marginBottom: SPACING.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  quickGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
    gap: 8,
  },
  quickCard: {
    flex: 1,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  quickIconBox: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  quickSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  latestPaymentCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  latestPaymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  latestPaymentIconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  latestPaymentAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  latestPaymentUtr: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 1,
  },
  latestPaymentDate: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  timelineCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    ...SHADOWS.sm,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: 10,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  timelineTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  timelineBody: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  timelineDate: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 6,
  },
  badgePaid: { backgroundColor: COLORS.successBg },
  badgePartial: { backgroundColor: COLORS.warningBg },
  badgeUnpaid: { backgroundColor: COLORS.dangerBg },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
});
