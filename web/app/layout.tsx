import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Armada HQ — L\'équipe IA de votre boutique Shopify',
  description:
    'Armada déploie une escouade d\'agents IA qui font tourner votre boutique Shopify — stock, SEO, marketing, support, finances. Opérationnel en 5 minutes, sans compétence technique.',
  keywords: [
    'agents IA e-commerce',
    'automatisation Shopify',
    'IA boutique Shopify',
    'agents IA marchand',
    'gestion boutique IA',
    'automatisation e-commerce',
    'plateforme agentique e-commerce',
    'IA gestion stock',
    'ArmadaOS',
    'Armada HQ',
  ],
  authors: [{ name: 'Armada' }],
  creator: 'Armada',
  publisher: 'Armada',
  metadataBase: new URL('https://armada-hq.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://armada-hq.com',
    title: 'Armada HQ — L\'équipe IA de votre boutique Shopify',
    description:
      'Une escouade d\'agents IA qui fait tourner votre boutique Shopify. Stock, SEO, marketing, support — même la nuit.',
    siteName: 'Armada HQ',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Armada HQ — L\'équipe IA de votre boutique Shopify',
    description:
      'Une escouade d\'agents IA qui fait tourner votre boutique Shopify. Stock, SEO, marketing, support — même la nuit.',
    creator: '@armadahq',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={inter.variable}>
        <ThemeProvider defaultTheme="system" storageKey="storeteam-theme">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
