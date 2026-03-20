#!/usr/bin/env python3
# Female voice pipeline — Piper lessac → AriaNeural → JennyNeural → gTTS

import os
import sys
import subprocess

PIPER_VOICE      = "en_US-lessac-high"
PIPER_MODEL_URL  = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx"
PIPER_CONFIG_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx.json"
PIPER_BIN_URL    = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz"

EDGE_VOICES = [
    "en-US-AriaNeural",
    "en-US-JennyNeural",
    "en-US-MichelleNeural",
    "en-US-SaraNeural",
]

def run(cmd, timeout=120):
    return subprocess.run(cmd, shell=True, capture_output=True, timeout=timeout)

def install_piper():
    piper_bin = '/tmp/piper/piper'
    if os.path.exists(piper_bin):
        return piper_bin
    print("  📦 Installing Piper TTS...")
    os.makedirs('/tmp/piper', exist_ok=True)
    tar = '/tmp/piper.tar.gz'
    r = subprocess.run(['curl', '-L', '--silent', '--output', tar, PIPER_BIN_URL],
                       capture_output=True, timeout=60)
    if r.returncode != 0:
        raise Exception("Piper download failed")
    subprocess.run(['tar', '-xzf', tar, '-C', '/tmp/'], capture_output=True)
    os.chmod(piper_bin, 0o755)
    print("  ✅ Piper installed")
    return piper_bin

def download_piper_voice():
    model  = f'/tmp/piper/{PIPER_VOICE}.onnx'
    config = f'/tmp/piper/{PIPER_VOICE}.onnx.json'
    if not os.path.exists(model):
        print(f"  📥 Downloading female voice: {PIPER_VOICE}...")
        subprocess.run(['curl', '-L', '--silent', '--output', model, PIPER_MODEL_URL],
                       capture_output=True, timeout=120)
    if not os.path.exists(config):
        subprocess.run(['curl', '-L', '--silent', '--output', config, PIPER_CONFIG_URL],
                       capture_output=True, timeout=30)
    return model, config

def normalize(wav, mp3):
    r = run(
        f'ffmpeg -i "{wav}" '
        f'-codec:a libmp3lame -qscale:a 2 -ar 44100 -ac 1 '
        f'-af "loudnorm=I=-16:TP=-1.5:LRA=11,'
        f'equalizer=f=3000:width_type=o:width=2:g=3" '
        f'"{mp3}" -y'
    )
    if r.returncode != 0:
        run(f'ffmpeg -i "{wav}" -codec:a libmp3lame -qscale:a 2 "{mp3}" -y')

def generate_piper(text, mp3):
    print("  🎙️ Piper TTS — lessac-high (warm female)...")
    piper = install_piper()
    model, _ = download_piper_voice()
    if not os.path.exists(model):
        raise Exception("Voice model missing")
    wav = mp3.replace('.mp3', '_raw.wav')
    r = subprocess.run(
        [piper, '--model', model, '--output_file', wav,
         '--sentence_silence', '0.25', '--length_scale', '0.95'],
        input=text.encode('utf-8'),
        capture_output=True, timeout=180
    )
    if r.returncode != 0:
        raise Exception(f"Piper: {r.stderr.decode()[-200:]}")
    if not os.path.exists(wav) or os.path.getsize(wav) < 1000:
        raise Exception("Piper empty output")
    normalize(wav, mp3)
    try: os.remove(wav)
    except: pass
    print(f"  ✅ Piper ready ({os.path.getsize(mp3)//1024}KB)")

def generate_edge(text, mp3, voice):
    print(f"  🎙️ edge-tts — {voice}...")
    import asyncio, edge_tts
    async def _gen():
        c = edge_tts.Communicate(text, voice=voice, rate="+8%", volume="+10%")
        await c.save(mp3)
    asyncio.run(_gen())
    if not os.path.exists(mp3) or os.path.getsize(mp3) < 1000:
        raise Exception(f"edge-tts {voice} empty output")
    tmp = mp3 + '.norm.mp3'
    r = run(f'ffmpeg -i "{mp3}" -af "loudnorm=I=-16:TP=-1.5:LRA=11" '
            f'-codec:a libmp3lame -qscale:a 2 "{tmp}" -y')
    if r.returncode == 0 and os.path.exists(tmp):
        os.replace(tmp, mp3)
    print(f"  ✅ edge-tts ready ({os.path.getsize(mp3)//1024}KB)")

def generate_gtts(text, mp3):
    print("  🎙️ gTTS — Google female (last resort)...")
    from gtts import gTTS
    gTTS(text=text, lang='en', slow=False, tld='co.uk').save(mp3)
    print(f"  ✅ gTTS ready ({os.path.getsize(mp3)//1024}KB)")

def main():
    text_file = 'output/voiceover_text.txt'
    output    = 'output/voiceover.mp3'

    if not os.path.exists(text_file):
        print("❌ voiceover_text.txt not found!")
        sys.exit(1)

    with open(text_file) as f:
        text = f.read().strip()

    if not text:
        print("❌ Voiceover text empty!")
        sys.exit(1)

    os.makedirs('output', exist_ok=True)
    print(f"🎙️ Generating FEMALE voiceover ({len(text)} chars)...")
    print(f"📝 Preview: {text[:100]}...\n")

    # 1 — Piper (best quality)
    try:
        generate_piper(text, output)
        print("\n✅ Piper female voice done!")
        return
    except Exception as e:
        print(f"  ⚠️ Piper failed: {e}\n")

    # 2-4 — edge-tts female voices
    for voice in EDGE_VOICES:
        try:
            generate_edge(text, output, voice)
            print(f"\n✅ {voice} done!")
            return
        except Exception as e:
            print(f"  ⚠️ {voice} failed: {e}")

    # 5 — gTTS last resort
    try:
        generate_gtts(text, output)
        print("\n✅ gTTS done (fallback)!")
        return
    except Exception as e:
        print(f"❌ ALL TTS failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
