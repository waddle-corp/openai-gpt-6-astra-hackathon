import type { Metadata } from 'next';
import { StoreHeader, StoreFooter } from '@/lib/source';
import { CartProvider } from '@/components/shop-client';
import { cartVariants } from '@/lib/catalog';
import './store.css';
export const metadata: Metadata = {
  title: { default: 'Boosted USA — Demo Store', template: '%s | Boosted USA' },
  icons: {
    icon: '/media/storefront/buy-boosted-boards-online-electric-skateboard-2.png',
  },
  description:
    'Electric bikes, skateboards, scooters, and accessories. Boosted USA demo storefront.',
  robots: { index: false, follow: false },
};
export default function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="store-scope">
      <CartProvider variants={cartVariants}>
        <StoreHeader />
        {children}
        <StoreFooter />
      </CartProvider>
    </div>
  );
}
