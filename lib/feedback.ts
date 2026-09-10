export type JourneyEvent = {
  id: string;
  at: string;
  kind:
    | 'page_view'
    | 'variant_selected'
    | 'cart_added'
    | 'image_selected'
    | 'description_reached'
    | 'link_clicked'
    | 'cart_updated'
    | 'cart_removed';
  path: string;
  title: string;
  image?: string;
  detail?: string;
  destinationPath?: string;
};
export type Question = { id: string; prompt: string; options: string[] };
export type Reward = 'coupon' | 'card_cashback';
export type FeedbackCartItem = {
  variantId: string;
  productHandle: string;
  productTitle: string;
  variantTitle: string;
  quantity: number;
  unitPriceCents: number;
};
export function validFeedbackCart(value: unknown): value is FeedbackCartItem[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(
      (item) =>
        item &&
        ['variantId', 'productHandle', 'productTitle', 'variantTitle'].every(
          (key) =>
            typeof item[key] === 'string' &&
            item[key].length > 0 &&
            item[key].length <= 240,
        ) &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 99 &&
        Number.isSafeInteger(item.unitPriceCents) &&
        item.unitPriceCents >= 0,
    )
  );
}
export type FeedbackDraft = {
  conversational?: boolean;
  approvedSummary?: string;
  step: 'journey' | 'pain' | 'questions' | 'review';
  selected?: JourneyEvent;
  focus?: 'specific_moments' | 'overall';
  selectedIds?: string[];
  category: string;
  note: string;
  questions: Question[];
  answers: Record<string, string>;
  questionSource: 'prepared' | 'astra';
  reward?: Reward;
};
export type FeedbackSubmission = {
  conversational?: boolean;
  schemaVersion: 1 | 2;
  id: string;
  sessionId: string;
  submittedAt: string;
  reviewDueAt: string;
  status: 'pending_review';
  rewardPreference: Reward;
  orderTotalCents: number;
  // Optional only for legacy v1 records. New submissions always include it.
  cartSnapshot?: FeedbackCartItem[];
  completedOrder?: {
    items: FeedbackCartItem[];
    totalCents: number;
    completedAt: string;
  };
  orderReference?: string;
  journey: JourneyEvent[];
  selectedScreen: JourneyEvent | null;
  selection?: { scope: 'specific_moments' | 'overall'; eventIds: string[] };
  category: string;
  note: string;
  questions: Question[];
  answers: Record<string, string>;
  questionSource: 'prepared' | 'astra';
  summary: string;
  demo: true;
  synthetic?: true;
};
export const FEEDBACK_SUBMISSIONS_KEY = 'pay-feedback-submissions-v1';
export const categories = [
  'Finding a product',
  'Comparing products',
  'Understanding details',
  'Choosing an option',
  'Something else',
];
export const emptyDraft = (): FeedbackDraft => ({
  step: 'journey',
  category: '',
  note: '',
  questions: [],
  answers: {},
  questionSource: 'prepared',
});

export const selectedMomentIds = (draft: FeedbackDraft) =>
  draft.focus === 'overall'
    ? []
    : (draft.selectedIds ?? (draft.selected ? [draft.selected.id] : []));
export function selectionLabel(
  draft: FeedbackDraft,
  events: JourneyEvent[] = [],
) {
  if (draft.focus === 'overall') return 'Your overall shopping experience';
  const ids = new Set(selectedMomentIds(draft));
  const selected = journeyMoments(events).filter((moment) =>
    moment.eventIds.some((id) => ids.has(id)),
  );
  if (!selected.length)
    return draft.selected?.title ?? 'Your shopping experience';
  return selected
    .map((moment) => `${moment.page.title} (${moment.label.toLowerCase()})`)
    .join(' → ');
}

