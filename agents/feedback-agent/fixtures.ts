import raw from '../../data/shopper-feedback.json' with { type: 'json' };

export type JourneyStep = {
  step: number;
  path: string;
  action: string;
  toPath: string;
  target?: string;
  text?: string;
  keys?: string[];
  scrollY?: number;
  direction?: string;
};

export type FeedbackRecord = {
  id?: string;
  message: string;
  channel?: string;
  topic?: string;
  priority?: string;
  productHandle?: string | null;
  productTitle?: string | null;
  journey?: { viewport: string; startPath: string; steps: JourneyStep[] };
};

export const feedbackFixtures = raw.feedback as FeedbackRecord[];

export function findFeedback(id: string) {
  return feedbackFixtures.find((record) => record.id === id);
}

export function feedbackTargetPath(record: FeedbackRecord) {
  return record.productHandle
    ? `/store/products/${record.productHandle}`
    : (record.journey?.startPath ?? '/store');
}

// ponytail: one line per step is enough context for triage and replay; raw JSON if Astra needs coordinates.
export function journeySummary(
  journey: NonNullable<FeedbackRecord['journey']>,
) {
  const steps = journey.steps.map((step) => {
    const detail = step.target ?? step.text ?? step.keys?.join('+') ?? '';
    const move = step.toPath !== step.path ? ` -> ${step.toPath}` : '';
    return `${step.step}. ${step.action}${detail ? ` "${detail}"` : ''}${step.scrollY ? ` ${step.scrollY}px` : ''}${move}`;
  });
  return [
    `Recorded shopper journey (${journey.viewport}, started at ${journey.startPath}):`,
    ...steps,
  ].join('\n');
}

export function recordContext(record: FeedbackRecord) {
  const lines = [];
  if (record.id)
    lines.push(
      `Feedback record: ${record.id} (${[record.channel, record.topic, record.priority && `${record.priority} priority`].filter(Boolean).join(', ')})`,
    );
  if (record.productTitle)
    lines.push(
      `Product: ${record.productTitle} (${feedbackTargetPath(record)})`,
    );
  if (record.journey) lines.push(journeySummary(record.journey));
  return lines;
}
