'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { ShellSidebar } from './shell-sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const authenticationPage =
    pathname === '/sign-in' ||
    pathname === '/recover-account' ||
    pathname === '/accept-invite' ||
    (pathname.startsWith('/o/') && pathname.endsWith('/join'));
  if (authenticationPage) {
    return <main className="authWorkspace">{children}</main>;
  }
  return (
    <div className="appShell">
      <ShellSidebar />
      <main className="workspace">{children}</main>
    </div>
  );
}
