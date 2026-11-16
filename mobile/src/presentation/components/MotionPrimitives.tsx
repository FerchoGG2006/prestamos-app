import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewStyle,
} from 'react-native';

/**
 * Primitivas de Motion Design y UX para React Native / Expo:
 * - Snappy timing (< 300ms) con easing cúbico orgánico.
 * - Squash & stretch + follow-through táctil en botones (TactilePressable).
 * - Staging & pose-to-pose para transiciones de vista (StagedView).
 * - Exaggerated feedback para confirmaciones (SuccessPop) y errores (useShakeAnimation).
 * - Fitts's law / Bigger hit areas mediante hitSlop por defecto.
 */

const DEFAULT_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

interface TactilePressableProps extends Omit<TouchableOpacityProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  pressScale?: number;
  disabled?: boolean;
}

export const TactilePressable: React.FC<TactilePressableProps> = ({
  children,
  style,
  pressScale = 0.965,
  disabled = false,
  hitSlop = DEFAULT_HIT_SLOP,
  activeOpacity = 0.92,
  onPressIn,
  onPressOut,
  ...rest
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(
    (e: Parameters<NonNullable<TouchableOpacityProps['onPressIn']>>[0]) => {
      if (!disabled) {
        Animated.timing(scaleAnim, {
          toValue: pressScale,
          duration: 75,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      }
      onPressIn?.(e);
    },
    [disabled, onPressIn, pressScale, scaleAnim]
  );

  const handlePressOut = useCallback(
    (e: Parameters<NonNullable<TouchableOpacityProps['onPressOut']>>[0]) => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        speed: 28,
        bounciness: 7,
        useNativeDriver: true,
      }).start();
      onPressOut?.(e);
    },
    [onPressOut, scaleAnim]
  );

  return (
    <AnimatedTouchable
      {...rest}
      disabled={disabled}
      hitSlop={hitSlop}
      activeOpacity={activeOpacity}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, { transform: [{ scale: scaleAnim }] }]}
    >
      {children}
    </AnimatedTouchable>
  );
};

interface StagedViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delayMs?: number;
  offsetY?: number;
}

export const StagedView: React.FC<StagedViewProps> = ({
  children,
  style,
  delayMs = 0,
  offsetY = 10,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(offsetY)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 185,
        delay: delayMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 200,
        delay: delayMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [delayMs, opacity, translateY]);

  return (
    <Animated.View
      style={[style, { opacity, transform: [{ translateY }] }]}
    >
      {children}
    </Animated.View>
  );
};

interface SuccessPopProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const SuccessPop: React.FC<SuccessPopProps> = ({ children, style }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        speed: 24,
        bounciness: 9,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [opacity, scale]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
};

export function useShakeAnimation() {
  const translateX = useRef(new Animated.Value(0)).current;

  const triggerShake = useCallback(() => {
    translateX.setValue(0);
    Animated.sequence([
      Animated.timing(translateX, { toValue: -7, duration: 40, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 7, duration: 45, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: -4, duration: 45, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 3, duration: 40, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  }, [translateX]);

  return { translateX, triggerShake };
}

interface UxToastProps {
  visible: boolean;
  message: string;
  type?: 'success' | 'error' | 'info';
  onHide?: () => void;
}

export const UxToast: React.FC<UxToastProps> = ({
  visible,
  message,
  type = 'success',
  onHide,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (!visible) return;

    opacity.setValue(0);
    translateY.setValue(16);

    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          speed: 24,
          bounciness: 6,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(2200),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 10,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);

    anim.start(({ finished }) => {
      if (finished) {
        onHide?.();
      }
    });

    return () => anim.stop();
  }, [message, onHide, opacity, translateY, visible]);

  if (!visible || !message) return null;

  const bgColor =
    type === 'success' ? '#065F46' : type === 'error' ? '#991B1B' : '#1E293B';
  const badgeText = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        toastStyles.container,
        { backgroundColor: bgColor, opacity, transform: [{ translateY }] },
      ]}
    >
      <View style={toastStyles.iconCircle}>
        <Text style={toastStyles.iconText}>{badgeText}</Text>
      </View>
      <Text style={toastStyles.message} numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
};

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    maxWidth: '88%',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 999,
  },
  iconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  iconText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  message: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
});
