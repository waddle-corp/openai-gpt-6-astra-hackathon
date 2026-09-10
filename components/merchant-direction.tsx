'use client';

import { useEffect, useState } from 'react';

const defaults = {
  goal: 'Increase average order value',
  strategy: 'Sell compatible parts',
};
const storageKey = 'boosted-merchant-direction';

export function MerchantDirection() {
  const [direction, setDirection] = useState(defaults);
  const [draft, setDraft] = useState(defaults);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (
        saved &&
        typeof saved.goal === 'string' &&
        saved.goal.trim() &&
        typeof saved.strategy === 'string' &&
        saved.strategy.trim()
      ) {
        // Hydrate browser-only preferences after the server render.
        // oxlint-disable-next-line react/react-compiler
        setDirection({
          goal: saved.goal.slice(0, 100),
          strategy: saved.strategy.slice(0, 160),
        });
      }
    } catch {
      /* Keep defaults when browser storage is unavailable. */
    }
  }, []);

  return (
    <form
      className="mo-heading mo-direction mo-direction-editable"
      onSubmit={(event) => {
        event.preventDefault();
        const next = {
          goal: draft.goal.trim(),
          strategy: draft.strategy.trim(),
        };
        if (!next.goal || !next.strategy) {
          setError('Enter both a goal and a strategy.');
          return;
        }
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          setError('Could not save in this browser. Please try again.');
          return;
        }
        setDirection(next);
        setEditing(false);
        setError('');
      }}
    >
      <div className="mo-revenue-goal">
        <label
          className="mo-kicker"
          htmlFor={editing ? 'merchant-goal' : undefined}
        >
          GOAL
        </label>
        {editing ? (
          <input
            id="merchant-goal"
            required
            maxLength={100}
            value={draft.goal}
            onChange={(event) =>
              setDraft({ ...draft, goal: event.target.value })
            }
          />
        ) : (
          <h1>{direction.goal}</h1>
        )}
      </div>
      <div className="mo-active-strategy">
        <label
          className="mo-kicker"
          htmlFor={editing ? 'merchant-strategy' : undefined}
        >
          STRATEGY
        </label>
        {editing ? (
          <input
            id="merchant-strategy"
            required
            maxLength={160}
            value={draft.strategy}
            onChange={(event) =>
              setDraft({ ...draft, strategy: event.target.value })
            }
          />
        ) : (
          <h2>{direction.strategy}</h2>
        )}
        {editing && (
          <p>
            Saved in this browser. Demo signals remain scoped to compatible
            parts.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="mo-direction-actions">
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError('');
              }}
            >
              Cancel
            </button>
            <button type="submit" className="mo-direction-save">
              Save
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(direction);
              setEditing(true);
            }}
          >
            Edit goal & strategy
          </button>
        )}
      </div>
    </form>
  );
}
