import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../hooks/useAuth';
import { ThemeProvider, useTheme, useStyles } from '../theme';
import { StatusBar } from 'expo-status-bar';
import { notificationService } from '../services/notificationService';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootLayoutNav />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const styles = useStyles(getStyles);

  useEffect(() => {
    if (loading) return;

    const path = (segments as string[]).join('/');
    const inAuthGroup = segments[0] === '(auth)';
    const isPublicLegalScreen =
      path.includes('settings/privacy-policy') || path.includes('settings/terms');

    if (!user && !inAuthGroup && !isPublicLegalScreen) {
      // Redirect to the sign-in page if not logged in
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      // Redirect to the home page if already logged in
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  useEffect(() => {
    if (!user || loading) return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      notificationService.handleNotificationTap(response, router);
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        notificationService.handleNotificationTap(response, router);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user, loading]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerTintColor: colors.text,
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="properties/add" options={{ presentation: 'modal', headerShown: true, title: 'Add Property' }} />
        <Stack.Screen name="properties/[id]" options={{ headerShown: true, title: 'Property Details' }} />
        <Stack.Screen name="properties/edit" options={{ headerShown: true, title: 'Edit Property' }} />
        <Stack.Screen name="properties/unit-add" options={{ headerShown: true, title: 'Add Unit' }} />
        <Stack.Screen name="properties/unit-edit" options={{ headerShown: true, title: 'Edit Unit' }} />
        <Stack.Screen name="tenants/add" options={{ presentation: 'modal', headerShown: true, title: 'Add Tenant' }} />
        <Stack.Screen name="tenants/[id]" options={{ headerShown: true, title: 'Tenant Details' }} />
        <Stack.Screen name="tenants/edit" options={{ headerShown: true, title: 'Edit Tenant' }} />
        <Stack.Screen name="tenants/vacate" options={{ headerShown: true, title: 'Vacate Tenant' }} />
        <Stack.Screen name="tenants/payments" options={{ headerShown: true, title: 'Payments History' }} />
        <Stack.Screen name="bills/create" options={{ headerShown: true, title: 'Create Bill' }} />
        <Stack.Screen name="bills/preview" options={{ headerShown: true, title: 'Bill Preview' }} />
        <Stack.Screen name="bills/[id]" options={{ headerShown: true, title: 'Bill Details' }} />
        <Stack.Screen name="bills/payment" options={{ headerShown: true, title: 'Record Payment' }} />
        <Stack.Screen name="bills/payment-verifications" options={{ headerShown: true, title: 'Payment Approvals' }} />
        <Stack.Screen name="notifications/index" options={{ headerShown: true, title: 'Notifications' }} />
        <Stack.Screen name="settings/profile" options={{ headerShown: true, title: 'Profile' }} />
        <Stack.Screen name="settings/bill-customization" options={{ headerShown: true, title: 'Bill Customization' }} />
        <Stack.Screen name="settings/upi" options={{ headerShown: true, title: 'UPI Settings' }} />
        <Stack.Screen name="settings/reports" options={{ headerShown: true, title: 'Reports' }} />
        <Stack.Screen name="settings/appearance" options={{ headerShown: true, title: 'Appearance' }} />
        <Stack.Screen name="settings/privacy-policy" options={{ headerShown: true, title: 'Privacy Policy' }} />
        <Stack.Screen name="settings/terms" options={{ headerShown: true, title: 'Terms & Conditions' }} />
      </Stack>
    </>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
