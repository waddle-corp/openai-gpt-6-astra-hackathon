'use client';

import { useState } from 'react';
import type { WheelOption } from './vehicle-hotspots';

export const WHEEL_EVENT = 'vehicle-wheels';
export type WheelChange = { hex: string | null; label: string };

/** Colour chips on a wheel card; a click previews the colour on the 3D ride (VehicleModel listens). */
export function WheelSwatches({ options }: { options: WheelOption[] }) {
  const [active, setActive] = useState<string | null>(null);
  const pick = (option: WheelOption | null) => {
    setActive(option?.label ?? null);
    document.dispatchEvent(new CustomEvent<WheelChange>(WHEEL_EVENT, { detail: { hex: option?.hex ?? null, label: option?.label ?? 'Stock' } }));
  };
  return (
    <div className="wheel-swatches" aria-label="Preview wheel colour on your ride">
      <span>Preview on your ride</span>
      <div>
        <button type="button" className={active === null ? 'is-active' : ''} onClick={() => pick(null)} title="Stock all-terrain tyres" aria-label="Stock all-terrain tyres">
          <span className="wheel-swatch-stock" />
        </button>
        {options.map((option) => (
          <button key={option.label} type="button" className={active === option.label ? 'is-active' : ''} onClick={() => pick(option)} title={option.label} aria-label={option.label}>
            <span style={{ background: option.hex }} />
          </button>
        ))}
      </div>
      <em>{active ?? 'All terrain (stock)'}</em>
    </div>
  );
}
