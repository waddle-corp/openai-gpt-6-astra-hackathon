import { products } from '@/lib/catalog';
import type { Product } from '@/lib/shop';

const vehicleType = (p: Product) => /^(Vehicle|Electric Skateboard|Electric Scooter|Electric Bike)$/i.test(p.productType);
// Some bundled Evolve and Super73 spares use the vehicle's product type.
// Resolve those with the actual part title rather than rendering a charger as a ride.
const partTitle = /\b(batter(?:y|ies)|chargers?|wheels?|tires?|tyres?|tubes?|kits?|gears?|belts?|bearings?|motors?|plates?|guards?|remotes?|decks?|grip tape|trucks?|seats?|pegs?|racks?|platform|basket|locks?|throttle|display|harness|fenders?|plugs?|bumpers?|footpads?|covers?|bindings|lights|screws?|tools?)\b/i;
export const isPart = (p: Product) => /^(Accessories|Skateboard parts|Spareparts)$/i.test(p.productType) || p.collections.some(c => /accessories|spare-parts/.test(c.handle) && (c.handle !== 'accessories' || partTitle.test(p.title.replace(/\([^)]*\)/g, ''))));
export const isVehicle = (p: Product) => vehicleType(p) && !isPart(p);
const vehicles = products.filter(isVehicle);
const normalize = (s: string) => s.toLowerCase().replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim();

type Model = { key: string; label: string; brand: RegExp; pattern: RegExp };
const models: Model[] = [
  ...['Mini X', 'Mini S', 'Stealth', 'Plus', 'V2', 'V3', 'Rev'].map((name) => ({
    key: `boosted-${normalize(name)}`, label: `Boosted ${name}`, brand: /boosted/i,
    pattern: new RegExp(`\\b${name.replace(' ', '[\\s-]*')}\\b`, 'i'),
  })),
  { key: 'gtr2', label: 'Evolve GTR Series 2', brand: /evolve/i, pattern: /\bGTR\s*(?:Series\s*)?2\b|\bGTR2\b/i },
  { key: 'gtr1', label: 'Evolve GTR Series 1', brand: /evolve/i, pattern: /\bGTR\s*(?:Series\s*)?1\b|\bGTR1\b/i },
  { key: 'hadean', label: 'Evolve Hadean', brand: /evolve/i, pattern: /\bHadean\b/i },
  { key: 'stoke2', label: 'Evolve Stoke Series 2', brand: /evolve/i, pattern: /\bStoke\s*(?:Series\s*)?2\b|\bStoke2\b/i },
  { key: 'stoke1', label: 'Evolve Stoke Series 1', brand: /evolve/i, pattern: /\bStoke\s*(?:Series\s*)?1\b|\bStoke1\b/i },
  { key: 'stokex', label: 'Evolve Stoke X', brand: /evolve/i, pattern: /\bStoke\s*X\b/i },
  { key: 'renegade', label: 'Evolve Renegade', brand: /evolve/i, pattern: /\bRenegade\b/i },
  { key: 'diablo', label: 'Evolve Diablo', brand: /evolve/i, pattern: /\bDiablo\b/i },
  { key: 'xyber', label: 'Segway Xyber', brand: /segway/i, pattern: /\bXyber\b/i },
  { key: 'onewheel-gt', label: 'Onewheel GT', brand: /onewheel|future motion/i, pattern: /\bGT\b(?![\s-]*S(?:eries)?\b)/i },
  { key: 'onewheel-gts', label: 'Onewheel GT S-Series', brand: /onewheel|future motion/i, pattern: /\bGT[\s-]*S[\s-]*Series\b/i },
  { key: 'onewheel-pintx', label: 'Onewheel Pint X', brand: /onewheel|future motion/i, pattern: /\bPint[\s-]*X\b/i },
  { key: 'onewheel-pint', label: 'Onewheel Pint', brand: /onewheel|future motion/i, pattern: /\bPint\b(?![\s-]*[XS]\b)/i },
  { key: 'onewheel-xr', label: 'Onewheel XR', brand: /onewheel|future motion/i, pattern: /\bXR\b(?![\s-]*Classic\b)/i },
  ...['S1', 'S2', 'ZX', 'Z1', 'Z Miami', 'Z Adventure', 'S Adventure', 'R Adventure', 'R Brooklyn', 'RX'].map(name => ({
    key: `super73-${normalize(name)}`, label: `Super73 ${name}`, brand: /super\s*73/i,
    pattern: new RegExp(`\\b${name.replace(' ', '[\\s-]*')}\\b`, 'i'),
  })),
];
// Exact scooter model names from the catalog provide coverage without treating
// every scooter from the same manufacturer as electrically interchangeable.
for (const vehicle of vehicles.filter(v => /dualtron/i.test(v.title))) {
  const name = vehicle.title.split(/electric scooter| - /i)[0].trim();
  if (!name || /[()]/.test(name)) continue; // generation-qualified names need explicit evidence
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  models.push({ key: vehicle.handle, label: name, brand: /dualtron|minimotors/i, pattern: new RegExp(`\\b${escaped}\\b`, 'i') });
}

