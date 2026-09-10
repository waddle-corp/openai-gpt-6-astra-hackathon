export type Moment = {
  id: string;
  label: string;
  route: string;
  detail: string;
  image?: string;
};
export type Verdict =
  | 'Reproduced'
  | 'Observation supported'
  | 'Could not reproduce'
  | 'Needs more evidence';
export type Run = {
  mode: 'demo';
  verdict: Verdict;
  steps: string[];
  observation: string;
  hypothesis: string;
  confidence: string;
};
export type Feedback = {
  id: string;
  persona: string;
  title: string;
  comment: string;
  moments: Moment[];
  sample: boolean;
  group: string;
  run?: Run;
  reviewed?: boolean;
  createdAt: string;
};
export type Forecast = {
  sessions: number;
  baseline: number;
  lift: number;
  aov: number;
  margin: number;
  rate: number;
  cap: number;
};
export type Contributor = { id: string; weight: number; reason: string };
export type Proposal = {
  id: string;
  version: number;
  title: string;
  change: string;
  acceptance: string;
  forecast: Forecast;
  contributors: Contributor[];
  status: 'proposed' | 'approved' | 'paid';
  snapshot?: {
    forecast: Forecast;
    version: number;
    pool: number;
    allocations: { id: string; cents: number }[];
  };
  receipt?: string;
};
export type DemoState = { feedback: Feedback[]; proposals: Proposal[] };
export const defaultForecast: Forecast = {
  sessions: 10000,
  baseline: 4,
  lift: 0.4,
  aov: 200,
  margin: 40,
  rate: 20,
  cap: 1000,
};
export function calculate(f: Forecast, multiplier = 1) {
  for (const value of Object.values(f))
    if (!Number.isFinite(value) || value < 0)
      throw new Error('Use finite, nonnegative assumptions.');
  if (
    f.baseline > 100 ||
    f.margin > 100 ||
    f.rate > 100 ||
    f.lift > 100 - f.baseline
  )
    throw new Error(
      'Conversion, margin and bounty percentages must stay within 100%.',
    );
  const lift = Math.min(f.lift * multiplier, 100 - f.baseline);
  const orders = (f.sessions * lift) / 100;
  const profit = (orders * f.aov * f.margin) / 100;
  if (
    !Number.isSafeInteger(Math.round(profit * 100)) ||
    !Number.isSafeInteger(Math.round(f.cap * 100))
  )
    throw new Error('Assumptions exceed supported amounts.');
  return {
    lift,
    orders,
    profit,
    pool: Math.round(Math.min(f.cap, (profit * f.rate) / 100) * 100),
  };
}
export function allocate(pool: number, contributors: Contributor[]) {
  if (
    !contributors.length ||
    new Set(contributors.map((c) => c.id)).size !== contributors.length ||
    contributors.some((c) => !Number.isFinite(c.weight) || c.weight < 0)
  )
    throw new Error('Choose unique contributors with nonnegative weights.');
  const total = contributors.reduce((n, c) => n + c.weight, 0);
  if (!Number.isFinite(total) || total <= 0)
    throw new Error('At least one contribution weight must be positive.');
  const shares = contributors.map((c) => ({
    id: c.id,
    cents: Math.floor((pool * c.weight) / total),
    remainder: ((pool * c.weight) / total) % 1,
  }));
  let left = pool - shares.reduce((n, c) => n + c.cents, 0);
  for (const c of [...shares].sort((a, b) => b.remainder - a.remainder))
    if (left-- > 0) c.cents++;
  return shares.map(({ id, cents }) => ({ id, cents }));
}
export const supported = (f: Feedback) =>
  f.run?.verdict === 'Reproduced' || f.run?.verdict === 'Observation supported';
