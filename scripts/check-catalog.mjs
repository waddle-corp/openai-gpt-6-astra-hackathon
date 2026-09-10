import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  cents,
  maxQuantity,
  normalizeCart,
  setCartQuantity,
  localLink,
} from '../lib/shop.ts';
const root = fileURLToPath(new URL('..', import.meta.url));
const load = (name) =>
  JSON.parse(readFileSync(`${root}/data/${name}.json`, 'utf8'));
const catalog = load('catalog');
const assets = load('asset-map');
assert.equal(catalog.products.length, 317);
assert.equal(catalog.collections.length, 25);
const variants = catalog.products.flatMap((product) => product.variants);
assert.equal(variants.length, 1124);
assert.equal(
  new Set(variants.map((variant) => variant.id)).size,
  variants.length,
);
const ids = new Set(catalog.products.map((product) => product.id));
for (const collection of catalog.collections)
  for (const product of collection.products)
    assert(ids.has(product.id), `Missing ${product.id}`);
let imageReferences = 0;
function checkImages(value) {
  if (Array.isArray(value)) {
    value.forEach(checkImages);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (
    value.url &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  ) {
    assert(assets[value.url], `Image not bundled: ${value.url}`);
    imageReferences++;
  }
  Object.values(value).forEach(checkImages);
}
checkImages(catalog);
for (const path of new Set(Object.values(assets))) {
  assert(path.startsWith('/media/'), `Unexpected asset target: ${path}`);
  assert(!path.includes('..'), `Unsafe asset target: ${path}`);
  assert(existsSync(`${root}/public${path}`), `Missing asset: ${path}`);
  assert(statSync(`${root}/public${path}`).size > 0, `Empty asset: ${path}`);
}
for (const variant of variants) {
  assert(Number.isSafeInteger(cents(variant.price)));
  assert(maxQuantity(variant) >= 0 && maxQuantity(variant) <= 99);
}
assert.equal(cents('19.99') * 3, 5997);
assert.equal(cents('85.0'), 8500);
assert.throws(() => cents('NaN'));
assert.throws(() => cents('-1'));
const stock = { a: { max: 3 }, sold: { max: 0 } };
const cart = normalizeCart(
  [
    { variantId: 'a', quantity: 2 },
    { variantId: 'a', quantity: 99 },
    { variantId: 'sold', quantity: 1 },
    { variantId: 'missing', quantity: 1 },
  ],
  stock,
);
assert.deepEqual(cart, [{ variantId: 'a', quantity: 3 }]);
assert.deepEqual(
  setCartQuantity(cart, 'a', 1.5, stock),
  cart,
  'Invalid quantity must not remove cart items',
);
assert.deepEqual(setCartQuantity(cart, 'a', NaN, stock), cart);
assert.deepEqual(setCartQuantity(cart, 'a', 0, stock), []);
assert.equal(
  localLink(
    'https://boostedusa.com/collections/accessories/products/boosted-charger?variant=123',
  ),
  '/store/products/boosted-charger?variant=123',
);
assert.equal(
  localLink('shopify://products/boosted-rev'),
  '/store/collections/electric-scooters',
);
assert.equal(localLink('javascript:alert(1)'), '/store');
console.log(
  `Verified 317 products, 1124 variants, 25 collections, ${imageReferences} image references, ${new Set(Object.values(assets)).size} bundled assets, cart quantities, prices, and source links.`,
);

assert.equal(localLink('/store/cart'), '/store/cart');
assert.equal(localLink('/media/example.png'), '/media/example.png');
assert.equal(localLink('#details'), '#details');
assert.equal(localLink('/search?q=board'), '/store/search?q=board');
assert.equal(localLink('https://example.com/page'), 'https://example.com/page');
