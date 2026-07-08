export const PALETTES = [
  {
    name: 'Zen Sand',
    background: '#FDFBF7', // Relaxing warm cream
    text: '#334155',       // Soft slate text
    primary: '#0EA5E9',    // Vibrant relaxing ocean blue
    secondary: '#94A3B8',  // Muted gray
    border: '#E2E8F0',     // Soft border
    surface: '#FFFFFF',    // Pure white for board
    emptyPipe: '#F1F5F9',  // Dull color for empty pipes
    source: '#0284C7',     // Darker blue for source nodes
    sink: '#10B981',       // Mint green for success/sink
  },
  {
    name: 'Midnight Forest',
    background: '#0F172A', // Dark slate
    text: '#F8FAFC',       // Light crisp text
    primary: '#10B981',    // Glowing mint fluid
    secondary: '#64748B',  // Slate gray
    border: '#334155',
    surface: '#1E293B',    // Darker board
    emptyPipe: '#334155',  // Dark empty pipes
    source: '#059669',
    sink: '#38BDF8',       // Cyan sink
  },
  {
    name: 'Coral Reef',
    background: '#FFF5F5', // Soft blush
    text: '#4A154B',       // Warm dark plum
    primary: '#F43F5E',    // Coral/Rose fluid
    secondary: '#FDA4AF',
    border: '#FECDD3',
    surface: '#FFFFFF',
    emptyPipe: '#FFE4E6',
    source: '#E11D48',
    sink: '#0D9488',       // Teal sink
  },
  {
    name: 'Matcha Green',
    background: '#F0FDF4', // Soft mint background
    text: '#14532D',       // Dark forest green
    primary: '#84CC16',    // Lime/Matcha fluid
    secondary: '#86EFAC',
    border: '#BBF7D0',
    surface: '#FFFFFF',
    emptyPipe: '#DCFCE7',
    source: '#4D7C0F',
    sink: '#F59E0B',       // Amber sink
  },
  {
    name: 'Spring Bloom',
    background: '#FAF5F7', // Very soft lilac pink
    text: '#831843',       // Deep rose text
    primary: '#E8BA40',    // Mustard yellow fluid
    secondary: '#DED4E8',
    border: '#FCE7F3',
    surface: '#FFFFFF',
    emptyPipe: '#F3E8EB',
    source: '#D97706',
    sink: '#C7395F',       // Rose red sink
  },
  {
    name: 'Earthy Organic',
    background: '#EDF4F2', // Soft neutral green
    text: '#1E293B',
    primary: '#31473A',    // Pine green fluid
    secondary: '#94A3B8',
    border: '#CBD5E1',
    surface: '#FFFFFF',
    emptyPipe: '#E2E8F0',
    source: '#7C8363',     // Sage source
    sink: '#B45309',       // Earthy terra cotta sink
  },
  {
    name: 'Modern Retro',
    background: '#FFFBEB', // Warm cream
    text: '#1E3A8A',       // Deep blue text
    primary: '#3B5BA5',    // Prussian blue fluid
    secondary: '#9CA3AF',
    border: '#FEF3C7',
    surface: '#FFFFFF',
    emptyPipe: '#F3F4F6',
    source: '#F3B941',     // Mustard source
    sink: '#E87A5D',       // Orange sink
  },
  {
    name: 'Periwinkle Dream',
    background: '#F5F5FA', // Barely there periwinkle
    text: '#312E81',       // Deep indigo
    primary: '#BBCB50',    // Bright Lime fluid (bold but soft)
    secondary: '#A5B4FC',
    border: '#E0E7FF',
    surface: '#FFFFFF',
    emptyPipe: '#EEF2FF',
    source: '#678CEC',     // Periwinkle source
    sink: '#D49BAE',       // Pink sink
  },
  {
    name: 'Balanced Wellness',
    background: '#F0F9FF', // Airy sky blue
    text: '#0C4A6E',       // Deep sky blue
    primary: '#4AAFD5',    // Flowing teal fluid
    secondary: '#7DD3FC',
    border: '#E0F2FE',
    surface: '#FFFFFF',
    emptyPipe: '#E0F2FE',
    source: '#E7A339',     // Orange source
    sink: '#91B187',       // Soft green sink
  }
];

export const theme = {
  // Default fallback colors (Zen Sand)
  colors: PALETTES[0],
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
      black: '900' as const,
    },
  },
  borderRadius: {
    sm: 4,
    md: 12,
    lg: 24,
    xl: 32,
    pill: 9999,
  },
  shadows: {
    soft: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.05,
      shadowRadius: 20,
      elevation: 5,
    },
    innerPulse: {
      shadowColor: '#0EA5E9', // Will be overridden in dynamic styles if needed
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 8,
      elevation: 4,
    }
  }
};
