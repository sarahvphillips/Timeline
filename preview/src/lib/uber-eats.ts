import raw from "@/data/uber-eats-imports.json";

export type UberEatsImport = {
  id: string;
  date: string;
  time: string;
  merchant: string;
  amount: string;
  items: string;
  note: string;
};

export function uberEatsReceipts(): UberEatsImport[] {
  const value: unknown = raw;
  if (Array.isArray(value)) return value as UberEatsImport[];
  if (value && typeof value === "object" && Array.isArray((value as { default?: unknown }).default)) {
    return (value as { default: UberEatsImport[] }).default;
  }
  return [];
}

/** Pull merchant + total from an Uber Receipts snippet. */
export function parseUberSnippet(snippet: string): { merchant: string; amount: string } | null {
  const text = snippet.replace(/&#39;/g, "'").replace(/&/g, "&");
  const merchant = text.match(/receipt for (.+?)\.\s*Total/i)?.[1]?.trim();
  const amount = text.match(/Total £([\d.]+)/i)?.[1];
  if (!merchant || !amount) return null;
  return { merchant, amount };
}