export function approve(p: Proposal, feedback: Feedback[]): Proposal {
  if (p.status !== 'proposed') return p;
  if (
    p.contributors.some(
      (c) =>
        !feedback.some(
          (f) => f.id === c.id && f.group === p.id && supported(f),
        ),
    )
  )
    throw new Error(
      'Every contributor needs a supported finding linked to this improvement.',
    );
  const { pool } = calculate(p.forecast);
  if (pool <= 0) throw new Error('The bounty pool must be positive.');
  return {
    ...p,
    status: 'approved',
    snapshot: {
      forecast: { ...p.forecast },
      version: p.version,
      pool,
      allocations: allocate(pool, p.contributors),
    },
  };
}
export function pay(p: Proposal): Proposal {
  if (p.status === 'paid') return p;
  if (p.status !== 'approved' || !p.snapshot)
    throw new Error('Approve and lock the bounty before payout.');
  return {
    ...p,
    status: 'paid',
    receipt: `SIM-${p.id}-v${p.snapshot.version}`,
  };
}
const productMoment: Moment = {
  id: 'sample-product',
  label: 'Product decision',
  route: '/store/products/boostedusa-hyperlane-fast-charger',
  detail: 'Looking for delivery timing beside the purchase controls.',
  image: '/evidence/charger-reference.jpg',
};
export const initialState: DemoState = {
  feedback: [
    {
      id: 'F-014',
      persona: 'Alex · sample shopper',
      title: 'When will my charger arrive?',
      comment:
        'I could see the price, but couldn’t work out when the charger would arrive before adding it to my cart.',
      moments: [
        productMoment,
        {
          id: 'sample-cart',
          label: 'Cart review',
          route: '/store/cart',
          detail:
            'No destination-specific arrival estimate in this illustrative journey.',
        },
      ],
      sample: true,
      group: 'delivery',
      createdAt: 'Sample',
    },
    {
      id: 'F-009',
      persona: 'Sam · sample shopper',
      title: 'Delivery timing on a small screen',
      comment:
        'I looked around the purchase area on my phone for an arrival date.',
      moments: [
        {
          ...productMoment,
          id: 'sample-mobile',
          label: 'Mobile purchase decision',
        },
      ],
      sample: true,
      group: 'delivery',
      createdAt: 'Sample',
    },
    {
      id: 'F-008',
      persona: 'Robin · sample shopper',
      title: 'The cart did not open on my first try',
      comment:
        'I tapped View cart and thought nothing happened. A second try worked.',
      moments: [
        {
          id: 'sample-tap',
          label: 'After adding to cart',
          route: '/store/cart',
          detail: 'Original tap target and timing were not captured.',
        },
      ],
      sample: true,
      group: 'cart',
      createdAt: 'Sample',
    },
    {
      id: 'F-006',
      persona: 'Jamie · sample shopper',
      title: 'The option in my cart looked different',
      comment: 'I thought I chose another option. I did not save which one.',
      moments: [productMoment],
      sample: true,
      group: 'variant',
      createdAt: 'Sample',
    },
  ],
  proposals: [],
};
// ponytail: deterministic fixtures only; replace this adapter with a trusted server runner when that runtime exists.
export async function reproduce(f: Feedback): Promise<Run> {
  await new Promise((resolve) => setTimeout(resolve, 900));
  const steps = [
    'Load the selected journey context (fixture)',
    'Review the purchase moment (fixture)',
    'Compare the reported observation (fixture)',
  ];
  if (!f.sample)
    return {
      mode: 'demo',
      verdict: 'Needs more evidence',
      steps: [
        'Read shopper-selected moments',
        'No live browser run is configured',
      ],
      observation:
        'Your submission was received. A deterministic demo cannot verify a new report.',
      hypothesis:
        'Unknown. Collect a controlled replay and compare it with these moments.',
      confidence: 'Unassessed · no live reproduction',
    };
  if (f.group === 'delivery')
    return {
      mode: 'demo',
      verdict: 'Observation supported',
      steps,
      observation:
        'The illustrative replay supports the shopper’s difficulty finding delivery timing. This is sample evidence, not a verified storefront defect.',
      hypothesis:
        'Delivery guidance may be too far from the purchase decision. Validate placement and destination rules before implementing.',
      confidence: 'Illustrative support only · root cause remains a hypothesis',
    };
  if (f.group === 'cart')
    return {
      mode: 'demo',
      verdict: 'Could not reproduce',
      steps,
      observation:
        'The fixture reaches the cart successfully. The original report remains unresolved.',
      hypothesis:
        'Unknown; timing, tap target or loading could differ. Request a more precise sequence.',
      confidence:
        'Inconclusive · one successful replay does not invalidate the report',
    };
  return {
    mode: 'demo',
    verdict: 'Needs more evidence',
    steps,
    observation:
      'The selected option is missing from the report, so a comparison is not possible.',
    hypothesis: 'Unknown. Ask for the option label and cart contents.',
    confidence: 'Insufficient evidence',
  };
}
export function propose(group: string, feedback: Feedback[]): Proposal {
  const eligible = feedback.filter((f) => f.group === group && supported(f));
  if (!eligible.length || group !== 'delivery')
    throw new Error(
      'Review supported delivery findings before creating this demo improvement.',
    );
  return {
    id: group,
    version: 1,
    title: 'Make delivery timing part of the purchase decision',
    change:
      'Show destination-aware delivery guidance beside the purchase controls, with a clear uncertainty range.',
    acceptance:
      'A shopper can find delivery guidance before adding to cart; confirm promises against fulfillment rules.',
    forecast: { ...defaultForecast },
    contributors: eligible.map((f, i) => ({
      id: f.id,
      weight: i === 0 ? 60 : 40,
      reason:
        i === 0
          ? 'Identified the missing decision context'
          : 'Independent mobile perspective on the same improvement',
    })),
    status: 'proposed',
  };
}
export function submitFeedback(
  state: DemoState,
  comment: string,
  moments: Moment[],
): { state: DemoState; id: string } {
  const clean = comment.trim();
  if (
    clean.length < 12 ||
    clean.length > 2000 ||
    !moments.length ||
    moments.length > 8
  )
    throw new Error('Select 1–8 moments and write 12–2,000 characters.');
  const existing = state.feedback.find(
    (f) =>
      !f.sample &&
      f.comment === clean &&
      JSON.stringify(f.moments) === JSON.stringify(moments),
  );
  if (existing) return { state, id: existing.id };
  const id = `F-${crypto.randomUUID().slice(0, 8)}`;
  return {
    id,
    state: {
      ...state,
      feedback: [
        {
          id,
          persona: 'Demo shopper',
          title: clean.slice(0, 65),
          comment: clean,
          moments,
          sample: false,
          group: id,
          createdAt: new Date().toISOString(),
        },
        ...state.feedback,
      ],
    },
  };
}
