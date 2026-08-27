import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: 'Wishline — Steam wishlist momentum',
  description: 'See your Steam wishlist momentum without opening a dashboard.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Wishline — Steam wishlist momentum',
    description: 'Track momentum, catch spikes, and celebrate every wishlist milestone.',
    images: [{ url: '/og.png', width: 1536, height: 1024, alt: 'Wishline product preview' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wishline — Steam wishlist momentum',
    description: 'Track momentum, catch spikes, and celebrate every wishlist milestone.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#181a1d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
