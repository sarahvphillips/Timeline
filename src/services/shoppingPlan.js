/** Past recipes, a clear that can be put back, and a Grok Bot handoff. No shop payment. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function recipeKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function pastRecipeCards(events) {
  const groups = new Map();
  (events || []).forEach((event) => {
    if (!event || String(event.source || '') !== 'food') return;
    const name = String(event.recipeName || event.title || '').trim();
    const key = recipeKey(name);
    if (!key) return;
    const items = String(event.foodItems || '').trim();
    const when = String(event.date || event.createdAt || '');
    const prev = groups.get(key);
    if (prev && String(prev.when) >= when) return;
    groups.set(key, {
      key,
      name,
      when,
      eventId: event.id || '',
      items,
      isBox: !!event.mealKit,
    });
  });
  return Array.from(groups.values()).sort((a, b) => String(b.when).localeCompare(String(a.when)));
}

export function archiveLabel(date) {
  const d = date instanceof Date ? date : new Date(date);
  const day = Number.isNaN(d.getTime()) ? new Date() : d;
  return `Week of ${day.getDate()} ${MONTHS[day.getMonth()]}`;
}

export function clearShoppingList(state, recipes, now = new Date()) {
  const current = state || {};
  const snapshot = {
    hidden: current.hidden || [],
    extras: current.extras || [],
    selected: current.selected,
    paid: current.paid || {},
    prices: current.prices || {},
    swaps: current.swaps || {},
    got: current.got || {},
    dropped: current.dropped || {},
    checked: current.checked || {},
  };
  const ids = (recipes || []).map((recipe) => recipe && recipe.id).filter(Boolean);
  const archive = {
    id: `week-${now instanceof Date ? now.getTime() : Date.now()}`,
    label: archiveLabel(now),
    at: (now instanceof Date ? now : new Date()).toISOString(),
    snapshot,
  };
  return {
    ...current,
    hidden: [...new Set([...(current.hidden || []), ...ids])],
    extras: [],
    selected: [],
    paid: {},
    prices: {},
    swaps: {},
    got: {},
    dropped: {},
    checked: {},
    archives: [archive, ...(current.archives || [])].slice(0, 12),
  };
}

export function restoreArchive(state, archiveId) {
  const current = state || {};
  const archive = (current.archives || []).find((row) => row && row.id === archiveId);
  if (!archive || !archive.snapshot) return current;
  return {
    ...current,
    ...archive.snapshot,
    archives: (current.archives || []).filter((row) => row.id !== archiveId),
  };
}

export function handoffPayload({
  mode,
  shop,
  substitutions,
  exceptions,
  capPounds,
  allowedShops,
  optedIn,
  lines,
}) {
  const picked = mode === 'one' || mode === 'all' || mode === 'order' ? mode : '';
  if (!picked) throw new Error('Choose how the bot should shop.');
  const shops = (allowedShops || []).map((item) => String(item || '').trim()).filter(Boolean);
  let capPence = null;
  if (picked === 'order') {
    const cap = Number(capPounds);
    if (!Number.isFinite(cap) || cap <= 0) throw new Error('Set a spending cap above 0.');
    if (!shops.length) throw new Error('Choose at least one allowed shop.');
    if (!optedIn) throw new Error('Tick the box to allow this order. Timeline will not pay.');
    capPence = Math.round(cap * 100);
  }
  const items = (lines || []).filter((line) => line && !line.dropped).map((line) => ({
    name: String(line.swap || line.name || '').trim(),
    qty: line.qty || '',
    meal: line.mealName || '',
    got: !!line.got,
  }));
  return {
    mode: picked,
    shop: shop || '',
    substitutions: substitutions === 'allow' || substitutions === 'skip' ? substitutions : 'ask',
    exceptions: String(exceptions || '').trim(),
    capPence,
    allowedShops: picked === 'order' ? shops : [],
    optedIn: picked === 'order',
    paysInApp: false,
    items,
    createdAt: new Date().toISOString(),
    note: 'Do not take payment inside Timeline. Stop if the shop asks for a bank code. Do not place a real order in a test.',
  };
}
