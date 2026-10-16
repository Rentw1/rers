let current: { html: string; title: string } | null = null;

export function setPreview(p: { html: string; title: string }): void {
  current = p;
}

export function getPreview(): { html: string; title: string } | null {
  return current;
}
