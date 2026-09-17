import * as LinkingExpo from 'expo-linking';
import { getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
import { buildShareLinking } from './shareIntent';

/**
 * Navigation linking: share-intent (when available) plus invite deep links
 * timelineapp://share/{code}
 *
 * Only map screens that need public/deep URLs. In-app stack screens (Home,
 * Settings, etc.) must NOT get path entries — on web, React Navigation +
 * expo-linking HTTP prefixes can open those paths as a second tab/document.
 */
export function buildAppLinking() {
  const shareLinking = buildShareLinking();
  const PREFIX = LinkingExpo.createURL('/');
  const scheme = 'timelineapp';

  const baseConfig = {
    screens: {
      AcceptInvite: {
        path: 'share/:code',
        parse: {
          code: (code) => String(code || '').toUpperCase(),
        },
      },
      // Share-intent entry (native share sheet); keep for Add Event deep link.
      AddEvent: 'shareintent',
    },
  };

  const linking = {
    prefixes: [`${scheme}://`, PREFIX],
    config: baseConfig,
    getStateFromPath(path, options) {
      const join = String(path || '').match(/(?:^|\/)join\/([A-Za-z0-9]+)/i);
      if (join) {
        return {
          routes: [
            { name: 'AcceptInvite', params: { code: join[1].toUpperCase() } },
          ],
        };
      }
      return defaultGetStateFromPath(path, options);
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
      getStateFromPath: linking.getStateFromPath,
    };
  }

  return linking;
}
