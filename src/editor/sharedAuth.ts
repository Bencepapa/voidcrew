import { createElement, useCallback, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from "react";
import { t } from "../i18n";

const project = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const sharedConfigured = Boolean(project && key);
// the store's base URL (for public object URLs and per-store cache keys)
export const sharedProject = project;

const SESSION_KEY = "voidcrew-shared-session";
const LAST_EMAIL_KEY = "voidcrew-shared-last-email";
const EXPIRY_MARGIN_MS = 60_000;

export interface SharedSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: { email?: string };
}

// Whether the access token expires within the refresh margin (pure, testable).
export function sessionNeedsRefresh(expiresAt: number, now = Date.now()) {
  return expiresAt - now < EXPIRY_MARGIN_MS;
}

function readStorage(storageKey: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeStorage(storageKey: string, value: string) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey, value);
  } catch {
    /* storage unavailable: keep the session in memory */
  }
}

function removeStorage(storageKey: string) {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(storageKey);
  } catch {
    /* storage unavailable */
  }
}

function clearStoredSession() {
  removeStorage(SESSION_KEY);
}

function readStoredSession(): SharedSession | null {
  const raw = readStorage(SESSION_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SharedSession>;
    if (typeof value.access_token !== "string" || !value.access_token) return null;
    return {
      access_token: value.access_token,
      refresh_token: typeof value.refresh_token === "string" ? value.refresh_token : "",
      expires_at: typeof value.expires_at === "number" ? value.expires_at : 0,
      email: typeof value.email === "string" ? value.email : "",
    };
  } catch {
    return null;
  }
}

function sessionFromResponse(data: TokenResponse, email: string, previousRefresh = ""): SharedSession | null {
  if (!data.access_token) return null;
  const seconds = typeof data.expires_at === "number" ? data.expires_at : 0;
  const expires_at = seconds > 0
    ? (seconds < 1e12 ? seconds * 1000 : seconds)
    : Date.now() + (typeof data.expires_in === "number" ? data.expires_in * 1000 : 3_600_000);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? previousRefresh,
    expires_at,
    email: data.user?.email ?? email,
  };
}

// the signed-in editor's access token and name
let token = "";
let signedInName = "";
let session: SharedSession | null = null;
let persistSession = false;
let staySignedIn = true;
let generation = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshInFlight: Promise<string> | null = null;
let restoreStarted = false;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => void listeners.delete(listener); };

export function sharedToken() {
  return token;
}

// (called when the sign-in state changes: sign-in, sign-out, a refused session)
export const subscribeSharedAuth = subscribe;

function currentSignedInName() {
  return signedInName;
}

function currentStaySignedIn() {
  return staySignedIn;
}

function setStaySignedIn(value: boolean) {
  if (staySignedIn === value) return;
  staySignedIn = value;
  emit();
}

function scheduleRefresh(delay?: number) {
  if (refreshTimer !== null) { clearTimeout(refreshTimer); refreshTimer = null; }
  if (!session || typeof window === "undefined") return;
  const wait = delay ?? Math.max(5_000, session.expires_at - Date.now() - EXPIRY_MARGIN_MS);
  refreshTimer = setTimeout(() => { void refreshTick(); }, wait);
}

async function refreshTick() {
  const fresh = await refreshSession();
  if (!session) return;
  scheduleRefresh(fresh ? undefined : 30_000);
}

function applySession(next: SharedSession | null, persist: boolean) {
  session = next;
  persistSession = Boolean(next && persist);
  token = next?.access_token ?? "";
  signedInName = next?.email ? next.email.split("@")[0] : "";
  if (next && persistSession) {
    writeStorage(SESSION_KEY, JSON.stringify({
      access_token: next.access_token,
      refresh_token: next.refresh_token,
      expires_at: next.expires_at,
      email: next.email,
    }));
  } else if (!next) {
    clearStoredSession();
  }
  scheduleRefresh();
  emit();
}

function clearAuth() {
  generation++;
  session = null;
  persistSession = false;
  token = "";
  signedInName = "";
  clearStoredSession();
  if (refreshTimer !== null) { clearTimeout(refreshTimer); refreshTimer = null; }
  emit();
}

function refreshSession(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;
  const current = session;
  if (!current?.refresh_token) return Promise.resolve("");
  const startedAt = generation;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(project + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: {
        apikey: key, "Content-Type": "application/json",
      }, body: JSON.stringify({ refresh_token: current.refresh_token }) });
      if (generation !== startedAt) return "";
      if (!res.ok) {
        if (res.status === 400 || res.status === 401) clearAuth();
        return "";
      }
      const data = await res.json().catch(() => null) as TokenResponse | null;
      if (generation !== startedAt) return "";
      const next = data && sessionFromResponse(data, current.email, current.refresh_token);
      if (!next) { clearAuth(); return ""; }
      applySession(next, persistSession);
      return next.access_token;
    } catch {
      return "";
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = (authToken: string) => fetch(project + path, { ...init, headers: {
    apikey: key, ...(authToken ? { Authorization: "Bearer " + authToken } : {}),
    "Content-Type": "application/json", ...init.headers,
  } });
  let res = await send(token);
  if (res.status === 401 && session?.refresh_token) {
    const fresh = await refreshSession();
    if (fresh) res = await send(fresh);
  }
  if (res.status === 401) clearAuth();
  return res;
}

