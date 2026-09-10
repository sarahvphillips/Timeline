export type WordEntry = { id: string; phrase: string; ordinal: number };

export function lettersOnly(text: string): string {
  return (text || "").toUpperCase().replace(/[^A-Z]/g, "");
}

/** A=1 … Z=26, letters only. sarah = 47. */
export function ordinalSum(phrase: string): number {
  return lettersOnly(phrase)
    .split("")
    .reduce((sum, ch) => sum + (ch.charCodeAt(0) - 64), 0);
}

export function digitSum(n: number): { total: number; parts: string } {
  const digits = String(Math.abs(Math.trunc(n))).split("");
  const total = digits.reduce((s, d) => s + Number(d), 0);
  return { total, parts: digits.join("+") };
}

export function concatNumbers(a: number, b: number): number {
  return Number(`${a}${b}`);
}

export function matchesFor(list: WordEntry[], n: number): WordEntry[] {
  return list.filter((w) => w.ordinal === n);
}

export function formatDigitSum(n: number): string {
  return digitSum(n).parts;
}

export const findPhrasesForNumber = matchesFor;

export function formatHits(hits: WordEntry[]): string {
  if (!hits.length) return "no matching word yet";
  return hits.map((h) => h.phrase).join(", ");
}

export const TEST_WORDS: WordEntry[] = [
  { id: "w-baldr", phrase: "Baldr", ordinal: 37 },
  { id: "w-odin", phrase: "Odin", ordinal: 42 },
  { id: "w-hodr", phrase: "Hodr", ordinal: 45 },
  { id: "w-elon", phrase: "Elon", ordinal: 46 },
  { id: "w-frigg", phrase: "Frigg", ordinal: 47 },
  { id: "w-asgard", phrase: "Asgard", ordinal: 50 },
  { id: "w-hoder", phrase: "Hoder", ordinal: 50 },
  { id: "w-freya", phrase: "Freya", ordinal: 55 },
  { id: "w-figaro", phrase: "Figaro", ordinal: 56 },
  { id: "w-loved", phrase: "Loved", ordinal: 58 },
  { id: "w-baldur", phrase: "Baldur", ordinal: 58 },
  { id: "w-test", phrase: "test", ordinal: 64 },
  { id: "w-freyja", phrase: "Freyja", ordinal: 65 },
  { id: "w-hodur", phrase: "Hodur", ordinal: 66 },
];

export function mergeWordLists(current: WordEntry[], extra: WordEntry[]): WordEntry[] {
  const seen = new Set(current.map((w) => w.phrase.toLowerCase()));
  const add = extra.filter((w) => !seen.has(w.phrase.toLowerCase()));
  return [...current, ...add].sort(
    (a, b) => a.ordinal - b.ordinal || a.phrase.localeCompare(b.phrase),
  );
}
