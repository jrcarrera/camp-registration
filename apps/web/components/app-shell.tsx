'use client';

import {
  CalendarDays,
  ClipboardList,
  HeartPulse,
  Library,
  Settings,
  TentTree,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const navigation = [
  { href: '/', icon: ClipboardList, label: 'Overview' },
  { href: '/sessions', icon: CalendarDays, label: 'Sessions' },
  { href: '/programs', icon: Library, label: 'Programs' },
  { href: '/#campers', icon: Users, label: 'Campers' },
  { href: '/#health', icon: HeartPulse, label: 'Health' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="appShell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Camp Registration overview">
          <span className="brandMark" aria-hidden="true">
            <TentTree size={22} strokeWidth={2} />
          </span>
          <span>
            <strong>Camp Registration</strong>
            <small>Operations</small>
          </span>
        </Link>

        <nav aria-label="Primary navigation">
          {navigation.map(({ href, icon: Icon, label }) => {
            const active = label === 'Overview' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                className="navLink"
                href={href}
                aria-current={active ? 'page' : undefined}
                title={label}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <Link className="navLink settingsLink" href="/#settings" title="Settings">
          <Settings size={18} aria-hidden="true" />
          <span>Settings</span>
        </Link>
      </aside>

      <main className="workspace">{children}</main>
    </div>
  );
}
