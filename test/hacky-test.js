
const fs = require('fs');
const path = require('path');

// Manually read and eval the TS file content after stripping types for quick testing
// This avoids TS setup issues in the environment
const tsContent = fs.readFileSync(path.join(__dirname, '../src/utils/timestampParser.ts'), 'utf8');

// Quick and dirty TS -> JS converter
const jsContent = tsContent
    .replace(/import .* from .*/g, '')
    .replace(/export /g, '')
    .replace(/: [A-Z][a-zA-Z]+/g, '') // remove simple types
    .replace(/: string/g, '')
    .replace(/: number/g, '')
    .replace(/: boolean/g, '')
    .replace(/: any/g, '')
    .replace(/: LyricLine\[\]/g, '')
    .replace(/<[A-Z][a-zA-Z]+>/g, '') // remove generics
    .replace(/\?/g, '') // remove optional ?
    .replace(/interface .* \{[\s\S]*?\}/g, ''); // remove interfaces

// Eval blindly to get functions into scope
eval(jsContent);

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
    
    console.log('✅ Basic Test Passed');
} catch (e) {
    console.error('❌ Test Failed:', e);
}
