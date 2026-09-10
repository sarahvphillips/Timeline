import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBankOcr } from "./bank-ocr.ts";

describe("parseBankOcr", () => {
  it("reads a Monzo-style Uber Eats line", () => {
    const r = parseBankOcr(`Card payment\nUBER EATS\n-£18.49\n10 September 2026`);
    assert.equal(r.amount, "18.49");
    assert.match(r.merchant, /UBER/i);
    assert.equal(r.date, "2026-09-10");
  });

  it("reads UK slash date and GBP", () => {
    const r = parseBankOcr(`Debit\nTESCO STORES 3842\n24.99 GBP\n10/09/2026`);
    assert.equal(r.amount, "24.99");
    assert.match(r.merchant, /TESCO/i);
    assert.equal(r.date, "2026-09-10");
  });

  it("reads Starling-style Amazon", () => {
    const r = parseBankOcr(`AMAZON\n£12.00\n9 Sep 2026\nCard transaction`);
    assert.equal(r.amount, "12.00");
    assert.match(r.merchant, /AMAZON/i);
    assert.equal(r.date, "2026-09-09");
  });

  it("skips a large available-balance figure", () => {
    const r = parseBankOcr(`Available\n£1,240.50\nHELLOFRESH\n-£54.99\n02/09/2026`);
    assert.equal(r.amount, "54.99");
    assert.match(r.merchant, /HELLOFRESH/i);
  });

  it("reads a Lloyds spend notification", () => {
    const r = parseBankOcr(`Lloyds Bank\nYou spent £18.49 at UBER EATS`);
    assert.equal(r.amount, "18.49");
    assert.match(r.merchant, /UBER EATS/i);
    assert.match(r.items, /Lloyds notification/i);
  });

  it("reads a Starling shade screenshot like 10 Sept 2026", () => {
    const r = parseBankOcr(
      `17:51 Thu 10 Sept\nStarling 17:50\nStarling\nYou spent £42.32 at Uber Eats\nTemu delivered today\nYour Grok Task is ready\nRing\nThere is motion at your CamEra`,
    );
    assert.equal(r.amount, "42.32");
    assert.match(r.merchant, /Uber Eats/i);
    assert.equal(r.date, "2026-09-10");
    assert.match(r.items, /Starling notification/i);
    assert.doesNotMatch(r.merchant, /Temu|Ring|Grok/i);
  });

  it("reads a Lloyds sent-to notification", () => {
    const r = parseBankOcr(`You've sent £20.00 to K D`);
    assert.equal(r.amount, "20.00");
    assert.match(r.merchant, /K D/i);
  });

  it("reads a Lloyds card payment at merchant", () => {
    const r = parseBankOcr(`Card payment of £16.44 at MCDONALDS`);
    assert.equal(r.amount, "16.44");
    assert.match(r.merchant, /MCDONALDS/i);
  });
});
