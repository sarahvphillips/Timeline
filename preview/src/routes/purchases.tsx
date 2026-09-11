import { FeatureGate } from "@/components/admin-gate";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LocationPicker } from "@/components/location-picker";
import { VideoClipPicker } from "@/components/video-clip-picker";
import { parseBankOcr } from "@/lib/bank-ocr";
import { formatClock, logChecksum, sha256Text, type VideoClipMeta } from "@/lib/checksum";
import { formatUk, nowStamp, toIso } from "@/lib/date-span";
import { uberEatsReceipts } from "@/lib/uber-eats";
import { ocrImage, parseUberOcr, type DeliveryShot, type ShotKind, type UberOcrFill } from "@/lib/uber-ocr";

export const Route = createFileRoute("/purchases")({ component: PurchasesRoute });

function PurchasesRoute() {
  return (
    <FeatureGate feature="purchases">
      <AddPurchasePage />
    </FeatureGate>
  );
}

const SOURCES = [
  "Manual",
  "Email",
  "Amazon",
  "Uber Eats",
  "Website",
  "Notification",
  "Bank screenshot",
] as const;
type Source = (typeof SOURCES)[number];

const CATEGORIES = ["Personal", "Food", "Household", "Travel", "Work", "Other"] as const;
type Category = (typeof CATEGORIES)[number];

type Purchase = {
  id: string;
  source: Source;
  merchant: string;
  amount: string;
  date: string;
  items: string;
  location: string;
  category: Category;
  emailFrom: string;
  orderId: string;
  website: string;
  screenshot: string;
  createdAt: string;
  driverName: string;
  driverReg: string;
  driverPhone: string;
  driverPhoto: string;
  deliveryScreenshot: string;
  screenshots: DeliveryShot[];
  clips: VideoClipMeta[];
  checksum: string;
  edits: { at: string; what: string; sha256: string }[];
};

function emptyDriver() {
  return {
    driverName: "",
    driverReg: "",
    driverPhone: "",
    driverPhoto: "",
    deliveryScreenshot: "",
    screenshots: [] as DeliveryShot[],
    clips: [] as VideoClipMeta[],
    checksum: "",
    edits: [] as { at: string; what: string; sha256: string }[],
  };
}

function readFile(file: File | undefined, then: (data: string) => void) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => then(String(reader.result || ""));
  reader.readAsDataURL(file);
}

