/** Presentation timing only; never an agent result or customer evidence. */
export const DEMO_ANALYSIS_MS = 6000;
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
        waves === 1
          ? DEMO_ANALYSIS_MS
          : 2000 + (wave * (DEMO_ANALYSIS_MS - 2000)) / (waves - 1),
      ];
    }),
  );
}
export function analysisProgress(elapsed: number, deadline?: number) {
  return deadline
    ? Math.min(100, Math.max(0, Math.floor((elapsed / deadline) * 100)))
    : 0;
}

/** Every phase length of the merchant playback, in milliseconds. Tune the demo here and nowhere else. */
export const demoPhases = {
  signals: 2000,
  beforeAnalysis: 500,
  analysis: DEMO_ANALYSIS_MS,
  beforeGeneration: 500,
  generation: 3000,
  rewards: 5000,
} as const;

const ANALYSIS_AT = demoPhases.signals + demoPhases.beforeAnalysis;
const GENERATION_AT =
  ANALYSIS_AT + demoPhases.analysis + demoPhases.beforeGeneration;
export const DEMO_PREVIEWS_MS = GENERATION_AT + demoPhases.generation;
export const DEMO_FLOW_MS = DEMO_PREVIEWS_MS + demoPhases.rewards;

export function demoFlowAt(time: number, count: number) {
  const elapsed = Math.max(0, Math.min(DEMO_FLOW_MS, time));
  const initial = Math.min(25, count);
  return {
    signalCount:
      initial +
      Math.floor((count - initial) * Math.min(1, elapsed / demoPhases.signals)),
    analysisStarted: elapsed >= ANALYSIS_AT,
    analysisElapsed: Math.max(
      0,
      Math.min(demoPhases.analysis, elapsed - ANALYSIS_AT),
    ),
    generating: elapsed >= GENERATION_AT && elapsed < DEMO_PREVIEWS_MS,
    previewsReady: elapsed >= DEMO_PREVIEWS_MS,
    // Rewards settle only after the improvement exists; there is nothing to pay for before that.
    rewarding: elapsed >= DEMO_PREVIEWS_MS && elapsed < DEMO_FLOW_MS,
    rewardsReady: elapsed >= DEMO_FLOW_MS,
  };
}

/** Rehearsal control: /admin?speed=2 runs the playback at double rate, 0.5 at half. */
export function demoSpeed(search: string) {
  const value = Number(new URLSearchParams(search).get('speed'));
  return Number.isFinite(value) && value > 0 ? Math.min(10, value) : 1;
}
