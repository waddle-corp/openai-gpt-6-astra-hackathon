import raw from '@/data/catalog.json';
import { imageUrl } from './source';
import {
  cents,
  maxQuantity,
  type Product,
  type Collection,
  type CartVariant,
} from './shop';
export const catalog = raw as unknown as {
  products: Product[];
  collections: Collection[];
};
export const products = catalog.products.filter(
  (product) => product.status === 'ACTIVE',
);
export const byHandle = new Map(
  products.map((product) => [product.handle, product]),
);
export const byId = new Map(products.map((product) => [product.id, product]));
export function collectionProducts(handle: string) {
  if (handle === 'all') return products;
  return (
    catalog.collections
      .find((collection) => collection.handle === handle)
      ?.products.flatMap((reference) =>
        byId.get(reference.id) ? [byId.get(reference.id)!] : [],
      ) ?? []
  );
}
export const cartVariants = Object.fromEntries(
  products.flatMap((product) =>
    product.variants.map((variant) => [
      variant.id,
      {
        id: variant.id,
        title: variant.title,
        productTitle: product.title,
        handle: product.handle,
        image: imageUrl(variant.media[0]?.image?.url ?? product.images[0]?.url),
        cents: cents(variant.price),
        max: maxQuantity(variant),
      } satisfies CartVariant,
    ]),
  ),
);
