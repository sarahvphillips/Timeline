export type BankOcrFill = {
  merchant: string;
  amount: string;
  date: string;
  items: string;
};

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const SKIP =
  /^(card payment|card transaction|debit|credit|paid|payment|transaction|available|balance|pending|cleared|from|to|gbp|£|sort code|account|monzo|starling|barclays|natwest|halifax|lloyds|hsbc|metro)$/i;

export function parseBankOcr(text: string): BankOcrFill {
  const raw = (text || "").replace(/\u00a0/g, " ");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const joined = lines.join("\n");
  const phrase = parseLloydsPhrases(joined);

  const amount = phrase.amount || pickAmount(joined, lines);
  const date = phrase.date || pickDate(joined);
  const merchant = phrase.merchant || pickMerchant(lines, amount);
  const label = noticeLabel(joined);

  return {
    merchant,
    amount,
    date,
    items: label
      ? `${label}${merchant ? ` · ${merchant}` : ""}`
      : merchant
        ? `Bank screenshot · ${merchant}`
        : "Bank screenshot",
  };
}

function noticeLabel(joined: string): string {
  if (/starling/i.test(joined)) return "Starling notification";
  if (/lloyds/i.test(joined)) return "Lloyds notification";
  if (/\bmonzo\b/i.test(joined)) return "Monzo notification";
  if (/natwest/i.test(joined)) return "NatWest notification";
  if (/barclays/i.test(joined)) return "Barclays notification";
  if (/spent £|sent £|card payment of/i.test(joined)) return "Bank notification";
  return "";
}

/** Lloyds (and similar) push / banner copy. */
export function parseLloydsPhrases(joined: string): Partial<BankOcrFill> {
  const t = joined.replace(/\s+/g, " ");
  const spent = t.match(
    /(?:you\s+)?spent\s+£?\s*(\d{1,5}(?:[.,]\d{2}))\s+at\s+(.+?)(?:\.|$|\n| on )/i,
  );
  if (spent) {
    return {
      amount: Number(spent[1].replace(",", ".")).toFixed(2),
      merchant: cleanPayee(spent[2]),
    };
  }
  const cardAt = t.match(
    /card\s+(?:payment|transaction)\s+of\s+£?\s*(\d{1,5}(?:[.,]\d{2}))\s+at\s+(.+?)(?:\.|$|\n| on )/i,
  );
  if (cardAt) {
    return {
      amount: Number(cardAt[1].replace(",", ".")).toFixed(2),
      merchant: cleanPayee(cardAt[2]),
    };
  }
  const sent = t.match(
    /(?:you(?:'ve| have)?\s+)?(?:sent|paid)\s+£?\s*(\d{1,5}(?:[.,]\d{2}))\s+to\s+(.+?)(?:\.|$|\n| on )/i,
  );
  if (sent) {
    return {
      amount: Number(sent[1].replace(",", ".")).toFixed(2),
      merchant: cleanPayee(sent[2]),
    };
  }
  const paymentTo = t.match(
    /payment\s+of\s+£?\s*(\d{1,5}(?:[.,]\d{2}))\s+to\s+(.+?)(?:\.|$|\n| has )/i,
  );
  if (paymentTo) {
    return {
      amount: Number(paymentTo[1].replace(",", ".")).toFixed(2),
      merchant: cleanPayee(paymentTo[2]),
    };
  }
  const received = t.match(
    /(?:you(?:'ve| have)?\s+)?received\s+£?\s*(\d{1,5}(?:[.,]\d{2}))\s+from\s+(.+?)(?:\.|$|\n)/i,
  );
  if (received) {
    return {
      amount: Number(received[1].replace(",", ".")).toFixed(2),
      merchant: cleanPayee(received[2]),
      items: "Bank notification · received",
    };
  }
  return {};
}

function cleanPayee(s: string): string {
  return s
    .replace(/\bLloyds Bank\b/gi, "")
    .replace(/\bnow\b/gi, "")
    .replace(/[·•].*$/, "")
    .split(/\s+(?:Temu|Ring|Grok|Your Grok|Notification settings|Clear|vodafone)\b/i)[0]
    .replace(/\s+/g, " ")
    .trim();
}

function pickAmount(joined: string, lines: string[]): string {
  const hits: { value: string; score: number }[] = [];
  const re = /(-)?\s*(?:GBP|£)?\s*(\d{1,5}(?:[.,]\d{2}))\s*(?:GBP)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined))) {
    const num = m[2].replace(",", ".");
    const n = Number(num);
    if (!n || n > 20000) continue;
    let score = 1;
    if (m[1] === "-") score += 2;
    if (/£/.test(m[0])) score += 1;
    if (n >= 1) score += 1;
    hits.push({ value: n.toFixed(2), score });
  }
  for (const line of lines) {
    if (/balance|available/i.test(line)) continue;
    const only = line.match(/^[-−]?\s*£?\s*(\d{1,5}[.,]\d{2})\s*$/);
    if (only) hits.push({ value: Number(only[1].replace(",", ".")).toFixed(2), score: 4 });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits[0]?.value || "";
}

function pickDate(joined: string): string {
  const uk = joined.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  if (uk) {
    const d = uk[1].padStart(2, "0");
    const mo = uk[2].padStart(2, "0");
    let y = uk[3];
    if (y.length === 2) y = `20${y}`;
    if (Number(mo) >= 1 && Number(mo) <= 12) return `${y}-${mo}-${d}`;
  }
  const named = joined.match(
    /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{4})\b/i,
  );
  if (named) {
    const d = named[1].padStart(2, "0");
    const mo = MONTHS[named[2].toLowerCase().replace(".", "")];
    if (mo) return `${named[3]}-${mo}-${d}`;
  }
  const namedShort = joined.match(
    /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\b/i,
  );
  if (namedShort) {
    const d = namedShort[1].padStart(2, "0");
    const mo = MONTHS[namedShort[2].toLowerCase().replace(".", "")];
    const y = String(new Date().getFullYear());
    if (mo) return `${y}-${mo}-${d}`;
  }
  return "";
}

function pickMerchant(lines: string[], amount: string): string {
  const candidates = lines.filter((l) => {
    if (SKIP.test(l)) return false;
    if (/^[-−£\d\s.,GBP]+$/i.test(l)) return false;
    if (/\d{1,2}[\/.\-]\d{1,2}/.test(l)) return false;
    if (/balance|available|sort code|account ending/i.test(l)) return false;
    if (amount && l.includes(amount) && !/\bat\b|\bto\b|\bfrom\b|\bspent\b/i.test(l)) return false;
    return /[A-Za-z]{3,}/.test(l);
  });
  const ranked = [...candidates].sort((a, b) => {
    const score = (s: string) => {
      let n = s.length;
      if (/uber|amazon|tesco|asda|coop|co-op|hellofresh|temu|mcdonald/i.test(s)) n += 20;
      if (/^[A-Z0-9 *&.'-]{3,40}$/.test(s)) n += 8;
      return n;
    };
    return score(b) - score(a);
  });
  return (ranked[0] || "").replace(/^[*]+/, "").trim();
}
