/**
 * Cafe Eldeeb POS Enterprise - Official Royal Master Logo Generator
 * Standalone SVG and Data URL generators featuring the newly uploaded Royal Crowned Wolf Brand Crest.
 */

import { ELDEEB_ROYAL_LOGO_DATA_URL } from '../assets/images/logoDataUrl';

export type LogoVariant = 'gold' | 'white' | 'black';

export function getEldeebLogoSvgString(
  width: number = 240,
  showSubtext: boolean = true,
  variant: LogoVariant = 'gold'
): string {
  const height = showSubtext ? Math.round(width * 1.15) : width;

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 512 512"
  width="${width}"
  height="${height}"
  style="display: block; margin: 0 auto; max-width: 100%; height: auto;"
>
  <image
    href="${ELDEEB_ROYAL_LOGO_DATA_URL}"
    x="0"
    y="0"
    width="512"
    height="512"
    preserveAspectRatio="xMidYMid meet"
  />
</svg>
  `.trim();
}

export function getEldeebLogoDataUrl(
  width: number = 240,
  showSubtext: boolean = true,
  variant: LogoVariant = 'gold'
): string {
  return ELDEEB_ROYAL_LOGO_DATA_URL;
}

export default getEldeebLogoDataUrl;
