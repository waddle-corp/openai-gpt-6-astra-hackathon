# OpenAI GPT-6 Astra Hackathon

Standalone Boosted USA demo storefront, copied from `benchmark-boosted-usa.myshopify.com`. The merchant admin is the next step.

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

The app requires **no database, Shopify account, API keys, environment variables, or external data service**. React/Vinext reads the bundled JSON directly. All catalog photographs, page images, brand imagery, and fonts are local files. The original homepage's YouTube video is an optional external embed.

## Included snapshot

Exported September 10, 2026 through read-only Shopify CLI queries:

- 317 products and 1,124 variants, including titles, HTML descriptions, SKUs, prices, compare-at prices, options, inventory, and availability.
- 1,576 product image records and complete variant galleries.
- 25 collections with 853 ordered product memberships.
- 4 navigation menus, 18 pages, and 4 published articles across 2 blogs.
- 15 enabled homepage sections, matching the source order and copy.

`data/catalog.json` is the complete editable product/collection source. `data/content.json`, `data/blogs.json`, and `data/storefront-config.json` hold the other content. `data/asset-map.json` resolves source URLs to files under `public/media/`. The original source URLs and Shopify IDs are provenance only; the running storefront does not call Shopify.

Edit the JSON files to update the demo and commit those edits like application code. There is no database migration or import step for contributors. Optional `scripts/export-products.mjs` refreshes the catalog through an explicitly authenticated local Shopify CLI session; running the app never invokes it. Downloaded-image manifests in `data/provenance/` record original URLs, sizes, and hashes. Refreshing source URLs also requires refreshing the local image map/files before `npm test` will pass.

## Routes

`/` redirects to `/store`. All shopper routes live under `/store`, including products, collections, search, cart, and demo checkout. `/admin` hosts the Pay with Feedback merchant workspace in its own layout without storefront chrome or cart state. Shared catalog data and `/media` assets remain unchanged. With a preview running, use `node scripts/check-routes.mjs http://localhost:4318` to check route separation, redirects, and static assets.

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

## Pay with Feedback merchant demo

Run `npm run dev -- --host 127.0.0.1 --port 5190`, then open
`http://localhost:5190/admin`. This change is local-only; no deployment is required.

Demo walkthrough:

1. In `/store`, open **BoostedUSA Hyperlane Fast Charger** (the older Boosted Charger is sold out), add it to the cart, and continue to demo checkout.
2. Choose **Pay with Feedback**, review/deselect the captured moments, and describe the confusion. Submit to complete a feedback-funded demo order. No payment, shipment or Shopify order is created.
3. Open `/admin` on the same origin/browser. The new report appears immediately in the Feedback selector, including in another open tab. Choose **Investigate feedback**: it correctly returns **Needs more evidence**, because a fixture cannot verify new reports.
4. Select Alex (F-014) and choose **Investigate feedback**. The demo checks the related Sam report too. Choose **Review & create improvement** to combine both supported contributions into one forecast and bounty pool. Existing proposals retain their original contributors.
5. Use **How is this estimated?** and **Allocation & reward policy** for tabbed forecast and weight controls. The defaults produce $3,200 expected 30-day contribution profit and a $640 bounty. Approve to lock inputs/version/pool/allocations, then simulate payout. Reload preserves the receipt; repeated payout calls return the same result.
6. For a fresh demo, use a new browser origin/profile or remove only the `pay-with-feedback-v1` local-storage key in developer tools. This restores sample reports without changing the catalog or cart.

### Persistence, capture and evidence boundaries

- No external database, authentication, model call, or payment provider. Catalog data/assets remain bundled and unchanged. Feedback/proposals use `localStorage` (`pay-with-feedback-v1`); activity moments use per-tab `sessionStorage` (`feedback-journey`). Clearing site data loses these records. Origins/ports/devices do not share records. Storage failures surface an error instead of claiming submission success. This is a single-operator demo: simultaneous writes across tabs are not transactional, and storage is editable by the browser owner.
- Journey capture explicitly records product title, option label, quantity and known storefront routes. It does not inspect page text, arbitrary clicks, input values, URL queries, credentials, payment details or recordings. It keeps the last eight moments and lets shoppers choose which to submit. The comment is user-authored; the UI asks them to omit personal information.
- Moments are activity summaries, not screenshots. The bundled `public/evidence/charger-reference.jpg` is a sanitized reference capture of the local Hyperlane product page on 2026-09-10 at 1600×900 with an empty cart. It is not a shopper recording, a reported defect, or a reproduction result. Sample personas, comments, outcomes and proposals are illustrative. A shipping-page link exists in the store header; absence of a precise date near purchase does not establish a defect or prove uplift.
- The app has no bundled Playwright/computer-use server runtime. The Codex verification browser is development tooling, not an application service. `reproduce(Feedback): Promise<Run>` in `lib/feedback.ts` is the deterministic adapter boundary. A future trusted server runner must validate known storefront routes, use isolated browser sessions, keep model credentials server-side, capture/redact step screenshots, and return evidence-linked verdicts. Never turn arbitrary shopper prose into executable code or unrestricted navigation. There is no hidden live mode.
- **Reproduced** means repeated reported behavior; **Observation supported** means evidence supports an observation without proving a defect; **Could not reproduce** remains inconclusive; **Needs more evidence** means insufficient context. The demo never labels a new report as reproduced. Root causes remain hypotheses; forecasts are unmeasured estimates.
- One improvement owns one benefit estimate and pool: `min(cap, sessions × absolute lift / 100 × AOV × margin / 100 × bounty share / 100)`. The baseline is contextual. Low/base/high use 0×/1×/2× lift, capped at 100% conversion. Feedback-funded demo orders never enter paid revenue/conversion; no paid analytics are collected in this app.
- Allocation uses editable policy weights and largest-remainder cent rounding, not measured causal shares. Eligible report IDs are unique. Exact repeated submissions with the same selected moments reuse the report; semantic duplicates require merchant review (not automated). Approval freezes the forecast snapshot, proposal version, pool and allocations. Payout is simulated with a stable receipt ID; no real money moves, and browser persistence is not a production payout ledger.

Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and
`npm run test:routes -- http://localhost:5190` with the preview running.

The merchant UI is a fixed viewport workspace with three stages and no vertical page scroll. Evidence, forecasts and reward policy use tabbed modal panels; explanatory demo/settings UI is intentionally omitted. Longer comments are paginated in the full-feedback panel.
