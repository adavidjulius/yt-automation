#!/usr/bin/env python3
# scripts/generate_tts.py
# Female voice pipeline — best quality first, fallback chain
# 1. Piper TTS (lessac-high — warm natural female, CPU, fast)
# 2. edge-tts AriaNeural (Microsoft neural female)
# 3. edge-tts JennyNeural (Microsoft casual female)
# 4. gTTS (Google female — last resort)

import os
import sys
import subprocess
import urllib.request
import numpy as np

# ─── Female Voice Config ──────────────────────────────────────────────────────
PIPER_VOICE_NAME   = "en_US-lessac-high"          # Warm natural female
PIPER_MODEL_URL    = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx"
PIPER_CONFIG_URL   = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx.json"
PIPER_BINARY_URL   = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz"

EDGE_VOICE_PRIMARY = "en-US-AriaNeural"           # Microsoft — expressive female
EDGE_VOICE_BACKUP  = "en-US-JennyNeural"          # Microsoft — warm casual female
EDGE_VOICE_EXTRA   = "en-US-MichelleNeural"       # Microsoft — clear professional

def run(cmd, timeout=120):
    return subprocess.run(cmd, shell=True, capture_output=True, timeout=timeout)

def install_piper():
    piper_bin = '/tmp/piper/piper'
    if os.path.exists(piper_bin):
        print("  ✅ Piper already installed")
        return piper_bin

    print("  📦 Installing Piper TTS...")
    os.makedirs('/tmp/piper', exist_ok=True)
    tar = '/tmp/piper.tar.gz'

    result = subprocess.run([
        'curl', '-L', '--silent', '--output', tar, PIPER_BINARY_URL
    ], capture_output=True, timeout=60)

    if result.returncode != 0:
        raise Exception("Piper download failed")

    subprocess.run(['tar', '-xzf', tar, '-C', '/tmp/'], capture_output=True)
    os.chmod(piper_bin, 0o755)
    print("  ✅ Piper installed")
    return piper_bin

def download_piper_voice():
    model_path  = f'/tmp/piper/{PIPER_VOICE_NAME}.onnx'
    config_path = f'/tmp/piper/{PIPER_VOICE_NAME}.onnx.json'

    if not os.path.exists(model_path):
        print(f"  📥 Downloading female voice model: {PIPER_VOICE_NAME}...")
        subprocess.run(['curl', '-L', '--silent', '--output', model_path, PIPER_MODEL_URL],
                       capture_output=True, timeout=120)

    if not os.path.exists(config_path):
        print(f"  📥 Downloading voice config...")
        subprocess.run(['curl', '-L', '--silent', '--output', config_path, PIPER_CONFIG_URL],
                       capture_output=True, timeout=30)

    return model_path, config_path

def normalize_audio(wav_path, mp3_path):
    """Convert WAV → MP3 with loudness normalization for clear female voice"""
    result = run(
        f'ffmpeg -i "{wav_path}" '
        f'-codec:a libmp3lame -qscale:a 2 '
        f'-ar 44100 -ac 1 '
        f'-af "loudnorm=I=-16:TP=-1.5:LRA=11,equalizer=f=3000:width_type=o:width=2:g=3" '
        f'"{mp3_path}" -y'
    )
    # equalizer boost at 3kHz makes female voice crisper and clearer
    if result.returncode != 0:
        # fallback without eq
        run(f'ffmpeg -i "{wav_path}" -codec:a libmp3lame -qscale:a 2 -ar 44100 "{mp3_path}" -y')

def generate_with_piper(text, output_mp3):
    """Piper TTS — best quality free female voice, fast CPU inference"""
    print("  🎙️ Piper TTS — lessac-high female voice...")

    piper_bin = install_piper()
    model_path, config_path = download_piper_voice()

    if not os.path.exists(model_path):
        raise Exception("Voice model not downloaded")

    output_wav = output_mp3.replace('.mp3', '_piper.wav')

    result = subprocess.run(
        [piper_bin,
         '--model', model_path,
         '--output_file', output_wav,
         '--sentence_silence', '0.25',
         '--length_scale', '0.95'],   # slightly faster = more energetic YouTube style
        input=text.encode('utf-8'),
        capture_output=True,
        timeout=180
    )

    if result.returncode != 0:
        raise Exception(f"Piper error: {result.stderr.decode()[-300:]}")

    if not os.path.exists(output_wav) or os.path.getsize(output_wav) < 1000:
        raise Exception("Piper produced empty output")

    normalize_audio(output_wav, output_mp3)
    try: os.remove(output_wav)
    except: pass

    size_kb = os.path.getsize(output_mp3) // 1024
    print(f"  ✅ Piper female voice ready ({size_kb}KB)")

