import React, { useEffect, useRef } from 'react';
import { parseSharedEmail, isShareIntentAvailable } from '../services/shareIntent';

function navigateToAddEvent(navigationRef, parsed) {
  const params = {
    ...parsed,
    fromEmail: true,
    source: 'email',
    shareKey: Date.now(),
  };
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
    const parsed = parseSharedEmail(shareIntent);
    try {
      resetShareIntent();
    } catch (_) {}
    if (!user) {
      pendingRef.current = parsed;
      return;
    }
    navigateToAddEvent(navigationRef, parsed);
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
