import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { COLORS } from '../theme/colors';

/**
 * Punto 01: Skeletons de carga animados para transición instantánea sin pantallas en blanco.
 */
export const RouteSkeletonLoader: React.FC = React.memo(() => {
  const pulseAnim = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.9,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.45,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.container}>
      {/* Top Bar Skeleton */}
      <Animated.View style={[styles.topBar, { opacity: pulseAnim }]} />

      {/* Hero Financial Card Skeleton */}
      <Animated.View style={[styles.heroCard, { opacity: pulseAnim }]}>
        <View style={styles.heroLineShort} />
        <View style={styles.heroLineBig} />
        <View style={styles.heroGridRow}>
          <View style={styles.heroMiniBox} />
          <View style={styles.heroMiniBox} />
          <View style={styles.heroMiniBox} />
        </View>
      </Animated.View>

      {/* Quick Action Pills Skeleton */}
      <View style={styles.pillsRow}>
        {[1, 2, 3, 4].map((k) => (
          <Animated.View key={k} style={[styles.pillItem, { opacity: pulseAnim }]} />
        ))}
      </View>

      {/* Customer Cards Skeleton */}
      {[1, 2, 3, 4].map((item) => (
        <Animated.View key={item} style={[styles.customerCard, { opacity: pulseAnim }]}>
          <View style={styles.avatarCircle} />
          <View style={styles.cardBody}>
            <View style={styles.cardTitleLine} />
            <View style={styles.cardSubLine} />
          </View>
          <View style={styles.cardActionBox} />
        </Animated.View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 12,
  },
  topBar: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  heroCard: {
    height: 168,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    padding: 16,
    justifyContent: 'space-between',
  },
  heroLineShort: {
    width: '42%',
    height: 12,
    borderRadius: 6,
    backgroundColor: '#334155',
  },
  heroLineBig: {
    width: '68%',
    height: 28,
    borderRadius: 8,
    backgroundColor: '#475569',
  },
  heroGridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heroMiniBox: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#334155',
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pillItem: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
  },
  customerCard: {
    height: 76,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
  },
  cardBody: {
    flex: 1,
    gap: 8,
  },
  cardTitleLine: {
    width: '65%',
    height: 14,
    borderRadius: 6,
    backgroundColor: '#CBD5E1',
  },
  cardSubLine: {
    width: '45%',
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E2E8F0',
  },
  cardActionBox: {
    width: 68,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
});
