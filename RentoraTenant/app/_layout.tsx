import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { notificationService } from '../services/notificationService';

function RootNavigationGuard() {
  const { isLoading, isAuthenticated, isFirstLogin } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';
    const currentPath = segments.join('/');

    if (!isAuthenticated) {
      if (!inAuthGroup || currentPath.includes('create-password')) {
        router.replace('/(auth)/login');
      }
    } else if (isFirstLogin) {
      if (!currentPath.includes('create-password')) {
        router.replace('/(auth)/create-password');
      }
    } else if (isAuthenticated && !isFirstLogin) {
      if (inAuthGroup) {
        router.replace('/(tabs)');
      }
    }
  }, [isLoading, isAuthenticated, isFirstLogin, segments]);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

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
  }, [isAuthenticated, isLoading]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors?.bg || '#0F172A' }]}>
        <StatusBar style={colors?.statusBarStyle || 'light'} />
        <View style={styles.brandIconBox}>
          <Text style={{ fontSize: 36 }}>🏠</Text>
        </View>
        <Text style={[styles.brandTitle, { color: colors?.textPrimary || '#F8FAFC' }]}>Rentora Tenant</Text>
        <Text style={[styles.brandSubtitle, { color: colors?.textSecondary || '#94A3B8' }]}>Your Portal for Rental Living</Text>
        <ActivityIndicator size="large" color={colors?.primary || '#6366F1'} style={styles.spinner} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={colors.statusBarStyle} />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <RootNavigationGuard />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  brandIconBox: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textWhite,
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 6,
    marginBottom: 32,
  },
  spinner: {
    marginTop: 12,
  },
});
