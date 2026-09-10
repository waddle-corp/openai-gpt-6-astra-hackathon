export type JourneyEvent = {
  id: string;
  at: string;
  kind: 'page_view' | 'variant_selected' | 'cart_added';
  path: string;
  title: string;
  image?: string;
  detail?: string;
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
  step: 'journey' | 'pain' | 'questions' | 'review';
  selected?: JourneyEvent;
  category: string;
  note: string;
  questions: Question[];
  answers: Record<string, string>;
  questionSource: 'prepared' | 'astra';
  reward?: Reward;
};
export type FeedbackSubmission = {
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
  selectedScreen: JourneyEvent;
  category: string;
  note: string;
  questions: Question[];
  answers: Record<string, string>;
  questionSource: 'prepared' | 'astra';
  summary: string;
  demo: true;
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

export function feedbackSummary(draft: FeedbackDraft) {
  const answers = draft.questions
    .map((q) => draft.answers[q.id])
    .filter(Boolean);
  return `${draft.selected?.title ?? 'Shopping experience'} — ${draft.category}. ${answers.join('. ')}.${draft.note.trim() ? ` ${draft.note.trim()}` : ''}`;
}
