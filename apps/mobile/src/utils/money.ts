/**
 * Pounds the way the website writes them: whole pounds bare ("£14"), anything
 * else to the penny ("£18.50", never "£18.5").
 */
export function formatPounds(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '£—';
  return Number.isInteger(value) ? `£${value}` : `£${value.toFixed(2)}`;
}
