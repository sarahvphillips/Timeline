/** One list for Add event picker (Home / Timeline +). */
export const ADD_KINDS = [
  { id: 'event', label: 'Event', blurb: 'A dated note on the timeline' },
  { id: 'poem', label: 'Poem', blurb: 'Poem, album, cover photo', screen: 'AddPoem' },
  { id: 'sms', label: 'SMS', blurb: 'Sent or received text', screen: 'AddSms' },
  { id: 'call', label: 'Phone call', blurb: 'Incoming, outgoing, or missed', screen: 'AddCall' },
  { id: 'person', label: 'Person', blurb: 'A friend, even if they don’t use Timeline', screen: 'People' },
  { id: 'social', label: 'Social media', blurb: 'X, Instagram, TikTok — paste a link', screen: 'Social' },
  { id: 'games', label: 'Game', blurb: 'Steam, PlayStation, Android session', screen: 'Games' },
  { id: 'youtube', label: 'YouTube', blurb: 'Your upload or a video you watched', screen: 'YouTube' },
  { id: 'spotify', label: 'Spotify', blurb: 'Track, album, or playlist link', screen: 'Spotify' },
  { id: 'watched', label: 'TV & films', blurb: 'What you watched, optional score', screen: 'AddWatched' },
  { id: 'email', label: 'Email', blurb: 'Save a mail as an event', screen: 'AddEvent', params: { kind: 'email', fromEmail: true, source: 'email' } },
  { id: 'gmail', label: 'Pick from Gmail', blurb: 'Choose a message, then save', screen: 'PickFromGmail' },
  { id: 'qr', label: 'QR link', blurb: 'Link plus a code', screen: 'AddQr' },
  { id: 'food', label: 'Food', blurb: 'Planned or eaten. Photo optional', screen: 'AddFood', needsFood: true },
  { id: 'wash', label: 'Wash load', blurb: 'Laundry on the household spine', screen: 'AddWashLoad', needsWash: true },
];
