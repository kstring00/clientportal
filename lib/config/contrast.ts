/**
 * WCAG contrast maths, used by the config validator and its test.
 *
 * The tokens are flat colours, so computing the ratio numerically is exact —
 * unlike text over photography, which has to be sampled from rendered pixels.
 * Translucent tokens (the hairlines) are never used for text and are skipped.
 */

export type Rgb = { r: number; g: number; b: number };

/** Accepts #rgb, #rrggbb, and rgba(r, g, b, a). Returns null for anything else. */
export function parseColor(value: string): Rgb | null {
  const input = value.trim();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input);
  if (hex) {
    const digits = hex[1];
    const full =
      digits.length === 3
        ? digits
            .split("")
            .map((d) => d + d)
            .join("")
        : digits;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(input);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }

  return null;
}

function channelLuminance(value: number) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }: Rgb) {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/** Returns 0 when either colour cannot be parsed, so a bad token fails loudly. */
export function contrastRatio(foreground: string, background: string) {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return 0;

  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));

  return (lighter + 0.05) / (darker + 0.05);
}
