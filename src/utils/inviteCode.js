/** Pure invite-code helpers (no Firebase / service imports). */

export function buildShareLink(code) {
  return `timelineapp://share/${String(code || '').toUpperCase()}`;
}

export function buildJoinLink(code) {
  return `timelineapp://join/${String(code || '').toUpperCase()}`;
}

/** Extract invite code from raw QR / pasted link text. Matches Share QR (timelineapp://share/CODE) and join links (timelineapp://join/CODE). */
export function parseInviteCodeFromScan(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  const scheme = text.match(/timelineapp:\/\/(?:\/)?(?:share|join)\/([A-Za-z0-9]+)/i);
  if (scheme && scheme[1]) return scheme[1].toUpperCase();

  const httpsPath = text.match(/https?:\/\/[^\s]+\/(?:share|join)\/([A-Za-z0-9]+)/i);
  if (httpsPath && httpsPath[1]) return httpsPath[1].toUpperCase();

  const query = text.match(/[?&#](?:code|invite|inviteCode)=([A-Za-z0-9]+)/i);
  if (query && query[1]) return query[1].toUpperCase();

  const bare = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z0-9]{4,12}$/.test(bare)) return bare;

  return '';
}

