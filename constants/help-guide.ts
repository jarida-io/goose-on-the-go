/**
 * Help & Feedback's guide to the problems people hit most. Each answer is the app's own wording for
 * that failure, gathered in one place, and points to the screen where it is put right. Keys only,
 * like `settings-issues.ts`, so `t()` runs at render time and a missing key fails to compile.
 */

import type { TranslationKey } from '@/services/i18n';

export interface HelpTopic {
  id: string;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  /** The screen where it is fixed, when the app has one, named by that screen's own title. */
  link?: { screenKey: TranslationKey; route: string };
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'unreachable',
    titleKey: 'help.guide.unreachable.title',
    bodyKey: 'help.guide.unreachable.body',
    link: { screenKey: 'screens.remoteAccess', route: '/(stack)/remote-access' },
  },
  {
    id: 'slow',
    titleKey: 'help.guide.slow.title',
    bodyKey: 'help.guide.slow.body',
    link: { screenKey: 'screens.models', route: '/(stack)/models' },
  },
  { id: 'microphone', titleKey: 'help.guide.microphone.title', bodyKey: 'help.guide.microphone.body' },
  {
    id: 'wakeWord',
    titleKey: 'help.guide.wakeWord.title',
    bodyKey: 'help.guide.wakeWord.body',
    link: { screenKey: 'screens.wakeWord', route: '/(stack)/wake-word' },
  },
  {
    id: 'deviceOffline',
    titleKey: 'help.guide.deviceOffline.title',
    bodyKey: 'help.guide.deviceOffline.body',
    link: { screenKey: 'tabs.devices', route: '/(stack)/devices' },
  },
  { id: 'pairingCode', titleKey: 'help.guide.pairingCode.title', bodyKey: 'help.guide.pairingCode.body' },
  {
    id: 'notices',
    titleKey: 'help.guide.notices.title',
    bodyKey: 'help.guide.notices.body',
    link: { screenKey: 'screens.settingsPhoneNotifications', route: '/(stack)/settings-phone-notifications' },
  },
  {
    id: 'whatHappened',
    titleKey: 'help.guide.whatHappened.title',
    bodyKey: 'help.guide.whatHappened.body',
    link: { screenKey: 'screens.logs', route: '/(stack)/logs' },
  },
];
