# Compatibility feedback demo

## Live shopper: one board, no extra charger

Start a new feedback demo from the storefront footer, empty any previous demo cart, and accept participation. Do not preload a synthetic journey into this live session.

1. Open `/store/collections/evolve-skateboards`.
2. Open **Evolve GTR Series 2 Bamboo Street** at `/store/products/evolve-skateboards-bamboo-gtr-series-2-street`.
3. Select **Black** ($1,069.00 in the bundled snapshot) and add one board. This is an available option. Avoid relying on the default option for repeatable demos.
4. Open `/store/collections/evolve-skateboard-accessories` and find **Evolve Battery Chargers**. Use pagination if needed, or the direct product route `/store/products/evolve-skateboards-battery-charger-400013-ss20` during a time-limited demo.
5. Look at the charger options, revisit the board, and go to `/store/cart`, then `/store/checkout`. Leave the charger out; keep the board in the cart.
6. Select **Pay with your feedback**, choose the charger moment, and choose **Understanding details**.
7. Enter: **I wanted a second charger for the office, but I could not tell which charger would fit the board I added. I left the charger out.**
8. In prepared-question mode, choose **I was unsure it would work with the board**, then **Consider adding it to this order**. Live Astra wording may vary; answer honestly according to the scenario rather than requiring an exact sentence.
9. Choose a reward preference and **Apply feedback**. The inline section collapses; select **Place demo order** below it to finish.

The charger description already names compatibility with GTR/Stoke Series 1 & 2. The available GTR charger option is $99.99. The investigation is whether the store clearly connects the shopper's selected board to that option, not whether compatibility text is entirely missing. Existing information is evidence for Astra to inspect; a final recommendation still needs validation. Do not imply that an extra charger is necessary for the board to work.

## Prepared data

`data/feedback/synthetic-submissions.json` contains 14 **synthetic** completed demo purchases in the shared FeedbackRecord v1.0 shape as the customer flow. Each record retains a purchased item and customer-reported difficulty with another item. Prices, variants, and availability come from the bundled catalog. Events, customers' statements, timestamps, and order references are fictional. `source.kind: "synthetic"` and `journey.evidence: "synthetic"` must remain visible to downstream consumers.

For the presentation, use records **02–14** as 13 existing submissions, then add the live customer submission. Record **01** is the rehearsal equivalent of the live scenario; do not include it as another independent customer in the live demonstration.

| Records | Purpose                                                                                    |
| ------- | ------------------------------------------------------------------------------------------ |
| 01, 07  | New board buyer cannot confidently match a charger option                                  |
| 02, 08  | Owner knows the model but finds generation terminology confusing; price comparison remains |
| 03, 09  | Search complaint clarified as compatibility uncertainty                                    |
| 04, 10  | Modified gear requires configuration information                                           |
| 05, 11  | Another person's board cannot be inferred from the cart                                    |
| 06      | Price is the reported blocker                                                              |
| 12      | No current need for another charger                                                        |
| 13      | Desired helmet size is unavailable                                                         |
| 14      | Delivery timing is the reported blocker                                                    |

Typed search queries are not recorded. Any quoted search phrase in a customer's note is self-reported. Page navigation does not establish dwell time, that a paragraph was read, or why an item was omitted. The prepared questions in fixture records are authored examples, not outputs attributed to Astra.

## Merchant integration

Load only the raw submission array into the merchant's demo seed data. Do not automatically inject it into customer browsing sessions or overwrite local live submissions. Keep fixture IDs (`SYN-FB-*`) separate from live IDs (`FB-*`), and de-duplicate seed imports by ID.

New live submissions include `context.cart` (at submission). `purchase.cart` stores the actual final demo cart, total, and completion time when checkout finishes. These can differ if the shopper edits the cart after submitting. An uncompleted order is not proof of a purchase. Neither synthetic nor live demo orders are real Shopify payments.

See [feedback-contract.md](feedback-contract.md) and `contracts/feedback.ts` for the shared input contract.

The original journey remains chronological, including repeat product visits. The selected charger screen and the board in the cart should both be included in investigation context. Use the full raw records plus catalog/browser evidence for analysis, not the customer-facing summary alone.

## Isolated evaluation rubric

`evaluation/feedback/expected-outcomes.json` is **evaluation-only author intent**, never model input or customer evidence. The expected groups are hypotheses to compare with Astra's investigation, not proven customer research.

Expected behavior:

- Group 01/02/03/07/08/09 under model-to-accessory compatibility information, while preserving the distinction between immediate consideration and further price comparison.
- Mark 04/10 and 05/11 as needing additional information. Do not issue definitive recommendations based only on the cart.
- Exclude 06/12/13/14 from estimated gains attributable to a compatibility change.
- Explain group decisions from exact answers and store evidence. Do not let one keyword determine the grouping.
- Treat conditional purchase intent as self-report, not actual uplift. A $99.99 omitted charger is a candidate basket addition, not a $99.99 store-wide AOV increase.
- Keep any conversion-rate assumptions, order counts, and measurement horizon explicit. Synthetic frequencies do not estimate real demand, and successful computer-use interaction does not establish sales uplift.

## Validation and remaining live check

Run `node --experimental-strip-types scripts/check-feedback-fixtures.mjs` to validate data against the catalog. Add `http://localhost:3000` to exercise the question API on the six representative cases. This reports whether questions came from `prepared` or `astra`; it does not score merchant classification.

Actual Astra classification cannot be verified until the merchant analyst and its model access are connected. Feed raw records to that analyst, collect its groups/evidence/uncertainties independently, then compare with the isolated rubric. Do not present the expected groups above as measured model results.
