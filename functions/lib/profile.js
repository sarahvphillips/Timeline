/** Stored DOB -> yyyy-mm-dd, or null. Accepts yyyy-mm-dd and dd/mm/yyyy (UK). */
function dobToIso(raw) {
  const s = String(raw || '').trim();
  let y;
  let m;
  let d;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (r) {
    y = +r[1];
    m = +r[2];
    d = +r[3];
  } else {
    r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (!r) return null;
    d = +r[1];
    m = +r[2];
    y = +r[3];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function publicProfile(data) {
  const src = data && typeof data === 'object' ? data : {};
  const dateOfBirth = typeof src.dateOfBirth === 'string' ? src.dateOfBirth : '';
  const handle = String(src.handle || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24);
  return {
    displayName: typeof src.displayName === 'string' ? src.displayName : '',
    dateOfBirth,
    dateOfBirthIso: dobToIso(dateOfBirth),
    username: handle,
  };
}

module.exports = { dobToIso, publicProfile };