function DriverFields({
  name,
  reg,
  phone,
  photo,
  shots,
  onName,
  onReg,
  onPhone,
  onPhoto,
  onShots,
  onFill,
}: {
  name: string;
  reg: string;
  phone: string;
  photo: string;
  shots: DeliveryShot[];
  onName: (v: string) => void;
  onReg: (v: string) => void;
  onPhone: (v: string) => void;
  onPhoto: (v: string) => void;
  onShots: (fn: (prev: DeliveryShot[]) => DeliveryShot[]) => void;
  onFill: (fill: UberOcrFill) => void;
}) {
  const [status, setStatus] = useState("");

  function addShot(kind: ShotKind, file: File | undefined) {
    if (!file) return;
    readFile(file, async (dataUrl) => {
      const id = `s-${Date.now()}`;
      const row: DeliveryShot = { id, kind, dataUrl, ocrText: "" };
      onShots((prev) => [...prev, row]);
      setStatus("Reading screenshot…");
      try {
        const text = await ocrImage(dataUrl);
        onShots((prev) => prev.map((s) => (s.id === id ? { ...s, ocrText: text } : s)));
        onFill(parseUberOcr(text));
        setStatus("Filled what we could read. Check the boxes — OCR misses things.");
      } catch {
        setStatus("Could not read that image. Type the boxes and keep the photos.");
      }
    });
  }

  const kinds: { id: ShotKind; label: string; hint: string }[] = [
    { id: "order", label: "Order screen", hint: "Driver name and order details" },
    { id: "vehicle", label: "Vehicle / reg", hint: "Number plate — usually a different screen" },
    { id: "other", label: "Another photo", hint: "Anything else from the drop-off" },
  ];

  return (
    <div className="space-y-2 rounded-radius border border-border bg-bg p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Driver (from screenshots)</p>
      <p className="text-xs text-muted">
        Order screen and vehicle registration are usually two screenshots. Add as many as you need. We try
        to fill the boxes from the text; you correct them.
      </p>
      <input
        value={name}
        onChange={(e) => onName(e.target.value)}
        placeholder="Driver name"
        className="w-full rounded-radius border border-border bg-surface px-3 py-3 text-fg"
      />
      <input
        value={reg}
        onChange={(e) => onReg(e.target.value)}
        placeholder="Vehicle registration"
        className="w-full rounded-radius border border-border bg-surface px-3 py-3 text-fg"
      />
      <input
        value={phone}
        onChange={(e) => onPhone(e.target.value)}
        inputMode="tel"
        placeholder="Phone (if they called)"
        className="w-full rounded-radius border border-border bg-surface px-3 py-3 text-fg"
      />
      {kinds.map((k) => (
        <label key={k.id} className="block text-sm text-muted">
          Add {k.label}
          <span className="mt-0.5 block text-xs">{k.hint}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => addShot(k.id, e.target.files?.[0])}
            className="mt-1 block w-full text-sm text-fg"
          />
        </label>
      ))}
      {status ? <p className="text-sm text-primary">{status}</p> : null}
      {shots.map((s) => (
        <div key={s.id} className="rounded-radius border border-border p-2">
          <p className="text-xs uppercase tracking-wide text-muted">{s.kind}</p>
          <img src={s.dataUrl} alt="" className="mt-1 max-h-36 rounded-radius" />
          <button
            type="button"
            onClick={() => onShots((prev) => prev.filter((x) => x.id !== s.id))}
            className="mt-1 text-sm text-muted"
          >
            Remove
          </button>
        </div>
      ))}
      <label className="block text-sm text-muted">
        Driver photo (if separate)
        <input
          type="file"
          accept="image/*"
          onChange={(e) => readFile(e.target.files?.[0], onPhoto)}
          className="mt-1 block w-full text-sm text-fg"
        />
      </label>
      {photo ? <img src={photo} alt="" className="max-h-36 rounded-radius" /> : null}
    </div>
  );
}

const STORE = "timeline-purchases-mock-v1";
const PERK_STORE = "timeline-delivery-perk-v1";

const SOURCE_HINT: Record<Source, string> = {
  Manual: "Type it yourself. Receipt in a drawer, cash, or you just remember.",
  Email: "Later: pick a receipt email. For now paste who it was from.",
  Amazon: "Later: order email or Amazon account. Order number is optional.",
  "Uber Eats": "Import from Gmail receipts (noreply@uber.com). Marketing mail is skipped.",
  Website: "Temu, HelloFresh, a shop checkout — paste the site.",
  Notification:
    "Screenshot the banner or notification shade. No need to log into the bank app.",
  "Bank screenshot": "Photo of a line inside the bank app, if you already have it open.",
};

