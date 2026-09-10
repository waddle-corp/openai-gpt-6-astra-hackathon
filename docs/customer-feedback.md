# Customer feedback demo

## Try it

1. Run the storefront and accept **Count me in** on `/store`.
2. Browse a collection and a product, change an option if available, and add it to the cart.
3. Continue to `/store/checkout` and select **Pay with your feedback**.
4. Pick an actual visited screen, a pain category, and answer one or two multiple-choice questions.
5. Review the literal answer summary, select coupon or card cashback, and submit.
6. Continue checkout and complete the demo order. Its reference is attached to the feedback.

Use **Restart feedback demo** in the footer for a fresh opt-in and journey. This preserves submitted feedback and the existing cart. **Feedback preferences** permits withdrawing consent and clears unsubmitted journey/draft data. A late opt-in never invents earlier visits; browse again to create a journey.

## Real vs simulated

- Real: consent, permitted page views, option changes, cart additions, chronological highlights, questionnaire, draft persistence, reward preference, local submission and order linking.
- Prepared: deterministic highlight selection and representative images from the actual visited page. There is no screen video, screenshot capture, or AI video analysis.
- Questions: prepared category- and note-specific questions by default; optional Astra-generated questions when credentials are configured. Source is recorded as `prepared` or `astra` and accurately labeled in the UI.
- Rewards: preference only, reviewed within 72 hours of submission. Amount and eligibility remain unset. Coupons apply to future purchases; card cashback means a partial refund of the current purchase, whose processing can take longer. No real payment, coupon, refund, or notification is issued.
- One contribution per demo session. Answer summaries concatenate the customer's choices and optional note; they do not fabricate an interpretation.

## Optional live Astra questions

Copy `.dev.vars.example` to ignored `.dev.vars`, set `OPENAI_API_KEY` and `OPENAI_FEEDBACK_MODEL` to the **exact Astra API model identifier provided by the hackathon**, then restart the development server. No model identifier is guessed or substituted. Keep secrets server-side.

`POST /api/feedback/questions` uses the OpenAI Responses API with structured output and `store: false`. It receives only the selected page path/title, category, optional note, the current cart snapshot, and up to 30 allowed journey events. Body size and output shape are bounded. The server times out after eight seconds; the client falls back after ten. Unconfigured, invalid, failed, or late responses use prepared questions. Closing the dialog cancels the client request and prevents stale changes to the draft.

The live path requires account access and has not been verified without supplied credentials. This unauthenticated endpoint is for the local hackathon demo; add access control and rate limiting before exposing a key-backed deployment.

## Merchant handoff

Types: `lib/feedback.ts`. Storage boundary: `lib/feedback-storage.ts`.

Submissions live in localStorage under `pay-feedback-submissions-v1`, readable with `readFeedbackSubmissions()` on the same browser/origin. Listen for `pay-feedback-submitted` in the current window or the native `storage` event from other tabs. This is not shared storage between devices. Replace the storage boundary with a shared API when integrating the merchant backend.

Each `FeedbackSubmission` includes schema version, session/feedback IDs, submitted/review-due times, `pending_review` status, reward preference, cart total in cents, `cartSnapshot` with item/variant IDs and prices, optional completed order reference and `completedOrder` snapshot, journey evidence, selected screen, category, verbatim questions/answers/note, summary, question source, and a `demo: true` marker. An absent order reference means the demo purchase has not completed; do not treat it as a verified order or refund entitlement.

The session and draft use sessionStorage (24-hour expiry). Events are capped at 100. Only store content paths are allowed; checkout, admin, query strings, payment details, and typed searches are excluded. Storage failures do not display a false receipt. Submitted data is retained until manually cleared; restart only resets the active session.

## Checks

Run `node scripts/check-feedback.mjs` for consent, storage, draft, and submission checks. Existing `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` cover storefront regressions and compilation. Browser interaction and live API verification are separate checks.

New records use schema version 2; legacy v1 records may omit cart snapshots. The storage key remains unchanged for compatibility. See [compatibility-demo.md](compatibility-demo.md) for the live path and 14 labeled synthetic fixtures.
