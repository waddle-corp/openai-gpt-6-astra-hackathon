export const DEMO_DURATION_MS = 60000;

// A recording timeline, separate from the looping factory simulation.
const chapters = [
  { start: 0, end: 5000, step: 'overview', close: 0, from: 0, to: 1500 },
  { start: 5000, end: 14000, step: '01', close: 12000, from: 1500, to: 2400 },
  { start: 14000, end: 27000, step: '02', close: 25000, from: 2500, to: 10000 },
  {
    start: 27000,
    end: 37000,
    step: '03',
    close: 35000,
    from: 10500,
    to: 14900,
  },
  {
    start: 37000,
    end: 48000,
    step: '04',
    close: 46000,
    from: 15000,
    to: 18500,
  },
  {
    start: 48000,
    end: 56000,
    step: '05',
    close: 56000,
    from: 19000,
    to: 28000,
  },
  {
    start: 56000,
    end: 60000,
    step: 'overview',
    close: 0,
    from: 28000,
    to: 28000,
  },
] as const;

export function projectDemoTour(elapsedMs: number) {
  const elapsed = Math.max(0, Math.min(DEMO_DURATION_MS, elapsedMs));
  const chapter =
    chapters.find((item) => elapsed < item.end) ?? chapters.at(-1)!;
  const progress = (elapsed - chapter.start) / (chapter.end - chapter.start);
  return {
    step: chapter.step,
    showModal: chapter.step !== 'overview' && elapsed < chapter.close,
    page:
      elapsed >= chapter.start + (chapter.close - chapter.start) * 0.65 ? 1 : 0,
    sampleMs: chapter.from + (chapter.to - chapter.from) * progress,
    finished: elapsed === DEMO_DURATION_MS,
  };
}
