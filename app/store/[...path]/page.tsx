import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { catalog, products, byHandle, collectionProducts } from '@/lib/catalog';
import { Html, content, imageUrl } from '@/lib/source';
import { ProductListing, ProductCard } from '@/components/catalog-view';
import { ProductPurchase, CartPage } from '@/components/shop-client';
import { cents, type Product } from '@/lib/shop';
import blogData from '@/data/blogs.json';
type Props = {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  if (path[0] === 'products') {
    const product = byHandle.get(path[1]);
    return {
      title: product?.seo.title || product?.title || 'Product not found',
      description:
        product?.seo.description || product?.description.slice(0, 155),
    };
  }
  if (path[0] === 'collections')
    return {
      title:
        catalog.collections.find((collection) => collection.handle === path[1])
          ?.title || 'All products',
    };
  if (path[0] === 'pages')
    return {
      title:
        content.pages.find((page) => page.handle === path[1])?.title ||
        'Page not found',
    };
  if (path[0] === 'blogs')
    return {
      title: path[2]
        ? blogData.articles.nodes.find((article) => article.handle === path[2])
            ?.title || 'Article not found'
        : blogData.blogs.nodes.find((blog) => blog.handle === path[1])?.title ||
          'News',
    };
  return {
    title:
      path[0] === 'cart'
        ? 'Your cart'
        : path[0] === 'checkout'
          ? 'Demo checkout'
          : 'Search',
  };
}
function prepared(product: Product): Product {
  return {
    ...product,
    images: product.images.map((image) => ({
      ...image,
      url: imageUrl(image.url),
    })),
    variants: product.variants.map((variant) => ({
      ...variant,
      media: variant.media.map((media) => ({
        ...media,
        image: media.image
          ? { ...media.image, url: imageUrl(media.image.url) }
          : undefined,
        preview: media.preview?.image
          ? {
              image: {
                ...media.preview.image,
                url: imageUrl(media.preview.image.url),
              },
            }
          : undefined,
      })),
    })),
  };
}
export default async function StoreRoute({ params, searchParams }: Props) {
  const { path } = await params;
  const query = await searchParams;
  if (path.join('/') === 'products/boosted-rev')
    redirect('/store/collections/electric-scooters');
  if (
    path[0] === 'collections' &&
    path[2] === 'products' &&
    path.length === 4
  ) {
    const queryString = new URLSearchParams(
      Object.entries(query).flatMap(([key, value]) =>
        (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(
          (item) => [key, item],
        ),
      ),
    ).toString();
    redirect(
      `/store/products/${path[3]}${queryString ? `?${queryString}` : ''}`,
    );
  }
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  if (path[0] === 'products' && path.length === 2) {
    const product = byHandle.get(path[1]);
    if (!product) notFound();
    const related = product.collections.length
      ? collectionProducts(product.collections[0].handle)
          .filter((item) => item.id !== product.id)
          .slice(0, 4)
      : [];
    return (
      <main id="main" className="container">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <a href="/store">Home</a>
          <span>/</span>
          <a href="/store/collections/all">Products</a>
          <span>/</span>
          <span>{product.title}</span>
        </nav>
        <ProductPurchase
          product={prepared(product)}
          selectedVariant={
            typeof query.variant === 'string' ? query.variant : undefined
          }
        >
          <div className="rich-text product-description">
            <Html html={product.descriptionHtml} />
          </div>
        </ProductPurchase>
        {related.length > 0 && (
          <section className="related-products">
            <h2>You may also like</h2>
            <div className="product-grid">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        )}
      </main>
    );
  }
  if (path[0] === 'collections' && path.length === 1)
    return (
      <main id="main" className="container">
        <h1>Collections</h1>
        <div className="collection-grid">
          {catalog.collections.map((collection) => (
            <a
              href={`/store/collections/${collection.handle}`}
              key={collection.id}
            >
              {collection.image && (
                <img
                  src={imageUrl(collection.image.url)}
                  alt={collection.image.altText || collection.title}
                  loading="lazy"
                />
              )}
              <h2>{collection.title}</h2>
              <p>{collection.products.length} products</p>
            </a>
          ))}
        </div>
      </main>
    );
  if (path[0] === 'collections' && path.length <= 3) {
    const collection = catalog.collections.find(
      (value) => value.handle === path[1],
    );
    if (!collection && path[1] !== 'all') notFound();
    let items = collectionProducts(path[1]);
    if (path[2]) {
      const tag = path[2].toLowerCase();
      items = items.filter((product) =>
        product.tags.some(
          (value) => value.toLowerCase().replace(/\s+/g, '-') === tag,
        ),
      );
    }
    if (
      query.sort_by === 'price-ascending' ||
      query.sort_by === 'price-descending'
    ) {
      const direction = query.sort_by === 'price-ascending' ? 1 : -1;
      items = [...items].sort(
        (a, b) =>
          direction *
          (Math.min(...a.variants.map((v) => cents(v.price))) -
            Math.min(...b.variants.map((v) => cents(v.price)))),
      );
    }
    return (
      <main id="main" className="container">
        <ProductListing
          title={collection?.title || 'All products'}
          description={collection?.descriptionHtml}
          items={items}
          page={page}
          base={`/store/${path.join('/')}${query.sort_by ? `?sort_by=${encodeURIComponent(String(query.sort_by))}` : ''}`}
        />
      </main>
    );
  }
  if (path[0] === 'pages' && path.length === 2) {
    const sourcePage = content.pages.find(
      (value) => value.handle === path[1] && value.isPublished,
    );
    if (!sourcePage) notFound();
    return (
      <main id="main" className="container content-page">
        <h1>{sourcePage.title}</h1>
        <Html className="rich-text" html={sourcePage.body} />
      </main>
    );
  }
  if (path[0] === 'search' && path.length === 1) {
    const term = typeof query.q === 'string' ? query.q : '';
    const matches = term.trim()
      ? products.filter((product) =>
          `${product.title} ${product.vendor} ${product.productType} ${product.tags.join(' ')}`
            .toLowerCase()
            .includes(term.trim().toLowerCase()),
        )
      : [];
    return (
      <main id="main" className="container">
        <h1>Search</h1>
        <form action="/store/search" className="search-form">
          <input
            type="search"
            name="q"
            defaultValue={term}
            placeholder="Search products"
            aria-label="Search products"
          />
          <button className="button" type="submit">
            Search
          </button>
        </form>
        {term && (
          <ProductListing
            title={`Results for “${term}”`}
            items={matches}
            page={page}
            base={`/store/search?q=${encodeURIComponent(term)}`}
          />
        )}
      </main>
    );
  }
  if (path[0] === 'blogs' && path.length === 2) {
    const blog = blogData.blogs.nodes.find((value) => value.handle === path[1]);
    if (!blog) notFound();
    const articles = blogData.articles.nodes.filter(
      (article) =>
        article.blog.handle === blog.handle &&
        article.publishedAt &&
        new Date(article.publishedAt) <= new Date(),
    );
    return (
      <main id="main" className="container content-page">
        <h1>{blog.title}</h1>
        {articles.length ? (
          articles.map((article) => (
            <article key={article.id} className="article-preview">
              <a href={`/store/blogs/${blog.handle}/${article.handle}`}>
                <h2>{article.title}</h2>
                {article.image && (
                  <img
                    src={imageUrl(article.image.url)}
                    alt={article.image.altText || article.title}
                  />
                )}
              </a>
              <Html html={article.summary} />
              <a href={`/store/blogs/${blog.handle}/${article.handle}`}>
                Read more →
              </a>
            </article>
          ))
        ) : (
          <p>No articles published yet.</p>
        )}
      </main>
    );
  }
  if (path[0] === 'blogs' && path.length === 3) {
    const article = blogData.articles.nodes.find(
      (value) =>
        value.blog.handle === path[1] &&
        value.handle === path[2] &&
        value.publishedAt &&
        new Date(value.publishedAt) <= new Date(),
    );
    if (!article) notFound();
    return (
      <main id="main" className="container content-page">
        <h1>{article.title}</h1>
        <Html className="rich-text" html={article.body} />
      </main>
    );
  }
  if (path.length === 1 && (path[0] === 'cart' || path[0] === 'checkout'))
    return <CartPage checkout={path[0] === 'checkout'} />;
  notFound();
}
