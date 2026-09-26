import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useStyles, useTheme, typography, spacing } from '../../theme';

interface LoadingViewProps {
  message?: string;
  fullscreen?: boolean;
}

export const LoadingView: React.FC<LoadingViewProps> = ({ message = 'Loading...', fullscreen = true }) => {
  const styles = useStyles(getStyles);
  const { colors } = useTheme();

  return (
    <View style={[styles.container, fullscreen ? styles.fullscreen : styles.inline]}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  fullscreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inline: {
    flex: 0,
    backgroundColor: colors.transparent,
  },
  message: {
    marginTop: spacing.md,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
  },
});

export default LoadingView;
