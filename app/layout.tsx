import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import AppHeader from '@/components/AppHeader';
import { SessionMonitor } from '@/components/SessionMonitor';
import { auth } from '@/lib/auth';

import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'No Stress Planner',
  description: 'Plan group activities without the fear of rejection.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'NoStressPlanner',
  },
  icons: {
    icon: '/icons/icon-192x192.png',
    apple: '/icons/icon-192x192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#3b82f6',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Get the session from NextAuth for SSR
  const session = await auth();

  return (
    <html lang='en'>
      <head>
        <link rel='icon' href='/favicon.ico' />
        <link rel='manifest' href='/manifest.json' />
        <meta name='theme-color' content='#3b82f6' />
        <meta name='apple-mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-status-bar-style' content='default' />
        <meta name='apple-mobile-web-app-title' content='NoStressPlanner' />
        <link rel='apple-touch-icon' href='/icons/icon-192x192.png' />
      </head>
      <body className='bg-white text-slate-900'>
        <Providers session={session}>
          <SessionMonitor />
          <AppHeader />
          <div className='min-h-screen'>{children}</div>
        </Providers>
      </body>
    </html>
  );
}
