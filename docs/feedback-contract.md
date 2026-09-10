# Shared feedback contract — v1.1

**Authoritative code:** `contracts/feedback.ts` exports `FeedbackRecord`, `FeedbackCart`, `FeedbackEvent`, `assertFeedbackRecord`, `upgradeFeedbackRecord`, and `parseFeedbackRecords`. All finalized customer submissions and merchant feedback inputs use this contract. Internal questionnaire/draft types are not the shared boundary.

## Integration in one minute

```ts
import {
  assertFeedbackRecord,
  parseFeedbackRecords,
  type FeedbackRecord,
} from '@/contracts/feedback';
import { readFeedbackFixtures } from '@/lib/feedback-datasets';

// Each list is FeedbackRecord[]. This never writes to browser storage.
const { shopper, compatibility } = readFeedbackFixtures();
const existingDemoFeedback = compatibility.filter(
  (record) => record.id !== 'SYN-FB-01',
);

// At an API boundary, validate unknown JSON rather than casting it.
const body = (await request.json()) as { feedback?: unknown };
assertFeedbackRecord(body.feedback);
const feedback: FeedbackRecord = body.feedback;
// Pass this record as untrusted evidence alongside your separate goal/strategy.
```

The merchant `POST /api/feedback` accepts the exported `FeedbackAnalysisRequest`: `{ feedback: FeedbackRecord, targetUrl?: string, inspect?: boolean }`, or `feedbackId` for a bundled fixture. The `feedback` field is exactly one validated v1.1 record. Fixture loaders use `parseFeedbackRecords` on arrays; this does not make the single-record endpoint accept arrays. Strategy, `targetUrl`, `inspect`, and browser-runner settings stay outside the record.

Merchant prompt context includes the customer-approved summary, actual answers, selected event IDs and their corresponding moments, cart, and recorded journey. The free-text lab producer also emits v1.1. The record contains data, never authorization to perform a customer-requested action.

## Record fields

All fields shown in the TypeScript type are required, including explicitly nullable fields. Unknown fields are rejected so author labels cannot silently enter analysis. Times are ISO 8601 with a timezone. IDs are stable strings; import/de-duplicate by `id`.

