/**
 * The You tab's menu, grouped as iPhone Settings groups. Labels are catalogue keys because a module
 * constant is evaluated before i18next has a language; `navigation.test.ts` checks every route.
 */

import type { TranslationKey } from '@/services/i18n';
import type { SummaryId } from '@/models/pond-settings';

import type { TileColor } from './colors';
import type { IconName } from './icons';

export interface NavItem {
  id: string;
  /** Key into the string catalogue — resolve with `t()` at render. */
  labelKey: TranslationKey;
  icon: IconName;
  tile: TileColor;
  /** Route path for expo-router */
  route: string;
  /** What the row shows on its right: how the thing it leads to is set. */
  summary?: SummaryId;
}

export interface NavGroup {
  /** Names the group for a screen reader; the groups themselves carry no visible heading. */
  groupKey: TranslationKey;
  items: NavItem[];
}

/** Where the card at the top of the menu leads: the household, and what Goose calls you. */
export const ACCOUNT_ROUTE = '/(stack)/settings-household';

export const PROFILE_NAV: NavGroup[] = [
  {
    groupKey: 'settings.menu.home',
    items: [
      { id: 'profiles', labelKey: 'screens.addUsers', icon: 'users', tile: 'green', route: '/(stack)/add-users', summary: 'people' },
      { id: 'home', labelKey: 'screens.settingsHome', icon: 'home', tile: 'green', route: '/(stack)/settings-home', summary: 'home' },
    ],
  },
  {
    groupKey: 'settings.menu.goose',
    items: [
      { id: 'assistant', labelKey: 'screens.settingsAssistant', icon: 'agent', tile: 'purple', route: '/(stack)/settings-assistant', summary: 'assistant' },
      { id: 'voice', labelKey: 'screens.settingsVoice', icon: 'voice', tile: 'pink', route: '/(stack)/settings-voice', summary: 'voice' },
      { id: 'models', labelKey: 'screens.models', icon: 'models', tile: 'purple', route: '/(stack)/models', summary: 'models' },
      { id: 'thinking', labelKey: 'screens.settingsThinking', icon: 'sparkle', tile: 'indigo', route: '/(stack)/settings-thinking', summary: 'thinking' },
    ],
  },
  {
    groupKey: 'settings.menu.connection',
    items: [
      { id: 'connectors', labelKey: 'goose.find.connectors', icon: 'plug', tile: 'orange', route: '/(stack)/goose-connectors' },
      { id: 'devices', labelKey: 'tabs.devices', icon: 'device', tile: 'blue', route: '/(stack)/devices' },
      { id: 'myPond', labelKey: 'screens.myPond', icon: 'server', tile: 'amber', route: '/(stack)/pond' },
      { id: 'remoteAccess', labelKey: 'screens.remoteAccess', icon: 'lock', tile: 'blue', route: '/(stack)/remote-access', summary: 'remoteAccess' },
      { id: 'internet', labelKey: 'screens.settingsInternet', icon: 'globe', tile: 'blue', route: '/(stack)/settings-internet', summary: 'internet' },
      { id: 'security', labelKey: 'screens.security', icon: 'lock', tile: 'slate', route: '/(stack)/pairing-lock' },
      { id: 'privacy', labelKey: 'screens.settingsPrivacy', icon: 'shield', tile: 'blue', route: '/(stack)/settings-privacy', summary: 'privacy' },
    ],
  },
  {
    groupKey: 'settings.menu.phone',
    items: [
      { id: 'appearance', labelKey: 'screens.settingsAppearance', icon: 'palette', tile: 'slate', route: '/(stack)/settings-appearance', summary: 'appearance' },
      { id: 'phoneNotifications', labelKey: 'screens.settingsPhoneNotifications', icon: 'bell', tile: 'red', route: '/(stack)/settings-phone-notifications' },
    ],
  },
  {
    groupKey: 'settings.menu.help',
    items: [
      { id: 'help', labelKey: 'screens.help', icon: 'info', tile: 'blue', route: '/(stack)/help' },
      { id: 'developer', labelKey: 'nav.developerMode', icon: 'cpu', tile: 'slate', route: '/(stack)/developer' },
    ],
  },
];
