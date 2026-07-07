export const theme = {
  colors: {
    background: '#F9F7F1', // Paper-like off-white
    text: '#333333',       // Dark gray/soft black for text
    primary: '#85A392',    // Calm sage green
    secondary: '#D0B8A8',  // Muted beige/sand
    accent: '#F5CCA0',     // Soft muted orange/peach
    border: '#E2DCD0',     // Slightly darker paper tone for borders
    surface: '#FFFFFF',    // Pure white for elevated surfaces
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  typography: {
    fontFamily: 'System', // Use default system font for simplicity
    sizes: {
      small: 12,
      body: 16,
      h3: 20,
      h2: 24,
      h1: 32,
    },
    weights: {
      regular: '400' as const,
      medium: '500' as const,
      bold: '700' as const,
    },
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 16,
    pill: 9999,
  }
};
