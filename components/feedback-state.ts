'use client';
import { useEffect, useState } from 'react';
import { initialState, type DemoState, type Moment } from '@/lib/feedback';
const key = 'pay-with-feedback-v1';
export function readDemo(): DemoState {
  const raw = localStorage.getItem(key);
  if (!raw) return structuredClone(initialState);
  const value = JSON.parse(raw);
  if (!Array.isArray(value.feedback) || !Array.isArray(value.proposals))
    throw new Error(
      'Saved demo data is invalid. Clear this site’s demo storage to restart.',
    );
  return value;
}
export function saveDemo(state: DemoState) {
  localStorage.setItem(key, JSON.stringify(state));
  window.dispatchEvent(new Event('feedback-change'));
}
export function useDemo() {
  const [state, setState] = useState<DemoState>(initialState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => {
      try {
        setState(readDemo());
        setReady(true);
        setError('');
      } catch {
        setError(
          'Demo storage is unavailable or damaged. Enable local storage or clear this site’s data.',
        );
      }
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('feedback-change', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('feedback-change', refresh);
    };
  }, []);
  function update(fn: (current: DemoState) => DemoState) {
    try {
      saveDemo(fn(readDemo()));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save demo.');
    }
  }
  return { state, ready, error, update };
}
// Capture only explicit catalog events. Never read form values, page text, query strings or credentials.
export function captureMoment(moment: Omit<Moment, 'id'>) {
  try {
    const list: Moment[] = JSON.parse(
      sessionStorage.getItem('feedback-journey') || '[]',
    );
    const previous = list.at(-1);
    if (previous?.label === moment.label && previous.detail === moment.detail)
      return;
    sessionStorage.setItem(
      'feedback-journey',
      JSON.stringify(
        [...list, { ...moment, id: crypto.randomUUID() }].slice(-8),
      ),
    );
  } catch {
    /* Optional capture; checkout still offers a reviewable cart moment. */
  }
}
export function readMoments(): Moment[] {
  try {
    return JSON.parse(sessionStorage.getItem('feedback-journey') || '[]');
  } catch {
    return [];
  }
}
