/**
 * Hash router. Small enough to own outright rather than take a dependency for.
 *
 * Routes look like #/jobs or #/jobs/abc123 — the segments after the name are
 * handed to the page as params.
 */

export const route = $state({ name: 'dashboard', params: [] as string[] });

function parse() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const segments = raw.split('/').filter(Boolean);
  route.name = segments[0] ?? 'dashboard';
  route.params = segments.slice(1);
}

export function startRouter() {
  parse();
  window.addEventListener('hashchange', parse);
}

export function navigate(path: string) {
  window.location.hash = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
}
