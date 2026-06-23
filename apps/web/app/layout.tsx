import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppShell } from '../components/app-shell';

import './globals.css';

export const metadata: Metadata = {
  description: 'Camp registration and operations workspace.',
  title: 'Camp Registration',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
