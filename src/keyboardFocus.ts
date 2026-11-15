// Only controls that accept typed characters own game/editor keys.
export function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && ["text", "search", "number", "password", "email", "url", "tel"].includes(target.type)));
}
