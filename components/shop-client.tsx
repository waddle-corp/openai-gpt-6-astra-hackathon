'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { flushSync } from 'react-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FeedbackCheckout } from '@/components/customer-feedback';
import { recordJourney, linkFeedbackOrder } from '@/lib/feedback-storage';
import {
  cents,
  money,
  normalizeCart,
  setCartQuantity,
  maxQuantity,
  type CartItem,
  type CartVariant,
  type Product,
} from '@/lib/shop';
type ShopContext = {
  items: CartItem[];
  variants: Record<string, CartVariant>;
  ready: boolean;
  add: (id: string, quantity: number) => void;
  update: (id: string, quantity: number) => void;
  clear: () => void;
};
const CartContext = createContext<ShopContext | null>(null);
const storageKey = 'boosted-demo-cart-v1';
const useCart = () => useContext(CartContext)!;

export function CartProvider({
  variants,
  children,
}: {
  variants: Record<string, CartVariant>;
  children: React.ReactNode;
}) {
  const [storage] = useState(() => {
    let cached: string | null = null;
    const listeners = new Set<() => void>();
    return {
      read: () => {
        if (cached === null) {
          try {
            cached = localStorage.getItem(storageKey) ?? '[]';
          } catch {
            cached = '[]';
          }
        }
        return cached;
      },
      save: (next: CartItem[]) => {
        cached = JSON.stringify(next);
        try {
          localStorage.setItem(storageKey, cached);
        } catch {
          /* In-memory cart remains available. */
        }
        listeners.forEach((listener) => listener());
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        const onStorage = (event: StorageEvent) => {
          if (event.key === storageKey || event.key === null) {
            cached = null;
            listener();
          }
        };
        window.addEventListener('storage', onStorage);
        return () => {
          listeners.delete(listener);
          window.removeEventListener('storage', onStorage);
        };
      },
    };
  });
  const snapshot = useSyncExternalStore(
    storage.subscribe,
    storage.read,
    () => null,
  );
  const ready = snapshot !== null;
  const items = useMemo(() => {
    try {
      return normalizeCart(JSON.parse(snapshot ?? '[]'), variants);
    } catch {
      return [];
    }
  }, [snapshot, variants]);
  const getItems = useCallback(() => {
    try {
      return normalizeCart(JSON.parse(storage.read()), variants);
    } catch {
      return [];
    }
  }, [storage, variants]);
  const add = useCallback(
    (id: string, quantity: number) => {
      if (
        !variants[id]?.max ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99
      )
        throw new Error(
          'Choose an available variant and a quantity from 1 to 99.',
        );
      storage.save(
        normalizeCart([...getItems(), { variantId: id, quantity }], variants),
      );
      recordJourney({
        kind: 'cart_added',
        path: window.location.pathname,
        title: variants[id].productTitle,
        image: variants[id].image,
        detail: `${variants[id].title} · quantity ${quantity}`,
      });
    },
    [storage, variants, getItems],
  );
  function update(id: string, quantity: number) {
    storage.save(setCartQuantity(getItems(), id, quantity, variants));
  }
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: 'get_demo_cart',
        description:
          'Read this browser’s demo cart. No Shopify orders or payments are created.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () => ({
          items: getItems().map((item) => ({
            ...item,
            ...variants[item.variantId],
          })),
          totalCents: getItems().reduce(
            (sum, item) => sum + variants[item.variantId].cents * item.quantity,
            0,
          ),
        }),
      },
      {
        name: 'add_to_demo_cart',
        description:
          'Add a catalog variant to this browser’s demo cart. This does not place an order.',
        inputSchema: {
          type: 'object',
          properties: {
            variantId: { type: 'string' },
            quantity: { type: 'integer', minimum: 1, maximum: 99 },
          },
          required: ['variantId', 'quantity'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: (input: unknown) => {
          const value = input as { variantId?: unknown; quantity?: unknown };
          if (
            !value ||
            typeof value.variantId !== 'string' ||
            typeof value.quantity !== 'number'
          )
            throw new Error('variantId and quantity are required.');
          flushSync(() =>
            add(value.variantId as string, value.quantity as number),
          );
          return { items: getItems() };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Optional browser capability. */
      }
    }
    return () => lifecycle.abort();
    // The catalog is an immutable bundled snapshot for this demo.
  }, [variants, add, getItems]);
  return (
    <CartContext.Provider
      value={{
        items,
        variants,
        ready,
        add,
        update,
        clear: () => storage.save([]),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function CartLink() {
  const { items } = useCart();
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <a href="/store/cart" aria-label={`Cart, ${count} items`}>
      Cart{count > 0 ? ` (${count})` : ''}
    </a>
  );
}

export function ProductPurchase({
  product,
  selectedVariant,
  children,
}: {
  product: Product;
  selectedVariant?: string;
  children: React.ReactNode;
}) {
  const { add, items, variants: cartVariants } = useCart();
  const initial =
    product.variants.find(
      (variant) => variant.id.split('/').pop() === selectedVariant,
    ) ??
    product.variants.find((variant) => maxQuantity(variant) > 0) ??
    product.variants[0];
  const [variantId, setVariantId] = useState(initial?.id ?? '');
  const variant =
    product.variants.find((value) => value.id === variantId) ?? initial;
  const [activeImage, setActiveImage] = useState(
    initial?.media[0]?.image?.url ??
      initial?.media[0]?.preview?.image?.url ??
      product.images[0]?.url ??
      '',
  );
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');
  const max = variant ? maxQuantity(variant) : 0;
  const remaining = Math.max(
    0,
    max - (items.find((item) => item.variantId === variantId)?.quantity ?? 0),
  );
  const price = cartVariants[variantId]?.cents ?? 0;
  return (
    <>
      <div className="product-layout">
        <section
          className="product-gallery"
          aria-label={`${product.title} images`}
        >
          {activeImage && (
            <img
              className="product-main-image"
              src={activeImage}
              alt={
                product.images.find((image) => image.url === activeImage)
                  ?.altText || product.title
              }
              width="800"
              height="800"
            />
          )}
          <div className="thumbnails">
            {product.images.map((image, index) => (
              <button
                key={image.url}
                aria-label={`View image ${index + 1}`}
                aria-pressed={activeImage === image.url}
                onClick={() => setActiveImage(image.url)}
              >
                <img
                  src={image.url}
                  alt=""
                  loading="lazy"
                  width="84"
                  height="84"
                />
              </button>
            ))}
          </div>
        </section>
        <section className="product-info">
          <p className="eyebrow">{product.vendor}</p>
          <h1>{product.title}</h1>
          <div className="product-price">
            {money(price)}
            {variant?.compareAtPrice &&
            Number(variant.compareAtPrice) > price / 100 ? (
              <del>{money(cents(variant.compareAtPrice))}</del>
            ) : null}
          </div>
          {variant?.sku && <p className="muted">SKU: {variant.sku}</p>}
          {product.variants.length > 1 && (
            <div className="variant-field">
              <label id="variant-label">
                {product.options.map((option) => option.name).join(' / ')}
              </label>
              <Select
                value={variantId}
                onValueChange={(value) => {
                  if (!value) return;
                  setVariantId(value);
                  setQuantity(1);
                  setMessage('');
                  const next = product.variants.find(
                    (item) => item.id === value,
                  );
                  recordJourney({
                    kind: 'variant_selected',
                    path: window.location.pathname,
                    title: product.title,
                    detail: next?.title,
                  });
                  const image =
                    next?.media[0]?.image?.url ??
                    next?.media[0]?.preview?.image?.url;
                  if (image) setActiveImage(image);
                }}
              >
                <SelectTrigger
                  aria-labelledby="variant-label"
                  className="variant-trigger"
                >
                  <SelectValue>{variant?.title}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {product.variants.map((value) => (
                    <SelectItem key={value.id} value={value.id}>
                      {value.title}
                      {maxQuantity(value) === 0 ? ' — Sold out' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const amount = Math.min(quantity, remaining);
              if (amount < 1) return;
              add(variantId, amount);
              setMessage(`${amount} added to your cart.`);
            }}
          >
            <label className="quantity-label">
              Quantity
              <input
                aria-label="Quantity"
                type="number"
                min="1"
                max={remaining || 1}
                step="1"
                value={quantity}
                disabled={!remaining}
                onChange={(event) =>
                  setQuantity(
                    Math.max(
                      1,
                      Math.min(remaining || 1, Number(event.target.value) || 1),
                    ),
                  )
                }
              />
            </label>
            <Button
              className="button add-to-cart"
              type="submit"
              disabled={!remaining}
            >
              {!max
                ? 'Sold out'
                : !remaining
                  ? 'Maximum quantity in cart'
                  : 'Add to cart'}
            </Button>
          </form>
          <p aria-live="polite" className="cart-feedback">
            {message}
            {message && (
              <>
                {' '}
                <a href="/store/cart">View cart →</a>
              </>
            )}
          </p>
          <p className="muted">
            Demo store. Checkout is simulated; no payment is collected.
          </p>
          {children}
        </section>
      </div>
    </>
  );
}

export function CartPage({ checkout = false }: { checkout?: boolean }) {
  const { items, variants, update, clear, ready } = useCart();
  const [confirmation, setConfirmation] = useState('');
  const [orderError, setOrderError] = useState('');
  const total = items.reduce(
    (sum, item) => sum + variants[item.variantId].cents * item.quantity,
    0,
  );
  if (!ready)
    return (
      <main id="main" className="container">
        <h1>Your cart</h1>
        <p>Loading cart…</p>
      </main>
    );
  if (confirmation)
    return (
      <main id="main" className="container confirmation">
        <h1>Demo order completed</h1>
        <p>Reference: {confirmation}</p>
        <p>No payment was collected and no order was sent to Shopify.</p>
        <a className="button" href="/store/collections/all">
          Continue shopping
        </a>
      </main>
    );
  return (
    <main id="main" className="container">
      <h1>{checkout ? 'Demo checkout' : 'Your cart'}</h1>
      {!items.length ? (
        <>
          <p>Your cart is empty.</p>
          <a href="/store/collections/all" className="button">
            Continue shopping
          </a>
        </>
      ) : (
        <div className="cart-layout">
          <div>
            {items.map((item) => {
              const variant = variants[item.variantId];
              return (
                <article className="cart-row" key={item.variantId}>
                  <a href={`/store/products/${variant.handle}`}>
                    {variant.image ? (
                      <img
                        src={variant.image}
                        alt={variant.productTitle}
                        width="120"
                        height="120"
                      />
                    ) : (
                      <span className="missing-image">No image</span>
                    )}
                  </a>
                  <div>
                    <a href={`/store/products/${variant.handle}`}>
                      <h2>{variant.productTitle}</h2>
                    </a>
                    {variant.title !== 'Default Title' && (
                      <p>{variant.title}</p>
                    )}
                    <p>{money(variant.cents)}</p>
                    {!checkout && (
                      <button
                        className="text-button"
                        onClick={() => update(item.variantId, 0)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div>
                    {checkout ? (
                      <span>Qty {item.quantity}</span>
                    ) : (
                      <input
                        aria-label={`Quantity for ${variant.productTitle}, ${variant.title}`}
                        type="number"
                        min="1"
                        max={variant.max}
                        value={item.quantity}
                        onChange={(event) =>
                          update(
                            item.variantId,
                            Math.max(
                              1,
                              Math.min(
                                variant.max,
                                Number(event.target.value) || 1,
                              ),
                            ),
                          )
                        }
                      />
                    )}
                    <strong>{money(variant.cents * item.quantity)}</strong>
                  </div>
                </article>
              );
            })}
          </div>
          <aside className="cart-summary">
            <h2>{checkout ? 'Order summary' : 'Subtotal'}</h2>
            <p className="total">{money(total)}</p>
            <p className="muted">
              Demo only. No shipping charges, taxes, or payments are processed.
            </p>
            {checkout ? (
              <>
                <FeedbackCheckout orderTotalCents={total} />
                {orderError && <p role="alert">{orderError}</p>}
                <Button
                  className="button"
                  onClick={() => {
                    const reference = `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
                    try {
                      linkFeedbackOrder(reference);
                    } catch {
                      setOrderError(
                        'Unable to link your feedback to this demo order. Allow browser storage and try again.',
                      );
                      return;
                    }
                    setConfirmation(reference);
                    clear();
                  }}
                >
                  Complete demo order
                </Button>
              </>
            ) : (
              <a className="button" href="/store/checkout">
                Continue to demo checkout
              </a>
            )}
            <a
              className="continue-shopping"
              href={checkout ? '/store/cart' : '/store/collections/all'}
            >
              {checkout ? 'Return to cart' : 'Continue shopping'}
            </a>
          </aside>
        </div>
      )}
    </main>
  );
}

export function Newsletter({
  title,
  description,
}: {
  title: string;
  description: React.ReactNode;
}) {
  const [subscribed, setSubscribed] = useState(false);
  return (
    <section className="newsletter">
      <h2>{title}</h2>
      {description}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubscribed(true);
        }}
      >
        <input
          type="email"
          required
          placeholder="Email address"
          aria-label="Email address"
        />
        <Button type="submit" className="button">
          Subscribe
        </Button>
      </form>
      <p className="muted" aria-live="polite">
        {subscribed
          ? 'Thanks! This demo does not send or store email addresses.'
          : 'Demo signup — no email will be sent.'}
      </p>
    </section>
  );
}