// Catalog copy names series ranges and families rather than single models:
// "GTR & Stoke Series 1 & 2", "Hadean and GTR2", "GT, GTR and Hadean", "all Evolve boards".
const EVOLVE_ALL = ['gtr1', 'gtr2', 'hadean', 'stoke1', 'stoke2', 'stokex', 'renegade', 'diablo'];
const BOOSTED_ALL = ['boosted-mini x', 'boosted-mini s', 'boosted-stealth', 'boosted-plus', 'boosted-v2', 'boosted-v3'];
const aliases: { brand: RegExp; pattern: RegExp; keys: string[] }[] = [
  { brand: /evolve/i, pattern: /\b(?:all|any|every)\s+(?:of\s+(?:our|the)\s+)?evolve\s+(?:electric\s+)?(?:skate)?boards?\b|\ball\s+(?:our\s+)?boards\b/i, keys: EVOLVE_ALL },
  { brand: /evolve/i, pattern: /\bGTR\s*(?:&|and|\/|,)?\s*(?:Stoke\s*)?Series\s*1\s*(?:&|and|\/|,)\s*2\b|\bSeries\s*1\s*(?:&|and|\/)\s*2\b/i, keys: ['gtr1', 'gtr2', 'stoke1', 'stoke2'] },
  { brand: /evolve/i, pattern: /\bGTR\b(?!\s*(?:Series\s*)?[12]\b)(?![\s-]*(?:Carbon|Bamboo)\s+(?:Series\s*)?1\b)/i, keys: ['gtr1', 'gtr2'] },
  { brand: /evolve/i, pattern: /\bGTR\s*1\b|\bGTR\s*Series\s*1\b/i, keys: ['gtr1'] },
  { brand: /evolve/i, pattern: /\bStoke\b(?!\s*(?:Series\s*)?[12X]\b)/i, keys: ['stoke1', 'stoke2'] },
  { brand: /boosted/i, pattern: /\b(?:all|any)\s+boosted\s+(?:boards?|models)\b|\bboosted\s+boards\b/i, keys: BOOSTED_ALL },
];
function aliasKeys(context: string, sentence: string) {
  return aliases.filter(a => a.brand.test(context) && a.pattern.test(sentence)).flatMap(a => a.keys);
}

