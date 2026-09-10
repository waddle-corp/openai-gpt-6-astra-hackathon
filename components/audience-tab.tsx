'use client';

import { useState } from 'react';
import './audience-tab.css';

export function AudienceTab({ audience, active, onSelect }: {
  audience: 'merchant' | 'user';
  active: boolean;
  onSelect: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const merchant = audience === 'merchant';
  return (
    <div className={`audience-tab ${dismissed ? 'is-dismissed' : ''}`}>
      <button
        type="button"
        aria-pressed={active}
        aria-describedby={`${audience}-challenge`}
        onMouseEnter={() => setDismissed(false)}
        onFocus={() => setDismissed(false)}
        onKeyDown={(event) => { if (event.key === 'Escape') setDismissed(true); }}
        onClick={() => { setDismissed(true); onSelect(); }}
      >{merchant ? 'Merchant' : 'User'}</button>
      <div className="audience-preview" role="tooltip" id={`${audience}-challenge`}>
        <div className={`audience-portrait-frame ${merchant ? 'is-merchant' : ''}`}>
        <img className="audience-portrait" src={`/media/audience/${audience}.png`} width={1536} height={1024} alt={merchant ? 'A thoughtful store owner behind a laptop' : 'A shopper questioning what she sees on her phone'} />
        </div>
        <strong>{merchant ? 'What should I fix?' : 'Who do I tell?'}</strong>
        <p>{merchant
          ? 'I want to grow my store, but I don’t know where shoppers struggle.'
          : 'There’s no easy way to share a problem—and nothing in it for me.'}</p>
      </div>
    </div>
  );
}
