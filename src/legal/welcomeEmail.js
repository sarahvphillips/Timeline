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

export function buildWelcomeEmail({ displayName = '', email = '' } = {}) {
  const name = firstNameFrom(displayName, email);
  const hello = name ? `Hello ${name},` : 'Hello,';

  const paragraphs = [
    hello,
    'I’m Sarah. I made Timeline so the bits of a life that matter — people, dates, poems, a wash load, a message you might need again — sit on one line you control. It is not a public feed. Nothing is shared unless you choose it.',
    'Your new account is totally private. Events stay on your timeline. Friends only see what you invite them to. If you later want to be found, Settings → Searchable, pick a handle, then share the link or QR. You can switch back to private whenever you like.',
    'A few first steps that actually help:',
    '1. Settings — your display name, then Totally private or Searchable.\n2. People — add someone even if they never install the app. Invite with Copy, Gmail, SMS, WhatsApp, or More.\n3. Add event — one + menu for poems, SMS, calls, YouTube, food, a wash load, and the rest.\n4. Utilities — Word to int, days between dates, the date circle, and Starlink check.',
    'If a screen feels noisy, leave it. Timeline should make looking back quieter, not louder.',
    'You can open this letter again from Settings → Welcome email.',
    'Take care,\nSarah\nTimeline',
  ];

  const body = paragraphs.join('\n\n');
  return {
    from: WELCOME_FROM,
    fromEmail: WELCOME_FROM_EMAIL,
    subject: WELCOME_SUBJECT,
    hello,
    paragraphs,
    body,
    text: `From: ${WELCOME_FROM}\nSubject: ${WELCOME_SUBJECT}\n\n${body}\n\n#kern2622`,
  };
}
