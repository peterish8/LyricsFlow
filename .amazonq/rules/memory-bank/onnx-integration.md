# ONNX Model Integration Guide

## Overview
Integration of quantized Spleeter/Demucs ONNX models for on-device vocal/instrumental separation.

## Model Requirements

### Size
- Quantized models: 40-60MB
- Full precision: 80-120MB (not recommended for mobile)

### Format
- ONNX (Open Neural Network Exchange)
- Quantization: INT8 or FP16
- Input: Float32 PCM audio
- Output: Vocal + Instrumental stems

## Model Sources

### Option 1: Spleeter (Recommended)
Search HuggingFace: `spleeter onnx quantized`
- GitHub: https://github.com/deezer/spleeter
- Typical size: ~50MB for 2-stem model

### Option 2: Demucs
Search: `demucs quantized onnx`
- GitHub: https://github.com/facebookresearch/demucs
- Better quality but slower

### Option 3: UVR5 (Ultimate Vocal Remover)
- GitHub: https://github.com/Anjok07/ultimatevocalremovergui
- Has ONNX exports available

## Model Placement

### Bundled (Offline)
```
assets/models/spleeter_2stem_quantized.onnx
```

### CDN (Download on First Use)
Update MODEL_URL in sourceSeparationModel.ts:
```typescript
const MODEL_URL = 'https://your-cdn.com/models/spleeter_2stem_quantized.onnx';
```

## Implementation

### Dependencies
```bash
npm install onnxruntime-react-native
```

### Loading Strategy
```typescript
// sourceSeparationModel.ts
async initialize(): Promise<void> {
  // 1. Check local storage
  const modelInfo = await FileSystem.getInfoAsync(MODEL_PATH);
  
  if (!modelInfo.exists) {
    // 2. Try CDN
    if (MODEL_URL) {
      await FileSystem.downloadAsync(MODEL_URL, MODEL_PATH);
    } else {
      // 3. Copy from bundled assets
      const asset = Asset.fromModule(BUNDLED_MODEL);
      await asset.downloadAsync();
      await FileSystem.copyAsync({
        from: asset.localUri,
        to: MODEL_PATH
      });
    }
  }
  
  // 4. Load into ONNX Runtime
  this.session = await ort.InferenceSession.create(MODEL_PATH, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    enableMemPattern: true,
    enableCpuMemArena: true,
  });
}
```

### Audio Processing Pipeline

#### 1. Chunking
```typescript
const windowSize = 44100; // 2 seconds at 22.05kHz
const hopSize = 22050;    // 1 second hop (50% overlap)
const numWindows = Math.ceil((audioData.length - windowSize) / hopSize) + 1;
```

#### 2. Inference Loop
```typescript
for (let i = 0; i < numWindows; i++) {
  const start = i * hopSize;
  const end = Math.min(start + windowSize, audioData.length);
  
  // Create window
  const window = new Float32Array(windowSize);
  window.set(audioData.slice(start, end));
  
  // Create tensor [1, 2, windowSize/2] - batch, stereo, time
  const inputTensor = new ort.Tensor('float32', window, [1, 2, windowSize / 2]);
  
  // Run inference
  const feeds = { input: inputTensor };
  const results = await this.session.run(feeds);
  
  // Extract outputs (check your model's output names!)
  const vocalsOutput = results.vocals?.data as Float32Array;
  const instrOutput = results.accompaniment?.data as Float32Array;
}
```

#### 3. Overlap-Add Reconstruction
```typescript
private overlapAdd(chunks: Float32Array[], hopSize: number): Float32Array {
  const totalLength = hopSize * (chunks.length - 1) + chunks[0].length;
  const result = new Float32Array(totalLength);
  const window = this.createHannWindow(chunks[0].length);

  for (let i = 0; i < chunks.length; i++) {
    const start = i * hopSize;
    for (let j = 0; j < chunks[i].length; j++) {
      result[start + j] += chunks[i][j] * window[j];
    }
  }
  return result;
}

private createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}
```

## Model Inspection

Use Netron (https://netron.app) to inspect your ONNX model:
- Input shape (usually [1, 2, samples] for stereo)
- Output names (vocals, accompaniment, etc.)
- Sample rate requirements (usually 22050 Hz)

## Performance Optimization

### Session Options
```typescript
const session = await ort.InferenceSession.create(MODEL_PATH, {
  executionProviders: ['cpu'],        // Mobile only has CPU
  graphOptimizationLevel: 'all',       // Max optimization
  enableMemPattern: true,             // Memory efficiency
  enableCpuMemArena: true,            // CPU memory pooling
});
```

### Chunk Size Trade-offs
- Smaller chunks: Lower latency, more boundary artifacts
- Larger chunks: Better quality, higher memory usage
- Recommended: 2-second windows with 50% overlap

## Common Issues

### Issue: Model outputs undefined
**Solution**: Check output names with Netron. Different models use different names:
- `vocals`, `accompaniment`
- `vocals`, `drums`
- `vocal`, `instr`

### Issue: Out of memory during inference
**Solution**: Reduce chunk size or implement streaming inference.

### Issue: Audio has clicks at chunk boundaries
**Solution**: Ensure Hann window is applied correctly in overlap-add.

### Issue: Model loads slowly on first run
**Solution**: Pre-download during app install or show loading indicator.

## Future Enhancements

- GPU delegate support (when available in onnxruntime-react-native)
- Model quantization to INT4 for smaller size
- Streaming inference for real-time separation
- Multiple model support (choose quality vs speed)
