import React from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { GOLD, MONOGRAM_SVG, WORDMARK } from './logo';
import { colors, radius } from '../lib/theme';

/**
 * If `mobile/assets/logo.png` exists it wins; otherwise the vector monogram is
 * drawn. This lets the original artwork be dropped in without touching code —
 * Metro resolves the require at build time, so the try/catch runs once.
 */
let logoAsset: number | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  logoAsset = require('../../assets/logo.png') as number;
} catch {
  logoAsset = null;
}

/** The TR monogram on its own — headers, tab bars, tight spaces. */
export function Monogram({ size = 40 }: { size?: number }) {
  // The artwork is roughly 2:1, so height follows from the width.
  const height = Math.round((size * 116) / 232);

  if (logoAsset) {
    return (
      <Image
        source={logoAsset}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="Train With Rohin"
      />
    );
  }

  return <SvgXml xml={MONOGRAM_SVG} width={size} height={height} />;
}

/** Full lockup: monogram, wordmark, and the rule-flanked tagline. */
export function BrandLogo({
  width = 260,
  showTagline = true,
  style,
}: {
  width?: number;
  showTagline?: boolean;
  style?: ViewStyle;
}) {
  // Everything scales off the lockup width so the proportions hold at any size.
  const wordSize = Math.round(width * 0.125);
  const tagSize = Math.max(9, Math.round(width * 0.042));

  return (
    <View style={[styles.lockup, style]} accessibilityLabel="Train With Rohin">
      <Monogram size={Math.round(width * 0.62)} />

      <View style={[styles.wordmark, { marginTop: width * 0.05 }]}>
        <Text style={[styles.word, { fontSize: wordSize }]} numberOfLines={1} adjustsFontSizeToFit>
          <Text style={{ color: colors.text }}>{WORDMARK.lead}</Text>
          <Text style={{ color: GOLD.base }}>{WORDMARK.accent}</Text>
          <Text style={{ color: colors.text }}>{WORDMARK.trail}</Text>
        </Text>
      </View>

      {showTagline ? (
        <View style={[styles.taglineRow, { marginTop: width * 0.038 }]}>
          <View style={styles.rule} />
          <Text style={[styles.tagline, { fontSize: tagSize }]} numberOfLines={1}>
            {WORDMARK.tagline.map((word, index) => (
              <Text key={word}>
                {index > 0 ? <Text style={{ color: GOLD.base }}>{'  |  '}</Text> : null}
                <Text style={{ color: colors.text }}>{word}</Text>
              </Text>
            ))}
          </Text>
          <View style={styles.rule} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: { alignItems: 'center' },
  wordmark: { flexDirection: 'row', alignItems: 'baseline' },
  word: {
    fontWeight: '900',
    // Tight tracking and a slight condense echo the artwork's heavy grotesque.
    letterSpacing: -0.5,
    fontStyle: 'italic',
  },
  taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule: { width: 26, height: 2, backgroundColor: GOLD.deep, borderRadius: radius.pill },
  tagline: { letterSpacing: 2.2, fontWeight: '600' },
});
