import sanitizeHtml from 'sanitize-html';
import themeData from '@/data/storefront-config.json';
import contentData from '@/data/content.json';
import assets from '@/data/asset-map.json';
import { CartLink } from '@/components/shop-client';
import { localLink } from './shop';
export { localLink } from './shop';

export type Settings = Record<string, string | number | boolean>;
export type Block = { id: string; type: string; settings: Settings };
export type Section = Block & { blocks: Block[] };
export type MenuItem = {
  id: string;
  title: string;
  url: string;
  items: MenuItem[];
};
export const theme = themeData as unknown as {
  header: { sections: Section[] };
  footer: { sections: Section[] };
  home: { sections: Section[] };
};
export const content = contentData;
const fileUrls = new Map(
  content.files.flatMap((file) =>
    file.image?.url
      ? ([
          [
            decodeURIComponent(
              new URL(file.image.url).pathname.split('/').pop()!,
            ),
            file.image.url,
          ],
        ] as [string, string][])
      : [],
  ),
);

export function imageUrl(value?: string) {
  if (!value) return '';
  const bundled = (assets as Record<string, string>)[value];
  if (bundled) return bundled;
  if (value.startsWith('shopify://shop_images/'))
    return fileUrls.get(value.slice('shopify://shop_images/'.length)) ?? '';
  if (value.startsWith('//')) return `https:${value}`;
  return value.startsWith('https://') || value.startsWith('/media/')
    ? value
    : '';
}

export function cleanHtml(value: string = '') {
  return sanitizeHtml(value, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2'],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
      td: ['rowspan', 'colspan'],
      th: ['rowspan', 'colspan', 'scope'],
      '*': ['class'],
    },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    transformTags: {
      a: (_tag, attributes) => ({
        tagName: 'a',
        attribs: { ...attributes, href: localLink(attributes.href) },
      }),
      img: (_tag, attributes) => ({
        tagName: 'img',
        attribs: {
          ...attributes,
          src: imageUrl(attributes.src),
          loading: 'lazy',
        },
      }),
    },
  });
}
export function Html({
  html,
  className = '',
}: {
  html?: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: cleanHtml(html) }}
    />
  );
}
export const text = (value: unknown) =>
  typeof value === 'string' ? value : '';
export const header = theme.header.sections.find(
  (section) => section.type === 'header-classic',
)!;
export const announcement = theme.header.sections.find(
  (section) => section.type === 'announcement-bar',
)!;
export const navigation =
  content.menus.find((menu) => menu.handle === header.settings.main_linklist)
    ?.items ?? [];

export function Navigation({ items }: { items: MenuItem[] }) {
  return (
    <>
      {items.map((item) =>
        item.items.length ? (
          <details className="nav-menu" key={item.id}>
            <summary>{item.title}</summary>
            <div className="nav-children">
              <a href={localLink(item.url)}>All {item.title}</a>
              <Navigation items={item.items} />
            </div>
          </details>
        ) : (
          <a key={item.id} href={localLink(item.url)}>
            {item.title}
          </a>
        ),
      )}
    </>
  );
}

export function StoreHeader() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="announcement">
        <Html html={text(announcement.settings.text)} />
      </div>
      <header className="store-header">
        <a href="/store" aria-label="Boosted USA home">
          <img
            className="brand-logo"
            src={imageUrl(text(header.settings.logo))}
            alt="Boosted USA"
            width="300"
            height="55"
          />
        </a>
        <div className="header-actions">
          <a href="/store/search" aria-label="Search products">
            Search
          </a>
          <CartLink />
        </div>
        <nav className="desktop-nav" aria-label="Main navigation">
          <Navigation items={navigation} />
        </nav>
        <details className="mobile-nav">
          <summary>Menu</summary>
          <nav aria-label="Mobile navigation">
            <Navigation items={navigation} />
          </nav>
        </details>
      </header>
    </>
  );
}

export function StoreFooter() {
  const footer = theme.footer.sections.find(
    (section) => section.type === 'footer-classic',
  )!;
  return (
    <footer className="store-footer">
      <div className="footer-columns">
        {footer.blocks.map((block) => (
          <div key={block.id}>
            {block.type === 'logo' ? (
              <img
                src={imageUrl(text(block.settings.logo))}
                alt="Boosted USA"
                width="160"
                height="160"
              />
            ) : block.type === 'link_list' ? (
              <>
                <h2>Explore</h2>
                <nav aria-label="Footer navigation">
                  <Navigation
                    items={
                      content.menus.find(
                        (menu) => menu.handle === block.settings.menu,
                      )?.items ?? []
                    }
                  />
                </nav>
              </>
            ) : (
              <>
                <h2>{block.settings.title}</h2>
                <Html html={text(block.settings.content)} />
              </>
            )}
          </div>
        ))}
      </div>
      <div className="copyright">
        <span>© {new Date().getFullYear()} Boosted USA</span>
        <Html html={text(footer.settings.copyright_text)} />
      </div>
    </footer>
  );
}

export function Promotions({ section }: { section: Section }) {
  return (
    <section
      className="promotions"
      style={{
        gridTemplateColumns: `repeat(${section.blocks.length}, minmax(0, 1fr))`,
      }}
    >
      {section.blocks.map((block) => (
        <a
          className={`promotion ${block.settings.image ? '' : 'promotion-placeholder'}`}
          key={block.id}
          href={
            block.settings.link
              ? localLink(text(block.settings.link))
              : undefined
          }
        >
          {block.settings.image ? (
            <img
              className="promotion-photo"
              src={imageUrl(text(block.settings.image))}
              alt=""
              fetchPriority="high"
            />
          ) : null}
          <div className="promotion-copy">
            <Html
              className="promotion-title"
              html={text(block.settings.title)}
            />
            <Html html={text(block.settings.text)} />
          </div>
        </a>
      ))}
    </section>
  );
}
