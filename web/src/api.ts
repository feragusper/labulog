// Thin fetch wrapper. Token lives in localStorage; API is same-origin (dev via vite proxy).

const TOKEN_KEY = "labulog_token";

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;
  if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* non-json */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---- types ----
export type AppStatus =
  | "saved" | "applied" | "first_contact" | "screening"
  | "technical_interview" | "manager_interview" | "interview"
  | "proposal" | "offer" | "accepted" | "rejected" | "cancelled" | "ghosted" | "withdrawn";

export type Priority = "high" | "medium" | "low";

export interface Posting {
  id: number;
  url: string;
  title: string;
  company_id: number | null;
  company_name: string | null;
  location: string | null;
  country: string | null;
  remote: string | null;
  seniority: string | null;
  industry: string | null;
  commitment: string | null;
  salary_period: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  source: string | null;
  posted_at: string | null;
  first_seen_at: string;
  is_ghost: boolean;
}

export interface StatusEvent {
  id: number;
  status: AppStatus;
  at: string;
  note: string | null;
}

export interface Contact {
  id: number;
  name: string;
  role: string | null;
  stage: AppStatus | null;
  note: string | null;
}

export interface Attachment {
  id: number;
  filename: string;
  content_type: string | null;
  size: number;
  created_at: string;
}

export interface Application {
  id: number;
  status: AppStatus;
  priority: Priority | null;
  follow_up_date: string | null;
  applied_at: string | null;
  channel: string | null;
  resume_version: string | null;
  referral: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  posting: Posting;
  events: StatusEvent[];
  contacts: Contact[];
  attachments: Attachment[];
}

// ---- interview simulations ----
export type SimStage = "screening" | "management" | "technical" | "mixed";
export type SimRunStatus = "draft" | "in_progress" | "done";
export type SectionKind = "theory" | "live_coding" | "open";

export interface SimQuestion {
  q: string;
  a: string | null;
}

export interface SimSection {
  title: string;
  kind: SectionKind;
  topic: string | null;
  duration_seconds: number;
  prompt: string | null;
  questions: SimQuestion[];
}

export interface SimSectionResult {
  elapsed_seconds: number;
  rating: number | null; // 1..5 self-rating
  notes: string;
  checked: boolean[]; // per-question "I nailed it" (theory/open)
}

export interface SimResults {
  sections: SimSectionResult[];
  overall_rating: number | null;
  overall_notes: string;
}

export interface SimRun {
  id: number;
  application_id: number;
  title: string;
  stage: SimStage;
  status: SimRunStatus;
  sections: SimSection[];
  results: Partial<SimResults>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface SimTemplate {
  id: number;
  title: string;
  stage: SimStage;
  sections: SimSection[];
  created_at: string;
}

export interface SimMeta {
  stages: SimStage[];
  topics: { key: string; label: string }[];
}

export interface Funnel {
  total: number;
  by_status: Record<AppStatus, number>;
  response_rate: number;
  interview_rate: number;
  offer_rate: number;
  ghost_count: number;
}

export interface Lookup {
  posting: Posting | null;
  already_applied: boolean;
  application_id: number | null;
  status: AppStatus | null;
}

// ---- endpoints ----
export const api = {
  register: (email: string, password: string) =>
    request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),

  login: async (email: string, password: string) => {
    const body = new URLSearchParams({ username: email, password });
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new ApiError(res.status, (await res.json()).detail ?? "Login failed");
    const data = await res.json();
    auth.set(data.access_token);
    return data;
  },

  me: () => request<{ id: number; email: string }>("/api/auth/me"),

  authConfig: () => request<{ google_client_id: string }>("/api/auth/config"),

