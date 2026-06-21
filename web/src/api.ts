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
  | "proposal" | "offer" | "rejected" | "ghosted" | "withdrawn";

export type Priority = "high" | "medium" | "low";

export interface Posting {
  id: number;
  url: string;
  title: string;
  company_id: number | null;
  company_name: string | null;
  location: string | null;
  remote: string | null;
  seniority: string | null;
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

  updatePosting: (id: number, payload: unknown) =>
    request<Posting>(`/api/postings/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  addEvent: (appId: number, payload: unknown) =>
    request<Application>(`/api/applications/${appId}/events`, { method: "POST", body: JSON.stringify(payload) }),

  updateEvent: (appId: number, eventId: number, payload: unknown) =>
    request<Application>(`/api/applications/${appId}/events/${eventId}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteEvent: (appId: number, eventId: number) =>
    request<Application>(`/api/applications/${appId}/events/${eventId}`, { method: "DELETE" }),

  lookup: (url: string) =>
    request<Lookup>(`/api/postings/lookup?url=${encodeURIComponent(url)}`),

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

  importCsv: async (file: File): Promise<ImportResult> => {
    const form = new FormData();
    form.append("file", file);
    // No Content-Type header: the browser sets the multipart boundary.
    const res = await fetch("/api/import/csv", {
      method: "POST",
      headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
      body: form,
    });
    if (!res.ok) throw new ApiError(res.status, (await res.json()).detail ?? "Import failed");
    return res.json();
  },
};

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}
