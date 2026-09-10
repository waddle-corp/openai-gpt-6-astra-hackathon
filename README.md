# OpenAI GPT-6 Astra Hackathon

Standalone Boosted USA demo storefront, copied from `benchmark-boosted-usa.myshopify.com`. The agent system overview lives at `/admin`.

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

`/` redirects to `/store`. All shopper routes live under `/store`, including products, collections, search, cart, and demo checkout. `/admin` hosts the Pay with Feedback agent system overview in its own layout without storefront chrome or cart state. Shared catalog data and `/media` assets remain unchanged. With a preview running, use `node scripts/check-routes.mjs http://localhost:4318` to check route separation, redirects, and static assets.

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

## Pay with Feedback system overview

Run `npm run dev -- --host 127.0.0.1 --port 5190`, then open
`http://localhost:5190/admin`. This is a desktop-first, fixed-viewport factory scene for the agent system. Shopper signals enter an intake station, travel through parallel browser workbenches, and reach evidence inspection, improvement assembly and reward distribution. No deployment is required.

### Demo walkthrough

1. Open `/admin` to see the complete system in motion: four sample shopper reports, 12 illustrative worker windows and three output stations. The scene starts 28 seconds into a 36-second sample loop, with a simulated delivery reward visible while three option-investigation tasks run in parallel. The three investigations start 12 seconds apart to keep activity distributed through the loop.
2. Follow the physical conveyor from the intake tray through the browser workbenches to the evidence scanner, improvement assembly station and shopper reward trays. The delivery reports share one investigation, one improvement and one $640 simulated reward pool. The cart and option samples remain unresolved without proposals or rewards.
3. Click a shopper card, browser monitor or station label to open a focused view. Worker views show a larger bundled reference or schematic page and the current investigation context. Output views show the observation, root-cause hypothesis, proposal, forecast assumptions or reward allocations available at that position. Opening a focused view pauses the scene; **Back to overview** restores it.
4. Hover a shopper card to highlight its workers. Use the bottom controls to pause, restart or scrub the simulation. These controls only change presentation; they never start an investigation, approve an improvement or transfer money. Output details use the current event projection, so later rewards do not appear early.
5. To demonstrate an actual submission, open `/store/products/boostedusa-hyperlane-fast-charger`, add to cart, continue to checkout and choose **Pay with Feedback**. Review the selected moments and submit. The same-origin admin places the report first among shopper signals with **Awaiting backend** status. The intake tray shows up to four reports; click its **Shopper signals** label to view all reports and their moments in paginated detail. Real submissions receive no simulated workers, findings, proposals or rewards.

### Dean’s backend boundary

Dean owns agent execution, worker lifecycles, reproduction evidence, findings, forecasts, proposal and reward decisions. This checkout implements the visualization and deterministic sample data. There is no backend endpoint or live connection configured and no credentials are required.

`components/feedback-admin.tsx` owns playback and focused details. It passes the `projectFleet` result from `lib/agent-fleet.ts` into `components/agent-factory-scene.tsx`, which renders the physical stations, conveyors and browser monitors using `app/admin/factory-scene.css`. The projection retains all feedback, deduplicates related sample runs, exposes only reached events and creates sample workers from shopper moments. Pending submissions remain fixed while sample runs loop. Images and animated cursors in worker windows illustrate computer use; they do not represent live browser sessions.

`lib/agent-run.ts` defines `AgentRun`, `decodeAgentEvent`, `appendEvent` and `projectEvent` for validated ordered delivery and historical projection. Connecting Dean's backend requires replacing the sample fleet projection with backend run and worker data through the eventual transport. Reuse the event validation and projection boundary; reserve `source: "live"` for actual backend-delivered events and keep pending submissions distinct. A live fleet feed is not implemented. See [the event contract](docs/agent-run-events.md) for exact fields, ordering and responsibility boundaries. This is a proposed integration contract, not evidence of agreement with Dean.

### Persistence and evidence

- No external database, authentication, model call or payment provider. Catalog data/assets stay bundled. Shopper feedback uses `localStorage` (`pay-with-feedback-v1`); activity moments use per-tab `sessionStorage` (`feedback-journey`). Reload preserves submissions and resets the sample scene to its 28-second opening. Different origins/ports/devices do not share records. Clearing site data removes local submissions. Simultaneous writes across tabs are not transactional.
- The viewer reads submissions and never writes run outcomes into local business state. Previous demo proposal records are ignored. Replaying a sample is side-effect-free, including the simulated payout receipt.
- Capture explicitly records product title, option label, quantity and known storefront routes. It does not inspect arbitrary clicks, page text, form values, URL queries, credentials, payment details or recordings. Shoppers select from the last eight moments and write their own comment; the UI asks them to omit personal information.
- `public/evidence/charger-reference.jpg` is a sanitized reference capture of the local Hyperlane product page on 2026-09-10 at 1600×900 with an empty cart. It is not a shopper recording, a computer-use capture or proof of a defect. Sample personas, events, findings and outcomes are illustrative. A shipping-page link exists in the store header; lack of a precise date near purchase does not prove a defect or uplift.
- Sample forecasts are unmeasured 30-day contribution estimates. The default $3,200 = 10,000 affected sessions × 0.4 percentage-point lift × $200 AOV × 40% margin. Baseline conversion is 4%. Low/base/high are $0/$3,200/$6,400. Feedback-funded demo orders are excluded from paid revenue and conversion.
- One improvement has one pool: min($1,000 cap, 20% × $3,200) = $640. The sample policy allocates $384/$256, then emits approved and simulated-paid events with a stable receipt. Those are recorded outputs, not actions triggered by the viewer. Allocation policy is not measured causal attribution; the real backend must own eligibility, deduplication, locks and payout idempotency.

Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and
`npm run test:routes -- http://localhost:5190` with the preview running.
