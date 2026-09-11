/**
 * Navigation structure — Goose On The Go v2 design.
 * Profile hub groups and sub-screen routes.
 */

import type { IconName } from './icons';

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  /** Route path for Expo Router */
  route: string;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

/** Screens accessible from the Profile hub */
export const PROFILE_NAV: NavGroup[] = [
  {
    group: 'GOOSE',
    items: [
      { id: 'models', label: 'AI Models', icon: 'models', route: '/(stack)/models' },
      { id: 'memories', label: 'Memories', icon: 'memory', route: '/(stack)/memories' },
      { id: 'logs', label: 'Activity Logs', icon: 'logs', route: '/(stack)/logs' },
      { id: 'schedule', label: 'Schedule', icon: 'schedule', route: '/(stack)/schedule' },
    ],
  },
  {
    group: 'INTEGRATIONS',
    items: [
      { id: 'appManagement', label: 'App Integrations', icon: 'link', route: '/(stack)/app-management' },
      { id: 'mcpServers', label: 'MCP Servers', icon: 'globe', route: '/(stack)/mcp-servers' },
    ],
  },
  {
    group: 'MEDIA & DATA',
    items: [
      { id: 'userMedia', label: 'Photos & Videos', icon: 'photo', route: '/(stack)/user-media' },
      { id: 'photoUpload', label: 'Upload for Analysis', icon: 'upload', route: '/(stack)/photo-upload' },
    ],
  },
  {
    group: 'HOUSEHOLD',
    items: [
      { id: 'addUsers', label: 'Users', icon: 'users', route: '/(stack)/add-users' },
      { id: 'biometrics', label: 'Biometric Data', icon: 'shield', route: '/(stack)/biometrics' },
      { id: 'homeManagement', label: 'Home Management', icon: 'home', route: '/(stack)/home-management' },
    ],
  },
  {
    group: 'DATA & PRIVACY',
    items: [
      { id: 'backup', label: 'Backup', icon: 'cloud', route: '/(stack)/backup' },
      { id: 'restore', label: 'Restore to Pond', icon: 'restore', route: '/(stack)/restore' },
      { id: 'privacy', label: 'Privacy & Licenses', icon: 'shield', route: '/(stack)/privacy' },
    ],
  },
  // Dev-only: mock/real backend toggle per screen (issue #21). Discoverable
  // in dev builds without a code change; absent entirely from production.
  ...(__DEV__
    ? [
        {
          group: 'DEVELOPER',
          items: [
            { id: 'developer', label: 'Backend Mode', icon: 'cpu', route: '/(stack)/developer' },
          ],
        },
      ]
    : []),
];

/** Shortcut items for the home screen carousel */
export interface ShortcutItem {
  id: string;
  label: string;
  iconName: string;
  color: string;
}

export const HOME_SHORTCUTS: ShortcutItem[] = [
  { id: 'morning', label: 'Morning', iconName: 'sun', color: '#FEF3C7' },
  { id: 'home', label: 'Home', iconName: 'home', color: '#DBEAFE' },
  { id: 'night', label: 'Night', iconName: 'moon', color: '#EDE9FE' },
  { id: 'music', label: 'Music', iconName: 'music', color: '#FCE7F3' },
  { id: 'packages', label: 'Packages', iconName: 'package', color: '#FEE2E2' },
];
