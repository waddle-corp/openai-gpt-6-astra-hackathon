import type { Feedback, Forecast } from './feedback';

export const STAGES = [
  { id: 'feedback', label: 'Feedback' },
  { id: 'reproduce', label: 'Reproduce' },
  { id: 'diagnose', label: 'Diagnose' },
  { id: 'propose', label: 'Propose' },
  { id: 'reward', label: 'Reward' },
] as const;
export type Stage = (typeof STAGES)[number]['id'];
export type AgentEvent = {
  runId: string;
  sequence: number;
  elapsedMs: number;
  stage: Stage;
  status: 'running' | 'completed' | 'blocked' | 'failed';
  title: string;
  summary: string;
  artifact?: { kind: 'reference' | 'screenshot'; url: string; caption: string };
  finding?: {
    verdict: string;
    observation: string;
    hypothesis: string;
    confidence: string;
  };
  proposal?: {
    title: string;
    change: string;
    acceptance: string;
    forecast: Forecast;
    scenarios: { label: string; lift: number; profit: number }[];
    expectedProfit: number;
  };
  reward?: {
    poolCents: number;
    status: 'proposed' | 'approved' | 'paid';
    allocations: {
      feedbackId: string;
      persona: string;
      cents: number;
      reason: string;
    }[];
    receipt?: string;
  };
};
export type AgentRun = {
  id: string;
  title: string;
  source: 'sample' | 'pending' | 'live';
  feedback: Feedback[];
  events: AgentEvent[];
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an event object.');
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 10000)
    throw new Error(
      'Expected nonempty event text of at most 10,000 characters.',
    );
  return value;
}
function number(value: unknown, integer = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER ||
    (integer && !Number.isSafeInteger(value))
  )
    throw new Error('Expected a finite nonnegative event number.');
  return value;
}
function oneOf<T extends string>(value: unknown, options: readonly T[]): T {
  if (!options.includes(value as T))
    throw new Error('Unknown event status or kind.');
  return value as T;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || !value.length || value.length > 100)
    throw new Error('Expected 1–100 event items.');
  return value;
}

/** Transport boundary: reject malformed payloads and retain only supported fields. */
export function decodeAgentEvent(value: unknown): AgentEvent {
  const data = object(value);
  const event: AgentEvent = {
    runId: string(data.runId),
    sequence: number(data.sequence, true),
    elapsedMs: number(data.elapsedMs, true),
    stage: oneOf(
      data.stage,
      STAGES.map((stage) => stage.id),
    ),
    status: oneOf(data.status, ['running', 'completed', 'blocked', 'failed']),
    title: string(data.title),
    summary: string(data.summary),
  };
  if (data.artifact !== undefined) {
    const artifact = object(data.artifact);
    const url = string(artifact.url);
    // Only local, absolute paths: no external media, credentials, or protocol-relative URLs.
    if (!/^\/(?!\/)/.test(url) || /[\\\s]|\p{Cc}/u.test(url))
      throw new Error('Evidence must use a same-origin absolute path.');
    event.artifact = {
      kind: oneOf(artifact.kind, ['reference', 'screenshot']),
      url,
      caption: string(artifact.caption),
    };
  }
  if (data.finding !== undefined) {
    const finding = object(data.finding);
    event.finding = {
      verdict: oneOf(finding.verdict, [
        'Reproduced',
        'Observation supported',
        'Could not reproduce',
        'Needs more evidence',
      ]),
      observation: string(finding.observation),
      hypothesis: string(finding.hypothesis),
      confidence: string(finding.confidence),
    };
  }
  if (data.proposal !== undefined) {
    const proposal = object(data.proposal);
    const f = object(proposal.forecast);
    const forecast: Forecast = {
      sessions: number(f.sessions, true),
      baseline: number(f.baseline),
      lift: number(f.lift),
      aov: number(f.aov),
      margin: number(f.margin),
      rate: number(f.rate),
      cap: number(f.cap),
    };
    if (
      forecast.baseline + forecast.lift > 100 ||
      forecast.margin > 100 ||
      forecast.rate > 100
    )
      throw new Error('Forecast percentages exceed 100%.');
    const scenarios = list(proposal.scenarios).map((value) => {
      const scenario = object(value);
      const lift = number(scenario.lift);
      if (lift + forecast.baseline > 100)
        throw new Error('Scenario conversion exceeds 100%.');
      return {
        label: string(scenario.label),
        lift,
        profit: number(scenario.profit),
      };
    });
    event.proposal = {
      title: string(proposal.title),
      change: string(proposal.change),
      acceptance: string(proposal.acceptance),
      forecast,
      scenarios,
      expectedProfit: number(proposal.expectedProfit),
    };
  }
  if (data.reward !== undefined) {
    const reward = object(data.reward);
    const poolCents = number(reward.poolCents, true);
    const allocations = list(reward.allocations).map((value) => {
      const allocation = object(value);
      return {
        feedbackId: string(allocation.feedbackId),
        persona: string(allocation.persona),
        cents: number(allocation.cents, true),
        reason: string(allocation.reason),
      };
    });
    if (
      new Set(allocations.map((allocation) => allocation.feedbackId)).size !==
        allocations.length ||
      allocations.reduce((total, allocation) => total + allocation.cents, 0) !==
        poolCents
    )
      throw new Error('Unique reward allocations must sum to the pool.');
    event.reward = {
      poolCents,
      status: oneOf(reward.status, ['proposed', 'approved', 'paid']),
      allocations,
      ...(reward.receipt === undefined
        ? {}
        : { receipt: string(reward.receipt) }),
    };
    if (event.reward.status === 'paid' && !event.reward.receipt)
      throw new Error('A paid reward needs a receipt.');
  }
  return event;
}

