export const fonts = {
  display: 'SharpGroteskBold',
  displayMedium: 'SharpGroteskMedium',
  displayBook: 'SharpGroteskBook',
  ui: 'SharpGroteskBook',
  mono: 'monospace',
} as const;

export const typography = {
  display: {
    fontFamily: fonts.display,
    letterSpacing: -0.7,
  },
  title: {
    fontFamily: fonts.ui,
    letterSpacing: -0.45,
  },
  label: {
    fontFamily: fonts.ui,
    letterSpacing: 0.5,
  },
} as const;
