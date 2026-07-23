'use client';

import {
  CalendarDays,
  CalendarRange,
  ClipboardList,
  ClipboardPlus,
  FileSignature,
  CircleDollarSign,
  HeartPulse,
  HandCoins,
  House,
  MessagesSquare,
  BedDouble,
  Library,
  Settings,
  UserRoundCog,
  TableProperties,
  ShieldCheck,
  TentTree,
  Users,
  Tags,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavigationItem {
  exact?: boolean;
  href: string;
  icon: LucideIcon;
  label: string;
}

const adminNavigation: NavigationItem[] = [
  { href: '/', icon: ClipboardList, label: 'Overview' },
  { href: '/sessions', icon: CalendarDays, label: 'Sessions' },
  { href: '/housing', icon: BedDouble, label: 'Housing' },
  { href: '/reports', icon: TableProperties, label: 'Reports' },
  { href: '/communications', icon: MessagesSquare, label: 'Communications' },
  { href: '/families', icon: Users, label: 'Families' },
  { href: '/seasons', icon: CalendarRange, label: 'Seasons' },
  { href: '/programs', icon: Library, label: 'Programs' },
  { href: '/forms', icon: FileSignature, label: 'Forms' },
  { href: '/orders', icon: ShoppingCart, label: 'Orders' },
  { href: '/pricing', icon: Tags, label: 'Pricing' },
  { href: '/financial-assistance', icon: HandCoins, label: 'Assistance' },
  { href: '/payments', icon: CircleDollarSign, label: 'Payments' },
  { href: '/health-records', icon: HeartPulse, label: 'Health' },
];

const portalNavigation: NavigationItem[] = [
  { exact: true, href: '/portal', icon: House, label: 'My Family' },
  { href: '/portal/register', icon: ClipboardPlus, label: 'Register' },
  { href: '/portal/readiness', icon: HeartPulse, label: 'Readiness' },
  { href: '/portal/health', icon: ShieldCheck, label: 'Health records' },
  { href: '/portal/forms', icon: FileSignature, label: 'Forms & waivers' },
  { href: '/portal/assistance', icon: HandCoins, label: 'Assistance' },
];

export function ShellSidebar() {
  const pathname = usePathname();
  const isPortal = pathname.startsWith('/portal');
  const navigation = isPortal ? portalNavigation : adminNavigation;

  return (
    <aside className={`sidebar${isPortal ? ' sidebarPortal' : ''}`}>
      <Link
        className="brand"
        href={isPortal ? '/portal' : '/'}
        aria-label={isPortal ? 'Parent portal' : 'Camp Registration overview'}
      >
        <span className="brandMark" aria-hidden="true">
          <TentTree size={22} strokeWidth={2} />
        </span>
        <span>
          <strong>Camp Registration</strong>
          <small>{isPortal ? 'Parent portal' : 'Operations'}</small>
        </span>
      </Link>

      <nav aria-label="Primary navigation">
        {navigation.map(({ exact, href, icon: Icon, label }) => {
          const active = href === '/' || exact ? pathname === href : pathname.startsWith(href);
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

      <nav className="sidebarFooter" aria-label="Secondary navigation">
        <Link
          aria-current={pathname.startsWith('/account') ? 'page' : undefined}
          className="navLink"
          href="/account/security"
          title="Account"
        >
          <UserRoundCog size={18} aria-hidden="true" />
          <span>Account</span>
        </Link>
        {isPortal ? (
          <Link className="navLink settingsLink" href="/" title="Staff workspace">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>Staff workspace</span>
          </Link>
        ) : (
          <>
            <Link className="navLink" href="/portal" title="Parent portal">
              <House size={18} aria-hidden="true" />
              <span>Parent portal</span>
            </Link>
            <Link
              aria-current={pathname === '/settings' ? 'page' : undefined}
              className="navLink settingsLink"
              href="/settings"
              title="Settings"
            >
              <Settings size={18} aria-hidden="true" />
              <span>Settings</span>
            </Link>
          </>
        )}
      </nav>
    </aside>
  );
}