async function checkMembership(): Promise<boolean | null> {
  try {
    const res = await authorizedFetch("/rest/v1/void_editors?select=user_id");
    if (res.ok) {
      const rows = await res.json().catch(() => null);
      return Array.isArray(rows) ? rows.length > 0 : null;
    }
    return res.status === 401 || res.status === 403 ? false : null;
  } catch {
    return null;
  }
}

async function restoreSession() {
  if (restoreStarted) return;
  restoreStarted = true;
  const stored = readStoredSession();
  if (!stored) return;
  if (stored.email) writeStorage(LAST_EMAIL_KEY, stored.email);
  applySession(stored, true);
  const restoreGeneration = generation;
  if (sessionNeedsRefresh(stored.expires_at)) {
    if (!stored.refresh_token) { clearAuth(); return; }
    const fresh = await refreshSession();
    if (generation !== restoreGeneration) return;
    if (!fresh) return;
  }
  const member = await checkMembership();
  if (generation !== restoreGeneration) return;
  if (member === false) clearAuth();
}

export async function sharedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await authorizedFetch(path, init);
  if (!res.ok) {
    if (res.status === 409) throw new Error(t("editorShell.shared.newerVersion"));
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.message || detail.msg || res.statusText);
  }
  const text = await res.text();
  return JSON.parse(text || "null");
}

export class SharedHttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "SharedHttpError"; }
}

// One storage upload (append-only: never overwrites; an existing object is a 409).
export async function sharedUpload(path: string, body: Blob | string, contentType: string): Promise<void> {
  const res = await authorizedFetch(path, { method: "POST", body, headers: {
    "Content-Type": contentType, "x-upsert": "false",
  } });
  if (res.ok) return;
  const detail = await res.json().catch(() => ({}));
  throw new SharedHttpError(detail.message || detail.msg || detail.error || res.statusText, res.status);
}
export interface SharedAuth {
  token: string;
  signedInName: string;
  email: string;
  password: string;
  staySignedIn: boolean;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  setStaySignedIn: (value: boolean) => void;
  signIn: () => Promise<void>;
  signOut: () => void;
}

// The sign-in state and request that the shared store needs: the email and
// password fields, signing in (token + editor membership) and signing out.
// The caller keeps running its own work after signIn() resolves.
export function useSharedAuth(): SharedAuth {
  const activeToken = useSyncExternalStore(subscribe, sharedToken);
  const activeName = useSyncExternalStore(subscribe, currentSignedInName);
  const activeStay = useSyncExternalStore(subscribe, currentStaySignedIn);
  const [email, setEmail] = useState(() => readStorage(LAST_EMAIL_KEY) ?? "");
  const [password, setPassword] = useState("");
  const signIn = useCallback(async () => {
    const auth = await sharedRequest<TokenResponse>("/auth/v1/token?grant_type=password", {method:"POST",body:JSON.stringify({email,password})});
    const next = sessionFromResponse(auth, email);
    if (!next) throw new Error(t("editorShell.shared.signInFailed"));
    const remember = staySignedIn;
    generation++;
    applySession(next, remember);
    if (!remember) clearStoredSession();
    writeStorage(LAST_EMAIL_KEY, next.email || email);
    setPassword("");
    const membership = await sharedRequest<unknown[]>("/rest/v1/void_editors?select=user_id");
    if (!membership.length) { clearAuth(); throw new Error(t("editorShell.shared.accessRequired")); }
  }, [email, password]);
  const signOut = useCallback(() => clearAuth(), []);
  return { token: activeToken, signedInName: activeName, email, password, staySignedIn: activeStay, setEmail, setPassword, setStaySignedIn, signIn, signOut };
}

export const sharedButton = "w-fit rounded border border-neutral-500 bg-neutral-800 px-3 py-2 text-left text-white hover:border-amber-400 hover:bg-neutral-700 focus-visible:outline-amber-400 disabled:opacity-50";
const input = "rounded border border-neutral-500 bg-neutral-800 px-3 py-2";

// The sign-in form both the shared-map window and later windows show. The
// submit handler is the caller's: it can wrap signIn() in its own busy state
// and continue with what it opened the form for.
export function SharedLoginForm({auth, onSubmit}: {auth: SharedAuth; onSubmit: () => void}) {
  return createElement("form", {
    className: "flex flex-col gap-2",
    onSubmit: (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onSubmit(); },
  },
    createElement("input", {
      className: input, "aria-label": t("editorShell.shared.email"), type: "email", placeholder: t("editorShell.shared.email"),
      required: true, value: auth.email, onChange: (event: ChangeEvent<HTMLInputElement>) => auth.setEmail(event.target.value),
    }),
    createElement("input", {
      className: input, "aria-label": t("editorShell.shared.password"), type: "password", placeholder: t("editorShell.shared.password"),
      required: true, value: auth.password, onChange: (event: ChangeEvent<HTMLInputElement>) => auth.setPassword(event.target.value),
    }),
    createElement("label", { className: "flex items-center gap-2 text-sm text-neutral-300" },
      createElement("input", {
        type: "checkbox", checked: auth.staySignedIn,
        onChange: (event: ChangeEvent<HTMLInputElement>) => auth.setStaySignedIn(event.target.checked),
      }),
      t("editorShell.shared.staySignedIn"),
    ),
    createElement("button", { className: sharedButton }, t("editorShell.shared.logIn")),
  );
}

if (typeof window !== "undefined") void restoreSession();
