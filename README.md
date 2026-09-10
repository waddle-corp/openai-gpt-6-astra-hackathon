# OpenAI GPT-6 Astra Hackathon

Standalone Boosted USA demo storefront, copied from `benchmark-boosted-usa.myshopify.com`, with a customer **Pay with your feedback** flow. The merchant feedback agent lives in `agents/` and is exposed through API routes; its temporary UI is at `/tmp/feedback`.

**Shared customer/merchant contract:** [docs/feedback-contract.md](docs/feedback-contract.md), with authoritative types and validation in `contracts/feedback.ts`. Both feedback fixture files and persisted customer submissions use `FeedbackRecord` v1.0.

Customer demo setup, real/simulated behavior, optional Astra credentials, and the merchant handoff contract are documented in [docs/customer-feedback.md](docs/customer-feedback.md).

**`main` is the improved storefront.** Shoppers kept asking which parts fit their ride, so Astra built a compatibility experience into the product pages. Everything below runs from this checkout.

### Run the before and after at the same time

The storefront as it was is commit `3b1620f`, the first parent of merge commit `163ee06` that brought the compatibility work into `main`. Check it out into a second worktree and give it its own port. The two servers are separate processes with separate files and separate browser storage, so neither affects the other and both stay up together.

```sh
git clone https://github.com/waddle-corp/openai-gpt-6-astra-hackathon.git
cd openai-gpt-6-astra-hackathon
npm ci
npm run dev &                                   # after: http://localhost:3000

git worktree add ../shop-before 3b1620f
(cd ../shop-before && npm ci && npm run dev -- --port 3002 &)   # before: http://localhost:3002
```

Open the same path on both ports and compare:

- after http://localhost:3000/store/products/gtr-series-2-bamboo-at
- before http://localhost:3002/store/products/gtr-series-2-bamboo-at

The improved page carries a **Compatible parts** section with a 3D board; the original goes straight from the description to *You may also like*. Neither server needs `OPENAI_API_KEY`; only the agents do.

The second `npm ci` takes a few minutes. Both worktrees pin the same dependency versions, so you can skip it with `ln -s "$PWD/node_modules" ../shop-before/node_modules` instead, at the cost of the comparison worktree breaking if the main checkout is removed.

Clean up with `git worktree remove ../shop-before`.

### Where the improvement lives

Useful when handing this to a coding agent. The change is additive: 3 lines in the product route, 82 added lines of CSS, and new files.

| Area | Files |
| --- | --- |
| Compatibility UI and fitment rules | `components/compatibility.tsx`, `components/compatibility-data.ts`, `components/compatibility-assembly.tsx` |
| 3D ride and wheel preview | `components/vehicle-model.tsx`, `components/vehicle-hotspots.ts`, `components/wheel-swatches.tsx`, `public/media/3d/evolve-gtr.glb` |
| Wired into the storefront | `app/store/[...path]/page.tsx` (3 lines), `app/store/store.css` (appended block) |
| Blender sources for the model | `scripts/build-3d.py`, `scripts/3d/board.py`, `scripts/3d/street_wheel.py` |
| The agent that built it | `agents/coding-agent/`, `app/api/build/`, `app/tmp/build/` |

## Open the improved shop

Requires Node.js 22.13+.

```sh
npm ci
npm run dev
```

| What to look at | URL |
| --- | --- |
| Compatible parts on a vehicle page, with the 3D ride | http://localhost:3000/store/products/gtr-series-2-bamboo-at |
| Fits your ride panel on a part page | http://localhost:3000/store/products/standard-range-battery-pack |
| Charger with two connector styles called out | http://localhost:3000/store/products/evolve-skateboards-battery-charger-400013-ss20 |
| Storefront home | http://localhost:3000/store |
| Merchant build review (needs `npm run agent:runner`) | http://localhost:3000/tmp/build |
| Feedback labs (steps 1-3) | http://localhost:3000/tmp/feedback and `/tmp/feedback/collective` |

On the vehicle page, scroll to **Compatible parts**: drag the board to rotate it, hover it to replay the parts docking into place, click a hotspot to open that part, and pick a colour under the wheel card to swap the all-terrain wheels for the 97 mm street set.

## What Astra changed

Astra (`gpt-6-astra`) produced the compatibility experience end to end, from shopper feedback to reviewed code:

1. **Feedback into an opportunity.** Five of the synthetic shoppers in `data/shopper-feedback.json` could not tell which parts fit their board. Astra grouped them and wrote the build brief (`agents/coding-agent/fixtures.ts` keeps that result).
2. **Code.** The coding agent implemented it in an isolated git worktree and verified it in a headless browser: `components/compatibility.tsx`, `components/compatibility-data.ts` and the product-page wiring. It reads fitment from the bundled catalog text only, and says so when a listing does not confirm a model.
3. **3D.** A second Astra loop compared headless Blender renders against the real product photos and edited the parametric modules until they matched (`scripts/3d/street_wheel.py`, `scripts/3d/board.py`). Run it again with `npm run agent:refine-3d wheel` or `... board`.

A merchant approved the change on `/tmp/build` before it was merged. Nothing deploys on its own.

## Other commands

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

`POST /api/build` starts step ④: the coding agent (`agents/coding-agent/`) builds the synthesized opportunity in an isolated git worktree under `work/`, verifies it in a headless browser at the desktop viewport (mobile is out of scope for now), runs `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`, and waits for the merchant on `/tmp/build` (original vs implemented, evidence, reasoning, checks, diff). Publish merges the build branch locally; nothing is deployed. The agent runs in a separate Node process because API routes execute inside workerd: start it with `npm run agent:runner` (it reads `OPENAI_API_KEY` from `.env`). See [`agents/coding-agent/README.md`](agents/coding-agent/README.md).

Electric-skateboard product pages render a stylised 3D board in the Compatible parts section. `scripts/build-3d.py` builds it with headless Blender (`brew install --cask blender`, then `/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/build-3d.py -- public/media/3d/evolve-gtr.glb`): the board plus `Battery`, `Wheels`, `BeltKit`, and `Charger` nodes with one `assemble` animation that docks the parts. The storefront shows it with a vendored copy of `<model-viewer>` (`public/vendor/model-viewer.min.js`, Apache-2.0) so no CDN is needed; hotspot anchors live in `components/vehicle-hotspots.ts`. The GLB is committed; Blender is only needed to regenerate it.

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

### Admin comparison previews

Section 03 of `/admin` opens As-is and To-be product previews in a modal, with tabs to switch versions. As-is loads the `3b1620f` worktree on `http://localhost:3002`; To-be loads the current origin and jumps to `#compatible-parts-heading`. Both use `/store/products/gtr-series-2-bamboo-at`. Keep both development servers above running for the comparison; the modal also provides an Open store link. The thumbnail frames are non-interactive; open the modal to explore the actual store and 3D compatibility section.
