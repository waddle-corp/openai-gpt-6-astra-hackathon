export type Image = {
  url: string;
  altText?: string | null;
  width?: number;
  height?: number;
};
export type Variant = {
  id: string;
  title: string;
  price: string;
  compareAtPrice: string | null;
  sku: string | null;
  availableForSale: boolean;
  inventoryQuantity: number;
  sellableOnlineQuantity: number;
  inventoryPolicy: string;
  inventoryItem: { tracked: boolean };
  selectedOptions: { name: string; value: string }[];
  media: { image?: Image; preview?: { image?: Image } }[];
};
export type Product = {
  id: string;
  title: string;
  handle: string;
  status: string;
  descriptionHtml: string;
  description: string;
  vendor: string;
  tags: string[];
  productType: string;
  seo: { title: string | null; description: string | null };
  options: { name: string; optionValues: { name: string }[] }[];
  variants: Variant[];
  images: Image[];
  collections: { id: string; handle: string; title: string }[];
};
export type Collection = {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  image: Image | null;
  products: { id: string; handle: string }[];
};
export type CartVariant = {
  id: string;
  title: string;
  productTitle: string;
  handle: string;
  image: string;
  cents: number;
  max: number;
};
export type CartItem = { variantId: string; quantity: number };
export function cents(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error(`Invalid price: ${value}`);
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    value / 100,
  );
export function maxQuantity(variant: Variant) {
  if (!variant.availableForSale) return 0;
  if (!variant.inventoryItem.tracked || variant.inventoryPolicy === 'CONTINUE')
    return 99;
  return Math.max(
    0,
    Math.min(
      99,
      variant.sellableOnlineQuantity ?? variant.inventoryQuantity ?? 0,
    ),
  );
}
export function normalizeCart(
  value: unknown,
  variants: Record<string, CartVariant>,
): CartItem[] {
  if (!Array.isArray(value)) return [];
  const quantities = new Map<string, number>();
  for (const item of value) {
    if (
      !item ||
      typeof item.variantId !== 'string' ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    )
      continue;
    const variant = variants[item.variantId];
    if (!variant?.max) continue;
    quantities.set(
      item.variantId,
      Math.min(
        variant.max,
        (quantities.get(item.variantId) ?? 0) + item.quantity,
      ),
    );
  }
  return [...quantities].map(([variantId, quantity]) => ({
    variantId,
    quantity,
  }));
}
export function setCartQuantity(
  items: CartItem[],
  id: string,
  quantity: number,
  variants: Record<string, CartVariant>,
) {
  if (!Number.isInteger(quantity) || quantity < 0 || !variants[id])
    return items;
  return normalizeCart(
    items
      .filter((item) => item.variantId !== id)
      .concat(quantity > 0 ? [{ variantId: id, quantity }] : []),
    variants,
  );
}
export function localLink(value: string = '/') {
  const path = (value: string) =>
    value
      .replace(/^\/collections\/[^/]+\/products\//, '/products/')
      .replace(
        /^\/products\/boosted-rev(?=[?#]|$)/,
        '/collections/electric-scooters',
      );
  const storePath = (value: string) => {
    if (/^\/media(?:\/|$)/.test(value)) return value;
    return '/store' + path(value.replace(/^\/store(?=[/?#]|$)/, '') || '/');
  };
  if (value.startsWith('#') || value.startsWith('?')) return value;
  const normalized = value.replace(/^shopify:\/\//, '/');
  if (normalized.startsWith('/') && !normalized.startsWith('//'))
    return storePath(normalized);
  try {
    const url = new URL(
      normalized.startsWith('//') ? `https:${normalized}` : normalized,
    );
    if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol))
      return '/store';
    if (
      [
        'boostedusa.com',
        'www.boostedusa.com',
        'benchmark-boosted-usa.myshopify.com',
      ].includes(url.hostname)
    )
      return storePath(`${url.pathname}${url.search}${url.hash}`);
    return url.href;
  } catch {
    return '/store';
  }
}
