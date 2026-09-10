/** Presentation timing only; never an agent result or customer evidence. */
export const DEMO_ANALYSIS_MS = 8000;
export function analysisSchedule(ids: string[], random = Math.random) {
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const waves = Math.min(5, order.length);
  return Object.fromEntries(
    order.map((id, i) => {
      const wave = Math.floor((i * waves) / order.length);
      return [
        id,
        waves === 1 ? DEMO_ANALYSIS_MS : 2000 + (wave * 6000) / (waves - 1),
      ];
    }),
  );
}
export function analysisProgress(elapsed: number, deadline?: number) {
  return deadline
    ? Math.min(100, Math.max(0, Math.floor((elapsed / deadline) * 100)))
    : 0;
}

export const DEMO_FLOW_MS = 20000;
export function demoFlowAt(time: number, count: number) {
  const elapsed = Math.max(0, Math.min(DEMO_FLOW_MS, time));
  const initial = Math.min(25, count);
  return {
    signalCount:
      initial + Math.floor((count - initial) * Math.min(1, elapsed / 5000)),
    analysisStarted: elapsed >= 6000,
    analysisElapsed: Math.max(0, Math.min(DEMO_ANALYSIS_MS, elapsed - 6000)),
    generating: elapsed >= 15000 && elapsed < DEMO_FLOW_MS,
    previewsReady: elapsed >= DEMO_FLOW_MS,
  };
}
