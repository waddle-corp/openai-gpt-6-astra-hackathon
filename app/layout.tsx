import type { Metadata } from 'next';
import { StoreHeader, StoreFooter } from '@/lib/source';
import { CartProvider } from '@/components/shop-client';
import { cartVariants } from '@/lib/catalog';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Boosted USA — Demo Store', template: '%s | Boosted USA' },
  icons: {
    icon: '/media/storefront/buy-boosted-boards-online-electric-skateboard-2.png',
  },
  description:
    'Electric bikes, skateboards, scooters, and accessories. Boosted USA demo storefront.',
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <CartProvider variants={cartVariants}>
          <StoreHeader />
          {children}
          <StoreFooter />
        </CartProvider>
      </body>
    </html>
  );
}
