#!/usr/bin/env python3
# scripts/generate_tts.py
# Uses gTTS (Google Text-to-Speech) - 100% FREE, no API key needed
# Falls back to pyttsx3 if needed

import os
import sys

def generate_with_gtts(text, output_path):
    """gTTS - Free, uses Google's TTS engine, no API key"""
    from gtts import gTTS
    tts = gTTS(text=text, lang='en', slow=False, tld='com')
    tts.save(output_path)
    print(f"✅ Voice generated with gTTS: {output_path}")
    return True

def main():
    # Read voiceover text
    text_file = 'output/voiceover_text.txt'
    output_file = 'output/voiceover.mp3'

    if not os.path.exists(text_file):
        print("❌ voiceover_text.txt not found!")
        sys.exit(1)

    with open(text_file, 'r') as f:
        text = f.read().strip()

    if not text:
        print("❌ Voiceover text is empty!")
        sys.exit(1)

    print(f"🎙️ Generating voiceover ({len(text)} characters)...")

    # Try gTTS first (free, no key needed)
    try:
        generate_with_gtts(text, output_file)
        print(f"📁 Saved to: {output_file}")
        return
    except Exception as e:
        print(f"⚠️ gTTS failed: {e}")

    # Fallback: edge-tts (Microsoft free TTS)
    try:
        import subprocess
        subprocess.run([
            'pip', 'install', 'edge-tts', '--quiet'
        ], check=True)
        subprocess.run([
            'edge-tts',
            '--voice', 'en-US-AriaNeural',    # Free Microsoft neural voice
            '--text', text,
            '--write-media', output_file
        ], check=True)
        print(f"✅ Voice generated with edge-tts (Microsoft free): {output_file}")
        return
    except Exception as e:
        print(f"⚠️ edge-tts failed: {e}")

    print("❌ All TTS methods failed!")
    sys.exit(1)

if __name__ == '__main__':
    main()
