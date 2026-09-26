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
import { LandlordNotification } from '../types';

const DEVICE_FCM_TOKEN_KEY = '@rentora_landlord_fcm_token';

// Configure default notification handler for foreground notifications
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
  console.warn('Notifications handler init error in Landlord app:', e);
}

let pushTokenSubscription: Notifications.Subscription | null = null;
let currentRegisteredUid: string | null = null;

export const notificationService = {
  /**
   * Sets up default Android notification channel with high priority
   */
  async setupNotificationChannel(): Promise<void> {
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Rentora Landlord Notifications',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2563EB',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
      } catch (err) {
        console.warn('Error setting up notification channel in Landlord app:', err);
      }
    }
  },

  /**
   * Registers for push notifications and saves tokens under landlord profile
   */
  async registerForPushNotificationsAsync(uid: string): Promise<string | null> {
    if (!uid) return null;

    currentRegisteredUid = uid;

    try {
      await this.setupNotificationChannel();

      // Check current permission status
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Only prompt if not determined
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('[LandlordNotificationService] Push notification permission not granted or denied.');
        return null;
      }

      const tokensToAdd: string[] = [];

      // 1. Obtain native FCM registration token from Android
      try {
        const devicePushToken = await Notifications.getDevicePushTokenAsync();
        if (devicePushToken && devicePushToken.data) {
          const rawToken = typeof devicePushToken.data === 'string'
            ? devicePushToken.data
            : JSON.stringify(devicePushToken.data);
          if (rawToken && rawToken.trim()) {
            tokensToAdd.push(rawToken.trim());
            console.log('[LandlordNotificationService] Acquired native device FCM token');
          }
        }
      } catch (deviceTokenErr) {
        console.log('[LandlordNotificationService] Native token acquisition fallback:', deviceTokenErr);
      }

      // 2. Obtain Expo push token
      try {
        const expoPush = await Notifications.getExpoPushTokenAsync({
          projectId: '7bf8286a-28e4-4aa2-8329-927d11c1394e',
        });
        if (expoPush && expoPush.data && expoPush.data.trim()) {
          tokensToAdd.push(expoPush.data.trim());
          console.log('[LandlordNotificationService] Acquired Expo push token:', expoPush.data);
        }
      } catch (expoErr) {
        console.log('[LandlordNotificationService] Expo token error:', expoErr);
      }

      if (tokensToAdd.length === 0) {
        console.warn('[LandlordNotificationService] Unable to obtain push token.');
        return null;
      }

      // Check previously saved token on this device
      const previousToken = await AsyncStorage.getItem(DEVICE_FCM_TOKEN_KEY);

      // Save tokens in Firestore users/{uid} with multi-device arrayUnion
      const userDocRef = doc(db, 'users', uid);
      try {
        await updateDoc(userDocRef, {
          notificationTokens: arrayUnion(...tokensToAdd),
          updatedAt: new Date().toISOString(),
        });
        if (previousToken && !tokensToAdd.includes(previousToken)) {
          await updateDoc(userDocRef, {
            notificationTokens: arrayRemove(previousToken),
          });
        }
      } catch (uErr) {
        console.warn('[LandlordNotificationService] Error updating user doc token:', uErr);
      }

      // Cache primary token locally
      await AsyncStorage.setItem(DEVICE_FCM_TOKEN_KEY, tokensToAdd[0]);

      // Listen for FCM token rotations/refreshes
      if (!pushTokenSubscription) {
        pushTokenSubscription = Notifications.addPushTokenListener((newTokenData) => {
          if (newTokenData?.data && currentRegisteredUid) {
            console.log('[LandlordNotificationService] Token refreshed by OS');
            notificationService.registerForPushNotificationsAsync(currentRegisteredUid);
          }
        });
      }

      return tokensToAdd[0];
    } catch (error) {
      console.warn('[LandlordNotificationService] Could not register push notification token:', error);
      return null;
    }
  },

  /**
   * Direct push dispatch via Expo push service (immediate 24/7, works in background/terminated)
   */
  async sendPushNotificationDirect(payload: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, any>;
  }): Promise<boolean> {
    if (!payload.tokens || payload.tokens.length === 0) return false;

    const expoTokens = Array.from(
      new Set(
        payload.tokens.filter(
          (t) => typeof t === 'string' && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['))
        )
      )
    );

    if (expoTokens.length === 0) {
      console.log('[LandlordPushDirect] No valid Expo push tokens found among:', payload.tokens);
      return false;
    }

    const messages = expoTokens.map((to) => ({
      to,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      priority: 'high',
      channelId: 'default',
      _displayInForeground: true,
    }));

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      const resData = await response.json();
      console.log('[LandlordPushDirect] Sent to', expoTokens.length, 'tokens:', resData);
      return true;
    } catch (pushErr) {
      console.warn('[LandlordPushDirect] Push dispatch network error:', pushErr);
      return false;
    }
  },

  /**
   * Unregisters device token on landlord logout
   */
  async unregisterPushNotificationsAsync(uid: string): Promise<void> {
    try {
      const storedToken = await AsyncStorage.getItem(DEVICE_FCM_TOKEN_KEY);
      if (storedToken && uid) {
        const userDocRef = doc(db, 'users', uid);
        await updateDoc(userDocRef, {
          notificationTokens: arrayRemove(storedToken),
          updatedAt: new Date().toISOString(),
        }).catch(() => {});

        await AsyncStorage.removeItem(DEVICE_FCM_TOKEN_KEY);
      }

      if (pushTokenSubscription) {
        pushTokenSubscription.remove();
        pushTokenSubscription = null;
      }
      currentRegisteredUid = null;
    } catch (err) {
      console.warn('[LandlordNotificationService] Error unregistering token on logout:', err);
    }
  },

  /**
   * Deep navigates to the relevant screen when landlord taps a notification
   */
  handleNotificationTap(response: Notifications.NotificationResponse, router: any): void {
    try {
      const data = response?.notification?.request?.content?.data || {};
      const type = data.type || data.notificationType;
      const paymentId = data.paymentId || data.relatedPaymentId;
      const billId = data.billId || data.relatedBillId;

      console.log('[LandlordNotificationService] Notification tapped:', { type, paymentId, billId });

      // If notification is about a payment submission: open Payment Verifications screen
      if (type === 'payment_submitted' || paymentId) {
        router.push('/bills/payment-verifications');
        return;
      }

      // If notification is about a bill: open Bill Details screen
      if (billId) {
        router.push({
          pathname: '/bills/[id]',
          params: { id: billId },
        });
        return;
      }

      // Default fallback: open In-App Notifications Center
      router.push('/notifications');
    } catch (navErr) {
      console.warn('[LandlordNotificationService] Error navigating from tap:', navErr);
      try {
        router.push('/notifications');
      } catch (fallbackErr) {}
    }
  },

  /**
   * Subscribes to real-time notifications for the authenticated landlord
   */
  subscribeLandlordNotifications(
    ownerId: string,
    onUpdate: (notifications: LandlordNotification[]) => void,
    onError?: (err: any) => void
  ): Unsubscribe {
    if (!ownerId) {
      onUpdate([]);
      return () => {};
    }

    const q = query(
      collection(db, 'notifications'),
      where('ownerId', '==', ownerId),
      limit(50)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list: LandlordNotification[] = [];
        snapshot.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...(docSnap.data() as Omit<LandlordNotification, 'id'>),
          });
        });

        // Sort newest first
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

        onUpdate(list);
      },
      (error) => {
        console.error('Error fetching landlord notifications:', error);
        if (onError) onError(error);
      }
    );
  },

  /**
   * Marks a single notification as read
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
   * Marks all unread notifications as read
   */
  async markAllNotificationsAsRead(ownerId: string): Promise<void> {
    if (!ownerId) return;
    try {
      const q = query(
        collection(db, 'notifications'),
        where('ownerId', '==', ownerId),
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
