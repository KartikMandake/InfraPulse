---
name: InfraPulse
colors:
  surface: '#121318'
  surface-dim: '#121318'
  surface-bright: '#38393e'
  surface-container-lowest: '#0c0e13'
  surface-container-low: '#1a1b20'
  surface-container: '#1e1f24'
  surface-container-high: '#282a2f'
  surface-container-highest: '#33353a'
  on-surface: '#e2e2e9'
  on-surface-variant: '#c5c9ad'
  inverse-surface: '#e2e2e9'
  inverse-on-surface: '#2f3035'
  outline: '#8f9379'
  outline-variant: '#444933'
  surface-tint: '#afd500'
  primary: '#ffffff'
  on-primary: '#2a3500'
  primary-container: '#c8f30c'
  on-primary-container: '#586c00'
  inverse-primary: '#536600'
  secondary: '#b1c5ff'
  on-secondary: '#002c71'
  secondary-container: '#0050c0'
  on-secondary-container: '#bbccff'
  tertiary: '#ffffff'
  on-tertiary: '#27313d'
  tertiary-container: '#d8e3f3'
  on-tertiary-container: '#5b6573'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c8f30c'
  primary-fixed-dim: '#afd500'
  on-primary-fixed: '#171e00'
  on-primary-fixed-variant: '#3e4c00'
  secondary-fixed: '#dae2ff'
  secondary-fixed-dim: '#b1c5ff'
  on-secondary-fixed: '#001946'
  on-secondary-fixed-variant: '#00419f'
  tertiary-fixed: '#d8e3f3'
  tertiary-fixed-dim: '#bcc7d7'
  on-tertiary-fixed: '#121c28'
  on-tertiary-fixed-variant: '#3d4854'
  background: '#121318'
  on-background: '#e2e2e9'
  surface-variant: '#33353a'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Geist
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 1.125rem
    fontWeight: '500'
    lineHeight: 1.375rem
    letterSpacing: -0.015em
  body-lg:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: -0.005em
  body-md:
    fontFamily: Geist
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.125rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Geist
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1rem
    letterSpacing: 0em
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: -0.01em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
    letterSpacing: -0.01em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '400'
    lineHeight: 0.875rem
    letterSpacing: 0em
  label-md:
    fontFamily: Geist
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Geist
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-desktop: 1rem
  margin: 1rem
  margin-desktop: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

## Brand & Style

This design system delivers a high-density, mission-critical workspace engineered for Site Reliability Engineers, platform architects, and systems operators under intense operational cognitive load. Rooted in technical minimalism and utilitarian precision, the visual language merges the surgical micro-density of modern developer consoles with an aggressive, restrained command-center aesthetic.

The emotional core centers on total situational clarity, instant latency-free feedback, and uncompromised confidence during production triage. Every pixel is intentional: noise is suppressed through deep obsidian canvas surfaces, while telemetry spikes, anomalous spans, and actionable system events pierce through with razor-sharp luminous accents. Rather than decorative visual styling, the system relies on spatial discipline, hairline divisions, precise monospaced alignment, and high-contrast typographic pacing.

## Colors

The palette operates in strict hierarchical tiers to prevent alarm fatigue and maximize visual processing speed:

- **Canvases & Foundations**: The primary background rests on deep Midnight Black (`#030407`), ensuring near-infinite contrast ratios and reducing eye fatigue during continuous on-call monitoring.
- **Elevated Surfaces**: Container surfaces stack from Surface Base (`#030407`) to Surface Elevated Tier 1 (`#101116`) for panels, sidebars, and trace views, ascending to Surface Elevated Tier 2 (`#171920`) for active cards, drawers, and modal overlays.
- **Structural Outlines**: Hairline structural definition uses Subdued Border (`#272A33`) for panel separation and grid boundaries, and Focused Border (`#3A3E4D`) for interactive element resting borders.
- **Action & Accentuation (Acid Lime - `#D4FF24`)**: Reserved exclusively for top-tier operational directives, primary resolution CTAs, active cursor highlights, anomalous root-cause beacons, and selected execution toggles. It must be deployed with absolute restraint—never for large background fills.
- **System Anchor (Electric Cobalt - `#1558C9`)**: Handles interactive active links, multi-series metric selections, telemetry breadcrumbs, selected navigation rails, and query highlight spans.
- **Text & Telemetry Hierarchy**: Primary Content sits at `#F4F5F7` (maximum contrast), Muted Telemetry / Secondary Labels at `#9296A3`, and De-emphasized Annotations / Null Metrics at `#5A5E6B`.
- **Operational Status Indicators**:
  - Critical / Incident Active: `#FF5364`
  - Degraded / Warning: `#FFB547`
  - Nominal / Healthy: `#50D890`
  - Inactive / Stale: `#5A5E6B`

