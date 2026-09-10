import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Html, imageUrl } from '@/lib/source';
import { cents, money, type Product } from '@/lib/shop';
export function ProductCard({ product }: { product: Product }) {
  const prices = product.variants.map((variant) => cents(variant.price));
  const price = prices.length ? Math.min(...prices) : 0;
  const compare = product.variants.find(
    (variant) => cents(variant.price) === price,
  )?.compareAtPrice;
  const soldOut = product.variants.every(
    (variant) => !variant.availableForSale,
  );
  return (
    <article className="product-card">
      <a href={`/store/products/${product.handle}`}>
        <div className="card-photo">
          {product.images[0] ? (
            <img
              src={imageUrl(product.images[0].url)}
              alt={product.images[0].altText || product.title}
              loading="lazy"
              width="480"
              height="480"
            />
          ) : (
            <span className="missing-image">No image available</span>
          )}
          {soldOut && <span className="product-badge">Sold out</span>}
          {!soldOut && compare && cents(compare) > price && (
            <span className="product-badge sale">Sale</span>
          )}
        </div>
        <h3>{product.title}</h3>
        <p className="card-price">
          {Math.max(...prices) > price ? 'From ' : ''}
          {money(price)}
          {compare && cents(compare) > price ? (
            <del>{money(cents(compare))}</del>
          ) : null}
        </p>
      </a>
    </article>
  );
}
export function ProductListing({
  title,
  description,
  items,
  page = 1,
  base,
}: {
  title: string;
  description?: string;
  items: Product[];
  page?: number;
  base: string;
}) {
  const pages = Math.max(1, Math.ceil(items.length / 48));
  const current = Math.max(1, Math.min(pages, page));
  const pageUrl = (value: number) =>
    `${base}${base.includes('?') ? '&' : '?'}page=${value}`;
  return (
    <>
      <div className="listing-heading">
        <h1>{title}</h1>
        {description && <Html className="rich-text" html={description} />}
        <p className="muted">{items.length} products</p>
      </div>
      {!items.length ? (
        <p>
          No products found.{' '}
          <a href="/store/collections/all">Browse all products</a>
        </p>
      ) : (
        <div className="product-grid">
          {items.slice((current - 1) * 48, current * 48).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
      {pages > 1 && (
        <Pagination className="catalog-pagination">
          <PaginationContent>
            {current > 1 && (
              <PaginationItem>
                <PaginationPrevious href={pageUrl(current - 1)} />
              </PaginationItem>
            )}
            {Array.from({ length: pages }, (_, index) => index + 1).map(
              (value) => (
                <PaginationItem key={value}>
                  <PaginationLink
                    href={pageUrl(value)}
                    isActive={current === value}
                  >
                    {value}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            {current < pages && (
              <PaginationItem>
                <PaginationNext href={pageUrl(current + 1)} />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}
    </>
  );
}