export type JourneyMoment = {
  id: string;
  eventIds: string[];
  page: JourneyEvent;
  label: string;
  details: string[];
};
/** Observed actions only. Repeat visits remain separate; no motive or dwell-time inference. */
export function journeyMoments(events: JourneyEvent[]): JourneyMoment[] {
  const moments: JourneyMoment[] = [];
  const visits = new Set<string>();
  for (const event of events) {
    let moment = moments.at(-1);
    if (
      event.kind === 'page_view' ||
      !moment ||
      moment.page.path !== event.path
    ) {
      const returning = visits.has(event.path);
      const label = event.path.endsWith('/cart')
        ? 'Reviewed your cart'
        : returning
          ? 'Returned to this page'
          : event.path.includes('/products/')
            ? 'Explored a product'
            : event.path.includes('/collections/')
              ? 'Browsed a collection'
              : event.path.endsWith('/search')
                ? 'Visited product search'
                : 'Visited the store';
      moment = { id: event.id, eventIds: [], page: event, label, details: [] };
      moments.push(moment);
      visits.add(event.path);
    }
    moment.eventIds.push(event.id);
    const detail = event.detail ? `: ${event.detail}` : '';
    if (event.kind === 'cart_added') {
      moment.label = 'Added to your cart';
      moment.details.push(`Added ${event.title}${detail}`);
    }
    if (event.kind === 'variant_selected')
      moment.details.push(`Selected an option${detail}`);
    if (event.kind === 'image_selected')
      moment.details.push(`Changed product image${detail}`);
    if (event.kind === 'description_reached')
      moment.details.push('Product description entered the viewport');
    if (event.kind === 'link_clicked')
      moment.details.push(`Followed a store link${detail}`);
    if (event.kind === 'cart_updated')
      moment.details.push(`Changed quantity for ${event.title}${detail}`);
    if (event.kind === 'cart_removed')
      moment.details.push(`Removed ${event.title}`);
  }
  return moments;
}

export function journeySummary(events: JourneyEvent[]) {
  const pages = events.filter((event) => event.kind === 'page_view');
  const additions = events.filter((event) => event.kind === 'cart_added');
  const seen = new Set<string>();
  const returns = pages.filter((event) => {
    const repeat = seen.has(event.path);
    seen.add(event.path);
    return repeat;
  }).length;
  return `${seen.size} store pages visited${additions.length ? ` · ${additions.length} add-to-cart actions` : ''}${returns ? ` · ${returns} return visits` : ''}`;
}

export function isRecordablePath(path: string) {
  return /^\/store(?:\/(?:products|collections|pages|blogs)(?:\/[a-zA-Z0-9/_-]+)?|\/cart|\/search)?\/?$/.test(
    path,
  );
}

