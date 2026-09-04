import * as LinkingExpo from 'expo-linking';
import { buildShareLinking } from './shareIntent';

/**
 * Navigation linking: share-intent (when available) plus invite deep links
 * timelineapp://share/{code}
 */
export function buildAppLinking() {
  const shareLinking = buildShareLinking();
  const PREFIX = LinkingExpo.createURL('/');
  const scheme = 'timelineapp';

  const baseConfig = {
    screens: {
      Home: 'home',
      AcceptInvite: {
        path: 'share/:code',
        parse: {
          code: (code) => String(code || '').toUpperCase(),
        },
      },
      EventsWithFriends: 'friends',
      AddEvent: 'shareintent',
      Settings: 'settings',
    },
  };

  if (shareLinking) {
    return {
      ...shareLinking,
      prefixes: Array.from(
        new Set([...(shareLinking.prefixes || []), `${scheme}://`, PREFIX].filter(Boolean)),
      ),
      config: {
        screens: {
          ...(shareLinking.config?.screens || {}),
          ...baseConfig.screens,
        },
      },
    };
  }

  return {
    prefixes: [`${scheme}://`, PREFIX],
    config: baseConfig,
  };
}
