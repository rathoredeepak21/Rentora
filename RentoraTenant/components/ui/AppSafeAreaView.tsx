import React from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';

export interface AppSafeAreaViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
}

/**
 * Global AppSafeAreaView Component
 *
 * Guarantees that all screens in Rentora Tenant automatically respect the Android
 * system status-bar inset, notch, and punch-hole camera cutouts via WindowInsetsCompat.
 *
 * Defaults to edges={['top']} so that top headers never overlap the status bar / notch,
 * while leaving bottom safe-area management to tab bars and dedicated scroll/footer padding.
 */
export default function AppSafeAreaView({
  children,
  style,
  edges = ['top'],
}: AppSafeAreaViewProps) {
  return (
    <SafeAreaView edges={edges} style={[styles.container, style]}>
      {children}
    </SafeAreaView>
  );
}

export { AppSafeAreaView };

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