def generate_with_edge(text, output_mp3, voice=None):
    """edge-tts — Microsoft neural female voices, free"""
    voice = voice or EDGE_VOICE_PRIMARY
    print(f"  🎙️ edge-tts — {voice}...")

    run("pip install edge-tts --quiet")

    import asyncio

    async def _generate():
        import edge_tts
        communicate = edge_tts.Communicate(
            text,
            voice=voice,
            rate="+8%",       # slightly faster = energetic YouTube style
            volume="+10%",
            pitch="+0Hz"
        )
        await communicate.save(output_mp3)

    asyncio.run(_generate())

    if not os.path.exists(output_mp3) or os.path.getsize(output_mp3) < 1000:
        raise Exception(f"edge-tts {voice} produced empty output")

    # Normalize edge-tts output too
    temp = output_mp3 + '.tmp.mp3'
    r = run(f'ffmpeg -i "{output_mp3}" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -codec:a libmp3lame -qscale:a 2 "{temp}" -y')
    if r.returncode == 0:
        os.replace(temp, output_mp3)

    size_kb = os.path.getsize(output_mp3) // 1024
    print(f"  ✅ edge-tts female voice ready ({size_kb}KB)")

def generate_with_gtts(text, output_mp3):
    """gTTS — Google female voice, last resort"""
    print("  🎙️ gTTS — Google female voice (last resort)...")
    from gtts import gTTS
    # tld='co.uk' gives a slightly more natural female UK accent
    tts = gTTS(text=text, lang='en', slow=False, tld='co.uk')
    tts.save(output_mp3)
    size_kb = os.path.getsize(output_mp3) // 1024
    print(f"  ✅ gTTS female voice ready ({size_kb}KB)")

def main():
    text_file  = 'output/voiceover_text.txt'
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

    print(f"🎙️ Generating FEMALE voiceover ({len(text)} chars)...")
    print(f"📝 Preview: {text[:100]}...\n")

    # ── 1. Piper lessac-high (best quality, fast CPU) ─────────────────────────
    try:
        generate_with_piper(text, output_mp3)
        print(f"\n✅ Piper female voice complete!")
        return
    except Exception as e:
        print(f"  ⚠️ Piper failed: {e}\n")

    # ── 2. edge-tts AriaNeural (Microsoft expressive female) ─────────────────
    try:
        generate_with_edge(text, output_mp3, EDGE_VOICE_PRIMARY)
        print(f"\n✅ AriaNeural female voice complete!")
        return
    except Exception as e:
        print(f"  ⚠️ AriaNeural failed: {e}\n")

    # ── 3. edge-tts JennyNeural (Microsoft warm casual female) ───────────────
    try:
        generate_with_edge(text, output_mp3, EDGE_VOICE_BACKUP)
        print(f"\n✅ JennyNeural female voice complete!")
        return
    except Exception as e:
        print(f"  ⚠️ JennyNeural failed: {e}\n")

    # ── 4. edge-tts MichelleNeural (Microsoft clear professional female) ──────
    try:
        generate_with_edge(text, output_mp3, EDGE_VOICE_EXTRA)
        print(f"\n✅ MichelleNeural female voice complete!")
        return
    except Exception as e:
        print(f"  ⚠️ MichelleNeural failed: {e}\n")

    # ── 5. gTTS (last resort) ─────────────────────────────────────────────────
    try:
        generate_with_gtts(text, output_mp3)
        print(f"\n✅ gTTS female voice complete (fallback)!")
        return
    except Exception as e:
        print(f"❌ ALL TTS methods failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
