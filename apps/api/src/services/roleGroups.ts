// Role names on applications come from several eras: the current apply form
// ("Bar staff", "Waiting staff"), the older admin lists ("Bartender",
// "Waiter") and historical imports ("Kitchen porters"). The admin filters
// group them under the apply form's labels so a reworded form never again
// hides new applicants from a filter that still uses the old wording.

export const ROLE_GROUPS: ReadonlyArray<{ label: string; match: RegExp }> = [
  { label: 'Waiting staff', match: /^(waiting staff|waiters?|waitress(es)?|waiting)$/ },
  { label: 'Bar staff', match: /^(bar staff|bartenders?|bar ?backs?|mixologists?|bar)$/ },
  { label: 'Kitchen porters', match: /^(kitchen porters?|kps?)$/ },
  { label: 'Runners', match: /^(runners?|food runners?)$/ },
  { label: 'Hosts and front of house', match: /^(hosts?( and front of house)?|hostess(es)?|front of house|foh)$/ },
  { label: 'Chefs and cooks', match: /^(chefs?( and cooks?)?|cooks?)$/ }
];

function normalise(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The filter label a stored role name belongs under: its group, or itself. */
export function roleGroupLabel(name: string): string {
  const key = normalise(name);
  const group = ROLE_GROUPS.find((g) => g.match.test(key));
  return group ? group.label : name.trim();
}

/** Every stored role name that a filter label should match. */
export function roleNamesForLabel(label: string, storedNames: string[]): string[] {
  const target = normalise(roleGroupLabel(label));
  return storedNames.filter((name) => normalise(roleGroupLabel(name)) === target);
}

/** Collapse per-name counts into filter options, apply-form groups first. */
export function groupRoleCounts(rows: Array<{ name: string; count: number }>) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.count) continue;
    const label = roleGroupLabel(row.name);
    totals.set(label, (totals.get(label) || 0) + row.count);
  }
  const order = ROLE_GROUPS.map((g) => g.label);
  return [...totals.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      const ia = order.indexOf(a.label);
      const ib = order.indexOf(b.label);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
      return a.label.localeCompare(b.label);
    });
}