// These exceptions resolve abbreviated model lists and variant-specific connectors
// in the bundled descriptions. No fit is inferred from a shared vendor alone.
const overrides: Record<string, { keys: string[]; notes: string[] }> = {
  'evolve-skateboards-gt-battery-bms-500005-ss20': {
    keys: ['gtr2'],
    notes: ['14Ah battery: for Bamboo GTR Series 2 only. Not for Carbon decks or other series.', 'The 14Ah option is not compatible with Stoke.'],
  },
  'copy-of-evolve-battery-bamboo-gtr-14ah': {
    keys: ['gtr2', 'stoke1'],
    notes: ['4Ah travel battery: for Bamboo GTR2 or Stoke 1 only. Not compatible with other series.'],
  },
  'standard-range-battery-pack': {
    keys: ['boosted-mini x', 'boosted-mini s', 'boosted-stealth', 'boosted-plus', 'boosted-v2', 'boosted-v3'],
    notes: ['Not compatible with V1 boards.', 'Alignment is not perfect on XR models, but the description confirms it works.'],
  },
  'boostedusa-hyperlane-fast-charger': {
    keys: ['boosted-mini x', 'boosted-mini s', 'boosted-stealth', 'boosted-plus', 'boosted-v2', 'boosted-v3', 'boosted-rev'],
    notes: ['V2 charger: for V2 (Dual Plus), V3 (Mini S/X, Stealth, V3 Plus) and Rev.', 'Not compatible with Gen 1.'],
  },
  'clear-tail-puck': { keys: ['boosted-mini x', 'boosted-mini s'], notes: ['Only for Mini S/X boards.'] },
  '2nd-gen-wheels': { keys: ['boosted-v2'], notes: ['2nd-generation Boosted wheels. Other generations are not specified in this listing.'] },
  'evolve-skateboards-battery-charger-400013-ss20': {
    keys: ['gtr1', 'gtr2', 'stoke1', 'stoke2', 'hadean'],
    notes: ['GTR/Stoke 4A: D-shape connector. Only for GTR & Stoke Series 1 & 2.', 'Hadean 5A: 3-pin connector. Only for the Hadean series.', 'Choose the charger style that matches your board; these connectors are not interchangeable.'],
  },
};

