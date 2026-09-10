import type { Feedback } from './feedback';
import { buildSampleRun, projectEvent, type AgentRun } from './agent-run';

export type FleetRun = {
  run: AgentRun;
  index: number;
  snapshot: ReturnType<typeof projectEvent>;
  offsetMs: number;
  elapsedMs: number;
  progress: number;
};
export type FleetWorker = {
  id: string;
  feedbackId: string;
  runId: string;
  route: string;
  label: string;
  phase: 'inspect' | 'follow' | 'compare';
  status: 'queued' | 'running' | 'completed' | 'blocked';
  progress: number;
  source: 'sample';
  referenceImage?: string;
};
const CYCLE_MS = 36000;
const TASKS = [
  { phase: 'inspect', label: 'Inspect page' },
  { phase: 'follow', label: 'Follow journey' },
  { phase: 'compare', label: 'Compare context' },
] as const;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** A looping illustration of parallel work, never a claim of live computer use. */
export function projectFleet(feedback: Feedback[], elapsedMs: number) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
    throw new Error('Fleet elapsed time must be finite and nonnegative.');
  const uniqueRuns: AgentRun[] = [];
  for (const item of feedback) {
    const run = buildSampleRun(item, feedback);
    if (!uniqueRuns.some((existing) => existing.id === run.id))
      uniqueRuns.push(run);
  }
  const sampleCount = uniqueRuns.filter(
    (run) => run.source === 'sample',
  ).length;
  const runs: FleetRun[] = [];
  let sampleIndex = 0;
  for (const run of uniqueRuns) {
    const isSample = run.source === 'sample';
    const offsetMs = isSample
      ? Math.floor((sampleIndex * CYCLE_MS) / sampleCount)
      : 0;
    if (isSample) sampleIndex++;
    const localTime = isSample
      ? elapsedMs < offsetMs
        ? -1
        : (elapsedMs - offsetMs) % CYCLE_MS
      : 0;
    const index = isSample
      ? run.events.findLastIndex((event) => event.elapsedMs <= localTime)
      : run.events.length - 1;
    runs.push({
      run,
      index,
      snapshot: projectEvent(run.events, index),
      offsetMs,
      elapsedMs: localTime,
      progress: isSample
        ? clamp(localTime / (run.events.at(-1)?.elapsedMs || 1))
        : 0,
    });
  }
  const workers: FleetWorker[] = [];
  const samples = [
    ...new Map(
      feedback.filter((item) => item.sample).map((item) => [item.id, item]),
    ).values(),
  ].slice(0, 4);
  for (const item of samples) {
    const entry = runs.find((candidate) =>
      candidate.run.feedback.some((report) => report.id === item.id),
    )!;
    const start = entry.run.events.find(
      (event) => event.stage === 'reproduce',
    )!.elapsedMs;
    const reproductionEnd = entry.run.events.find(
      (event) => event.stage === 'reproduce' && event.status !== 'running',
    );
    const end = (reproductionEnd ||
      entry.run.events.find((event) => event.stage === 'diagnose'))!.elapsedMs;
    const terminalStatus =
      reproductionEnd?.status === 'blocked' ||
      reproductionEnd?.status === 'failed'
        ? 'blocked'
        : 'completed';
    for (const [taskIndex, task] of TASKS.entries()) {
      const moment = item.moments[taskIndex % item.moments.length];
      if (!moment) continue;
      const taskStart = start + taskIndex * 300;
      const progress = clamp((entry.elapsedMs - taskStart) / (end - taskStart));
      workers.push({
        id: `worker-${item.id}-${task.phase}`,
        feedbackId: item.id,
        runId: entry.run.id,
        route: moment.route,
        ...task,
        status:
          entry.elapsedMs < taskStart
            ? 'queued'
            : progress < 1
              ? 'running'
              : terminalStatus,
        progress,
        source: 'sample',
        ...(moment.image ? { referenceImage: moment.image } : {}),
      });
    }
  }
  return { feedback, runs, workers, cycleMs: CYCLE_MS };
}