## Typography

Typography prioritizes high-throughput data scannability over expressive flourish:

- **UI Text (`Geist`)**: Used across navigation, modal headers, context descriptions, and interactive labels. Tight tracking (`letter-spacing: -0.015em` to `-0.025em`) ensures compact labels fit within dense table rows and multi-pane breadcrumbs without clipping.
- **Telemetry & Data Engine (`JetBrains Mono`)**: Mandatory for all machine-generated content: Trace IDs, Span durations, HTTP response codes, query builder tokens, CPU/Memory telemetry counters, p50/p95/p99 values, and raw log records. Fixed character widths align multi-line metric reads across tabular panels.
- **Optical Hierarchy**: Capitalization is kept strictly functional. Section badges and status headers utilize uppercase tracking at small sizes (`label-sm`), while metrics and descriptions maintain standard sentence casing for legibility.

## Layout & Spacing

The layout is built for complex multi-view dashboard architectures, log streams, and flamegraph visualizations:

- **Layout Structure**: Utilizes a dynamic, pane-oriented fluid grid system. Canvases adapt between 12-column analytical dashboards and collapsible split-screen panes (e.g., Service Map on left, Trace Waterfall on center, AI Root-Cause Diagnostic Drawer on right).
- **Micro-Density Rhythms**: Component gaps and interior paddings are compressed. Standard dashboard cards use `space-md` (12px) internal padding, reducing dead space and maximizing viewport telemetry density.
- **Breakpoints & Adaptation**:
  - `Desktop (>= 1440px)`: Full multi-pane arrangement; persistent contextual toolbars, side-by-side metric comparison, `margin-desktop: 1.5rem`, `gutter-desktop: 1rem`.
  - `Laptop (1024px - 1439px)`: Split-pane with auto-docking auxiliary sidebars, `margin: 1rem`, `gutter: 0.75rem`.
  - `Mobile / Triage View (< 1024px)`: Single-column linear triage stream with modal trace inspectors; grid collapses to `margin: 0.75rem`.

## Elevation & Depth

Visual depth is achieved through structural layering and crisp luminosity contrast rather than soft, muddy blurs:

- **Tonal Layering**: Stacking is dictated by lightness steps. Canvas base (`#030407`) sinks to the bottom; panels sit at `#101116`; interactive surfaces and active cards rest at `#171920`.
- **Crisp Structural Borders**: Every panel, card, and floating menu is bounded by a 1px solid border (`#272A33`). Depth separation relies on contrast borders, not drop shadows.
- **Elevation Hierarchy**:
  - **Level 0 (Base Canvas)**: Background `#030407`. No borders, no shadows.
  - **Level 1 (Panels & Grid Cells)**: Background `#101116`, border 1px solid `#272A33`.
  - **Level 2 (Cards, Dropdowns & Popovers)**: Background `#171920`, border 1px solid `#3A3E4D`, subtle directional drop shadow (`0 4px 16px rgba(0, 0, 0, 0.65)`).
  - **Level 3 (Incident Modals & Command Palette)**: Background `#171920`, border 1px solid `#3A3E4D`, drop shadow (`0 12px 32px rgba(0, 0, 0, 0.85)`).
- **Targeted Diagnostic Glows**: Used solely for high-severity signals. Critical incidents emit a tight, controlled outer glow (`0 0 12px rgba(255, 83, 100, 0.25)`). Acid lime accents emit a high-precision edge aura (`0 0 10px rgba(212, 255, 36, 0.2)`) strictly when focused or engaged.

## Shapes

The shape system enforces high-precision geometric restraint:

