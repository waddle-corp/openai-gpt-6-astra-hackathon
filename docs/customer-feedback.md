# Customer feedback demo

## Try it

1. Run the storefront and accept **Count me in** on `/store`.
2. Browse a collection and a product, change an option if available, and add it to the cart.
3. Continue to `/store/checkout` and select **Pay with your feedback** inside the order summary to open the feedback modal.
4. Pick an actual visited screen, a pain category, and answer one or two multiple-choice questions.
5. Review the literal answer summary, select coupon or card cashback, and choose **Apply feedback**. The modal closes and the order summary shows **Feedback added**.
6. Choose **Place demo order** directly below the feedback section. Its reference is attached to the feedback.

Use **Restart feedback demo** in the footer for a fresh opt-in and journey. This preserves submitted feedback and the existing cart. **Feedback preferences** permits withdrawing consent and clears unsubmitted journey/draft data. A late opt-in never invents earlier visits; browse again to create a journey.

## Real vs simulated

- Real: consent, permitted page views, option changes, cart additions, chronological highlights, questionnaire, draft persistence, reward preference, local submission and order linking.
- Prepared: deterministic highlight selection and representative images from the actual visited page. There is no screen video, screenshot capture, or AI video analysis.
- Questions: prepared category- and note-specific questions by default; optional Astra-generated questions when credentials are configured. Source is recorded as `prepared` or `astra` and accurately labeled in the UI.
- Rewards: preference only, reviewed within 72 hours of submission. Amount and eligibility remain unset. Coupons apply to future purchases; card cashback means a partial refund of the current purchase, whose processing can take longer. No real payment, coupon, refund, or notification is issued.
- One contribution per demo session. Answer summaries concatenate the customer's choices and optional note; they do not fabricate an interpretation.

## Optional live Astra questions

Copy `.dev.vars.example` to ignored `.dev.vars`, set `OPENAI_API_KEY` and `OPENAI_FEEDBACK_MODEL` to the **exact Astra API model identifier provided by the hackathon**, then restart the development server. No model identifier is guessed or substituted. Keep secrets server-side.

`POST /api/feedback/questions` uses the OpenAI Responses API with structured output and `store: false`. It receives only the selected page path/title, category, optional note, the current cart snapshot, and up to 30 allowed journey events. Body size and output shape are bounded. The server times out after eight seconds; the client falls back after ten. Unconfigured, invalid, failed, or late responses use prepared questions. Closing the feedback modal cancels the client request and prevents stale changes to the draft.

The live path requires account access and has not been verified without supplied credentials. This unauthenticated endpoint is for the local hackathon demo; add access control and rate limiting before exposing a key-backed deployment.

## Merchant handoff

Shared types and validation: `contracts/feedback.ts`. Read [feedback-contract.md](feedback-contract.md) for the authoritative merchant handoff. `lib/feedback.ts` contains internal customer draft/receipt types; storage converts them to the shared contract.

Submissions live in localStorage under `pay-feedback-submissions-v1`, readable with `readFeedbackSubmissions()` on the same browser/origin. Listen for `pay-feedback-submitted` in the current window or the native `storage` event from other tabs. This is not shared storage between devices. Replace the storage boundary with a shared API when integrating the merchant backend.

`readFeedbackSubmissions()` returns `FeedbackRecord[]` v1.0. Records include source provenance, original message and question answers, selected page, chronological events, submission cart, final demo purchase snapshot, reward preference, and review deadline. An absent completed purchase is not a verified order or refund entitlement.

The session and draft use sessionStorage (24-hour expiry). Events are capped at 100. Only store content paths are allowed; checkout, admin, query strings, payment details, and typed searches are excluded. Storage failures do not display a false receipt. Submitted data is retained until manually cleared; restart only resets the active session.

## Checks

Run `node scripts/check-feedback.mjs` for consent, storage, draft, and submission checks. Existing `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` cover storefront regressions and compilation. Browser interaction and live API verification are separate checks.

New persisted records use shared contract v1.0; old customer schema v1/v2 records are migrated on read. The storage key remains unchanged for compatibility. See [compatibility-demo.md](compatibility-demo.md) for the live path and 14 labeled synthetic fixtures.

## Multi-moment journey update

The checkout trigger opens the existing spacious modal. Customers can select multiple timeline moments for one connected issue, or select the overall shopping experience. Timeline cards group page visits with observed option/image choices, cart actions, store links, and product-description visibility. Return visits remain visible. The summary uses deterministic rules; it does not claim AI video analysis or infer a pain point from scrolling. Short clarification questions use the selected event IDs and full recorded context. Applying feedback still returns to checkout before placing the demo order.

Shared submissions now use contract v1.1 with `context.focus`; see `docs/feedback-contract.md` for merchant migration.

## Conversation-first checkout (current)

The checkout now mounts `components/feedback-conversation.tsx`. It replaces the category survey with an observation, related product cards, and one question at a time. A second request after the first answer loads the selected products' descriptions and variant labels from the actual catalog; expandable source excerpts remain server-owned. After two answers, the shopper reviews/edits a summary, confirms it, chooses a reward, and applies feedback before placing the order. “I want to talk about something else” opens manual moment selection and free text. Closing the modal preserves completed answers; edited summaries survive reopening.

`POST /api/feedback/conversation` uses `OPENAI_API_KEY` and `OPENAI_FEEDBACK_MODEL` from Worker environment bindings (local `.dev.vars`). Use the model identifier provided by the hackathon. Do not commit credentials. Without both values, or on provider failure, the UI explicitly shows **Guided preview**, with deterministic adaptive prompts. The new endpoint uses the existing Responses structured-output integration; it does not simulate browser execution. The initial focus is selected deterministically from observed product visits and the cart, while the model interprets the context and writes the observation, follow-up, and final summary.

Catalog lookup runs after a customer answer. It is a bounded server-side lookup, not computer use; excerpts can be incomplete and must not be treated as conclusive compatibility verification. Actual browser investigation remains the merchant runner's responsibility. No predicted revenue or reward entitlement is added to customer evidence.

The canonical contract remains v1.1. Conversational submissions keep the selected event IDs and actual question/answer pairs. `feedback.category` is null because the customer did not choose a survey category. `feedback.summary` is the customer-approved text, while `feedback.message` remains their original free text. The questionnaire endpoint and legacy component remain available for older demo tooling, but the checkout uses the conversation component.

Validation: `npm test` includes an isolated endpoint test for real catalog lookup, branching, unknown IDs/answers, structured model response parsing with a stubbed provider, and provider failure fallback. A live model quality evaluation requires the configured credentials; mock-provider tests do not establish Astra quality.

## Journey timeline conversation

The customer modal pairs a chronological journey rail with a contextual conversation panel. Recorded visits, return visits, option choices, and cart actions remain factual; highlighted connected moments use the existing focus selection, not a new AI scoring system. Catalog thumbnails illustrate visits and are not session screenshots. Astra continues to generate observations, questions, and the summary through the existing live endpoint.

Clicking a timeline card opens its recorded details without changing the current draft. The explicit “Start a new conversation here” action replaces the current answers and requests a new question scoped to that moment. Manual selection still supports multiple related moments. Customer answers appear separately under “What you shared” for the connected context rather than being presented as observed browser behavior. On mobile, the journey becomes a horizontally scrollable strip above the conversation. The feedback contract, reward flow, and prepared fallback are unchanged.
