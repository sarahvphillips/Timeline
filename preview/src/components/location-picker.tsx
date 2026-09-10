import { useMemo, useState } from "react";
import { placeChoices } from "@/lib/places";

export function LocationPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const choices = useMemo(() => placeChoices(custom || value), [custom, value]);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Location</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={!value}
          onClick={() => onChange("")}
          className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${
            !value ? "border-primary bg-primary text-bg" : "border-border bg-bg text-muted"
          }`}
        >
          None
        </button>
        {choices.map((name) => {
          const on = value.toLowerCase() === name.toLowerCase();
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(name)}
              className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${
                on ? "border-primary bg-primary text-bg" : "border-border bg-bg text-muted"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>
      <input
        value={custom}
        onChange={(e) => {
          setCustom(e.target.value);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        placeholder="Or type: XYZ on the high street"
        className="mt-2 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
      />
    </div>
  );
}
