import React, { useRef } from 'react';
import { View, PanResponder, Animated, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';

export interface TabItem {
  name: string;
  route: string;
}

export const TENANT_TABS: TabItem[] = [
  { name: 'index', route: '/(tabs)' },
  { name: 'bills', route: '/(tabs)/bills' },
  { name: 'history', route: '/(tabs)/history' },
  { name: 'profile', route: '/(tabs)/profile' },
];

interface SwipeableTabWrapperProps {
  children: React.ReactNode;
  currentTab: string;
  tabs?: TabItem[];
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const SwipeableTabWrapper: React.FC<SwipeableTabWrapperProps> = ({
  children,
  currentTab,
  tabs = TENANT_TABS,
}) => {
  const router = useRouter();
  const translateX = useRef(new Animated.Value(0)).current;

  const currentIndex = tabs.findIndex((t) => t.name === currentTab);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx, dy } = gestureState;
        // Require horizontal movement > 30px and dx > 2.2 * dy to prevent accidental triggers while vertical scrolling
        const isHorizontalSwipe = Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 2.2;
        if (!isHorizontalSwipe) return false;

        // Bound check: Don't intercept if swiping right on first tab or swiping left on last tab
        if (currentIndex === 0 && dx > 0) return false;
        if (currentIndex === tabs.length - 1 && dx < 0) return false;

        return true;
      },
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderMove: (_, gestureState) => {
        const { dx } = gestureState;
        if ((currentIndex === 0 && dx > 0) || (currentIndex === tabs.length - 1 && dx < 0)) {
          translateX.setValue(dx * 0.15);
        } else {
          translateX.setValue(dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx, vx } = gestureState;
        const SWIPE_THRESHOLD = 50;
        const VELOCITY_THRESHOLD = 0.25;

        if ((dx < -SWIPE_THRESHOLD || vx < -VELOCITY_THRESHOLD) && currentIndex < tabs.length - 1) {
          // Swipe Left -> Move to Next Tab
          const nextTab = tabs[currentIndex + 1];
          Animated.timing(translateX, {
            toValue: -SCREEN_WIDTH * 0.2,
            duration: 100,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            router.navigate(nextTab.route as any);
          });
        } else if ((dx > SWIPE_THRESHOLD || vx > VELOCITY_THRESHOLD) && currentIndex > 0) {
          // Swipe Right -> Move to Previous Tab
          const prevTab = tabs[currentIndex - 1];
          Animated.timing(translateX, {
            toValue: SCREEN_WIDTH * 0.2,
            duration: 100,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            router.navigate(prevTab.route as any);
          });
        } else {
          // Reset position
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 3,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Animated.View style={[styles.content, { transform: [{ translateX }] }]}>
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});

export default SwipeableTabWrapper;
