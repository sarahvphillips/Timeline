import React, { useEffect, useRef } from 'react';
import { parseSharedContent, isShareIntentAvailable } from '../services/shareIntent';

function navigateToAddEvent(navigationRef, parsed) {
  const params = {
    ...parsed,
    shareKey: Date.now(),
  };
  if (params.fromEmail == null && params.source === 'email') {
    params.fromEmail = true;
  }
  const go = () => {
    try {
      if (navigationRef?.isReady?.()) {
        navigationRef.navigate('AddEvent', params);
        return true;
      }
    } catch (_) {}
    return false;
  };
  if (go()) return;
  let tries = 0;
  const id = setInterval(() => {
    tries += 1;
    if (go() || tries > 20) clearInterval(id);
  }, 150);
}

function ShareIntentListener({ navigationRef, user }) {
  const { useShareIntentContext } = require('expo-share-intent');
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const pendingRef = useRef(null);

  useEffect(() => {
    if (!hasShareIntent) return;
    let cancelled = false;
    (async () => {
      let parsed;
      try {
        parsed = await parseSharedContent(shareIntent);
      } catch (e) {
        console.warn('Share parse failed', e);
        parsed = null;
      }
      if (cancelled) return;
      try {
        resetShareIntent();
      } catch (_) {}
      if (!parsed) return;
      if (!user) {
        pendingRef.current = parsed;
        return;
      }
      navigateToAddEvent(navigationRef, parsed);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasShareIntent, shareIntent, user, navigationRef, resetShareIntent]);

  useEffect(() => {
    if (!user || !pendingRef.current) return;
    const parsed = pendingRef.current;
    pendingRef.current = null;
    navigateToAddEvent(navigationRef, parsed);
  }, [user, navigationRef]);

  return null;
}

export default function ShareToTimeline({ children, navigationRef, user }) {
  if (!isShareIntentAvailable()) {
    return children;
  }

  try {
    const { ShareIntentProvider } = require('expo-share-intent');
    return (
      <ShareIntentProvider options={{ disabled: false, resetOnBackground: true }}>
        <ShareIntentListener navigationRef={navigationRef} user={user} />
        {children}
      </ShareIntentProvider>
    );
  } catch (_) {
    return children;
  }
}
