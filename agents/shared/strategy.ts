export const strategy = {
  goal: 'Help more shoppers discover, understand, and confidently buy the right Boosted USA product.',
  principles: [
    'Reduce uncertainty about fit, compatibility, price, availability, or delivery.',
    'Improve the path from product discovery to a completed purchase.',
    'Keep the experience clear, fast, accessible, and trustworthy.',
    'Prefer evidence from the storefront over assumptions about shopper behavior.',
  ],
  outOfScope: [
    'Changes unrelated to shopper experience or conversion.',
    'Requests that expose private data or change orders or payments.',
    'Ideas that cannot be checked against the current storefront UI.',
  ],
} as const;

export function strategyContext() {
  return [
    `Goal: ${strategy.goal}`,
    'Strategy principles:',
    ...strategy.principles.map((item) => `- ${item}`),
    'Out of scope:',
    ...strategy.outOfScope.map((item) => `- ${item}`),
  ].join('\n');
}
