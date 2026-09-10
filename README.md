# OpenAI GPT-6 Astra Hackathon

Standalone Boosted USA demo storefront, copied from `benchmark-boosted-usa.myshopify.com`, with a customer **Pay with your feedback** flow. The merchant feedback agent lives in `agents/` and is exposed through API routes; its temporary UI is at `/tmp/feedback`.

**Shared customer/merchant contract:** [docs/feedback-contract.md](docs/feedback-contract.md), with authoritative types and validation in `contracts/feedback.ts`. Both feedback fixture files and persisted customer submissions use `FeedbackRecord` v1.0.

Customer demo setup, real/simulated behavior, optional Astra credentials, and the merchant handoff contract are documented in [docs/customer-feedback.md](docs/customer-feedback.md).

## Run locally

Requires Node.js 22.13+.

```sh
npm ci
npm run dev
```

Open the local URL printed by the development server, normally `http://localhost:3000`.

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The storefront itself requires no database or API key. The feedback API requires `OPENAI_API_KEY`. Copy `.env.example` to `.env` and add the key locally. Never commit `.env`.

`POST /api/feedback` runs the Astra strategy gate first. Set `inspect: true` to start computer-use research only when Astra returns an accepted `fit` decision with a score of at least 70. The isolated browser runner can send its screenshot to `POST /api/feedback/continue`. The agent proposes changes only and never deploys, submits forms, or changes orders and payments.

The agent reads both fixture files as `FeedbackRecord` v1.0 (20 shopper records plus compatibility submissions 02–14; SYN-FB-01 is the live-demo rehearsal twin and is excluded). `POST /api/feedback` accepts the shared `FeedbackAnalysisRequest` (`{ feedback: FeedbackRecord, targetUrl?, inspect? }`) or `feedbackId` to pick a fixture (with an optional edited `message`); author labels under `evaluation/` are never part of the prompt. `node --experimental-strip-types scripts/triage-fixtures.mjs [origin] [--json]` runs every record through the gate and prints which ones qualify for computer use. The dev server reads `.env` at startup, so restart it after adding the key.

Collective flow (merchant side, steps 2 and 3 of the prototype): `POST /api/feedback/prioritize` groups all records (or `feedbackIds`) into opportunities ranked against the merchant goal, ordered priorities, and constraints in `agents/shared/strategy.ts`, and lists records set aside with a reason. `POST /api/feedback/synthesize` takes `feedbackIds` (and an optional `focus`) and returns one improvement opportunity: the underlying problem, design direction, tensions between shoppers and how they are resolved, verbatim evidence, and a `buildBrief` for the coding agent. `/tmp/feedback/collective` drives both from a cached pass (`data/collective-cache.json`, rebuilt with `node --experimental-strip-types scripts/precompute-collective.mjs`) so the demo never waits on the model; the embedding map shows each record's `text-embedding-3-small` vector projected to 3D. Hovering a point plays that shopper's journey recording from `public/media/journeys/<id>.webm`, produced by `python scripts/record-journeys.py` (Playwright replay of the recorded journey with a visible cursor; the storefront must be running). `node --experimental-strip-types scripts/collective.mjs prioritize` and `... synthesize <id,id,...>` run them from the terminal.

## Included snapshot

Exported September 10, 2026 through read-only Shopify CLI queries:

- 317 products and 1,124 variants, including titles, HTML descriptions, SKUs, prices, compare-at prices, options, inventory, and availability.
- 1,576 product image records and complete variant galleries.
- 25 collections with 853 ordered product memberships.
- 4 navigation menus, 18 pages, and 4 published articles across 2 blogs.
- 15 enabled homepage sections, matching the source order and copy.

`data/catalog.json` is the complete editable product/collection source. `data/content.json`, `data/blogs.json`, and `data/storefront-config.json` hold the other content. `data/shopper-feedback.json` contains synthetic shopper feedback for demo and triage flows. `data/asset-map.json` resolves source URLs to files under `public/media/`. The original source URLs and Shopify IDs are provenance only; the running storefront does not call Shopify.

Edit the JSON files to update the demo and commit those edits like application code. There is no database migration or import step for contributors. Optional `scripts/export-products.mjs` refreshes the catalog through an explicitly authenticated local Shopify CLI session; running the app never invokes it. Downloaded-image manifests in `data/provenance/` record original URLs, sizes, and hashes. Refreshing source URLs also requires refreshing the local image map/files before `npm test` will pass.

## Routes

`/` redirects to `/store`. All shopper routes live under `/store`, including products, collections, search, cart, and demo checkout. `/admin` is intentionally empty and has its own layout without storefront chrome or cart state. Shared catalog data and `/media` assets remain unchanged. With a preview running, use `node scripts/check-routes.mjs http://localhost:4318` to check route separation, redirects, and static assets.

## Storefront behavior

Homepage, collections, paginated catalog, product search, product galleries, variant selection, cart, source pages, and articles are implemented. Prices and sold-out states use the source snapshot.

The cart uses browser localStorage and works in memory if storage is blocked. Checkout is an explicit simulation: it clears the local cart and shows a temporary demo reference. No payment, shipping calculation, Shopify order, customer account, or email subscription is created. The newsletter is also a local demonstration.

## Source differences

- The storefront implementation is independent React code. The vendor's original Shopify Liquid theme code is not included.
- The source's enabled “Special deal” placeholder is preserved.
- The source's removed `/products/boosted-rev` link goes to its existing electric-scooters collection.
- Old collection-prefixed product URLs resolve to canonical product routes.
- `evolve-motor-controller-copy` has no photograph in the source snapshot.
- Scripts, embedded forms, and unsupported embedded content in imported descriptions/pages are stripped. The source's Google Maps embeds are omitted; location addresses and photographs remain.
- This is a source-backed standalone recreation, not Shopify's Liquid runtime. Shopify-specific apps, checkout, customer accounts, and theme-editor behaviors are not included.

## Source content and publication

The application code, imported store content, and product/brand images have distinct provenance. Importing store content does not change its ownership or license. This repository does not include or relicense the original commercial Shopify theme. Choose the application-code license and confirm redistribution rights for the supplied store content before public release.

Lint covers the application code; generated Shadcn primitives retain their upstream implementation. The app deliberately uses native links and local images without a Next.js image-optimization service.

No credentials, customer records, orders, or private account information are included in the bundled data.
