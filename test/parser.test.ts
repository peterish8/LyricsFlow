
import { parseTimestampedLyrics } from '../src/utils/timestampParser';

describe('Timestamp Parser', () => {
  const SAMPLE_LYRICS = `[00:10.94]I heard you calling
[00:13.29]On the megaphone
[00:14.99]You wanna see me all alone
[00:20.63]As legend has it you
[00:22.60]Are quite the pyro
[00:24.56]You light the match to watch it blow`;

  test('parses standard timestamps correctly', () => {
    const result = parseTimestampedLyrics(SAMPLE_LYRICS);
    
    expect(result).toHaveLength(6);
    expect(result[0].timestamp).toBeCloseTo(10.94, 2);
    expect(result[0].text).toBe('I heard you calling');
  });

  const EMPTY_TEST = `
[00:10.00]Line 1

[00:20.00]Line 2   
`;

  test('handles empty lines between timestamps', () => {
    const result = parseTimestampedLyrics(EMPTY_TEST);
    
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('Line 1');
    expect(result[1].text).toBe('Line 2');
  });
});
