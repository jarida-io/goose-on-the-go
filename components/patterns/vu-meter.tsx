/**
 * VuMeter — audio level visualization bars.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AccentPurple, Grey } from '@/constants/colors';

interface VuMeterProps {
  level: number;
  active: boolean;
  barCount?: number;
}

export const VuMeter = React.memo(function VuMeter({ level, active, barCount = 7 }: VuMeterProps) {
  const lit = Math.round(level * barCount);

  return (
    <View style={styles.container}>
      {Array.from({ length: barCount }, (_, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: 10 + i * 4 },
            active && i < lit ? styles.barLit : styles.barDim,
          ]}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 28,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
  barLit: {
    backgroundColor: AccentPurple,
  },
  barDim: {
    backgroundColor: Grey[200],
  },
});
