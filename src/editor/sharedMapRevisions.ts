export function newerMapRevision(base: number, head: number | undefined): number | undefined {
  return head !== undefined && head > base ? head : undefined;
}

export function nextMapRevision(base: number, head = base): number {
  return Math.max(base, head) + 1;
}
