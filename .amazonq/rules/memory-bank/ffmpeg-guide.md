# FFmpeg Audio Processing Guide

## Overview
FFmpeg is used for audio format conversion in two main pipelines:
1. **Whisper Transcription**: MP3/M4A → WAV 16kHz mono
2. **AI Karaoke**: MP3/M4A → PCM Float32 → ONNX → PCM → WAV

## Installation

```bash
npm install ffmpeg-kit-react-native@6.0.2
```

**Note**: Version 6.0.2 is stable. Do NOT use "min-gpl" versions as they cause build failures.

## Android Configuration

Add to `android/app/src/main/AndroidManifest.xml`:
```xml
<application 
  android:extractNativeLibs="true"
  ... >
```

This prevents FFmpeg crashes on Android 14+.

## Usage in Code

### Import
```typescript
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';
```

### Whisper Conversion (16kHz WAV)
```typescript
const command = `-i "${inputUri}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputUri}" -y`;
const session = await FFmpegKit.execute(command);
const returnCode = await session.getReturnCode();

if (!ReturnCode.isSuccess(returnCode)) {
  throw new Error('FFmpeg conversion failed');
}
```

### AI Karaoke PCM Extraction
```typescript
// Decode to raw PCM Float32
const pcmPath = `${cacheDir}temp_audio.pcm`;
const command = `-i "${inputUri}" -ar 22050 -ac 2 -f f32le "${pcmPath}" -y`;
```

### AI Karaoke WAV Encoding
```typescript
// Encode processed PCM to WAV
const command = `-f f32le -ar ${sampleRate} -ac 2 -i "${pcmPath}" -ar ${sampleRate} -ac 2 "${outputPath}" -y`;
```

## Command Reference

| Flag | Meaning |
|------|---------|
| `-i input` | Input file path |
| `-ar 16000` | Audio sample rate (16kHz for Whisper) |
| `-ar 22050` | Audio sample rate (22.05kHz for ONNX models) |
| `-ac 1` | Mono channel |
| `-ac 2` | Stereo channels |
| `-c:a pcm_s16le` | 16-bit PCM codec |
| `-f f32le` | Float32 little-endian format |
| `-y` | Overwrite output file without asking |

## Error Handling

```typescript
try {
  const session = await FFmpegKit.execute(command);
  const returnCode = await session.getReturnCode();
  
  if (!ReturnCode.isSuccess(returnCode)) {
    const logs = await session.getLogs();
    const output = logs.map((l: any) => l.getMessage()).join('\n');
    throw new Error(`FFmpeg failed: ${output}`);
  }
} catch (error) {
  // Fallback to original file
  console.error('FFmpeg error:', error);
  return inputUri;
}
```

## Common Issues

### Issue: Build failure with "Could not find ffmpeg-kit"
**Solution**: Use exact version `6.0.2`, not "latest" or min-gpl variants.

### Issue: Android 14 crash
**Solution**: Add `android:extractNativeLibs="true"` to AndroidManifest.xml.

### Issue: Permission denied on iOS
**Solution**: Ensure input file is in app's sandbox (documentDirectory or cacheDirectory).

### Issue: Command returns error code 1
**Solution**: Check file paths exist, use absolute paths, verify input file format.

## PCM Data Handling

After FFmpeg PCM extraction:
```typescript
// Read PCM as base64
const base64 = await FileSystem.readAsStringAsync(pcmPath, {
  encoding: 'base64'
});

// Convert to Float32Array
const binaryString = atob(base64);
const bytes = new Uint8Array(binaryString.length);
for (let i = 0; i < binaryString.length; i++) {
  bytes[i] = binaryString.charCodeAt(i);
}
const pcmData = new Float32Array(bytes.buffer);
```

## Performance Notes

- Conversion time: ~10-20% of audio duration
- Memory usage: Low (streaming conversion)
- Parallel execution: FFmpeg is synchronous, run in background thread for UI responsiveness