function text(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
}
function statements(p: Product) {
  // Keep list items together, but preserve paragraph boundaries and decimal numbers.
  const blocks = p.descriptionHtml.replace(/\n/g, ' ').replace(/<\/(?:p|div|h[1-6]|ul|ol)>/gi, '\n')
    .split(/\n/).map(text).filter(Boolean);
  const joined: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (/^(?:compatibility|compatibile with|contents|kit includes|includes|what is in the box|what[’']s included)\s*:?$/i.test(block) && blocks[i + 1]) {
      joined.push(`${block.replace(/:\s*$/, '')}: ${blocks[++i]}`);
    } else joined.push(block);
  }
  return joined.flatMap(line => line.split(/(?<=[.!?])\s+(?=[A-Z*])/)).filter(Boolean);
}
const fitSignal = /compatib(?:le|ility|ile)|\bfits?\b|\bworks? (?:with|for|on|across)\b/i;
const negative = /\bnot\b|\bexcept\b|\bwon[’']t\b|\bincompatible\b/i;
const supplySignal = /includ|\bcontents\b|\bwhat is in the box\b|\brequir|\bwithout\s+(?:the\s+)?(?:pulleys|bearings|hardware|motor|mounts|belts|screws|tools)|\bcome(?:s)? (?:with|complete)\b|\bdo not come\b|\bsold (?:separately|individually)\b|\bneed (?:to buy|to purchase|an? (?:pulley|belt|bearing|tool|kit)|bearings|belts|pulleys|tools)|\bmust be paired\b|\bsame voltage\b|\bprice for ONE\b/i;

export function fitInfo(p: Product) {
  const lines = statements(p);
  const override = overrides[p.handle];
  const context = `${p.vendor} ${p.title} ${p.collections.map(c => c.title).join(' ')} ${p.tags.join(' ')}`;
  // Only affirmative fit statements supply automatic model matches. Never promote
  // a model mentioned in an exclusion, comparison or installation instruction.
  const evidence = lines.filter(s => fitSignal.test(s));
  if (!evidence.length && /upgrade your boosted board/i.test(p.description)) {
    evidence.push('For Boosted boards. The listing does not specify individual models or generations.');
  }
  const positive = evidence.filter(s => !negative.test(s));
  const excluded = (key: string) => {
    const model = models.find(m => m.key === key);
    // Material-qualified exclusions ("NOT COMPATIBLE GTR Bamboo") are resolved per vehicle in materialMatches.
    return !!model && evidence.some(s => [...s.matchAll(new RegExp(model.pattern.source, 'gi'))].some(hit => negatedAt(s, hit.index) && !MATERIAL.test(s.slice(hit.index, hit.index + 30))));
  };
  const direct = models.filter(m => m.brand.test(context) && (positive.some(s => m.pattern.test(s)) || m.pattern.test(p.title))).map(m => m.key);
  const expanded = [...positive, p.title].flatMap(s => aliasKeys(context, s));
  const keys = override?.keys ?? [...new Set([...direct, ...expanded])].filter(key => !excluded(key));
  const matched = models.filter(m => keys.includes(m.key));
  const notes = [...new Set([...(override?.notes ?? []), ...lines.filter(s => supplySignal.test(s) || (!override && fitSignal.test(s) && negative.test(s)))])];
  return { models: matched, evidence: override ? [] : evidence, notes };
}

const MATERIAL = /\b(bamboo|carbon)\b/gi;
/** A mention is negated when a negative word precedes it within the clause ("NOT COMPATIBLE GTR Bamboo"), not when the negation follows it ("for Bamboo GTR Boards Not compatible with any other series"). */
function negatedAt(sentence: string, index: number) {
  const before = sentence.slice(Math.max(0, index - 90), index);
  const match = [...before.matchAll(/\bnot\b|\bexcept\b|\bwon[’']t\b|\bincompatible\b/gi)].pop();
  return !!match && !/[.;:]/.test(before.slice(match.index + match[0].length));
}
function mentionOf(key: string, model: Model) {
  if (key.startsWith('gtr')) return /\bGTR\s*(?:Series\s*)?\d?\b/gi;
  if (key.startsWith('stoke')) return /\bStoke\s*(?:Series\s*)?[12X]?\b/gi;
  return new RegExp(model.pattern.source, 'gi');
}
/** Deck materials allowed/denied for a model, read next to each mention ("GTR Carbon" allows, "NOT COMPATIBLE GTR Bamboo" denies). */
function materialsFor(part: Product, key: string) {
  const model = models.find(m => m.key === key);
  const allow = new Set<string>(), deny = new Set<string>();
  if (!model) return { allow, deny };
  const mention = mentionOf(key, model);
  for (const sentence of [part.title, ...statements(part)]) {
    for (const hit of sentence.matchAll(mention)) {
      const window = sentence.slice(Math.max(0, hit.index - 16), hit.index + hit[0].length + 24);
      for (const material of window.match(MATERIAL) ?? []) (negatedAt(sentence, hit.index) ? deny : allow).add(material.toLowerCase());
    }
  }
  return { allow, deny };
}
function materialMatches(part: Product, key: string, vehicle: Product) {
  const { allow, deny } = materialsFor(part, key);
  const title = vehicle.title.toLowerCase();
  const has = (material: string) => title.includes(material);
  if ([...deny].some(has)) return false;
  return allow.size === 0 || [...allow].some(has) || ![...MATERIAL.source.matchAll(/bamboo|carbon/g)].some(([m]) => has(m));
}
export function matchingVehicles(key: string, part?: Product) {
  const model = models.find(m => m.key === key);
  return model ? vehicles.filter(v => model.brand.test(`${v.vendor} ${v.title}`) && model.pattern.test(v.title) && !(model.key === 'diablo' && /renegade/i.test(v.title)) && (!part || materialMatches(part, key, v))) : [];
}

export function compatibleParts(vehicle: Product) {
  return products.filter(isPart).flatMap(part => {
    const info = fitInfo(part);
    const match = info.models.some(m => matchingVehicles(m.key, part).some(v => v.id === vehicle.id));
    if (!match) return [];
    return [{ product: part, info }];
  }).sort((a, b) => categoryRank(a.product) - categoryRank(b.product));
}
export function partCategory(p: Product) {
  if (/charger.*plug/i.test(p.title)) return 'Replacement part';
  if (/charger/i.test(p.title)) return 'Charger';
  if (/battery/i.test(p.title)) return 'Battery';
  if (/conversion|kit/i.test(p.title)) return 'Kit';
  if (/wheel|tire|tyre/i.test(p.title)) return 'Wheels';
  return 'Replacement part';
}
function categoryRank(p: Product) {
  return ['Battery', 'Charger', 'Wheels', 'Kit', 'Replacement part'].indexOf(partCategory(p));
}
