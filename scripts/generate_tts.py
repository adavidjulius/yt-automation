#!/usr/bin/env python3
# scripts/generate_tts.py
# Uses Piper TTS — best balance of quality + speed on CPU
# Neural voice, sounds natural, installs in seconds, no GPU needed

import os
import sys
import subprocess
import urllib.request

PIPER_VOICE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx"
PIPER_CONFIG_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx.json"

def download_file(url, dest):
    print(f"  📥 Downloading {os.path.basename(dest)}...")
    urllib.request.urlretrieve(url, dest)
    size_mb = os.path.getsize(dest) / 1024 / 1024
    print(f"  ✅ Downloaded ({size_mb:.1f}MB)")

def install_piper():
    """Install Piper TTS binary"""
    piper_path = '/tmp/piper/piper'
    if os.path.exists(piper_path):
        return piper_path

    print("  📦 Installing Piper TTS...")
    os.makedirs('/tmp/piper', exist_ok=True)

    # Download Piper for Linux x86_64
    piper_url = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz"
    tar_path = '/tmp/piper.tar.gz'

    result = subprocess.run([
        'curl', '-L', '--silent', '--output', tar_path, piper_url
    ], capture_output=True)

    if result.returncode != 0:
        raise Exception("Failed to download Piper")

    subprocess.run(['tar', '-xzf', tar_path, '-C', '/tmp/'], capture_output=True)
    os.chmod(piper_path, 0o755)
    print("  ✅ Piper installed")
    return piper_path

def generate_with_piper(text, output_mp3):
    """Generate audio with Piper — Ryan high quality voice"""
    piper_path = install_piper()

    # Download voice model
    model_path = '/tmp/piper/en_US-ryan-high.onnx'
    config_path = '/tmp/piper/en_US-ryan-high.onnx.json'

    if not os.path.exists(model_path):
        download_file(PIPER_VOICE_URL, model_path)
    if not os.path.exists(config_path):
        download_file(PIPER_CONFIG_URL, config_path)

    output_wav = output_mp3.replace('.mp3', '.wav')

    print("  🎙️ Generating speech with Piper (Ryan - high quality)...")

    # Run Piper
    result = subprocess.run(
        [piper_path,
         '--model', model_path,
         '--output_file', output_wav,
         '--sentence_silence', '0.3',   # natural pause between sentences
         '--length_scale', '0.95'],     # slightly faster = more energetic
        input=text.encode('utf-8'),
        capture_output=True,
        timeout=120
    )

    if result.returncode != 0:
        raise Exception(f"Piper failed: {result.stderr.decode()}")

    if not os.path.exists(output_wav) or os.path.getsize(output_wav) < 1000:
        raise Exception("Piper produced no output")

    # Convert WAV → MP3 with FFmpeg (better quality + smaller size)
    mp3_result = subprocess.run([
        'ffmpeg', '-i', output_wav,
        '-codec:a', 'libmp3lame',
        '-qscale:a', '2',         # high quality
        '-ar', '44100',           # standard sample rate
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',  # normalize loudness
        output_mp3, '-y'
    ], capture_output=True)

    if mp3_result.returncode != 0:
        raise Exception(f"WAV→MP3 failed: {mp3_result.stderr.decode()}")

    # Clean up WAV
    try: os.remove(output_wav)
    except: pass

    size_kb = os.path.getsize(output_mp3) // 1024
    print(f"  ✅ Piper audio ready ({size_kb}KB)")
    return True

def generate_with_edge_tts(text, output_mp3):
    """Fallback: Microsoft edge-tts — also neural quality, free"""
    print("  ⚠️ Trying edge-tts fallback (Microsoft neural)...")
    subprocess.run(['pip', 'install', 'edge-tts', '--quiet'], check=True)

    import asyncio
    import edge_tts

    async def _gen():
        communicate = edge_tts.Communicate(
            text,
            voice="en-US-AndrewNeural",  # Deep, professional male voice
            rate="+5%",
            volume="+10%"
        )
        await communicate.save(output_mp3)

    asyncio.run(_gen())
    size_kb = os.path.getsize(output_mp3) // 1024
    print(f"  ✅ edge-tts ready ({size_kb}KB)")

def generate_with_gtts(text, output_mp3):
    """Last resort fallback"""
    print("  ⚠️ Using gTTS last resort fallback...")
    from gtts import gTTS
    tts = gTTS(text=text, lang='en', slow=False)
    tts.save(output_mp3)

def main():
    text_file = 'output/voiceover_text.txt'
    output_mp3 = 'output/voiceover.mp3'

    if not os.path.exists(text_file):
        print("❌ voiceover_text.txt not found!")
        sys.exit(1)

    with open(text_file, 'r') as f:
        text = f.read().strip()

    if not text:
        print("❌ Voiceover text is empty!")
        sys.exit(1)

    os.makedirs('output', exist_ok=True)

    print(f"🎙️ Generating voiceover ({len(text)} chars)...")
    print(f"📝 Preview: {text[:120]}...\n")

    # 1. Try Piper (best quality, fast, CPU-only)
    try:
        generate_with_piper(text, output_mp3)
        print(f"\n✅ Piper TTS complete!")
        return
    except Exception as e:
        print(f"  ⚠️ Piper failed: {e}")

    # 2. Try edge-tts (Microsoft neural, also excellent)
    try:
        generate_with_edge_tts(text, output_mp3)
        print(f"\n✅ edge-tts complete!")
        return
    except Exception as e:
        print(f"  ⚠️ edge-tts failed: {e}")

    # 3. Last resort: gTTS
    try:
        generate_with_gtts(text, output_mp3)
        print(f"\n✅ gTTS complete (fallback)!")
    except Exception as e:
        print(f"❌ All TTS failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