  googleLogin: async (credential: string) => {
    const data = await request<{ access_token: string }>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });
    auth.set(data.access_token);
    return data;
  },

  listApplications: () => request<Application[]>("/api/applications"),

  getApplication: (id: number) => request<Application>(`/api/applications/${id}`),

  createApplication: (payload: unknown) =>
    request<Application>("/api/applications", { method: "POST", body: JSON.stringify(payload) }),

  updateApplication: (id: number, payload: unknown) =>
    request<Application>(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteApplication: (id: number) =>
    request<void>(`/api/applications/${id}`, { method: "DELETE" }),

  scrape: (url: string) =>
    request<ScrapeResult>("/api/postings/scrape", { method: "POST", body: JSON.stringify({ url }) }),

  updatePosting: (id: number, payload: unknown) =>
    request<Posting>(`/api/postings/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  addEvent: (appId: number, payload: unknown) =>
    request<Application>(`/api/applications/${appId}/events`, { method: "POST", body: JSON.stringify(payload) }),

  updateEvent: (appId: number, eventId: number, payload: unknown) =>
    request<Application>(`/api/applications/${appId}/events/${eventId}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteEvent: (appId: number, eventId: number) =>
    request<Application>(`/api/applications/${appId}/events/${eventId}`, { method: "DELETE" }),

  addContact: (appId: number, payload: unknown) =>
    request<Application>(`/api/applications/${appId}/contacts`, { method: "POST", body: JSON.stringify(payload) }),

  updateContact: (appId: number, contactId: number, payload: unknown) =>
    request<Application>(`/api/applications/${appId}/contacts/${contactId}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteContact: (appId: number, contactId: number) =>
    request<Application>(`/api/applications/${appId}/contacts/${contactId}`, { method: "DELETE" }),

  addAttachments: async (appId: number, files: FileList | File[]): Promise<Application> => {
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    const res = await fetch(`/api/applications/${appId}/attachments`, {
      method: "POST",
      headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
      body: form,
    });
    if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).detail ?? "Upload failed");
    return res.json();
  },

  deleteAttachment: (appId: number, attId: number) =>
    request<Application>(`/api/applications/${appId}/attachments/${attId}`, { method: "DELETE" }),

  downloadAttachment: async (appId: number, att: Attachment): Promise<void> => {
    const res = await fetch(`/api/applications/${appId}/attachments/${att.id}`, {
      headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, "Download failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  lookup: (url: string) =>
    request<Lookup>(`/api/postings/lookup?url=${encodeURIComponent(url)}`),

  // ---- interview simulations ----
  simMeta: (lang: string) => request<SimMeta>(`/api/sim/meta?lang=${lang}`),

  simGenerate: (payload: { stage: SimStage; topics: string[]; application_id?: number; lang: string }) =>
    request<{ title: string; stage: SimStage; sections: SimSection[] }>(
      "/api/sim/generate", { method: "POST", body: JSON.stringify(payload) }),

  listSimRuns: (applicationId: number) =>
    request<SimRun[]>(`/api/sim/runs?application_id=${applicationId}`),

  getSimRun: (runId: number) => request<SimRun>(`/api/sim/runs/${runId}`),

  createSimRun: (payload: { application_id: number; title: string; stage: SimStage; sections: SimSection[] }) =>
    request<SimRun>("/api/sim/runs", { method: "POST", body: JSON.stringify(payload) }),

  updateSimRun: (runId: number, payload: Partial<{ title: string; status: SimRunStatus; results: Partial<SimResults>; started_at: string; completed_at: string }>) =>
    request<SimRun>(`/api/sim/runs/${runId}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteSimRun: (runId: number) =>
    request<void>(`/api/sim/runs/${runId}`, { method: "DELETE" }),

  listSimTemplates: () => request<SimTemplate[]>("/api/sim/templates"),

  createSimTemplate: (payload: { title: string; stage: SimStage; sections: SimSection[] }) =>
    request<SimTemplate>("/api/sim/templates", { method: "POST", body: JSON.stringify(payload) }),

  deleteSimTemplate: (id: number) =>
    request<void>(`/api/sim/templates/${id}`, { method: "DELETE" }),

  funnel: () => request<Funnel>("/api/stats/funnel"),

  exportCsv: async (): Promise<void> => {
    const res = await fetch("/api/applications/export.csv", {
      headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, "Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "labulog-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  },

  importApplications: async (file: File): Promise<ImportResult> => {
    const form = new FormData();
    form.append("file", file);
    // No Content-Type header: the browser sets the multipart boundary.
    const res = await fetch("/api/import/applications", {
      method: "POST",
      headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
      body: form,
    });
    if (!res.ok) throw new ApiError(res.status, (await res.json()).detail ?? "Import failed");
    return res.json();
  },
};

export interface PendingPosting {
  url: string | null;
  title: string;
  company_name: string;
  location: string | null;
  country: string | null;
  industry: string | null;
  commitment: string | null;
  salary_period: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  source: string | null;
}

export interface PendingRow {
  reason: string;
  posting: PendingPosting;
  status: AppStatus;
  priority: Priority | null;
  applied_at: string | null;
  follow_up_date: string | null;
  notes: string | null;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  pending: PendingRow[];
}

export interface ScrapeResult {
  title: string | null;
  company_name: string | null;
  location: string | null;
  country: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  source: string | null;
  description: string | null;
}
