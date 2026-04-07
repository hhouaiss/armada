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
  title: 'Armada HQ — Déployez votre équipe IA',
  description:
    'Armada orchestre des agents IA autonomes qui automatisent vos opérations métier — recherche, finance, support, marketing. Opérationnel en 5 minutes, sans compétence technique.',
  keywords: [
    'agents IA',
    'automatisation entreprise',
    'intelligence artificielle',
    'équipe IA',
    'automatisation opérations',
    'agents autonomes',
    'plateforme agentique',
    'IA entreprise',
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
    title: 'Armada HQ — Déployez votre équipe IA',
    description:
      'Des agents IA autonomes qui exécutent vos opérations métier. Votre entreprise tourne, même la nuit.',
    siteName: 'Armada HQ',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Armada HQ — Déployez votre équipe IA',
    description:
      'Des agents IA autonomes qui exécutent vos opérations métier. Votre entreprise tourne, même la nuit.',
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
