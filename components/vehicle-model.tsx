'use client';

import { createElement, useEffect, useRef } from 'react';

import type { Hotspot } from './vehicle-hotspots';
import { WHEEL_EVENT, type WheelChange } from './wheel-swatches';

const SCRIPT = '/vendor/model-viewer.min.js';

/** Renders the vendored <model-viewer> web component; the parts dock via the GLB's "assemble" clip. */
type Material = {
  name: string;
  setAlphaMode: (mode: 'OPAQUE' | 'BLEND' | 'MASK') => void;
  setAlphaCutoff: (cutoff: number) => void;
  pbrMetallicRoughness: {
    baseColorFactor: number[];
    setBaseColorFactor: (rgba: number[]) => void;
  };
};
type ModelViewerElement = HTMLElement & {
  play: (options?: { repetitions?: number }) => void;
  currentTime: number;
  loaded: boolean;
  model?: { materials: Material[] };
};

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
// Material groups in public/media/3d/evolve-gtr.glb: the stock all-terrain wheel set and the 97mm street set.
const AT_WHEELS = ['ATTyre', 'ATHub', 'ATNut'];
const STREET_WHEELS = ['StreetUrethane', 'StreetCore', 'StreetBearing', 'StreetPrint'];

/** Swap the wheel set. Hidden meshes use alpha-mask 0 so they are discarded entirely (no depth or shadow artefacts). */
function applyWheels(viewer: ModelViewerElement, change: WheelChange) {
  const materials = viewer.model?.materials ?? [];
  const show = (names: string[], visible: boolean, rgb = [1, 1, 1]) => {
    for (const material of materials.filter((m) => names.includes(m.name))) {
      material.setAlphaMode('MASK');
      material.setAlphaCutoff(0.5);
      const [r, g, b] = material.name === 'StreetUrethane' ? rgb : material.pbrMetallicRoughness.baseColorFactor;
      material.pbrMetallicRoughness.setBaseColorFactor([r, g, b, visible ? 1 : 0]);
    }
  };
  if (change.hex) {
    show(AT_WHEELS, false);
    show(STREET_WHEELS, true, hexToRgb(change.hex));
  } else {
    show(STREET_WHEELS, false);
    show(AT_WHEELS, true);
  }
}

export function VehicleModel({ src, alt, hotspots }: { src: string; alt: string; hotspots: Hotspot[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!customElements.get('model-viewer') && !document.querySelector(`script[src="${SCRIPT}"]`)) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = SCRIPT;
      document.head.appendChild(script);
    }
    const viewer = wrap.current?.querySelector('model-viewer') as ModelViewerElement | null;
    if (!viewer) return;
    // Dock once and hold the assembled pose; replay when the shopper hovers the model.
    const dock = () => viewer.play({ repetitions: 1 });
    const replay = () => {
      viewer.currentTime = 0;
      dock();
    };
    const onWheels = (event: Event) => applyWheels(viewer, (event as CustomEvent<WheelChange>).detail);
    viewer.addEventListener('load', dock);
    viewer.addEventListener('mouseenter', replay);
    document.addEventListener(WHEEL_EVENT, onWheels);
    return () => {
      viewer.removeEventListener('load', dock);
      viewer.removeEventListener('mouseenter', replay);
      document.removeEventListener(WHEEL_EVENT, onWheels);
    };
  }, []);
  // ponytail: createElement keeps the custom element out of the JSX type namespace.
  const viewer = createElement(
    'model-viewer',
    {
      className: 'vehicle-model',
      src,
      alt,
      'camera-controls': '',
      'touch-action': 'pan-y',
      'auto-rotate': '',
      'auto-rotate-delay': '4000',
      'rotation-per-second': '12deg',
      'interaction-prompt': 'none',
      'camera-orbit': '-58deg 74deg 1.45m',
      'field-of-view': '27deg',
      'min-camera-orbit': 'auto auto 0.8m',
      'max-camera-orbit': 'auto auto 2.5m',
      'shadow-intensity': '0',
      'environment-image': 'neutral',
      exposure: '1.05',
      'tone-mapping': 'neutral',
      'animation-name': 'assemble',
    },
    hotspots.map((spot) =>
      createElement(
        'a',
        { key: spot.slot, slot: spot.slot, className: 'vehicle-hotspot', href: spot.href, 'data-position': spot.position, 'data-normal': spot.normal },
        spot.label,
      ),
    ),
  );
  return <div ref={wrap} className="vehicle-model-wrap">{viewer}</div>;
}
