export const LOCATION_STORE = "timeline-locations-mock-v1";

export const PLACE_PRESETS = ["Home", "Internet", "Local high street"] as const;

export function savedPlaceNames(): string[] {
  try {
    const raw = localStorage.getItem(LOCATION_STORE);
    if (!raw) return [];
    const list = JSON.parse(raw) as { name?: string }[];
    if (!Array.isArray(list)) return [];
    const names = list.map((v) => (v.name || "").trim()).filter(Boolean);
    return [...new Set(names)];
  } catch {
    return [];
  }
}

export function placeChoices(extra = ""): string[] {
  const custom = extra.trim();
  const saved = savedPlaceNames().filter((n) => !PLACE_PRESETS.includes(n as (typeof PLACE_PRESETS)[number]));
  const all = [...PLACE_PRESETS, ...saved];
  if (custom && !all.some((n) => n.toLowerCase() === custom.toLowerCase())) all.push(custom);
  return all;
}
