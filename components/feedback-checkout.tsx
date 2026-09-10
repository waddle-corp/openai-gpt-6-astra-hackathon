'use client';
import { useState } from 'react';
import { readDemo, saveDemo, readMoments } from './feedback-state';
import { submitFeedback, type Moment } from '@/lib/feedback';
export function FeedbackCheckout({
  cartMoments,
  onComplete,
}: {
  cartMoments: Moment[];
  onComplete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  return (
    <section className="feedback-checkout">
      <button
        className="button"
        onClick={() => {
          const values = [...readMoments(), ...cartMoments].slice(-8);
          setMoments(values);
          setSelected(values.map((m) => m.id));
          setOpen(!open);
        }}
      >
        Pay with Feedback
      </button>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (done) return;
            try {
              const result = submitFeedback(
                readDemo(),
                comment,
                moments.filter((m) => selected.includes(m.id)),
              );
              saveDemo(result.state);
              setDone(true);
              try {
                sessionStorage.removeItem('feedback-journey');
              } catch {
                /* Submission is already saved. */
              }
              onComplete(result.id);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : 'Could not save feedback.',
              );
            }
          }}
        >
          <h3>What made shopping difficult?</h3>
          <p>
            Review your journey moments. Only product choices and cart actions
            are captured—not form values or payment details.
          </p>
          <p>
            These are activity summaries, not screen recordings. Please leave
            out personal information.
          </p>
          <fieldset>
            <legend>Choose moments to share</legend>
            {moments.map((m) => (
              <label className="feedback-moment" key={m.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, m.id]
                        : selected.filter((id) => id !== m.id),
                    )
                  }
                />
                <span>
                  <strong>{m.label}</strong>
                  <br />
                  {m.detail}
                </span>
              </label>
            ))}
          </fieldset>
          <label>
            Your feedback
            <textarea
              required
              minLength={12}
              maxLength={2000}
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="I was confused when…"
            />
          </label>
          <p>
            Demo order only. No payment, shipment or guaranteed reward. Feedback
            orders are excluded from paid conversion and revenue.
          </p>
          <button
            className="button"
            disabled={done || !selected.length}
            type="submit"
          >
            Submit feedback & finish demo order
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </section>
  );
}
