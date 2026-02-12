import json
import difflib
import re
import sys

def clean_word(word):
    """Remove special characters and lowercase for matching."""
    return re.sub(r'[^\w\s]', '', word).lower().strip()

def force_align(source_truth_text, whisper_result_json):
    """
    Aligns ground truth lyrics to Whisper timestamps using fuzzy matching and interpolation.
    """
    # 1. Prepare Truth Tokens
    truth_words = source_truth_text.split()
    clean_truth = [clean_word(w) for w in truth_words]
    
    # 2. Prepare Whisper Tokens
    # whisper_result_json is a list of {word, start, end, score}
    clean_whisper = [clean_word(w['word']) for w in whisper_result_json]
    
    # 3. Use SequenceMatcher to find the best alignment
    # SequenceMatcher finds matched "blocks"
    matcher = difflib.SequenceMatcher(None, clean_truth, clean_whisper)
    matches = matcher.get_matching_blocks()
    
    # 4. Create Sync Result
    synced_lyrics = []
    
    # Track which whisper words are already used to avoid double-mapping
    truth_to_whisper_map = {} # truth_index -> whisper_index
    for match in matches:
        for i in range(match.size):
            truth_to_whisper_map[match.a + i] = match.b + i
            
    # 5. Build final list and handle INTERPOLATION
    for i in range(len(truth_words)):
        if i in truth_to_whisper_map:
            # Direct Match
            w_idx = truth_to_whisper_map[i]
            synced_lyrics.append({
                "word": truth_words[i],
                "start": whisper_result_json[w_idx]["start"],
                "end": whisper_result_json[w_idx]["end"],
                "match": True
            })
        else:
            # Flag for interpolation later
            synced_lyrics.append({
                "word": truth_words[i],
                "start": None,
                "end": None,
                "match": False
            })
            
    # 6. Interpolation Engine
    # Find gaps and fill them
    for i in range(len(synced_lyrics)):
        if synced_lyrics[i]["start"] is None:
            # Find previous anchor
            prev_idx = i - 1
            prev_time = 0.0
            while prev_idx >= 0:
                if synced_lyrics[prev_idx]["start"] is not None:
                    prev_time = synced_lyrics[prev_idx]["end"]
                    break
                prev_idx -= 1
            
            # Find next anchor
            next_idx = i + 1
            next_time = None
            while next_idx < len(synced_lyrics):
                if synced_lyrics[next_idx]["start"] is not None:
                    next_time = synced_lyrics[next_idx]["start"]
                    break
                next_idx += 1
            
            # If no next anchor (end of song), assume 0.5s per word
            if next_time is None:
                next_time = prev_time + 0.5 * (next_idx - prev_idx)
            
            # Calculate gap size
            missing_count = next_idx - prev_idx - 1
            gap_duration = next_time - prev_time
            step = gap_duration / (missing_count + 1)
            
            # Fill the specific word
            local_offset = i - prev_idx
            synced_lyrics[i]["start"] = round(prev_time + step * local_offset, 3)
            synced_lyrics[i]["end"] = round(synced_lyrics[i]["start"] + step * 0.8, 3) # short duration

    return synced_lyrics

def main():
    if len(sys.argv) < 3:
        print("Usage: python force_mapper.py <source_lyrics.txt> <whisper_output.json>")
        return

    lyrics_path = sys.argv[1]
    json_path = sys.argv[2]
    
    print(f"[*] Reading source lyrics: {lyrics_path}")
    with open(lyrics_path, 'r', encoding='utf-8') as f:
        lyrics_text = f.read()
        
    print(f"[*] Reading Whisper output: {json_path}")
    with open(json_path, 'r', encoding='utf-8') as f:
        whisper_data = json.load(f)
        
    print("[*] Running Force Alignment Mapper...")
    final_output = force_align(lyrics_text, whisper_data)
    
    output_path = "synced_lyrics.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(final_output, f, indent=2)
        
    print(f"[+] Success! Mapped lyrics saved to: {output_path}")
    print(f"[+] Total words processed: {len(final_output)}")

if __name__ == "__main__":
    main()
