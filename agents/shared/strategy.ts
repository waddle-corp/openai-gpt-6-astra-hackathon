export const strategy = {
  goal: 'Increase average order value by helping shoppers confidently buy the right Boosted USA product and the parts that go with it.',
  // Ordered: earlier priorities outrank later ones when feedback competes.
  priorities: [
    'Make model, replacement, and accessory compatibility explicit so shoppers buy the right product and every part it needs.',
    'Increase conversion and attach rate on product, cart, and checkout pages.',
    'Prioritize the mobile shopping experience.',
  ],
  principles: [
    'Reduce uncertainty about fit, compatibility, price, availability, or delivery.',
    'Improve the path from product discovery to a completed purchase.',
    'Keep the experience clear, fast, accessible, and trustworthy.',
    'Prefer evidence from the storefront over assumptions about shopper behavior.',
  ],
  constraints: [
    'Preserve the current Boosted USA brand identity and visual system.',
    'No aggressive discounting or price changes.',
    'No changes to orders, payments, customer accounts, or private data.',
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
    'Current priorities (ordered, highest first):',
    ...strategy.priorities.map((item, index) => `${index + 1}. ${item}`),
    'Strategy principles:',
    ...strategy.principles.map((item) => `- ${item}`),
    'Merchant constraints:',
    ...strategy.constraints.map((item) => `- ${item}`),
    'Out of scope:',
    ...strategy.outOfScope.map((item) => `- ${item}`),
  ].join('\n');
}
