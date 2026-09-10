export type ShotKind = "order" | "vehicle" | "other";

export type DeliveryShot = {
  id: string;
  kind: ShotKind;
  dataUrl: string;
  ocrText: string;
};

export type UberOcrFill = {
  driverName: string;
  driverReg: string;
  driverPhone: string;
  merchant: string;
  amount: string;
};

const UK_REG = /\b([A-Z]{2}\d{2}\s?[A-Z]{3})\b/i;
const PHONE = /(?:\+44|0)7\d{9}/;
const TOTAL = /total[:\s]*£\s*([\d.]+)/i;
const DRIVER = /(?:your\s+)?driver[:\s]+([A-Za-z][A-Za-z'’-]{1,40}(?:\s+[A-Za-z][A-Za-z'’-]{1,40})?)/i;

export function parseUberOcr(text: string): UberOcrFill {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  const driver = clean.match(DRIVER)?.[1]?.trim() || "";
  const reg = (clean.match(UK_REG)?.[1] || "").replace(/\s+/g, " ").toUpperCase();
  const phone = clean.match(PHONE)?.[0] || "";
  const amount = clean.match(TOTAL)?.[1] || "";
  return {
    driverName: driver && !/^is\b/i.test(driver) ? driver : "",
    driverReg: reg,
    driverPhone: phone,
    merchant: "",
    amount,
  };
}

export function mergeFill(current: UberOcrFill, next: UberOcrFill): UberOcrFill {
  return {
    driverName: current.driverName || next.driverName,
    driverReg: current.driverReg || next.driverReg,
    driverPhone: current.driverPhone || next.driverPhone,
    merchant: current.merchant || next.merchant,
    amount: current.amount || next.amount,
  };
}

export async function ocrImage(dataUrl: string): Promise<string> {
  const { recognize } = await import("tesseract.js");
  const result = await recognize(dataUrl, "eng");
  return result.data.text || "";
}
