import { getEvents, saveEvent } from './eventService';

export function linkIdList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((id) => String(id || '').trim()).filter(Boolean))];
}

export async function eventsByIds(ids) {
  const want = new Set(linkIdList(ids));
  if (!want.size) return [];
  const all = await getEvents();
  return all.filter((event) => want.has(String(event.id)));
}

export async function linkEventGroup(ids) {
  const unique = linkIdList(ids);
  if (unique.length < 2) return unique;
  const all = await getEvents();
  const map = new Map(all.map((event) => [String(event.id), event]));
  for (const id of unique) {
    const event = map.get(id);
    if (!event) continue;
    const next = linkIdList([...(event.linkedEventIds || []), ...unique.filter((other) => other !== id)]);
    const savedList = await saveEvent({ ...event, linkedEventIds: next });
    const updated = (savedList || []).find((row) => String(row.id) === id) || { ...event, linkedEventIds: next };
    map.set(id, updated);
  }
  return unique;
}

export async function unlinkEvents(leftId, rightId) {
  const all = await getEvents();
  for (const id of [leftId, rightId]) {
    const event = all.find((row) => String(row.id) === String(id));
    if (!event) continue;
    await saveEvent({
      ...event,
      linkedEventIds: linkIdList(event.linkedEventIds).filter((other) => other !== String(rightId === id ? leftId : rightId)),
    });
  }
}

export function eventKindLabel(event) {
  if (!event) return 'Event';
  if (event.source === 'todo' || event.fromTodo) return 'To do';
  if (event.hobbyType === 'poetry' || event.source === 'poem') return 'Poem';
  if (event.source === 'youtube') return 'YouTube';
  if (event.source === 'social') return 'Social';
  if (event.source === 'spotify') return 'Spotify';
  if (event.source === 'watched') return 'Watched';
  if (event.source === 'game') return 'Game';
  if (event.source === 'food') return 'Food';
  if (event.source === 'sms') return 'SMS';
  if (event.source === 'call') return 'Call';
  if (event.source === 'life') return 'Life';
  return event.source || event.category || 'Event';
}
