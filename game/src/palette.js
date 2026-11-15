// DUSTLINE — Foundry Yard. The look plan, in one place: a dusk industrial yard,
// sodium-amber for Vanguard (the player), cold cyan for the Sentinels (bots),
// rust containers and dark steel everywhere else. Lighting makes the shades;
// no other colour appears in the code. The same names are the CSS variables.
export const PALETTE = {
  canvas: '#12151a',
  surface: '#232a31',
  hairline: '#39434d',
  ink: '#e8e2d4',
  muted: '#8b98a5',
  accent: '#ff9f1c',
  cyan: '#37c8e0',
  rust: '#a34d28',
  ember: '#ff5a1f',
  dark: '#0b0d10',
};

export function shade(name) {
  return PALETTE[name];
}
