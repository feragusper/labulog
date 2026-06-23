export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
}

// Compact ISO-3166 list (English names). Stored value is the code.
export const COUNTRIES: Country[] = [
  { code: "AR", name: "Argentina" }, { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" }, { code: "BE", name: "Belgium" },
  { code: "BO", name: "Bolivia" }, { code: "BR", name: "Brazil" },
  { code: "BG", name: "Bulgaria" }, { code: "CA", name: "Canada" },
  { code: "CL", name: "Chile" }, { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" }, { code: "CR", name: "Costa Rica" },
  { code: "HR", name: "Croatia" }, { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" }, { code: "DO", name: "Dominican Republic" },
  { code: "EC", name: "Ecuador" }, { code: "EG", name: "Egypt" },
  { code: "SV", name: "El Salvador" }, { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" }, { code: "FR", name: "France" },
  { code: "DE", name: "Germany" }, { code: "GR", name: "Greece" },
  { code: "GT", name: "Guatemala" }, { code: "HN", name: "Honduras" },
  { code: "HK", name: "Hong Kong" }, { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" }, { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" }, { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" }, { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" }, { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" }, { code: "LU", name: "Luxembourg" },
  { code: "MY", name: "Malaysia" }, { code: "MT", name: "Malta" },
  { code: "MX", name: "Mexico" }, { code: "MA", name: "Morocco" },
  { code: "NL", name: "Netherlands" }, { code: "NZ", name: "New Zealand" },
  { code: "NI", name: "Nicaragua" }, { code: "NO", name: "Norway" },
  { code: "PA", name: "Panama" }, { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" }, { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" }, { code: "PT", name: "Portugal" },
  { code: "PR", name: "Puerto Rico" }, { code: "RO", name: "Romania" },
  { code: "RS", name: "Serbia" }, { code: "SG", name: "Singapore" },
  { code: "SK", name: "Slovakia" }, { code: "SI", name: "Slovenia" },
  { code: "ZA", name: "South Africa" }, { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" }, { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" }, { code: "TW", name: "Taiwan" },
  { code: "TH", name: "Thailand" }, { code: "TR", name: "Türkiye" },
  { code: "UA", name: "Ukraine" }, { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" }, { code: "US", name: "United States" },
  { code: "UY", name: "Uruguay" }, { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Vietnam" },
];

// Synonyms so autofill values like "Spain"/"España"/"USA" map to a code.
const ALIASES: Record<string, string> = {
  españa: "ES", espana: "ES", spain: "ES",
  usa: "US", "united states of america": "US", "estados unidos": "US",
  uk: "GB", "great britain": "GB", "reino unido": "GB", england: "GB",
  alemania: "DE", germany: "DE", deutschland: "DE",
  francia: "FR", italia: "IT", "países bajos": "NL", holanda: "NL", netherlands: "NL",
  argentina: "AR", brasil: "BR", brazil: "BR", méxico: "MX", mexico: "MX",
  portugal: "PT", irlanda: "IE", suiza: "CH", remoto: "", remote: "",
};

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
const BY_NAME = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c.code]));

export function flag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  return code.toUpperCase().replace(/./g, (ch) =>
    String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

export function countryName(code: string): string {
  return BY_CODE.get(code.toUpperCase())?.name ?? code;
}

// Render any stored value (code or legacy free text) as "🏳️ Name".
export function countryDisplay(value: string | null | undefined): string {
  if (!value) return "—";
  const c = BY_CODE.get(value.toUpperCase());
  if (c) return `${flag(c.code)} ${c.name}`;
  return value; // legacy free text
}

// Normalize a scraped/free-text value to a code when possible.
export function toCountryCode(input: string | null | undefined): string {
  if (!input) return "";
  const v = input.trim();
  if (BY_CODE.has(v.toUpperCase())) return v.toUpperCase();
  const lower = v.toLowerCase();
  return BY_NAME.get(lower) ?? ALIASES[lower] ?? "";
}

export function searchCountries(query: string): Country[] {
  const q = query.trim().toLowerCase();
  if (!q) return COUNTRIES;
  return COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
}