- **Base Radius (`roundedness: 1`)**: Standard interactive components (buttons, input fields, dropdown toggles, table rows, and status badges) adhere strictly to a crisp `0.25rem` (4px) corner radius.
- **Large Panels (`rounded-lg`)**: Larger dashboard metric panels, code blocks, flamegraph containers, and trace drawers scale to `0.5rem` (8px) corner radius to soften major layout transitions without losing architectural sharpness.
- **Contextual Windows (`rounded-xl`)**: Top-level modal sheets and command palettes scale to `0.75rem` (12px).
- **Prohibitions**: Full pill buttons (`rounded-full`) are prohibited for actionable inputs and buttons, reserved solely for micro status indicators, span category pills, and numeric badge counters.

## Components

### Buttons
- **Primary (Action / Resolve / Run Query)**: Background `#D4FF24`, text `#030407` (`font-weight: 600`), border none, radius `4px`. Hover: `#E1FF59` with subtle lime edge glow (`0 0 10px rgba(212, 255, 36, 0.3)`). Active: `#B8DE1C`.
- **Secondary (Inspect / Export / Filter)**: Background `#171920`, text `#F4F5F7`, border `1px solid #272A33`, radius `4px`. Hover: border `#3A3E4D`, background `#20232B`.
- **Tertiary / Ghost (Icon Actions)**: Background transparent, text `#9296A3`, border none. Hover: text `#F4F5F7`, background `#171920`.
- **Destructive**: Background `#FF5364` with `#030407` text or ghost border with `#FF5364` text for low-priority alerts.

### Input Fields & Search / Query Builders
- **Surface**: Background `#101116`, border `1px solid #272A33`, text `#F4F5F7`, typography `Geist Mono` or `JetBrains Mono` for syntax inputs, radius `4px`.
- **State**: Focus applies border `1px solid #D4FF24` with zero ambient ring spill. Placeholder text `#5A5E6B`.
- **Query Prefix / Key-Value Badges**: Contained inside inputs with background `#171920`, border `1px solid #272A33`, text `#9296A3`.

### Cards & Metric Panels
- **Structure**: Background `#101116`, border `1px solid #272A33`, radius `8px`, padding `space-md` (12px).
- **Header**: Flex-aligned, title `label-md` uppercase in `#9296A3`, right-aligned latency/sparkline pill, border-bottom `1px solid #171920`.

### Chips & Telemetry Badges
- **Status Chips**: Font `code-sm`, padding `2px 6px`, radius `4px`.
  - Nominal: text `#50D890`, background `rgba(80, 216, 144, 0.08)`, border `1px solid rgba(80, 216, 144, 0.2)`.
  - Warning: text `#FFB547`, background `rgba(255, 181, 71, 0.08)`, border `1px solid rgba(255, 181, 71, 0.2)`.
  - Critical: text `#FF5364`, background `rgba(255, 83, 100, 0.1)`, border `1px solid rgba(255, 83, 100, 0.3)`.
  - Selected Series: text `#F4F5F7`, background `rgba(21, 88, 201, 0.3)`, border `1px solid #1558C9`.

### Lists & Telemetry Logs
- **Row Architecture**: Alternating hover highlights (`#171920`), base height `28px` for ultra-dense logs, `36px` for incident lists.
- **Log Line Elements**: Left-border colored status tick (2px width), timestamp in `#5A5E6B` (`code-sm`), service name `#9296A3`, log payload `#F4F5F7` with syntax highlights.

### Checkboxes & Radios
- **Design**: Box width/height `14px`, border `1px solid #272A33`, background `#030407`, radius `2px` (checkbox) or circular (radio).
- **Selected**: Background `#D4FF24`, inner check mark `#030407` (checkbox); inner dot `#D4FF24` (radio).

### Trace Flamegraph Spans & Waterfalls
- **Span Bars**: Height `18px`, radius `2px`, background gradient or solid color mapped to execution time.
- **Critical Path / Error Span**: Outlined in `#FF5364` with `#FF5364` striping pattern.
- **Inspection Pointer**: Vertical 1px hairline `#D4FF24` spanning across the full telemetry stack with real-time offset tooltip.