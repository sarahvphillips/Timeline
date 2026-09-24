/** In-app copy. Same text lives in docs/PRIVACY.md and docs/USER-MANUAL.md. */

export const PRIVACY_META = {
  title: 'Privacy policy',
  updated: '24 September 2026',
  version: '1.1',
};

export const PRIVACY_URL = 'https://github.com/sarahvphillips/Timeline/blob/main/docs/privacy.html';

export const PRIVACY_SECTIONS = [
  {
    heading: 'Who this is for',
    body: 'TimelineApp (“Timeline”) is a personal life-log for your own notes, dates, people, and household records. It is made by Sarah Phillips in the United Kingdom. Contact: sarah.v.phillips@googlemail.com. This policy is for the current development build (Expo / Google Play later). It will be updated before a public store listing.',
  },
  {
    heading: 'What we collect',
    body: 'Account: email address, Google sign-in if you choose it, and a Firebase user id.\n\nYou type: events, poems, SMS/call logs you enter, people (name, optional phone, email, birthday), labels, Word-to-Int words, date-circle entries, food, wash loads, purchases, banking notes, social/YouTube/Spotify/game links, and similar.\n\nApp data: credits, stamps, shop perks, invite codes, which events you shared and with whom, device session (so you can see other signed-in devices), settings and theme.\n\nWe do not ask for bank passwords, card numbers, or Google Play payment details. Google handles Play purchases when those go live.',
  },
  {
    heading: 'Photos, video, and audio',
    body: 'Profile photos, event pictures, wash photos, and call recordings are meant to stay on your device. Some images may be cached on the device (including as a compressed copy). They are not uploaded to Firebase Storage in this version. Checksums (SHA-256) of clips you choose may be stored so you can see if a file changed. Original gallery files are not overwritten.',
  },
  {
    heading: 'Gmail and Open Banking',
    body: 'Pick from Gmail only runs if you choose it, using your Google account. Timeline does not store your Gmail password.\n\nOpen Banking is a sandbox in this version: sample UK-style payments so import can be tested. A live bank link (Lloyds and others) would use a regulated provider (for example TrueLayer). You would log in on the bank’s own page, never inside Timeline. Screenshots of banking remain an option that does not connect a bank.',
  },
  {
    heading: 'Where it is stored',
    body: 'Google Firebase (Authentication and Firestore) holds your account, events, settings, credits, invites, and similar text records. A copy also sits on the device (AsyncStorage) so the app works if the network drops.\n\nProcessors: Google Ireland / Google LLC (Firebase, and later Google Play Billing). Development tools (Expo) may see a local session while you run a preview; that is not used as a public analytics product.',
  },
  {
    heading: 'Sharing with other people',
    body: 'Nothing is public by default. You can share a specific event with a Timeline friend (invite code / QR). They only see what you share. Credits you transfer go to another Timeline account you choose. Admins you appoint can see staff tools, not everyone else’s private events unless those events were shared.',
  },
  {
    heading: 'Credits and purchases',
    body: 'Credit balances live in Firestore on your account. Purchases are turned off while Timeline is in testing, so testers are not asked to pay. When packs return, they will be sold only in the Google Play Android app (SKUs 1_credits, 10_credits, 25_credits, 100_credits). The browser does not take card payments.',
  },
  {
    heading: 'Legal basis (UK GDPR)',
    body: 'Contract / requested service: running the account you signed up for.\nConsent: optional camera, photos, Gmail pick, future bank connect, notifications.\nLegitimate interests: keeping the service secure (sessions, admin audit, checksums you ask for).',
  },
  {
    heading: 'How long we keep it',
    body: 'While your account exists. Settings → Delete account removes the Firebase login, this account’s timeline data in Firestore (events, words, settings, invites you sent, and shares you created), the public profile if you had one, and this device’s copy. Credit transfers you sent or received are removed with the account.\n\nSettings → Clear this account’s local cache only removes the on-device copy. It does not delete the account.\n\nThe same policy is public at https://github.com/sarahvphillips/Timeline/blob/main/docs/privacy.html',
  },
  {
    heading: 'Children',
    body: 'Timeline is not directed at children under 13. Do not create an account for a child under 13.',
  },
  {
    heading: 'Your rights',
    body: 'You can delete the account yourself in Settings. You can also ask for a copy or a correction, and you can complain to the ICO (ico.org.uk). Contact: sarah.v.phillips@googlemail.com.',
  },
  {
    heading: 'What we do not do',
    body: 'We do not sell your data. We do not run ads in Timeline. We do not use your events to train public AI models.',
  },
];

