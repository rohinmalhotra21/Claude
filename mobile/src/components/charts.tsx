import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Line as SvgLine } from 'react-native-svg';
import { colors, radius, spacing, typography } from '../lib/theme';

/**
 * Small, dependency-light charts for the in-app summary. Deep analysis lives in
 * Power BI; these exist so the phone can answer "how am I doing" at a glance.
 */

const CHART_HEIGHT = 120;

/** Line chart with an optional smoothed second series (e.g. a 7-day average). */
export function LineChart({
  points,
  trend,
  color = colors.accent,
  unit = '',
}: {
  points: { x: string; y: number }[];
  trend?: (number | null)[];
  color?: string;
  unit?: string;
}) {
  if (points.length < 2) {
    return <ChartPlaceholder message="Not enough data yet" />;
  }

  const width = 320;
  const padding = { top: 8, bottom: 8, left: 0, right: 0 };
  const innerHeight = CHART_HEIGHT - padding.top - padding.bottom;

  const values = points.map((p) => p.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero; give it a nominal band instead.
  const span = max - min || Math.max(Math.abs(max) * 0.1, 1);

  const toX = (index: number) => (index / (points.length - 1)) * width;
  const toY = (value: number) => padding.top + innerHeight - ((value - min) / span) * innerHeight;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.y).toFixed(1)}`)
    .join(' ');

  const trendPath = trend
    ? trend
        .map((value, i) =>
          value === null ? null : `${toX(i).toFixed(1)} ${toY(value).toFixed(1)}`,
        )
        .filter((s): s is string => s !== null)
        .map((s, i) => `${i === 0 ? 'M' : 'L'} ${s}`)
        .join(' ')
    : null;

  const last = points[points.length - 1]!;

  return (
    <View>
      <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${width} ${CHART_HEIGHT}`}>
        <SvgLine
          x1="0"
          y1={CHART_HEIGHT - padding.bottom}
          x2={width}
          y2={CHART_HEIGHT - padding.bottom}
          stroke={colors.border}
          strokeWidth="1"
        />
        <Path d={linePath} stroke={color} strokeWidth="2" fill="none" opacity={trendPath ? 0.35 : 1} />
        {trendPath ? <Path d={trendPath} stroke={color} strokeWidth="2.5" fill="none" /> : null}
        <Circle cx={toX(points.length - 1)} cy={toY(last.y)} r="3.5" fill={color} />
      </Svg>
      <View style={styles.axisRow}>
        <Text style={typography.caption}>
          {min.toFixed(1)}
          {unit}
        </Text>
        <Text style={typography.caption}>
          {max.toFixed(1)}
          {unit}
        </Text>
      </View>
    </View>
  );
}

/** Horizontal bars, for ranked categories like volume per muscle group. */
export function BarList({
  items,
  color = colors.accent,
  unit = '',
}: {
  items: { label: string; value: number }[];
  color?: string;
  unit?: string;
}) {
  if (items.length === 0) return <ChartPlaceholder message="Nothing logged yet" />;

  const max = Math.max(...items.map((i) => i.value)) || 1;

  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((item) => (
        <View key={item.label}>
          <View style={styles.barLabelRow}>
            <Text style={[typography.body, { fontSize: 14 }]} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={typography.label}>
              {Math.round(item.value).toLocaleString()}
              {unit}
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${(item.value / max) * 100}%`, backgroundColor: color },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Vertical columns, for a per-week or per-day series. */
export function ColumnChart({
  items,
  color = colors.accent,
}: {
  items: { label: string; value: number }[];
  color?: string;
}) {
  if (items.length === 0) return <ChartPlaceholder message="Nothing logged yet" />;

  const max = Math.max(...items.map((i) => i.value)) || 1;

  return (
    <View style={styles.columnChart}>
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.column}>
          <View style={styles.columnTrack}>
            <View
              style={{
                height: `${Math.max((item.value / max) * 100, 2)}%`,
                backgroundColor: color,
                borderRadius: radius.sm,
                width: '100%',
              }}
            />
          </View>
          <Text style={styles.columnLabel} numberOfLines={1}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ChartPlaceholder({ message }: { message: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={typography.caption}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  barTrack: {
    height: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radius.pill },
  columnChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    height: CHART_HEIGHT + 20,
  },
  column: { flex: 1, alignItems: 'center', gap: spacing.xs },
  columnTrack: { height: CHART_HEIGHT, width: '100%', justifyContent: 'flex-end' },
  columnLabel: { color: colors.textFaint, fontSize: 10 },
  placeholder: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
  },
});
