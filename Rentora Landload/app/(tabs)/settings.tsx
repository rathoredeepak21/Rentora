import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useTheme, useStyles, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';

import SwipeableTabWrapper from '../../components/ui/SwipeableTabWrapper';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(getStyles);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
        }
      }
    ]);
  };

  const menuItems = [
    {
      title: 'Business Profile',
      icon: 'person-outline',
      color: colors.primary,
      onPress: () => router.push('/settings/profile'),
    },
    {
      title: 'Bill Customization',
      icon: 'color-palette-outline',
      color: '#8B5CF6', // Purple
      onPress: () => router.push('/settings/bill-customization'),
    },
    {
      title: 'UPI Payment Details',
      icon: 'card-outline',
      color: colors.secondary,
      onPress: () => router.push('/settings/upi'),
    },
    {
      title: 'Reports',
      icon: 'document-text-outline',
      color: '#10B981',
      onPress: () => router.push('/settings/reports'),
    },
    {
      title: 'Appearance',
      icon: 'sunny-outline',
      color: '#3B82F6', // Blue
      onPress: () => router.push('/settings/appearance'),
    },
    {
      title: 'Privacy Policy',
      icon: 'shield-checkmark-outline',
      color: '#6366F1',
      onPress: () => router.push('/settings/privacy-policy'),
    },
    {
      title: 'Terms & Conditions',
      icon: 'document-text-outline',
      color: '#0EA5E9',
      onPress: () => router.push('/settings/terms'),
    },
  ];

  return (
    <SwipeableTabWrapper currentTab="settings">
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* User Card */}
          {user && (
            <View style={styles.profileCard}>
              <View style={styles.profileAvatar}>
                <Ionicons name="person" size={32} color={colors.primary} />
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{user.name}</Text>
                <Text style={styles.profileEmail}>{user.email}</Text>
              </View>
            </View>
          )}

          {/* Menu Items */}
          <View style={styles.menuContainer}>
            {menuItems.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.menuItem}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIconContainer, { backgroundColor: item.color + '15' }]}>
                  <Ionicons name={item.icon as any} size={20} color={item.color} />
                </View>
                <Text style={styles.menuText}>{item.title}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.border} style={styles.chevron} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Sign Out Button */}
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.danger} style={styles.signOutIcon} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          {/* Version Info */}
          <Text style={styles.versionText}>Rentora Version 1.0.0</Text>
        </ScrollView>
      </SafeAreaView>
    </SwipeableTabWrapper>
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
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: spacing.borderRadius.lg,
    marginBottom: spacing.xl,
    ...spacing.shadows.light,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: spacing.borderRadius.round,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    marginLeft: spacing.lg,
  },
  profileName: {
    fontSize: typography.sizes.md + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  profileEmail: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs - 2,
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xl,
    ...spacing.shadows.light,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: spacing.borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  menuText: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    flex: 1,
  },
  chevron: {
    marginLeft: spacing.sm,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: spacing.borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.danger + '30',
    marginBottom: spacing.xl,
    ...spacing.shadows.light,
  },
  signOutIcon: {
    marginRight: spacing.sm,
  },
  signOutText: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.danger,
  },
  versionText: {
    textAlign: 'center',
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