function AddPurchasePage() {
  const [source, setSource] = useState<Source>("Manual");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => toIso(new Date()));
  const [items, setItems] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<Category>("Personal");
  const [emailFrom, setEmailFrom] = useState("");
  const [orderId, setOrderId] = useState("");
  const [website, setWebsite] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverReg, setDriverReg] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverPhoto, setDriverPhoto] = useState("");
  const [deliveryScreenshot, setDeliveryScreenshot] = useState("");
  const [formShots, setFormShots] = useState<DeliveryShot[]>([]);
  const [bankPaste, setBankPaste] = useState("");
  const [bankStatus, setBankStatus] = useState("");
  const bankFileRef = useRef<HTMLInputElement>(null);
  const [formClips, setFormClips] = useState<VideoClipMeta[]>([]);
  const [saved, setSaved] = useState<Purchase[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [deliveryPerk, setDeliveryPerk] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const list = JSON.parse(raw) as Purchase[];
        if (Array.isArray(list)) {
          setSaved(
            list.map((p) => ({
              ...emptyDriver(),
              ...p,
              screenshots: p.screenshots || [],
            })),
          );
        }
      }
      const perk = localStorage.getItem(PERK_STORE);
      if (perk === "on") setDeliveryPerk(true);
    } catch {
      /* ignore */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE, JSON.stringify(saved));
      localStorage.setItem(PERK_STORE, deliveryPerk ? "on" : "off");
    } catch {
      /* ignore */
    }
  }, [saved, deliveryPerk, ready]);

  function applyBankFill(text: string) {
    const f = parseBankOcr(text);
    if (f.merchant) setMerchant((v) => v || f.merchant);
    if (f.amount) setAmount((v) => v || f.amount);
    if (f.date) setDate(f.date);
    else if (source === "Notification") setDate(toIso(new Date()));
    if (f.items) setItems((v) => v || f.items);
    setNotice(
      [f.merchant && `Payee ${f.merchant}`, f.amount && `£${f.amount}`, f.date && f.date]
        .filter(Boolean)
        .join(" · ") || "Could not read a payee or amount — type them.",
    );
  }

  async function addBankShot(file: File | undefined) {
    if (!file) {
      setBankStatus("No photo came through. Try the button again, or paste the text.");
      return;
    }
    setBankStatus(`Got ${file.name || "photo"} (${Math.round(file.size / 1024)} KB). Showing it, then reading text…`);
    readFile(file, async (dataUrl) => {
      const id = `s-${Date.now()}`;
      setFormShots((prev) => [...prev, { id, kind: "other", dataUrl, ocrText: "" }]);
      setScreenshot(dataUrl);
      try {
        const text = await ocrImage(dataUrl);
        setFormShots((prev) => prev.map((s) => (s.id === id ? { ...s, ocrText: text } : s)));
        applyBankFill(text);
        setBankStatus("Filled what we could. Check merchant, £ and date.");
      } catch {
        setBankStatus("Photo is saved. Could not read the text — paste the line or type the boxes.");
      }
    });
  }

  function reset() {
    setMerchant("");
    setAmount("");
    setDate(toIso(new Date()));
    setItems("");
    setLocation("");
    setCategory("Personal");
    setEmailFrom("");
    setOrderId("");
    setWebsite("");
    setScreenshot("");
    setDriverName("");
    setDriverReg("");
    setDriverPhone("");
    setDriverPhoto("");
    setDeliveryScreenshot("");
    setFormShots([]);
    setFormClips([]);
    setBankPaste("");
    setBankStatus("");
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!merchant.trim() && !amount.trim()) {
      setNotice("Add who you paid or an amount, then Save.");
      return;
    }
    const id = `${Date.now()}`;
    const label = `${merchant.trim() || source} £${amount.trim() || "0"}`;
    const checksum = await sha256Text(
      JSON.stringify({ source, merchant, amount, date, items, location, category }),
    );
    logChecksum({
      relatedKind: "purchase",
      relatedId: id,
      href: "/purchases",
      label,
      sha256: checksum,
      action: "created",
      bytes: 0,
      durationSec: 0,
      clipStart: 0,
      clipEnd: 0,
    });
    for (const clip of formClips) {
      if (clip.originalSha256) {
        logChecksum({
          relatedKind: "purchase-clip-source",
          relatedId: id,
          href: "/purchases",
          label: `${label} · source ${clip.fileName}`,
          sha256: clip.originalSha256,
          action: "file-original",
          bytes: clip.bytes,
          durationSec: clip.durationSec,
          clipStart: clip.clipStart,
          clipEnd: clip.clipEnd,
        });
      }
      logChecksum({
        relatedKind: "purchase-clip",
        relatedId: id,
        href: "/purchases",
        label: `${label} · ${clip.clipFileName || clip.fileName}`,
        sha256: clip.clipSha256 || clip.sha256,
        action: "file-clip",
        bytes: clip.clipBytes || clip.bytes,
        durationSec: clip.durationSec,
        clipStart: clip.clipStart,
        clipEnd: clip.clipEnd,
      });
    }
    setSaved((list) => [
      {
        id,
        source,
        merchant: merchant.trim() || source,
        amount: amount.trim(),
        date,
        items: items.trim(),
        location,
        category,
        emailFrom: emailFrom.trim(),
        orderId: orderId.trim(),
        website: website.trim(),
        screenshot: formShots[0]?.dataUrl || screenshot,
        createdAt: nowStamp(),
        driverName: driverName.trim(),
        driverReg: driverReg.trim(),
        driverPhone: driverPhone.trim(),
        driverPhoto,
        deliveryScreenshot: formShots[0]?.dataUrl || deliveryScreenshot,
        screenshots: formShots,
        clips: formClips,
        checksum,
        edits: [{ at: nowStamp(), what: "created", sha256: checksum }],
      },
      ...list,
    ]);
    reset();
    setNotice("Saved to this device.");
  }

  async function importUberEats() {
    setNotice("Importing…");
    let list = uberEatsReceipts();
    if (!Array.isArray(list) || list.length === 0) {
      try {
        const res = await fetch("/data/uber-eats-imports.json");
        if (res.ok) list = (await res.json()) as typeof list;
      } catch {
        /* bundled copy is the main source */
      }
    }
    if (!Array.isArray(list) || list.length === 0) {
      setNotice("Receipts file did not load. Try refresh.");
      return;
    }
    const existingIds = new Set(
      saved.flatMap((p) => [p.orderId, p.id].filter(Boolean)),
    );
    const fresh = list.filter((r) => r?.id && !existingIds.has(r.id) && !existingIds.has(`uber-${r.id}`));
    if (fresh.length === 0) {
      setNotice(`Already imported — ${saved.filter((p) => p.source === "Uber Eats").length} Uber Eats on the list below.`);
      return;
    }
    setSaved((current) => [
      ...fresh.map((r) => ({
        id: `uber-${r.id}`,
        source: "Uber Eats" as const,
        merchant: r.merchant,
        amount: r.amount,
        date: r.date,
        items: [r.items, r.note].filter(Boolean).join(" · "),
        location: "Home",
        category: "Food" as const,
        emailFrom: "noreply@uber.com",
        orderId: r.id,
        website: "",
        screenshot: "",
        createdAt: nowStamp(),
        ...emptyDriver(),
      })),
      ...current,
    ]);
    setSource("Uber Eats");
    setNotice(`Imported ${fresh.length} Uber Eats receipts. List is under this button.`);
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-6">
      <Link to="/" className="text-sm font-semibold text-primary">
        ← Home
      </Link>
      <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-primary">Mock</p>
      <h1 className="text-3xl font-bold">Add purchase</h1>
      <p className="mt-2 text-sm text-muted">
        Several ways in: you type it, an email, Amazon, Uber Eats, another site, or a bank screenshot.
        Uber Eats import uses your real Gmail receipts (10 Sep 2026 pull).
      </p>

      <button
        type="button"
        onClick={importUberEats}
        className="mt-4 w-full rounded-radius bg-primary py-3 font-semibold text-bg"
      >
        Import Uber Eats from Gmail
      </button>
      {notice ? <p className="mt-3 text-sm font-semibold text-primary">{notice}</p> : null}
      {saved.filter((p) => p.source === "Uber Eats").length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-radius border border-border bg-surface p-3">
          {saved
            .filter((p) => p.source === "Uber Eats")
            .slice(0, 8)
            .map((p) => (
              <li key={p.id} className="text-sm">
                {p.merchant} · £{p.amount} · {formatUk(p.date)}
              </li>
            ))}
        </ul>
      ) : null}

      <fieldset className="mt-6 space-y-3 rounded-radius border border-border bg-surface p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          How did this arrive?
        </legend>
        <p className="text-sm font-semibold text-primary">Arrived as: {source}</p>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Or pick from this list
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as Source);
              setNotice("");
            }}
            className="mt-1 min-h-11 w-full rounded-radius border border-border bg-bg px-3 text-fg"
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="relative z-10 flex flex-wrap gap-2">
          {SOURCES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={source === s}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSource(s);
                setNotice("");
              }}
              className={`relative z-10 min-h-11 rounded-full border px-3 text-sm font-semibold ${
                source === s ? "border-primary bg-primary text-bg" : "border-border bg-bg text-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">{SOURCE_HINT[source]}</p>
      </fieldset>

      {source === "Bank screenshot" || source === "Notification" ? (
        <div className="mt-4 space-y-3 rounded-radius border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {source === "Notification" ? "Notification screenshot" : "Bank screenshots"}
          </p>
          <p className="text-xs text-muted">
            {source === "Notification"
              ? "Shade or banner — no need to open the bank app. Starling “You spent £… at …” works."
              : "A line inside the bank app. Use Notification if you would rather not log in."}
          </p>
          <input
            ref={bankFileRef}
            type="file"
            accept="image/*,image/jpeg,image/png"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              addBankShot(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => bankFileRef.current?.click()}
            className="min-h-12 w-full rounded-radius bg-primary py-3 font-semibold text-bg"
          >
            Choose photo
          </button>
          {formShots.map((s) => (
            <div key={s.id} className="rounded-radius border border-border p-2">
              <img src={s.dataUrl} alt="" className="max-h-48 w-full rounded-radius object-contain" />
              {s.ocrText ? (
                <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-xs text-muted">{s.ocrText}</pre>
              ) : null}
              <button
                type="button"
                onClick={() => setFormShots((list) => list.filter((x) => x.id !== s.id))}
                className="mt-1 text-sm text-muted"
              >
                Remove
              </button>
            </div>
          ))}
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
            Or paste the notification text
            <textarea
              value={bankPaste}
              onChange={(e) => setBankPaste(e.target.value)}
              rows={4}
              placeholder={"Starling\nYou spent £42.32 at Uber Eats"}
              className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (!bankPaste.trim()) {
                setBankStatus("Paste a few lines first, or use the sample.");
                return;
              }
              applyBankFill(bankPaste);
              setBankStatus("Read from pasted text. Check the boxes below.");
            }}
            className="min-h-11 w-full rounded-radius border border-primary px-3 text-sm font-semibold text-primary"
          >
            Read pasted text
          </button>
          <button
            type="button"
            onClick={() => {
              const sample = "Starling\nYou spent £42.32 at Uber Eats\nThu 10 Sept";
              setBankPaste(sample);
              applyBankFill(sample);
              setBankStatus("Sample Starling line filled. Check Uber Eats and £42.32 below.");
            }}
            className="min-h-11 w-full rounded-radius border border-border px-3 text-sm font-semibold text-muted"
          >
            Use Starling £42.32 sample
          </button>
          {bankStatus ? <p className="text-sm font-semibold text-primary">{bankStatus}</p> : null}
        </div>
      ) : null}

      <form onSubmit={save} className="mt-4 space-y-4 rounded-radius border border-border bg-surface p-4">

        {source === "Email" ? (
          <input
            value={emailFrom}
            onChange={(e) => setEmailFrom(e.target.value)}
            placeholder="From: receipts@…"
            className="w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        ) : null}
        {source === "Amazon" ? (
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="Order number (optional)"
            className="w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        ) : null}
        {source === "Website" ? (
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        ) : null}

        <input
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder={
            source === "Uber Eats" ? "Restaurant or shop" : source === "Amazon" ? "Amazon" : "Who did you pay?"
          }
          className="w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
        />
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Amount (£)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        </label>

        <p className="text-sm font-semibold text-primary">Category: {category}</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => {
                setCategory(c);
                setNotice("");
              }}
              className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${
                category === c ? "border-primary bg-primary text-bg" : "border-border bg-bg text-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <textarea
          value={items}
          onChange={(e) => setItems(e.target.value)}
          rows={2}
          placeholder="What was it? (optional)"
          className="w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
        />
        <LocationPicker value={location} onChange={setLocation} />

        {source === "Uber Eats" && deliveryPerk ? (
          <DriverFields
            name={driverName}
            reg={driverReg}
            phone={driverPhone}
            photo={driverPhoto}
            shots={formShots}
            onName={setDriverName}
            onReg={setDriverReg}
            onPhone={setDriverPhone}
            onPhoto={setDriverPhoto}
            onShots={setFormShots}
            onFill={(f) => {
              if (f.driverName) setDriverName((v) => v || f.driverName);
              if (f.driverReg) setDriverReg((v) => v || f.driverReg);
              if (f.driverPhone) setDriverPhone((v) => v || f.driverPhone);
              if (f.amount) setAmount((v) => v || f.amount);
              if (f.merchant) setMerchant((v) => v || f.merchant);
            }}
          />
        ) : source === "Uber Eats" ? (
          <p className="text-sm text-muted">
            Driver details are part of the Delivery tracking perk — turn it on below if you use takeaway
            or home shopping a lot.
          </p>
        ) : null}

        {source === "Uber Eats" && deliveryPerk ? (
          <>
            <VideoClipPicker
              onPicked={(clip) => {
                setFormClips((list) => [clip, ...list]);
                setNotice("Clip points kept. Original file was not edited.");
              }}
            />
            {formClips.map((c) => (
              <p key={c.clipSha256 || c.originalSha256} className="text-xs text-muted">
                {c.clipFileName || c.fileName} · clip {c.clipSha256 ? `${c.clipSha256.slice(0, 8)}…` : "pending"}
              </p>
            ))}
          </>
        ) : null}

        {notice ? <p className="text-sm font-semibold text-primary">{notice}</p> : null}

        <button
          type="button"
          onClick={() => save()}
          className="w-full rounded-radius bg-primary py-3 font-semibold text-bg"
        >
          Save to timeline
        </button>
      </form>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Logged purchases</h2>
        {saved.length === 0 ? (
          <p className="mt-3 text-sm text-muted">None yet. Try Manual, then a bank screenshot.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {saved.map((p) => (
              <li key={p.id} className="rounded-radius border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-muted">
                  {p.source} · {p.category}
                </p>
                <p className="text-lg font-semibold">{p.merchant}</p>
                {p.amount ? <p className="text-primary">£{p.amount}</p> : null}
                <p className="text-sm text-muted">{formatUk(p.date)}</p>
                {p.location ? <p className="text-sm text-muted">Location · {p.location}</p> : null}
                {p.items ? <p className="mt-1 text-sm">{p.items}</p> : null}
                {p.emailFrom ? <p className="text-xs text-muted">From {p.emailFrom}</p> : null}
                {p.orderId ? <p className="text-xs text-muted">Order {p.orderId}</p> : null}
                {p.website ? <p className="text-xs text-muted">{p.website}</p> : null}
                {p.screenshot ? (
                  <img src={p.screenshot} alt="" className="mt-2 max-h-32 rounded-radius" />
                ) : null}
                {p.source === "Uber Eats" && deliveryPerk ? (
                  <div className="mt-3">
                    {p.driverName || p.driverReg || p.driverPhone ? (
                      <p className="text-sm">
                        Driver {p.driverName || "unknown"}
                        {p.driverReg ? ` · ${p.driverReg}` : ""}
                        {p.driverPhone ? ` · ${p.driverPhone}` : ""}
                      </p>
                    ) : (
                      <p className="text-sm text-muted">No driver details yet — add from the delivery screen.</p>
                    )}
                    {p.deliveryScreenshot ? (
                      <img src={p.deliveryScreenshot} alt="" className="mt-2 max-h-32 rounded-radius" />
                    ) : null}
                    {p.driverPhoto ? (
                      <img src={p.driverPhoto} alt="" className="mt-2 max-h-32 rounded-radius" />
                    ) : null}
                    <DriverFields
                      name={p.driverName}
                      reg={p.driverReg}
                      phone={p.driverPhone}
                      photo={p.driverPhoto}
                      shots={p.screenshots || []}
                      onName={(v) =>
                        setSaved((list) => list.map((x) => (x.id === p.id ? { ...x, driverName: v } : x)))
                      }
                      onReg={(v) =>
                        setSaved((list) => list.map((x) => (x.id === p.id ? { ...x, driverReg: v } : x)))
                      }
                      onPhone={(v) =>
                        setSaved((list) => list.map((x) => (x.id === p.id ? { ...x, driverPhone: v } : x)))
                      }
                      onPhoto={(v) =>
                        setSaved((list) => list.map((x) => (x.id === p.id ? { ...x, driverPhoto: v } : x)))
                      }
                      onShots={(fn) =>
                        setSaved((list) =>
                          list.map((x) => (x.id === p.id ? { ...x, screenshots: fn(x.screenshots || []) } : x)),
                        )
                      }
                      onFill={(f) =>
                        setSaved((list) =>
                          list.map((x) =>
                            x.id === p.id
                              ? {
                                  ...x,
                                  driverName: x.driverName || f.driverName,
                                  driverReg: x.driverReg || f.driverReg,
                                  driverPhone: x.driverPhone || f.driverPhone,
                                  amount: x.amount || f.amount,
                                  merchant: x.merchant || f.merchant,
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </div>
                ) : null}
                {p.checksum ? (
                  <p className="mt-2 break-all font-mono text-xs text-muted">sha {p.checksum.slice(0, 12)}…</p>
                ) : null}
                {(p.edits || []).length > 1 ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {p.edits.map((ed, i) => (
                      <li key={`${p.id}-ed-${i}`}>
                        {ed.at} — {ed.what} — {ed.sha256.slice(0, 8)}…
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(p.clips || []).map((c) => (
                  <div key={c.clipSha256 || c.originalSha256 || c.fileName} className="mt-2 text-xs text-muted">
                    <p>
                      Clip {c.clipFileName || c.fileName} · {formatClock(c.clipStart)}–{formatClock(c.clipEnd)} of{" "}
                      {formatClock(c.durationSec)}
                      {c.savedCopy ? " · copy saved" : ""}
                    </p>
                    {c.clipSha256 ? (
                      <p className="break-all font-mono">clip {c.clipSha256}</p>
                    ) : null}
                    {c.originalSha256 ? (
                      <p className="break-all font-mono">source {c.originalSha256}</p>
                    ) : null}
                  </div>
                ))}
                {p.source === "Uber Eats" && deliveryPerk ? (
                  <div className="mt-3">
                    <VideoClipPicker
                      onPicked={(clip) => {
                        setSaved((list) =>
                          list.map((x) =>
                            x.id === p.id ? { ...x, clips: [clip, ...(x.clips || [])] } : x,
                          ),
                        );
                        logChecksum({
                          relatedKind: "purchase-clip",
                          relatedId: p.id,
                          href: "/purchases",
                          label: `${p.merchant} · ${clip.clipFileName || clip.fileName}`,
                          sha256: clip.clipSha256 || clip.sha256,
                          action: "file-clip",
                          bytes: clip.clipBytes || clip.bytes,
                          durationSec: clip.durationSec,
                          clipStart: clip.clipStart,
                          clipEnd: clip.clipEnd,
                        });
                        if (clip.originalSha256) {
                          logChecksum({
                            relatedKind: "purchase-clip-source",
                            relatedId: p.id,
                            href: "/purchases",
                            label: `${p.merchant} · source ${clip.fileName}`,
                            sha256: clip.originalSha256,
                            action: "file-original",
                            bytes: clip.bytes,
                            durationSec: clip.durationSec,
                            clipStart: clip.clipStart,
                            clipEnd: clip.clipEnd,
                          });
                        }
                      }}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSaved((list) => list.filter((x) => x.id !== p.id))}
                  className="mt-3 text-sm text-muted"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-radius border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold">Delivery tracking perk</h2>
        <p className="mt-2 text-sm text-muted">
          Driver name, vehicle registration, photo, phone, doorbell video and phone recordings. Off by
          default — not everyone uses takeaway or home shopping. In the real app this would cost credits
          or sit on a subscription. Preview can turn it on to try the layout.
        </p>
        <button
          type="button"
          onClick={() => setDeliveryPerk((v) => !v)}
          className={`mt-4 min-h-11 w-full rounded-radius border px-4 py-3 font-semibold ${
            deliveryPerk ? "border-primary bg-primary text-bg" : "border-border bg-bg text-muted"
          }`}
        >
          {deliveryPerk ? "Perk on (preview)" : "Perk off — turn on to try"}
        </button>
        {deliveryPerk ? (
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
            <li>Later: doorbell / home security clip of the driver pulling up and walking to the door</li>
            <li>Later: phone screen recording (live tracking)</li>
            <li>Later: phone camera recording of the drop-off</li>
          </ul>
        ) : null}
      </section>
    </main>
  );
}
