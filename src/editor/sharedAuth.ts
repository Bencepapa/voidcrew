import { createElement, useCallback, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from "react";
import { t } from "../i18n";

const project = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const sharedConfigured = Boolean(project && key);
// the store's base URL (for public object URLs and per-store cache keys)
export const sharedProject = project;

// the signed-in editor's access token and name (kept for this tab only, like before)
let token = "";
let signedInName = "";
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => void listeners.delete(listener); };

export function sharedToken() {
  return token;
}

function currentSignedInName() {
  return signedInName;
}

function setToken(value: string) {
  if (token === value) return;
  token = value;
  emit();
}

function setSignedInName(value: string) {
  if (signedInName === value) return;
  signedInName = value;
  emit();
}

export async function sharedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(project + path, { ...init, headers: {
    apikey: key, ...(token ? { Authorization: "Bearer " + token } : {}),
    "Content-Type": "application/json", ...init.headers,
  } });
  if (!res.ok) {
    if (res.status === 409) throw new Error(t("editorShell.shared.newerVersion"));
    if (res.status === 401) setToken("");
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
  const res = await fetch(project + path, { method: "POST", body, headers: {
    apikey: key, ...(token ? { Authorization: "Bearer " + token } : {}), "Content-Type": contentType, "x-upsert": "false",
  } });
  if (res.ok) return;
  if (res.status === 401) setToken("");
  const detail = await res.json().catch(() => ({}));
  throw new SharedHttpError(detail.message || detail.msg || detail.error || res.statusText, res.status);
}
export interface SharedAuth {
  token: string;
  signedInName: string;
  email: string;
  password: string;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  signIn: () => Promise<void>;
  signOut: () => void;
}

// The sign-in state and request that the shared store needs: the email and
// password fields, signing in (token + editor membership) and signing out.
// The caller keeps running its own work after signIn() resolves.
export function useSharedAuth(): SharedAuth {
  const activeToken = useSyncExternalStore(subscribe, sharedToken);
  const activeName = useSyncExternalStore(subscribe, currentSignedInName);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useCallback(async () => {
    const auth = await sharedRequest<{access_token:string; user: {email: string}}>("/auth/v1/token?grant_type=password", {method:"POST",body:JSON.stringify({email,password})});
    setToken(auth.access_token);
    setSignedInName(auth.user.email.split("@")[0]);
    setPassword("");
    const membership = await sharedRequest<unknown[]>("/rest/v1/void_editors?select=user_id");
    if (!membership.length) { setToken(""); throw new Error(t("editorShell.shared.accessRequired")); }
  }, [email, password]);
  const signOut = useCallback(() => setToken(""), []);
  return { token: activeToken, signedInName: activeName, email, password, setEmail, setPassword, signIn, signOut };
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
    createElement("button", { className: sharedButton }, t("editorShell.shared.logIn")),
  );
}