function validateHistory(events: AgentEvent[]) {
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    decodeAgentEvent(event);
    const previous = events[index - 1];
    if (
      previous &&
      (event.runId !== previous.runId ||
        event.sequence <= previous.sequence ||
        event.elapsedMs < previous.elapsedMs)
    )
      throw new Error(
        'A run requires increasing sequences and nondecreasing time.',
      );
  }
}

/** Ordered delivery only. Identical retries are ignored; conflicting or late events fail. */
export function appendEvent(
  events: AgentEvent[],
  value: AgentEvent,
): AgentEvent[] {
  validateHistory(events);
  const event = decodeAgentEvent(value);
  if (events.length && events[0].runId !== event.runId)
    throw new Error('Cannot mix events from different runs.');
  const existing = events.find((item) => item.sequence === event.sequence);
  if (existing) {
    if (JSON.stringify(decodeAgentEvent(existing)) !== JSON.stringify(event))
      throw new Error('Conflicting event for an existing sequence.');
    return events;
  }
  const previous = events.at(-1);
  if (
    previous &&
    (event.sequence < previous.sequence || event.elapsedMs < previous.elapsedMs)
  )
    throw new Error('Out-of-order event; request an ordered run snapshot.');
  return [...events, event];
}

/** Inclusive time travel. -1 or an empty run has no visible event or artifacts. */
export function projectEvent(events: AgentEvent[], index: number) {
  validateHistory(events);
  if (!Number.isInteger(index) || index < -1)
    throw new Error('Expected a valid event index.');
  const visible = events.slice(0, index + 1);
  const projection: {
    event?: AgentEvent;
    artifact?: AgentEvent['artifact'];
    finding?: AgentEvent['finding'];
    proposal?: AgentEvent['proposal'];
    reward?: AgentEvent['reward'];
  } = { event: visible.at(-1) };
  for (const event of visible) {
    if (event.artifact) projection.artifact = event.artifact;
    if (event.finding) projection.finding = event.finding;
    if (event.proposal) projection.proposal = event.proposal;
    if (event.reward) projection.reward = event.reward;
  }
  return projection;
}

