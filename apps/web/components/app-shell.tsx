import type { ReactNode } from 'react';

import { ShellSidebar } from './shell-sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="appShell">
      <ShellSidebar />
      <main className="workspace">{children}</main>
    </div>
  );
}