export const MANUAL_META = {
  title: 'User manual',
  updated: '20 September 2026',
  version: '1.0',
};

export const MANUAL_SECTIONS = [
  {
    heading: 'What Timeline is',
    body: 'A private timeline of your life: notes, people, household, media, and numbers. Open it in Expo Go while we build, then later from Google Play. Tag: #kern2622.',
  },
  {
    heading: 'Sign in',
    body: 'Email and password, or Google. Forgot password sends a reset from Firebase. Use a password you have not said aloud if you are nearby other people.',
  },
  {
    heading: 'Home',
    body: 'Timeline, Add event, Credits, Utilities (including Starlink check), latest wash if you use laundry. The + on Timeline opens the same Add event picker so Home does not grow a new row for every type.',
  },
  {
    heading: 'Add event',
    body: 'Pick a type: Event, Poem, SMS, Phone call, Person, Social, Game, YouTube, Spotify, TV & films, Email, Gmail, QR, Food, Wash, Open Banking. Each type has its own form. You can change type before saving.',
  },
  {
    heading: 'Timeline views',
    body: 'Years → months → weeks, with a central axis and bubbles left and right. Tap a year or month to zoom in. Filter chips (Poems, Games, SMS, Banking, and so on) show matching items on one central axis. Home icon next to + returns to Home.',
  },
  {
    heading: 'People and sharing',
    body: 'People: friends even if they do not use Timeline. Optional invite code / QR. Sharing is per event, not the whole timeline (whole-timeline share is not built yet). Auto-share flags for SMS/calls are stored for later.',
  },
  {
    heading: 'Credits and shop',
    body: 'Stamps on Home (poem, friend joined, word saved, and so on). A full row of four can grant credits. Shop spends credits on extras (call recordings, Open Banking, delivery perk, and similar). Everyday logging stays free. Buying packs is Google Play Android only, later. Admin can set a test balance. You can transfer credits to another Timeline email.',
  },
  {
    heading: 'Word to int and date circle',
    body: 'Word to int: letter sum A=1…Z=26 (sarah = 47). Duplicates (any capitalisation) are blocked. Sort by alpha, number, or date added. Lookups can pick ordinal / Pythagorean / reverse / reduced / all.\n\nDate circle: people around a ring, days between birthdays, optional save as a Wheel of dates event. DD/MM/YYYY throughout.',
  },
  {
    heading: 'Household and money',
    body: 'Wash loads: photo/video stay on device; status loaded → put away; optional “machine sang”.\nFood: planned or eaten, photo optional.\nPurchases: manual, email, screenshots. Open Banking: unlock with credits, connect sandbox, import sample payments as Banking events. Live bank is later. Screenshots stay.',
  },
  {
    heading: 'Checksums',
    body: 'SHA-256 for events and for video clips you trim. The original file is not edited. App checksums lists them with a shortcut to the item.',
  },
  {
    heading: 'Settings',
    body: 'Name, date of birth, labels, poem categories, light/dark and colour palette, food/wash menu toggles, People, Open Banking, privacy policy, this manual, clear local cache for this account.',
  },
  {
    heading: 'Admin',
    body: 'Only emails you appoint. Feature gates, tester credit grants, staff tools. Admin is not automatic for every Google login.',
  },
  {
    heading: 'If something fails',
    body: 'From the laptop: cd C:\\Users\\sarah\\Desktop\\TimelineApp then git pull then npx expo start --clear. Scan the QR with Expo Go on the same Wi‑Fi (no --tunnel unless you need it). Publish Firestore rules if cloud reads fail. Camera / photos: allow permission when Android asks.',
  },
];
