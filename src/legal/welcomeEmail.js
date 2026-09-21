/** Welcome letter shown after register. Same words if we later send real email (Blaze). */

export const WELCOME_FROM = 'Sarah Phillips, Timeline';
export const WELCOME_FROM_EMAIL = 'sarah.v.phillips@googlemail.com';
export const WELCOME_SUBJECT = 'Welcome to Timeline — your days, in your own line';

export const WELCOME_NEXT_KEY = '@timeline_welcome_next';

export function welcomePendingKey(uid) {
  return uid ? `@timeline_welcome_pending_${uid}` : '@timeline_welcome_pending_guest';
}

export function firstNameFrom(displayName, email) {
  const fromName = String(displayName || '')
    .trim()
    .split(/\s+/)[0];
  if (fromName) return fromName;
  const local = String(email || '').split('@')[0];
  if (local) return local.replace(/[._-]+/g, ' ').trim();
  return '';
}

export const WELCOME_POEM = `Something to list out
All your life's best points
Keep a tally of when each thing was
To look back and see the times you were happy
The days you were busy
The times you had too much to do
And those when you had not enough
Maybe when you felt ill,
And times got rough.
Imagine all your photos, messages, calls,
Trips to the shop,
Interesting things you watched,
All with the option
To add a note, a message to yourself,
Something to remind you,
That you had so many things going on
That you didn't want to forget
Even the shortest chat with a friend,
A little tête-à-tête.

Given the chance to keep them at a glance
Details that are important
All kept in one place
Safe and orderly
Sorted into categories
Neatly arranged
Everything sorted the right way
Data kept from going astray`;

export function buildWelcomeEmail({ displayName = '', email = '' } = {}) {
  const name = firstNameFrom(displayName, email);
  const hello = name ? `Hello ${name},` : 'Hello,';

  const beforePoem = [
    hello,
    'I’m Sarah. I made Timeline so a life can sit on one line you control — not a public feed. This is what it is for:',
  ];
  const afterPoem = [
    'Your new account is totally private. Events stay on your timeline. Friends only see what you invite them to. If you later want to be found, Settings → Searchable, pick a handle, then share the link or QR. You can switch back to private whenever you like.',
    'A few first steps that actually help:',
    '1. Settings — your display name, then Totally private or Searchable.\n2. People — add someone even if they never install the app. Invite with Copy, Gmail, SMS, WhatsApp, or More.\n3. Add event — one + menu for poems, SMS, calls, YouTube, food, a wash load, and the rest.\n4. Utilities — Word to int, days between dates, the date circle, and Starlink check.',
    'If a screen feels noisy, leave it. Timeline should make looking back quieter, not louder.',
    'You can open this letter again from Settings → Welcome email.',
    'Take care,\nSarah\nTimeline',
  ];

  const sections = [
    ...beforePoem.map((text) => ({ type: 'p', text })),
    { type: 'poem', text: WELCOME_POEM },
    ...afterPoem.map((text) => ({ type: 'p', text })),
  ];

  const body = [...beforePoem, WELCOME_POEM, ...afterPoem].join('\n\n');
  return {
    from: WELCOME_FROM,
    fromEmail: WELCOME_FROM_EMAIL,
    subject: WELCOME_SUBJECT,
    hello,
    sections,
    poem: WELCOME_POEM,
    paragraphs: [...beforePoem, WELCOME_POEM, ...afterPoem],
    body,
    text: `From: ${WELCOME_FROM}\nSubject: ${WELCOME_SUBJECT}\n\n${body}\n\n#kern2622`,
  };
}
