export const theme = {
  colors: {
    background: '#F9F7F1', // Paper-like off-white
    text: '#333333',       // Dark gray/soft black for text
    primary: '#85A392',    // Calm sage green (pastel)
    secondary: '#D0B8A8',  // Muted beige/sand
    accent: '#F5CCA0',     // Soft muted orange/peach
    border: '#E2DCD0',     // Slightly darker paper tone
    surface: '#F9F7F1',    // Pure clay surface
    clayShadow: '#C8C2B3', // Drop shadow color for clay
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
    fontFamily: 'System',
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
    md: 12, // More rounded for clay
    lg: 24, // More rounded for clay
    pill: 9999,
  },
  shadows: {
    clay: {
      shadowColor: '#C8C2B3',
      shadowOffset: { width: 3, height: 5 },
      shadowOpacity: 0.8,
      shadowRadius: 6,
      elevation: 6,
    },
    claySoft: {
      shadowColor: '#C8C2B3',
      shadowOffset: { width: 2, height: 3 },
      shadowOpacity: 0.5,
      shadowRadius: 4,
      elevation: 3,
    }
  }
};
