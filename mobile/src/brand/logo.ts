/**
 * The Train With Rohin mark, authored as SVG so it stays crisp at every size
 * and the app icon, splash screen and in-app logo all come from one source.
 *
 * Drop-in replacement: if you have the original artwork, save it as
 * `mobile/assets/logo.png` and `<BrandLogo>` will use that file instead of
 * this vector — see `src/brand/BrandLogo.tsx`.
 */

export const GOLD = {
  bright: '#F0D68A',
  base: '#D9A93C',
  deep: '#95690F',
} as const;

/** Shared gradient definition, so the monogram and wordmark match exactly. */
const goldGradient = `
    <linearGradient id="twrGold" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${GOLD.bright}"/>
      <stop offset="0.42" stop-color="${GOLD.base}"/>
      <stop offset="1" stop-color="${GOLD.deep}"/>
    </linearGradient>`;

/**
 * The TR monogram: an italic slab "T" in white cut by a diagonal from a
 * gold "R", mirroring the angular slash in the original artwork.
 */
export const MONOGRAM_SVG = `<svg viewBox="0 0 232 116" xmlns="http://www.w3.org/2000/svg">
  <defs>${goldGradient}</defs>

  <!-- T: crossbar plus stem, sheared for the italic lean, with the lower
       right corner cut away so the gold diagonal can pass through it. -->
  <g transform="translate(16,4) skewX(-11)">
    <path fill="#FFFFFF" d="M0,0 H104 V27 H66 V104 H34 V27 H0 Z"/>
  </g>

  <!-- The diagonal slash sitting between the two letters. -->
  <path fill="url(#twrGold)" d="M126,4 L146,4 L96,112 L76,112 Z"/>

  <!-- R: stem, bowl with its counter punched out, and an angled leg. -->
  <g transform="translate(122,4) skewX(-11)">
    <path fill="url(#twrGold)" fill-rule="evenodd"
          d="M0,0 H58 A27,27 0 0 1 58,54 H46 L92,104 H54 L22,62 V104 H0 Z
             M22,15 H56 A12.5,12.5 0 0 1 56,39 H22 Z"/>
  </g>
</svg>`;

/**
 * The wordmark is deliberately NOT part of the SVG. Text inside SVG depends on
 * font metrics that differ between iOS, Android and the browser used to generate
 * the app icon, so the letters overflow or reflow per platform. `BrandLogo`
 * composes the monogram above with real text nodes instead, which lay out
 * correctly everywhere and stay selectable and scalable.
 */
export const WORDMARK = {
  lead: 'TRAIN',
  accent: 'WITH',
  trail: 'ROHIN',
  tagline: ['STRENGTH', 'DISCIPLINE', 'RESULTS'],
} as const;
