/**
 * Cafe Eldeeb POS Enterprise - Official Royal Master Logo Generator
 * Standalone SVG and Data URL generators featuring the newly uploaded Royal Crowned Wolf Brand Crest.
 */

import { ELDEEB_ROYAL_LOGO_DATA_URL, ELDEEB_ROYAL_LOGO_FULL_DATA_URL } from '../assets/images/logoDataUrl';

export type LogoVariant = 'gold' | 'white' | 'black' | 'full';

export function getEldeebLogoSvgString(
  width: number = 240,
  showSubtext: boolean = true,
  variant: LogoVariant = 'gold'
): string {
  const height = showSubtext ? Math.round(width * 1.15) : width;
  const logoUrl = variant === 'full' ? ELDEEB_ROYAL_LOGO_FULL_DATA_URL : ELDEEB_ROYAL_LOGO_DATA_URL;

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 1024 1024"
  width="${width}"
  height="${width}"
  style="display: block; margin: 0 auto; max-width: 100%; height: auto;"
>
  <image
    href="${logoUrl}"
    x="0"
    y="0"
    width="1024"
    height="1024"
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
  if (variant === 'full') {
    return ELDEEB_ROYAL_LOGO_FULL_DATA_URL;
  }
  return ELDEEB_ROYAL_LOGO_DATA_URL;
}

export default getEldeebLogoDataUrl;
