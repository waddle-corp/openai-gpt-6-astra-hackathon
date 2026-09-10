import {
  journeyMoments,
  type JourneyEvent,
  type FeedbackCartItem,
  type Question,
} from './feedback';
export type ConversationTurn = { question: Question; answer: string };
export type ConversationReply = {
  source: 'astra' | 'prepared';
  observation: string;
  question: Question | null;
  summary: string;
  focusIds: string[];
  evidence: { title: string; path: string; excerpt: string }[];
};
export function suggestFocus(events: JourneyEvent[], cart: FeedbackCartItem[]) {
  const productMoments = journeyMoments(events).filter((m) =>
    m.page.path.includes('/products/'),
  );
  const extra = [...productMoments]
    .reverse()
    .find(
      (m) =>
        !cart.some((item) => m.page.path.endsWith('/' + item.productHandle)),
    );
  const purchased = [...productMoments]
    .reverse()
    .find((m) =>
      cart.some((item) => m.page.path.endsWith('/' + item.productHandle)),
    );
  return [
    ...new Set([purchased, extra].filter(Boolean).flatMap((m) => m!.eventIds)),
  ];
}
export function preparedConversation(
  events: JourneyEvent[],
  cart: FeedbackCartItem[],
  turns: ConversationTurn[],
  note: string,
  focusIds: string[],
): ConversationReply {
  const selected = journeyMoments(events).filter((m) =>
    m.eventIds.some((id) => focusIds.includes(id)),
  );
  const extra = selected.find(
    (m) =>
      !cart.some((item) => m.page.path.endsWith('/' + item.productHandle)) &&
      m.page.path.includes('/products/'),
  );
  const purchased = selected.find((m) =>
    cart.some((item) => m.page.path.endsWith('/' + item.productHandle)),
  );
  const observation =
    extra && purchased
      ? `You added ${purchased.page.title} to your cart and also looked at ${extra.page.title}, which isn’t in your cart.`
      : selected.length
        ? `Let’s talk about your visit to ${selected.map((m) => m.page.title).join(' and ')}.`
        : 'What would have made this shopping experience easier?';
  const question: Question | null =
    turns.length === 0
      ? {
          id: 'experience',
          prompt: extra
            ? `What influenced your decision to leave ${extra.page.title} out?`
            : 'Was there anything that made shopping harder?',
          options: extra
            ? [
                'I wasn’t sure it would fit or work',
                'The price',
                'I was just browsing',
                'Something else',
              ]
            : [
                'Finding the right product',
                'Understanding the details',
                'Choosing an option',
                'Something else',
              ],
        }
      : turns.length === 1
        ? {
            id: 'clarify',
            prompt: /fit|work|compatib/i.test(turns[0].answer)
              ? 'Where did you lose confidence?'
              : /price/i.test(turns[0].answer)
                ? 'What would have helped you judge the price?'
                : 'How did this affect your shopping?',
            options: /fit|work|compatib/i.test(turns[0].answer)
              ? [
                  'The model names were confusing',
                  'I couldn’t find the right option details',
                  'I needed reassurance before buying',
                  'Something else',
                ]
              : /price/i.test(turns[0].answer)
                ? [
                    'A clearer comparison',
                    'Knowing what was included',
                    'It was simply over my budget',
                    'Something else',
                  ]
                : [
                    'It slowed me down',
                    'I left an item out',
                    'It didn’t affect my purchase',
                    'Something else',
                  ],
          }
        : null;
  const prose: Record<string, string> = {
    'I wasn’t sure it would fit or work':
      'I wasn’t confident that the extra item would work with my board.',
    'The price': 'The price was why I left the extra item out.',
    'I was just browsing':
      'I was just browsing and wasn’t planning to add the extra item.',
    'Finding the right product': 'Finding the right product was difficult.',
    'Understanding the details': 'The product details were hard to understand.',
    'Choosing an option': 'I had trouble choosing an option.',
    'The model names were confusing':
      'The different model names made it hard to be sure.',
    'I couldn’t find the right option details':
      'I couldn’t find the details for the option I needed.',
    'I needed reassurance before buying': 'I wanted reassurance before buying.',
    'A clearer comparison':
      'A clearer comparison would have helped me judge the price.',
    'Knowing what was included':
      'Knowing what was included would have helped me judge the price.',
    'It was simply over my budget': 'It was over my budget.',
    'It slowed me down': 'It slowed me down.',
    'I left an item out': 'I left an item out of this order.',
    'It didn’t affect my purchase': 'It didn’t affect my purchase.',
  };
  const summary = [
    note.trim(),
    ...turns.map((t) => prose[t.answer] ?? `${t.question.prompt} ${t.answer}.`),
  ]
    .filter(Boolean)
    .join(' ');
  return {
    source: 'prepared',
    observation,
    question,
    summary,
    focusIds,
    evidence: [],
  };
}
