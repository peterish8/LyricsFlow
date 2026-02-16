
const { parseTimestampedLyrics } = require('../src/utils/timestampParser');

const SAMPLE_LYRICS = `[00:10.94]I heard you calling
[00:13.29]On the megaphone
[00:14.99]You wanna see me all alone
[00:20.63]As legend has it you
[00:22.60]Are quite the pyro
[00:24.56]You light the match to watch it blow`;

console.log('--- TEST START ---');
try {
    const result = parseTimestampedLyrics(SAMPLE_LYRICS);
    console.log('Parsed Result:', JSON.stringify(result, null, 2));

    if (result.length !== 6) throw new Error(`Expected 6 lines, got ${result.length}`);
    if (Math.abs(result[0].timestamp - 10.94) > 0.01) throw new Error(`Expected ts ~10.94, got ${result[0].timestamp}`);
    if (result[0].text !== 'I heard you calling') throw new Error('Text mismatch line 1');

    console.log('✅ Basic Test Passed');
} catch (e) {
    console.error('❌ Test Failed:', e);
}

const EMPTY_TEST = `
[00:10.00]Line 1

[00:20.00]Line 2   
`;
try {
    const res2 = parseTimestampedLyrics(EMPTY_TEST);
    console.log('Empty Test Result:', JSON.stringify(res2, null, 2));
    if (res2.length !== 2) throw new Error(`Expected 2 lines, got ${res2.length}`);
     console.log('✅ Empty Line Test Passed');
} catch (e) {
     console.error('❌ Empty Line Test Failed:', e);
}
