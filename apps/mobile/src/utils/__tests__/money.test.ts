import { formatPounds } from '../money';

describe('formatPounds', () => {
  it('writes whole pounds bare and everything else to the penny', () => {
    expect(formatPounds(14)).toBe('£14');
    expect(formatPounds(18.5)).toBe('£18.50');
    expect(formatPounds(101.75)).toBe('£101.75');
  });

  it('shows a dash for a missing figure', () => {
    expect(formatPounds(null)).toBe('£—');
    expect(formatPounds(undefined)).toBe('£—');
  });
});
