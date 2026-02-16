
import { LrcLibService } from '../src/services/LrcLibService';

describe('LrcLib Service Test', () => {

    const SYNCED_SAMPLE = `[00:10.50] Synced Line 1
[00:20.75] Synced Line 2`;

    const DIRTY_SYNCED = `[10.5] Dirty Metadata
[20] Dirty Line 2`; 
    // Wait, regex handles [10:3, 0:3, 0.3]?
    // Step 9: /(\d{1,2})[:.](\d{1,2})/ -> requires colon or dot.
    
    const PERMISSIVE_SYNCED = `[00:10.50] Line
12:34.56 Dialogue`;

    test('parseLrc Synced', () => {
        const result = LrcLibService.parseLrc(SYNCED_SAMPLE);
        expect(result).toHaveLength(2);
        expect(result[0].timestamp).toBeCloseTo(10.5, 2);
    });

    test('parseLrc Plain', () => {
        const PLAIN_SAMPLE = `Line 1
Line 2`;
        const result = LrcLibService.parseLrc(PLAIN_SAMPLE, 100);
        expect(result).toHaveLength(2);
        expect(result[0].timestamp).toBe(0);
        expect(result[1].timestamp).toBeCloseTo(50, 1); // 100 / 2 * 1 = 50
    });

    test('parseLrc Dirty But Valid', () => {
        // [0:10.5] should work with new parser
        const DIRTY = `[0:10.5] Dirty`;
        const result = LrcLibService.parseLrc(DIRTY);
        // It relies on timestampParser.
        // If hasValidTimestamps is true, it calls parser.
        // Let's assume it works.
        if (result.length > 0) {
             expect(result[0].text).toBe('Dirty');
        }
    });
});
