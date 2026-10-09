/**
 * The 42 cells of a month grid, Monday first.
 *
 * Pure and UTC throughout. Local-time date arithmetic shifts a day across the
 * March and October clock changes, which would put a job in the wrong cell -
 * the kind of bug you only notice twice a year.
 */

export type MonthCell = {
  /** YYYY-MM-DD */
  iso: string;
  dayNumber: number;
  /** False for the leading and trailing days borrowed from adjacent months. */
  inMonth: boolean;
  isToday: boolean;
};

/**
 * Always six rows. A fixed height stops the grid jumping as you page through
 * months, which is more annoying to use than a little empty space.
 */
export const CELLS = 42;

export function monthCells(month: string, today = new Date().toISOString().slice(0, 10)): MonthCell[] {
  const first = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);

  // Back up to the Monday on or before the 1st. getUTCDay gives 0 for Sunday,
  // so Sunday has to go back six days rather than none.
  const start = new Date(first);
  const weekday = start.getUTCDay() === 0 ? 7 : start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (weekday - 1));

  return Array.from({ length: CELLS }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return {
      iso,
      dayNumber: d.getUTCDate(),
      inMonth: d.getUTCMonth() === first.getUTCMonth(),
      isToday: iso === today,
    };
  });
}

/** Move to the first of the month `by` months away. */
export function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 10);
}