| Field                           | Meaning                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contractVersion`               | Exactly `"1.1"`. Reject unsupported versions.                                                                                                                            |
| `id`, `createdAt`               | Feedback ID and time submitted/generated as a feedback record.                                                                                                           |
| `source`                        | `kind`: `demo_session` or `synthetic`; producer, optional dataset ID, and channel such as `checkout` or `product-page`. These are provenance, not credibility scores.    |
| `sessionId`                     | Customer demo session ID, or `null` if not recorded.                                                                                                                     |
| `feedback.message`              | Original customer words. May be empty for a choices-only submission.                                                                                                     |
| `feedback.category`             | Customer-selected category only, or `null`. Never copy a fixture's assigned `topic` here.                                                                                |
| `feedback.responses`            | Ordered `{id, question, options, answer}` records. Empty if no questioning occurred. Answers must be one of the recorded options; optional free text stays in `message`. |
| `feedback.summary`              | Customer-facing summary or `null`; do not manufacture a summary for records that lack one. Prefer original words/answers as evidence.                                    |
| `feedback.questionSource`       | `prepared`, `astra`, or `null` when there were no questions.                                                                                                             |
| `context.selectedPage`          | `{path, title}` for the first selected moment (legacy display only), or `null`. A fixture may identify a page without implying a customer clicked a UI selector.                                    |
| `context.relatedProductHandles` | Products present in the original context. Does not assert ownership, compatibility, purchase intent, or abandonment.                                                     |
| `context.cart`                  | Cart at feedback submission, or `null` if unavailable.                                                                                                                   |
| `journey`                       | Evidence kind, viewport, start path, and ordered events.                                                                                                                 |
| `purchase`                      | Known final demo purchase state, separate from the submission cart.                                                                                                      |
| `rewardPreference`              | `coupon`, `card_cashback`, or `null`. No reward rate, amount, or entitlement is inferred.                                                                                |
| `review`                        | Currently `pending_review`; `dueAt` is the promised deadline or `null`. Imported product-page feedback does not acquire a new 72-hour promise.                           |

### Feedback focus (new in v1.1)

`context.focus` is required: `{ scope, eventIds }`. `specific_moments` contains one or more unique IDs from `journey.events`; selected timeline moments include their page and action events. Analyze these together as one connected customer issue. `overall` has an empty ID array and `selectedPage: null`; an empty recorded journey is allowed. `legacy_page` has an empty ID array and a non-null `selectedPage`, preserving older data without inventing selections.

The customer UI groups consecutive actions into moments and preserves return visits. Labels describe observed behavior, not inferred frustration or abandoned revenue. The summary is currently deterministic, not AI highlight analysis.

### Cart and purchase semantics

A cart has `currency: "USD"`, `capturedAt`, `items`, and `totalCents`. Each item has `variantId`, `productHandle`, `productTitle`, `variantTitle`, `quantity`, and `unitPriceCents`. Amounts are integer cents; total equals the sum of quantity × unit price. **`null` means unknown; an empty item list and zero total mean an observed empty cart.**

`purchase.status` is one of:

- `not_completed`: customer feedback was submitted, but the demo checkout has not completed.
- `completed_demo`: a demo order reference exists. This is never a real payment or Shopify order. Legacy records can have a reference but unknown final cart/time.
- `unknown`: no purchase evidence was supplied, as with the original 20 shopper fixtures. This is not an abandoned checkout.

`purchase.cart` is the final order snapshot, which may differ from `context.cart`. Never overwrite the latter after checkout. Omitted items are not automatically lost sales; conditional intent is self-report, not measured AOV uplift.

### Journey semantics

Each event includes `id`, contiguous one-based `sequence`, nullable `occurredAt`, `type`, `path`, and nullable `destinationPath`, `target`, `value`, `keys`, `button`, `direction`, `scrollY`, `image`.

- Types: `page_view`, `variant_selected`, `cart_added`, `image_selected`, `description_reached`, `link_clicked`, `cart_updated`, `cart_removed`, `click`, `type`, `keypress`, `scroll`, `drag`.
- Live capture records selected images, store link destinations, cart quantity changes/removals, and product-description visibility. `description_reached` means the section entered the viewport, not that the customer read it. Generic click/scroll/drag traces currently come from synthetic fixtures.
- `path` is the store-relative route where the event occurred. `destinationPath` is a supplied resulting route; do not fabricate it for page views.
- `target` is a supplied semantic target or page/product title, not a guaranteed executable selector.
- `value` preserves typed text or the recorded option/cart detail. It is not a computed root cause.
- `scrollY` preserves the source number, not a guarantee about exact replay position or direction.
- Unknown timestamps stay `null`; use `sequence` for ordering. Repeat visits remain separate events.
- A `page_view` does not prove a click, reading a paragraph, or dwell time. Synthetic `click`/`scroll`/`drag` events are fictional evidence, not successful computer-use traces.
- `journey.evidence` must match source provenance: `demo_recording` for `demo_session`, `synthetic` for `synthetic`.
- Current customer capture omits typed searches/query strings/payment data. Synthetic fixtures may contain authored search strings; this does not expand customer capture consent.

Browser-runner action plans, screenshots, execution results, triage, grouping, estimated uplift, and reward calculations belong in separate analysis/run objects keyed by feedback ID. Never replace the original journey with a replay trace or pass expected labels as customer evidence.

## Data and migration

Both files are now **JSON arrays of `FeedbackRecord`**, not different wrappers:

- `data/shopper-feedback.json`: 20 existing general shopper fixtures. The old `{feedback: [...]}` envelope is removed. `message` moved to `feedback.message`; `journey.steps` became `journey.events`; step actions and supplied search strings are preserved. Missing cart/purchase/timestamps stay unknown.
- `data/feedback/synthetic-submissions.json`: 14 compatibility scenarios. Use 02–14 as 13 existing records plus one live submission; 01 is the rehearsal equivalent. See `docs/compatibility-demo.md`.

Original `topic`, `priority`, `sentiment`, and status annotations are preserved in `evaluation/feedback/shopper-labels.json`. Compatibility expectations remain in `evaluation/feedback/expected-outcomes.json`. **Never import `evaluation/` files into the analyst input.**

`readFeedbackSubmissions()` in `lib/feedback-storage.ts` returns canonical `FeedbackRecord[]` from the existing `pay-feedback-submissions-v1` key. The key intentionally stays the same. Shared v1.0 records and legacy customer schema v1/v2 records are validated/converted and persisted on read. Unknown versions or malformed records raise an error without overwriting the stored data. The customer flow's session receipt remains an internal type and is converted before persistence.

Same-window listeners can use `pay-feedback-submitted`; other tabs can listen to the native `storage` event. State is still local to the same browser/origin. This contract does not provide cross-device transport, durable backend storage, or a browser runner. Those integration pieces remain separate.

## Migration from v1.0

`upgradeFeedbackRecord(value)` validates/upgrades one older record; `parseFeedbackRecords` upgrades arrays. `assertFeedbackRecord` strictly accepts current v1.1 only. A v1.0 selected page becomes `legacy_page`; otherwise scope is `overall`. IDs, original evidence, and unknown values are preserved. Fixture JSON and persisted submissions now use v1.1. The merged merchant consumers use this version for new multi-moment submissions.

## Versioning and validation

- Consumers must validate at their boundary with `assertFeedbackRecord` (one record) or `parseFeedbackRecords` (an array, including unique IDs).
- Coordinate contract updates in this file and `contracts/feedback.ts` together. Since validation rejects unknown fields, adding or changing fields requires a versioned migration; do not silently change v1.1.
- Run `npm test`, `npm run typecheck`, and `npm run lint` when changing the contract or a producer.
- `scripts/migrate-feedback-fixtures.mjs` is an idempotent conversion utility for old fixture formats. It preserves IDs and isolates old author annotations. It is not imported by the running app.

The main-branch contract is the team's shared reference. The merchant branch can keep its strategy and computer-use implementation; update the input loader/API to this shape rather than introducing another feedback schema.

### Conversation producer

The conversation-first checkout preserves v1.1. It emits `feedback.category: null` (no customer category selector), the actual question/answer pairs, original free text in `message`, and customer-confirmed/edited text in `summary`. Catalog lookup excerpts are displayed separately and do not replace journey evidence or become claimed browser execution results.