/** Illustrative recording only. New shopper reports wait for a real backend event. */
export function buildSampleRun(selected: Feedback, all: Feedback[]): AgentRun {
  const id = selected.sample
    ? `sample-${selected.group}-v1`
    : `submission-${selected.id}`;
  const related =
    selected.sample && selected.group === 'delivery'
      ? all.filter((item) => item.sample && item.group === selected.group)
      : [];
  const feedback = [
    ...new Map([selected, ...related].map((item) => [item.id, item])).values(),
  ];
  const events: AgentEvent[] = [];
  function add(event: Omit<AgentEvent, 'runId' | 'sequence'>) {
    events.push(
      decodeAgentEvent({ ...event, runId: id, sequence: events.length }),
    );
  }
  add({
    elapsedMs: 0,
    stage: 'feedback',
    status: 'completed',
    title:
      feedback.length > 1
        ? `${feedback.length} reports, one purchase question`
        : 'Shopper feedback received',
    summary: selected.sample
      ? 'The sample run begins with the moments the shopper chose to share.'
      : 'The shopper shared these selected moments. No agent investigation has run yet.',
  });
  if (!selected.sample) {
    add({
      elapsedMs: 0,
      stage: 'reproduce',
      status: 'blocked',
      title: 'Waiting for an agent connection',
      summary:
        'Submission received. A connected agent must provide reproduction evidence before any finding or reward can appear.',
    });
    return { id, title: selected.title, source: 'pending', feedback, events };
  }
  const artifact: AgentEvent['artifact'] = {
    kind: 'reference',
    url: '/evidence/charger-reference.jpg',
    caption:
      'Bundled product reference · illustrative sample, not a live browser capture',
  };
  add({
    elapsedMs: 2500,
    stage: 'reproduce',
    status: 'running',
    title: 'Retracing the purchase decision',
    summary:
      'Sample playback opens the reported product and follows the selected shopping moments.',
    ...(selected.group === 'delivery' ? { artifact } : {}),
  });
  if (selected.group !== 'delivery') {
    const isCart = selected.group === 'cart';
    add({
      elapsedMs: 6500,
      stage: 'reproduce',
      status: isCart ? 'completed' : 'blocked',
      title: isCart
        ? 'The sample replay reaches the cart'
        : 'The selected option is missing',
      summary: isCart
        ? 'This illustrative attempt did not recreate the reported delay. The original report remains unresolved.'
        : 'Without the option label or original cart contents, the sample cannot compare the reported selection.',
    });
    add({
      elapsedMs: 10500,
      stage: 'diagnose',
      status: 'blocked',
      title: 'Keep the report open',
      summary:
        'The system needs a more precise sequence before proposing a change or allocating a reward.',
      finding: {
        verdict: isCart ? 'Could not reproduce' : 'Needs more evidence',
        observation: isCart
          ? 'The illustrative replay reaches the cart successfully. This does not invalidate the shopper’s report.'
          : 'The reported selection is not captured, so the observation cannot yet be compared.',
        hypothesis: isCart
          ? 'Unknown. Timing or the original tap target may differ; request that context.'
          : 'Unknown. Request the option label and cart contents.',
        confidence: 'Inconclusive · sample evidence only',
      },
    });
    return { id, title: selected.title, source: 'sample', feedback, events };
  }
  add({
    elapsedMs: 6500,
    stage: 'reproduce',
    status: 'completed',
    title: 'Delivery timing is hard to find in the sample',
    summary:
      'The illustrative sequence checks the purchase controls, then the cart, for arrival guidance.',
    artifact,
  });
  add({
    elapsedMs: 10500,
    stage: 'diagnose',
    status: 'completed',
    title: 'The missing context is the arrival date',
    summary:
      'Related reports point to one purchase decision. They support one improvement, with one expected benefit.',
    finding: {
      verdict: 'Observation supported',
      observation:
        'In this illustrative journey, shoppers cannot find arrival guidance beside the purchase controls. This is not a verified storefront defect.',
      hypothesis:
        'Delivery information may appear too far from the purchase decision. Placement and fulfillment rules still need verification.',
      confidence:
        'Sample observation supported · root cause remains a hypothesis',
    },
  });
  add({
    elapsedMs: 15000,
    stage: 'propose',
    status: 'completed',
    title: 'Put delivery confidence beside the buy button',
    summary:
      'The agent proposes one change and a 30-day contribution-profit estimate. Conversion lift is an unmeasured assumption.',
    proposal: {
      title: 'Make arrival timing part of the purchase decision',
      change:
        'Show destination-aware delivery guidance beside the purchase controls, with a clear uncertainty range.',
      acceptance:
        'Shoppers can find arrival guidance before adding to cart. Confirm the promise against fulfillment rules, then measure paid conversion.',
      forecast: {
        sessions: 10000,
        baseline: 4,
        lift: 0.4,
        aov: 200,
        margin: 40,
        rate: 20,
        cap: 1000,
      },
      scenarios: [
        { label: 'Low', lift: 0, profit: 0 },
        { label: 'Base', lift: 0.4, profit: 3200 },
        { label: 'High', lift: 0.8, profit: 6400 },
      ],
      expectedProfit: 3200,
    },
  });
  const contributors = [...feedback]
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, 2);
  const allocations = contributors.map((item, index) => ({
    feedbackId: item.id,
    persona: item.persona,
    cents: contributors.length === 1 ? 64000 : index === 0 ? 38400 : 25600,
    reason:
      index === 0
        ? 'Identified missing purchase context · 60% policy weight'
        : 'Independent perspective on the same improvement · 40% policy weight',
  }));
  const reward = { poolCents: 64000, allocations };
  add({
    elapsedMs: 19000,
    stage: 'reward',
    status: 'running',
    title: 'One improvement. One $640 reward pool.',
    summary:
      '20% of the estimated $3,200 contribution profit, below the $1,000 cap. Allocation weights are reward policy, not measured causal shares.',
    reward: { ...reward, status: 'proposed' },
  });
  add({
    elapsedMs: 23000,
    stage: 'reward',
    status: 'running',
    title: 'The sample policy locks the reward',
    summary:
      'Proposal v1, forecast assumptions, the $640 pool and contributor allocations are locked together in this sample approval.',
    reward: { ...reward, status: 'approved' },
  });
  add({
    elapsedMs: 27000,
    stage: 'reward',
    status: 'completed',
    title: 'Shopper insight returns value to shoppers',
    summary:
      'Simulated payout recorded once for proposal v1. No money moves, and feedback-funded demo orders are excluded from paid revenue and conversion.',
    reward: { ...reward, status: 'paid', receipt: 'SIM-delivery-v1' },
  });
  return {
    id,
    title: 'From delivery doubt to shopper reward',
    source: 'sample',
    feedback,
    events,
  };
}
