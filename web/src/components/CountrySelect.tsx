import { useEffect, useRef, useState } from "react";
import { countryName, flag, searchCountries } from "../countries";

export default function CountrySelect({
  value, onChange, placeholder,
}: {
  value: string;                       // ISO-2 code or ""
  onChange: (code: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value ? countryName(value) : "");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Keep the text in sync if the value is set from outside (e.g. autofill).
  useEffect(() => { setQuery(value ? countryName(value) : ""); }, [value]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const matches = open ? searchCountries(query).slice(0, 8) : [];

  const pick = (code: string) => {
    onChange(code);
    setQuery(countryName(code));
    setOpen(false);
  };

  return (
    <div className="country-select" ref={ref}>
      <span className="country-flag">{value ? flag(value) : "🌐"}</span>
      <input
        value={query}
        placeholder={placeholder ?? "País…"}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHi(0); if (!e.target.value) onChange(""); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && matches[hi]) { e.preventDefault(); pick(matches[hi].code); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && matches.length > 0 && (
        <ul className="country-list">
          {matches.map((c, i) => (
            <li
              key={c.code}
              className={i === hi ? "hi" : ""}
              onMouseDown={(e) => { e.preventDefault(); pick(c.code); }}
              onMouseEnter={() => setHi(i)}
            >
              <span className="country-flag">{flag(c.code)}</span>{c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
