/**
 * Copying text, for a link or a webhook's address. expo-clipboard is loaded lazily: a dev client
 * built before it was added has no native half, and there the share sheet, which offers Copy on
 * both platforms, stands in rather than the button failing.
 */

import { Share } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

type ClipboardModule = typeof import('expo-clipboard');

function load(): ClipboardModule | null {
  if (!requireOptionalNativeModule('ExpoClipboard')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-clipboard') as ClipboardModule;
    return typeof mod.setStringAsync === 'function' ? mod : null;
  } catch {
    return null;
  }
}

const clipboard = load();

/** Resolves `copied` when the text is on the clipboard, `shared` when the share sheet was offered instead. */
export async function copyText(text: string): Promise<'copied' | 'shared' | 'failed'> {
  if (clipboard) {
    try {
      await clipboard.setStringAsync(text);
      return 'copied';
    } catch (e) {
      console.warn('[clipboard] could not copy', e instanceof Error ? e.message : e);
    }
  }
  try {
    await Share.share({ message: text });
    return 'shared';
  } catch {
    return 'failed';
  }
}
