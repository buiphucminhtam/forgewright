# Forgewright Studio Design System

This design specification adapts the **VoltAgent** design system preset from the `awesome-design-md` catalog specifically for the Forgewright Studio UI dashboard.

---

## 🎨 Visual Tokens

### 1. Palette
- **Canvas (Void-black)**: `#101010` (unyielding near-black background)
- **Canvas-soft (Sidebar/Cards)**: `#1a1a1a` (slightly lighter surface for structure)
- **Hairline Border**: `#3d3a39` (ultra-thin borders that segment cards and panels)
- **Primary Accent (Electric Green)**: `#00d992` (vibrant brand accent used sparingly for active states and highlights)
- **Primary-soft**: `#2fd6a1` (softer mint-green for success states)
- **Primary-deep**: `#10b981` (darker emerald-green)
- **Text Ink (Normal)**: `#f2f2f2` (high-contrast text)
- **Text Ink Strong**: `#ffffff` (pure white for titles/headings)
- **Text Body**: `#bdbdbd` (readable dark gray for labels and paragraphs)
- **Text Mute**: `#8b949e` (muted gray for timestamps and helper texts)
- **On Primary**: `#101010` (contrast text on primary green background)

### 2. Typography
- **UI Copy**: Inter, system-ui, sans-serif
- **Log / Data / Monospace**: SF Mono, Menlo, Monaco, Consolas, JetBrains Mono, monospace

---

## 🛠 Component Mappings

### Layout (StudioApp)
- Outer container: `bg-[#101010]`
- Sidebar: `bg-[#1a1a1a] border-r border-[#3d3a39]`
- Header: `bg-[#1a1a1a] border-b border-[#3d3a39]`
- Navigation Tabs (Active): `bg-[#101010] text-[#00d992] border-l-2 border-[#00d992]`
- Navigation Tabs (Hover): `hover:bg-[#101010] hover:text-[#f2f2f2] text-[#bdbdbd]`

### Timeline (PipelineMonitor)
- Phase cards: `bg-[#1a1a1a] border border-[#3d3a39]`
- Progress track: `bg-[#3d3a39]`
- Progress indicator: `bg-[#00d992]` or status color
- Active phase highlight: `bg-[#00d992]/10 text-[#00d992]`
- Inactive status color: `bg-[#3d3a39] text-[#8b949e]`

### Logs (MemoryTrace)
- Code block/Trace list: `bg-[#101010] text-[#bdbdbd]`
- Select filters: `bg-[#1a1a1a] border border-[#3d3a39] text-[#f2f2f2]`
- Auto scroll active: `bg-[#00d992]/20 border-[#00d992] text-[#00d992]`
- Auto scroll paused: `bg-[#1a1a1a] border-[#3d3a39] text-[#bdbdbd]`

### Analytics (StatsPanel)
- Stat cards: `bg-[#1a1a1a] border border-[#3d3a39]`
- Monospace values: `font-mono text-[#00d992]`
- Alerts/Success warnings: translucent theme background with solid border highlights.
