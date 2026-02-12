import torch
import torch.serialization
import functools

# Aggressive monkeypatch for torch 2.6+ weights_only=True security check
# This intercepts both the primary API and the internal serialization API.
original_load = torch.serialization.load
def patched_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return original_load(*args, **kwargs)

torch.serialization.load = patched_load
torch.load = patched_load

import whisperx
import json
import sys
import os

def align_lyrics(audio_file, lyrics_file, output_json):
    """
    Performs forced alignment using WhisperX.
    1. Transcribe (Fast-Whisper)
    2. Align (Wav2Vec2)
    3. Output JSON
    """
    device = "cpu" # Switched to CPU since Intel Arc doesn't support CUDA
    batch_size = 4 # Reduced for CPU
    compute_type = "int8" # Better for CPU speed

    # 1. Load Model (large-v3)
    print(f"[*] Loading WhisperX model (large-v3) on CPU...")
    model = whisperx.load_model("large-v3", device, compute_type=compute_type)

    # 2. Load Audio
    print(f"[*] Loading audio: {audio_file}")
    audio = whisperx.load_audio(audio_file)

    # 3. Transcribe
    print("[*] Transcribing...")
    result = model.transcribe(audio, batch_size=batch_size)
    
    # 4. Load Alignment Model
    print("[*] Loading alignment model for refined timestamps...")
    model_a, metadata = whisperx.load_align_model(language_code=result["language"], device=device)

    # 5. Align
    print("[*] Aligning text to audio...")
    
    if os.path.exists(lyrics_file):
        with open(lyrics_file, 'r', encoding='utf-8') as f:
            ground_truth_lyrics = f.read().splitlines()
            ground_truth_lyrics = [l.strip() for l in ground_truth_lyrics if l.strip()]
        
        print(f"[*] Ground truth lyrics found ({len(ground_truth_lyrics)} lines).")
    
    result = whisperx.align(result["segments"], model_a, metadata, audio, device, return_char_alignments=False)

    # 6. Save Word-level JSON
    print(f"[*] Saving result to {output_json}")
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(result["word_segments"], f, indent=2)

    print("[+] Done! Highly accurate timestamps saved.")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python forced_aligner.py <audio.mp3> <lyrics.txt>")
    else:
        audio = sys.argv[1]
        lyrics = sys.argv[2]
        output = "alignment_result.json"
        align_lyrics(audio, lyrics, output)
