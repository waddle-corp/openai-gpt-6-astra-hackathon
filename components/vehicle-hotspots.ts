// Server-safe (no 'use client'): RSC turns non-component exports of client modules into references.
export type Hotspot = { slot: string; position: string; normal: string; label: string; href: string };

// Anchors on public/media/3d/evolve-gtr.glb in glTF (Y-up) metres, printed by scripts/build-3d.py.
export const GTR_HOTSPOTS: Record<'Battery' | 'Wheels' | 'Kit' | 'Charger', Omit<Hotspot, 'label' | 'href'>> = {
  Battery: { slot: 'hotspot-battery', position: '0.14 -0.055 0.09', normal: '0 -1 0' },
  Wheels: { slot: 'hotspot-wheels', position: '0.43 -0.067 -0.215', normal: '0 0 -1' },
  Kit: { slot: 'hotspot-kit', position: '-0.457 -0.105 -0.16', normal: '0 -1 0' },
  Charger: { slot: 'hotspot-charger', position: '-0.15 -0.02 -0.3', normal: '0 1 0' },
};

export type WheelOption = { label: string; hex: string };

// Catalog wheel colours → preview colours for the 3D tyres. Unknown names are skipped.
const WHEEL_COLOURS: Record<string, string> = {
  purple: '#6a3fb5', yellow: '#f2c230', black: '#1c1c1c', 'glow in the dark': '#d9f7b3', orange: '#ff6a1a',
  white: '#f2f2f2', 'ice blue': '#a6d9f2', 'ice orange': '#ffb98c', 'ice green': '#ade7bd', 'stone ground': '#8d8781',
  red: '#d7262c', blue: '#2d63c8', green: '#3b9b57', pink: '#f28bb8', grey: '#8b8b8b', gray: '#8b8b8b',
};
export function wheelOptions(product: { variants: { title: string }[] }): WheelOption[] {
  return product.variants.flatMap((variant) => {
    const hex = WHEEL_COLOURS[variant.title.trim().toLowerCase()];
    return hex ? [{ label: variant.title.trim(), hex }] : [];
  });
}
