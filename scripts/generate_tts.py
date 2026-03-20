#!/usr/bin/env python3
# scripts/generate_tts.py
# Uses Kokoro-82M — best free local neural TTS, sounds near human quality
# Ranked just below ElevenLabs on TTS Arena — completely free, runs locally

import os
import sys
import subprocess
import soundfile as sf
import numpy as np

def enhance_audio(audio, sample_rate):
    """Improve audio quality — normalize volume, remove silence edges"""
    # Normalize to consistent volume
    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val * 0.95

    # Fade in (first 0.1 seconds)
    fade_in_samples = int(sample_rate * 0.1)
    if len(audio) > fade_in_samples:
        fade_in = np.linspace(0, 1, fade_in_samples)
        audio[:fade_in_samples] *= fade_in

    # Fade out (last 0.2 seconds)
    fade_out_samples = int(sample_rate * 0.2)
    if len(audio) > fade_out_samples:
        fade_out = np.linspace(1, 0, fade_out_samples)
        audio[-fade_out_samples:] *= fade_out

    return audio

def generate_with_kokoro(text, output_wav):
    """Use Kokoro-82M — best free neural TTS"""
    from kokoro import KPipeline

    print("  🧠 Loading Kokoro-82M model (first run downloads ~500MB)...")
    pipeline = KPipeline(lang_code='a')  # 'a' = American English

    print("  🎙️ Generating with voice: af_heart (warm female voice)...")
    all_audio = []
    sample_rate = 24000

    generator = pipeline(
        text,
        voice='af_heart',   # Options: af_heart, af_bella, af_sarah, am_adam, am_michael
        speed=1.05,          # Slightly faster = more energetic YouTube style
        split_pattern=r'\n+'
    )

    for i, (gs, ps, audio) in enumerate(generator):
        all_audio.append(audio)
        print(f"    ✅ Chunk {i+1} generated")

    if not all_audio:
        raise Exception("Kokoro generated no audio chunks")

    # Combine all chunks
    combined = np.concatenate(all_audio)

    # Enhance audio quality
    combined = enhance_audio(combined, sample_rate)

    # Save as WAV first
    sf.write(output_wav, combined, sample_rate)
    print(f"  ✅ WAV saved: {output_wav}")
    return True

def wav_to_mp3(wav_path, mp3_path):
    """Convert WAV to MP3 using FFmpeg"""
    result = subprocess.run([
        'ffmpeg', '-i', wav_path,
        '-codec:a', 'libmp3lame',
        '-qscale:a', '2',         # High quality MP3
        '-ar', '44100',           # Standard sample rate
        mp3_path, '-y'
    ], capture_output=True)

    if result.returncode != 0:
        raise Exception(f"FFmpeg WAV→MP3 failed: {result.stderr.decode()}")
    print(f"  ✅ MP3 saved: {mp3_path}")

def generate_with_gtts_fallback(text, mp3_path):
    """Fallback: gTTS if Kokoro fails"""
    print("  ⚠️ Using gTTS fallback...")
    from gtts import gTTS
    tts = gTTS(text=text, lang='en', slow=False)
    tts.save(mp3_path)
    print(f"  ✅ gTTS saved: {mp3_path}")

def generate_with_edge_fallback(text, mp3_path):
    """Fallback: Microsoft edge-tts (also neural, free)"""
    print("  ⚠️ Using edge-tts fallback (Microsoft neural voice)...")
    subprocess.run(['pip', 'install', 'edge-tts', '--quiet'], check=True)
    import asyncio
    import edge_tts

    async def _gen():
        communicate = edge_tts.Communicate(
            text,
            voice="en-US-AriaNeural",  # Microsoft neural voice
            rate="+5%"
        )
        await communicate.save(mp3_path)

    asyncio.run(_gen())
    print(f"  ✅ edge-tts saved: {mp3_path}")

def main():
    text_file = 'output/voiceover_text.txt'
    output_wav = 'output/voiceover.wav'
    output_mp3 = 'output/voiceover.mp3'

    if not os.path.exists(text_file):
        print("❌ voiceover_text.txt not found!")
        sys.exit(1)

    with open(text_file, 'r') as f:
        text = f.read().strip()

    if not text:
        print("❌ Voiceover text is empty!")
        sys.exit(1)

    print(f"🎙️ Generating voiceover ({len(text)} characters)...")
    print(f"📝 Preview: {text[:100]}...")

    os.makedirs('output', exist_ok=True)

    # Try Kokoro first (best quality)
    try:
        generate_with_kokoro(text, output_wav)
        wav_to_mp3(output_wav, output_mp3)
        # Clean up WAV
        if os.path.exists(output_wav):
            os.remove(output_wav)
        size_kb = os.path.getsize(output_mp3) // 1024
        print(f"\n✅ Kokoro voiceover ready! ({size_kb}KB)")
        return
    except Exception as e:
        print(f"  ⚠️ Kokoro failed: {e}")

    # Try edge-tts (also neural quality)
    try:
        generate_with_edge_fallback(text, output_mp3)
        size_kb = os.path.getsize(output_mp3) // 1024
        print(f"\n✅ edge-tts voiceover ready! ({size_kb}KB)")
        return
    except Exception as e:
        print(f"  ⚠️ edge-tts failed: {e}")

    # Last resort: gTTS
    try:
        generate_with_gtts_fallback(text, output_mp3)
        size_kb = os.path.getsize(output_mp3) // 1024
        print(f"\n✅ gTTS voiceover ready! ({size_kb}KB)")
        return
    except Exception as e:
        print(f"❌ All TTS methods failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
