import type { ImprovementOpportunity } from '../feedback-agent/synthesize.ts';

// A step ③ result captured for the demo so a build can start without re-running Astra.
// Quotes are verbatim from data/shopper-feedback.json.
export const sampleOpportunity: ImprovementOpportunity = {
  title: 'Show which parts fit your ride, right on the product page',
  underlyingProblem:
    'Shoppers cannot tell from a part page (battery, wheels, charger) which vehicles it fits, and cannot tell from a vehicle page which parts fit it. They abandon or risk a wrong order.',
  opportunity:
    'Make compatibility explicit on every product page: a "Fits your ride" section that lists the compatible vehicles for a part, and a "Compatible parts" section on vehicle pages that shows batteries, wheels, chargers, and kits that fit, presented as parts docking onto the vehicle.',
  designDirection: [
    'On vehicle pages (skateboards, scooters, bikes), add a "Compatible parts" section under the purchase panel: the vehicle image in the centre, compatible part cards arranged around it, with a subtle 3D/perspective assembly animation as parts settle into place.',
    'On part pages, add a compact "Fits" panel above the description listing compatible models and what is or is not included, derived from the existing description text and collections.',
    'Every part card links to its product page; no cart or checkout interaction is added.',
    'Desktop only for now: the parts orbit the vehicle image at the 1280px layout; mobile is out of scope.',
    'Keep the current Boosted USA typography, colours, and product-page layout; the new section must look native to the storefront.',
  ],
  tensions: [
    {
      feedbackIds: ['shopper-feedback-003', 'shopper-feedback-006'],
      tension: 'Some shoppers want an included-parts list, others want to know which extra kit to buy.',
      resolution: 'The Fits panel states both: what is in the box and which companion part is required when the description names one.',
    },
  ],
  constraintsHonored: [
    'Preserve the current Boosted USA brand identity and visual system.',
    'No price changes or discounts.',
    'No changes to orders, payments, customer accounts, or private data.',
  ],
  evidence: [
    {
      feedbackId: 'shopper-feedback-001',
      role: 'problem',
      quote: 'Will this battery fit a Boosted Mini X, or is it only for the larger boards? I do not want to order the wrong pack.',
    },
    {
      feedbackId: 'shopper-feedback-006',
      role: 'problem',
      quote: 'Are the pulleys included with these wheels? I have a V2 board and need to know whether I also need a belt kit before placing the order.',
    },
    {
      feedbackId: 'shopper-feedback-013',
      role: 'problem',
      quote: 'Which Evolve models does this charger work with? The product title is broad, and I need to confirm it matches my GTR Series 2 battery.',
    },
    {
      feedbackId: 'shopper-feedback-003',
      role: 'solution',
      quote: 'Does this kit include everything needed for the install, or do I need to buy a separate pulley and tool? A parts list would help.',
    },
    {
      feedbackId: 'shopper-feedback-016',
      role: 'context',
      quote: 'The replacement link needs clearer compatibility details.',
    },
  ],
  successMetric: 'Fewer compatibility questions on part pages and fewer wrong-part returns; more part pages visited from vehicle pages.',
  buildBrief: [
    'Pages: /store/products/[handle] for every product. Desktop viewport only; do not design or verify mobile for now.',
    'Components: add a compatibility component under components/ (for example components/compatibility.tsx) and render it from app/store/[...path]/page.tsx inside the product route. Styles go in app/store/store.css.',
    'Data: derive compatibility from the bundled catalog only (lib/catalog.ts exports products, byHandle, collectionProducts). Use vendor, productType, collections, tags, and description text (model names such as "Mini X", "V2", "GTR Series 2", "Hadean"). A small hand-written handle map is acceptable where the text is ambiguous.',
    'Vehicle pages (productType Vehicle, Electric Skateboard, Electric Scooter, Electric Bike): show a "Compatible parts" section with the vehicle image centred and part cards (image, title, price, link) arranged around it, with a CSS perspective/transform entrance animation that suggests parts docking onto the vehicle. Respect prefers-reduced-motion.',
    'Part pages (productType Accessories, Skateboard parts, Spareparts): show a "Fits" panel above the description listing compatible models and, when the description names it, what is included or required.',
    'Unchanged: header, footer, gallery, price, variant picker, add-to-cart form, cart, checkout, search, collections, and app/admin. No new dependencies, no forms, no cart or checkout calls, no price changes.',
  ].join('\n'),
};
