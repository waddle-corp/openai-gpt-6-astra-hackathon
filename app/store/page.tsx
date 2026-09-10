import {
  theme,
  Promotions,
  imageUrl,
  localLink,
  text,
  Html,
} from '@/lib/source';
import { collectionProducts } from '@/lib/catalog';
import { ProductCard } from '@/components/catalog-view';
import { Newsletter } from '@/components/shop-client';
export default function Home() {
  return (
    <main id="main">
      {theme.home.sections.map((section) => {
        const settings = section.settings;
        switch (section.type) {
          case 'index__featured-promotions':
            return <Promotions key={section.id} section={section} />;
          case 'index__gallery':
            return (
              <section
                key={section.id}
                className="press-logos"
                aria-label="Featured in"
              >
                {section.blocks.map((block) => (
                  <img
                    key={block.id}
                    src={imageUrl(text(block.settings.image))}
                    alt={text(block.settings.image)
                      .split('/')
                      .pop()
                      ?.replace(/[-_]/g, ' ')
                      .replace(/\.png$/, '')}
                    width="250"
                    height="50"
                  />
                ))}
              </section>
            );
          case 'index__featured-collection':
            return (
              <section className="featured-products" key={section.id}>
                <h2>
                  <a href={`/store/collections/${settings.collection}`}>
                    {settings.title}
                  </a>
                </h2>
                <div
                  className="product-carousel"
                  style={
                    {
                      '--columns': Number(settings.products_per),
                    } as React.CSSProperties
                  }
                >
                  {collectionProducts(text(settings.collection))
                    .slice(0, Number(settings.products_limit))
                    .map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                </div>
              </section>
            );
          case 'index__heading':
            return (
              <section key={section.id} className="brand-intro">
                <Html className="intro-heading" html={text(settings.title)} />
                <Html html={text(settings.subheading)} />
              </section>
            );
          case 'index__image-with-text':
            return (
              <section key={section.id} className="image-text">
                {section.blocks.map((block) =>
                  block.type === 'image' ? (
                    <a
                      key={block.id}
                      aria-label="View collection"
                      href={
                        block.settings.image_link
                          ? localLink(text(block.settings.image_link))
                          : undefined
                      }
                    >
                      <img
                        src={imageUrl(text(block.settings.image))}
                        alt=""
                        loading="lazy"
                        width="600"
                        height="600"
                      />
                    </a>
                  ) : (
                    <div key={block.id} className="image-text-copy">
                      <h2>{block.settings.title}</h2>
                      <Html
                        className="rich-text"
                        html={text(block.settings.text)}
                      />
                      <a
                        className="button"
                        href={localLink(text(block.settings.link))}
                      >
                        {block.settings.button_label}
                      </a>
                    </div>
                  ),
                )}
              </section>
            );
          case 'index__image-with-text-overlay':
            return (
              <section
                key={section.id}
                className={`full-banner ${settings.text_vertical_position === 'top' ? 'banner-top' : ''}`}
                style={{ color: text(settings.heading_color) }}
              >
                <img
                  src={imageUrl(text(settings.image))}
                  alt=""
                  loading="lazy"
                  width="1600"
                  height="900"
                />
                <div className="banner-copy">
                  <Html html={text(settings.pretext)} />
                  <h2>{settings.title}</h2>
                  <Html html={text(settings.subtitle)} />
                  {[1, 2].map((index) =>
                    settings[`button_${index}`] ? (
                      <a
                        key={index}
                        href={localLink(text(settings[`button_${index}_link`]))}
                        className="button"
                      >
                        {settings[`button_${index}`]}
                      </a>
                    ) : null,
                  )}
                </div>
              </section>
            );
          case 'index__html': {
            const videoId = text(settings.html_content).match(
              /youtube\.com\/embed\/([\w-]+)/,
            )?.[1];
            return videoId ? (
              <section className="store-video" key={section.id}>
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                  title="Boosted USA riding video"
                  loading="lazy"
                  allowFullScreen
                />
              </section>
            ) : null;
          }
          case 'index__newsletter':
            return (
              <Newsletter
                key={section.id}
                title={text(settings.newsletter_title)}
                description={<Html html={text(settings.newsletter_richtext)} />}
              />
            );
          default:
            return null;
        }
      })}
    </main>
  );
}