// Deterministic demo highlights, not video analysis. Preserve real chronology.
export function highlights(events: JourneyEvent[]): JourneyEvent[] {
  const unique = new Map<
    string,
    { event: JourneyEvent; index: number; score: number }
  >();
  events.forEach((event, index) => {
    if (event.kind !== 'page_view') return;
    const previous = unique.get(event.path);
    unique.set(event.path, {
      event: previous?.event ?? event,
      index: previous?.index ?? index,
      score:
        (previous?.score ?? 0) +
        1 +
        (event.path.includes('/products/')
          ? 3
          : event.path.includes('/collections/')
            ? 2
            : 0),
    });
  });
  events
    .filter((event) => event.kind !== 'page_view')
    .forEach((event) => {
      const screen = unique.get(event.path);
      if (screen) screen.score += 3;
    });
  return [...unique.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .sort((a, b) => a.index - b.index)
    .map(({ event }) => event);
}

export function preparedQuestions(category: string, note = ''): Question[] {
  // Explicit, bounded demo heuristics. Never label these as AI inference.
  const compatibility =
    /compatib|which.*charger|charger.*(fit|work)|맞는|호환/i.test(note);
  const missingModel =
    /(friend|gift|친구|선물).*(model|모델)|model.*(friend|gift)/i.test(note);
  const modified = /32t|38t|gear|기어/i.test(note);
  if (missingModel)
    return [
      {
        id: 'model_check',
        prompt: 'Can you confirm the model of the board this is for?',
        options: [
          'I can check the model now',
          'I need to ask the owner',
          'I cannot confirm the model',
          'None of these',
        ],
      },
    ];
  if (modified)
    return [
      {
        id: 'configuration',
        prompt: 'What do you know about the current gear setup?',
        options: [
          'It is the original setup',
          'It has been changed; I do not know the size',
          'I know the current gear size',
          'None of these',
        ],
      },
    ];
  if (/search.*charger/i.test(note))
    return [
      {
        id: 'search_stage',
        prompt: 'How far did you get when looking for a charger?',
        options: [
          'I never found a charger',
          'I found one but could not confirm the fit',
          'The correct charger was sold out',
          'None of these',
        ],
      },
    ];
  if (/gen(?:eration)?\s*2|\bV2\b/i.test(note))
    return [
      {
        id: 'terminology',
        prompt: 'What was unclear about the charger description?',
        options: [
          'How my model name relates to the generation labels',
          'Whether it supports the charging speed I want',
          'Whether it is available to order',
          'None of these',
        ],
      },
    ];
  if (compatibility)
    return [
      {
        id: 'purchase_barrier',
        prompt: 'What most influenced your decision about the extra item?',
        options: [
          'I was unsure it would work with the board',
          'The price',
          'I do not need it yet',
          'None of these',
        ],
      },
      {
        id: 'conditional_intent',
        prompt: 'If the fit were confirmed, what would you most likely do?',
        options: [
          'Consider adding it to this order',
          'Compare prices before deciding',
          'Wait until I need it',
          'Still leave it out',
          'None of these',
        ],
      },
    ];
  const options: Record<string, string[]> = {
    'Finding a product': [
      'I could not narrow down the selection',
      'Search did not show what I expected',
      'The categories were confusing',
    ],
    'Comparing products': [
      'Key specs were hard to compare',
      'The price difference was unclear',
      'I could not tell which suited my needs',
    ],
    'Understanding details': [
      'A specification was missing or unclear',
      'Compatibility was unclear',
      'Delivery or returns information was hard to find',
    ],
    'Choosing an option': [
      'I could not tell options apart',
      'Availability was unclear',
      'The option I wanted was unavailable',
    ],
    'Something else': [
      'The page was hard to use',
      'Something did not work as expected',
      'Important information was missing',
    ],
  };
  return [
    {
      id: 'cause',
      prompt: 'What was the main difficulty on this screen?',
      options: [
        ...(options[category] ?? options['Something else']),
        'None of these',
      ],
    },
    {
      id: 'impact',
      prompt: 'How did this affect your shopping?',
      options: [
        'It slowed me down',
        'I left out an item I wanted',
        'I considered leaving without buying',
        'It did not affect my purchase',
        'None of these',
      ],
    },
  ];
}

export function validQuestions(value: unknown): value is Question[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 2 &&
    value.every(
      (q) =>
        q &&
        typeof q.id === 'string' &&
        q.id.length > 0 &&
        q.id.length <= 40 &&
        typeof q.prompt === 'string' &&
        q.prompt.length > 0 &&
        q.prompt.length <= 240 &&
        Array.isArray(q.options) &&
        q.options.length >= 2 &&
        q.options.length <= 5 &&
        q.options.every(
          (s: unknown) =>
            typeof s === 'string' && s.length > 0 && s.length <= 140,
        ) &&
        new Set(q.options).size === q.options.length,
    ) &&
    new Set(value.map((q) => q.id)).size === value.length
  );
}

export function feedbackReviewText(draft: FeedbackDraft) {
  const sentences = draft.questions.flatMap((question) => {
    const answer = draft.answers[question.id];
    if (!answer) return [];
    if (question.id === 'cause' && answer !== 'None of these')
      return [
        answer === 'Compatibility was unclear'
          ? 'I couldn’t tell which products were compatible.'
          : `${answer.replace(/[.!?]+$/, '')}.`,
      ];
    if (question.id === 'impact' && answer !== 'None of these')
      return [`${answer.replace(/[.!?]+$/, '')}.`];
    // Preserve the question for conditional answers and model-generated options.
    return [`${question.prompt} ${answer}`];
  });
  return [draft.note.trim(), ...sentences].filter(Boolean).join(' ');
}

export function feedbackPages(draft: FeedbackDraft, events: JourneyEvent[]) {
  if (draft.focus === 'overall') return [];
  const ids = new Set(selectedMomentIds(draft));
  const pages = journeyMoments(events)
    .filter((moment) => moment.eventIds.some((id) => ids.has(id)))
    .map((moment) => moment.page.title);
  return [
    ...new Set(
      pages.length ? pages : draft.selected ? [draft.selected.title] : [],
    ),
  ];
}

export function feedbackSummary(
  draft: FeedbackDraft,
  events: JourneyEvent[] = [],
) {
  const pages = feedbackPages(draft, events);
  const context = pages.length
    ? `Related pages: ${pages.join('; ')}.`
    : 'About my overall shopping experience.';
  return `${feedbackReviewText(draft)} ${context}`;
}
