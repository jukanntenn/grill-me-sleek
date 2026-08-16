// Tab title formatting — the session (project) name leads so multiple tabs
// are distinguishable in a crowded tab bar; browsers truncate the tail.

const TITLE_SUFFIX = "grill-me-sleek";

export function sessionTitle(name: string): string {
  return `${name} — ${TITLE_SUFFIX}`;
}
