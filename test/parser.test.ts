
import { parseTimestampedLyrics } from '../src/utils/timestampParser';

// Sample from user request
const SAMPLE_LYRICS = `[00:10.94]I heard you calling
[00:13.29]On the megaphone
[00:14.99]You wanna see me all alone
[00:20.63]As legend has it you
[00:22.60]Are quite the pyro
[00:24.56]You light the match to watch it blow`;

describe('Timestamp Parser', () => {
    test('Correctly parses sample lyrics', () => {
        const result = parseTimestampedLyrics(SAMPLE_LYRICS);
        
        console.log('Parsed Result:', JSON.stringify(result, null, 2));

        expect(result.length).toBe(6);
        expect(result[0].timestamp).toBeCloseTo(10.94);
        expect(result[0].text).toBe('I heard you calling');
        expect(result[1].timestamp).toBeCloseTo(13.29);
        expect(result[1].text).toBe('On the megaphone');
    });

    test('Correctly handles empty lines or whitespace', () => {
        const text = `
        [00:10.00]Line 1
        
        [00:20.00]Line 2   
        `;
        const result = parseTimestampedLyrics(text);
        expect(result.length).toBe(2);
        expect(result[0].text).toBe('Line 1');
        expect(result[1].text).toBe('Line 2');
    });
});
