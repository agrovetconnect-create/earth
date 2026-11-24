import { Compass, History, Info, Map as MapIcon, MapPin, MessageCircleQuestion, Scale, Search, ShieldAlert, ShieldCheck } from 'lucide-react-native';
import type { ComponentType } from 'react';

/**
 * View registry for the Earth Talk mobile shell. Mirrors the web app's
 * navigation groups; on mobile the sidebar renders as an overlay drawer.
 */

export type View =
  | 'explore'
  | 'sites'
  | 'community'
  | 'mine'
  | 'my-map'
  | 'history'
  | 'about'
  | 'how-it-works'
  | 'terms'
  | 'privacy';

export interface NavItem {
  id: View;
  label: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  /** Signed-in-only sections. */
  requiresAuth?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'explore',
    label: 'Explore',
    items: [
      { id: 'explore', label: 'Explore map', icon: Compass },
      { id: 'sites', label: 'Geoscience sites', icon: MapPin },
      { id: 'my-map', label: 'My Map', icon: MapIcon },
    ],
  },
  {
    id: 'community',
    label: 'Community',
    items: [
      { id: 'community', label: 'Investigations', icon: MessageCircleQuestion },
      { id: 'mine', label: 'My Earth Talk', icon: ShieldCheck, requiresAuth: true },
    ],
  },
  {
    id: 'learn',
    label: 'Learn & support',
    items: [
      { id: 'history', label: 'History', icon: History },
      { id: 'about', label: 'About & Guide', icon: Info },
    ],
  },
  {
    id: 'legal',
    label: 'Legal & Transparency',
    items: [
      { id: 'terms', label: 'Terms of Service', icon: Scale },
      { id: 'privacy', label: 'Privacy Policy', icon: ShieldAlert },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export function findNavItem(view: View): NavItem | undefined {
  return ALL_NAV_ITEMS.find((item) => item.id === view);
}

export function navItemIcon(view: View): ComponentType<{ size?: number; color?: string; strokeWidth?: number }> {
  return findNavItem(view)?.icon ?? (view === 'how-it-works' ? Info : Search);
}

export function navItemLabel(view: View): string {
  return findNavItem(view)?.label ?? (view === 'how-it-works' ? 'How it works' : 'Earth Talk');
}

export function isAuthOnlyView(view: View): boolean {
  return findNavItem(view)?.requiresAuth ?? false;
}
