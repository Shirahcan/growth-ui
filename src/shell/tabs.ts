/** The Growth area's tabs, in order (plan G2c step 3). A host may hide tabs it has not mounted yet. */
export type GrowthTabKey =
  | 'overview'
  | 'plan'
  | 'blog'
  | 'newsletter'
  | 'announcements'
  | 'audience'
  | 'pages'
  | 'results'
  | 'settings';

export interface GrowthTab {
  key: GrowthTabKey;
  label: string;
}

export const GROWTH_TABS: readonly GrowthTab[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'plan', label: 'Plan' },
  { key: 'blog', label: 'Blog' },
  { key: 'newsletter', label: 'Newsletter' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'audience', label: 'Audience' },
  { key: 'pages', label: 'Landing pages' },
  { key: 'results', label: 'Results' },
  { key: 'settings', label: 'Settings' },
];

/** The tabs a host shows: all of them, or only those it lists, always in the canonical order. */
export function tabsFor(enabled?: readonly GrowthTabKey[]): GrowthTab[] {
  return enabled === undefined ? [...GROWTH_TABS] : GROWTH_TABS.filter((t) => enabled.includes(t.key));
}
