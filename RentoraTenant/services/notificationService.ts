import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  collection, 
  doc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove,
  onSnapshot, 
  query, 
  where, 
  limit,
  Unsubscribe,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from '../firebase/config';
import { TenantNotification } from '../types';

const DEVICE_FCM_TOKEN_KEY = '@rentora_tenant_fcm_token';

// Configure foreground notifications presentation behavior
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (e) {
  console.warn('Notifications handler init error:', e);
}

let pushTokenSubscription: Notifications.Subscription | null = null;
let currentRegisteredUid: string | null = null;
let currentRegisteredTenantId: string | null = null;

export const notificationService = {
  /**
   * Sets up default Android notification channel with high priority
   */
  async setupNotificationChannel(): Promise<void> {
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Rentora Notifications',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6366F1',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });
      } catch (err) {
        console.warn('Error configuring Android notification channel:', err);
      }
    }
  },

  /**
   * Requests permission naturally and registers device's FCM token in Firestore
   */
  async registerForPushNotificationsAsync(uid: string, tenantId?: string): Promise<string | null> {
    if (!uid) return null;

    currentRegisteredUid = uid;
    currentRegisteredTenantId = tenantId || null;

    try {
      await this.setupNotificationChannel();

      // Check existing permission
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Only request if not already determined
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('[NotificationService] Push notification permission not granted or denied.');
        return null;
      }

      // 1. Obtain native FCM registration token from Android device
      let token: string | null = null;
      try {
        const devicePushToken = await Notifications.getDevicePushTokenAsync();
        if (devicePushToken && devicePushToken.data) {
          token = typeof devicePushToken.data === 'string' 
            ? devicePushToken.data 
            : JSON.stringify(devicePushToken.data);
          console.log('[NotificationService] Acquired native device FCM token');
        }
      } catch (deviceTokenErr) {
        console.log('[NotificationService] Native FCM token acquisition fallback (e.g. Expo Go):', deviceTokenErr);
      }

      // Fallback for Expo development client / simulator
      if (!token) {
        try {
          const expoPush = await Notifications.getExpoPushTokenAsync();
          token = expoPush?.data || null;
        } catch (expoErr) {
          console.log('[NotificationService] Expo push token fallback error:', expoErr);
        }
      }

      if (!token) {
        console.warn('[NotificationService] Unable to obtain device push token.');
        return null;
      }

      // Check previously saved token on this device
      const previousToken = await AsyncStorage.getItem(DEVICE_FCM_TOKEN_KEY);

      // Save token in Firestore users/{uid}
      const userDocRef = doc(db, 'users', uid);
      const updates: any = {
        notificationTokens: arrayUnion(token),
        updatedAt: new Date().toISOString(),
      };

      if (previousToken && previousToken !== token) {
        updates.notificationTokensToRemove = arrayRemove(previousToken);
      }

      try {
        await updateDoc(userDocRef, {
          notificationTokens: arrayUnion(token),
          updatedAt: new Date().toISOString(),
        });
        if (previousToken && previousToken !== token) {
          await updateDoc(userDocRef, {
            notificationTokens: arrayRemove(previousToken),
          });
        }
      } catch (uErr) {
        console.warn('[NotificationService] Error updating user doc token:', uErr);
      }

      // Save token in tenants/{tenantId}
      if (tenantId) {
        try {
          const tenantDocRef = doc(db, 'tenants', tenantId);
          await updateDoc(tenantDocRef, {
            notificationTokens: arrayUnion(token),
            updatedAt: new Date().toISOString(),
          });
          if (previousToken && previousToken !== token) {
            await updateDoc(tenantDocRef, {
              notificationTokens: arrayRemove(previousToken),
            });
          }
        } catch (tErr) {
          console.warn('[NotificationService] Note: Tenant document token update skipped:', tErr);
        }
      }

      // Cache token locally
      await AsyncStorage.setItem(DEVICE_FCM_TOKEN_KEY, token);

      // Listen for FCM token rotations/refreshes
      if (!pushTokenSubscription) {
        pushTokenSubscription = Notifications.addPushTokenListener((newTokenData) => {
          if (newTokenData?.data && currentRegisteredUid) {
            console.log('[NotificationService] FCM Token refreshed by OS');
            notificationService.registerForPushNotificationsAsync(
              currentRegisteredUid,
              currentRegisteredTenantId || undefined
            );
          }
        });
      }

      return token;
    } catch (error) {
      console.warn('[NotificationService] Could not register push notification token:', error);
      return null;
    }
  },

  /**
   * Unregisters device token on user logout to prevent unwanted notifications
   */
  async unregisterPushNotificationsAsync(uid: string, tenantId?: string): Promise<void> {
    try {
      const storedToken = await AsyncStorage.getItem(DEVICE_FCM_TOKEN_KEY);
      if (storedToken) {
        if (uid) {
          const userDocRef = doc(db, 'users', uid);
          await updateDoc(userDocRef, {
            notificationTokens: arrayRemove(storedToken),
            updatedAt: new Date().toISOString(),
          }).catch(() => {});
        }

        if (tenantId) {
          const tenantDocRef = doc(db, 'tenants', tenantId);
          await updateDoc(tenantDocRef, {
            notificationTokens: arrayRemove(storedToken),
            updatedAt: new Date().toISOString(),
          }).catch(() => {});
        }

        await AsyncStorage.removeItem(DEVICE_FCM_TOKEN_KEY);
      }

      if (pushTokenSubscription) {
        pushTokenSubscription.remove();
        pushTokenSubscription = null;
      }
      currentRegisteredUid = null;
      currentRegisteredTenantId = null;
    } catch (err) {
      console.warn('[NotificationService] Error unregistering push token on logout:', err);
    }
  },

  /**
   * Handles notification tap deep-linking to the appropriate screen
   */
  handleNotificationTap(response: Notifications.NotificationResponse, router: any): void {
    try {
      const data = response?.notification?.request?.content?.data || {};
      const type = data.type || data.notificationType;
      const billId = data.billId || data.relatedBillId;
      const paymentId = data.paymentId || data.relatedPaymentId;

      console.log('[NotificationService] Notification tapped:', { type, billId, paymentId });

      if (billId) {
        // Navigate to Bill Details
        router.push({
          pathname: '/bills/[id]',
          params: { id: billId },
        });
        return;
      }

      if (type === 'payment_approved' || type === 'payment_rejected' || type === 'payment_submitted') {
        router.push('/(tabs)/payments');
        return;
      }

      // Default fallback: open Notifications Center
      router.push('/notifications');
    } catch (navErr) {
      console.warn('[NotificationService] Error navigating from notification tap:', navErr);
      try {
        router.push('/notifications');
      } catch (fallbackErr) {}
    }
  },

  /**
   * Subscribes to real-time notifications for the authenticated tenant
   */
  subscribeTenantNotifications(
    tenantId: string,
    onUpdate: (notifications: TenantNotification[]) => void,
    onError?: (err: any) => void
  ): Unsubscribe {
    if (!tenantId) {
      onUpdate([]);
      return () => {};
    }

    const q = query(
      collection(db, 'notifications'),
      where('tenantId', '==', tenantId),
      limit(50)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list: TenantNotification[] = [];
        snapshot.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...(docSnap.data() as Omit<TenantNotification, 'id'>),
          });
        });

        // Sort newest first
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

        onUpdate(list);
      },
      (error) => {
        console.error('Error fetching tenant notifications:', error);
        if (onError) onError(error);
      }
    );
  },

  /**
   * Marks a single notification document as read
   */
  async markNotificationAsRead(notificationId: string): Promise<void> {
    if (!notificationId) return;
    try {
      const docRef = doc(db, 'notifications', notificationId);
      await updateDoc(docRef, { isRead: true });
    } catch (error) {
      console.warn('Failed to mark notification as read:', error);
    }
  },

  /**
   * Marks all unread notifications for a tenant as read
   */
  async markAllNotificationsAsRead(tenantId: string): Promise<void> {
    if (!tenantId) return;
    try {
      const q = query(
        collection(db, 'notifications'),
        where('tenantId', '==', tenantId),
        where('isRead', '==', false)
      );
      const snap = await getDocs(q);
      const batch = writeBatch(db);

      snap.forEach((docSnap) => {
        batch.update(docSnap.ref, { isRead: true });
      });

      await batch.commit();
    } catch (error) {
      console.warn('Failed to mark all notifications as read:', error);
    }
  },
};

export default notificationService;
