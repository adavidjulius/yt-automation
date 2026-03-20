#!/usr/bin/env python3
# scripts/generate_avatar.py
# Wav2Lip lip sync — female model photo + female voiceover
# → talking female AI presenter for YouTube Shorts
# 9:16 format, bold captions, professional look
# 100% free, no watermark, CPU only

import os
import sys
import subprocess
import urllib.request
import shutil
import json

# ─── Config ───────────────────────────────────────────────────────────────────
AVATAR_PHOTO      = "avatar.jpg"       # Your female model photo in repo root
AVATAR_VIDEO      = "avatar_base.mp4"  # Optional looping video (better quality)
WAV2LIP_REPO      = "https://github.com/justinjohn0306/Wav2Lip.git"
WAV2LIP_MODEL_URL = "https://github.com/justinjohn0306/Wav2Lip/releases/download/models/wav2lip_gan.pth"
FACE_DETECT_URL   = "https://github.com/justinjohn0306/Wav2Lip/releases/download/models/s3fd-619a316812.pth"
WAV2LIP_DIR       = "/tmp/Wav2Lip"

# Shorts config
SHORTS_WIDTH      = 1080
SHORTS_HEIGHT     = 1920
SHORTS_FPS        = 30
MAX_DURATION      = 58   # YouTube Shorts max

# Caption style — bold white with black outline like Madhan Gowri / Shorts style
CAPTION_FONTSIZE  = 58
CAPTION_COLOR     = "white"
CAPTION_BOX_COLOR = "black@0.55"
CAPTION_Y_POS     = "h-240"   # near bottom of screen
CAPTION_WORDS     = 4         # words per caption chunk

def run(cmd, timeout=300, cwd=None):
    result = subprocess.run(
        cmd, shell=True,
        capture_output=True,
        timeout=timeout,
        cwd=cwd
    )
    return result.returncode == 0, result.stdout.decode(), result.stderr.decode()

def get_duration(filepath):
    result = subprocess.run([
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filepath
    ], capture_output=True)
    try:
        return float(result.stdout.decode().strip())
    except:
        return 55.0

def install_wav2lip():
    if os.path.exists(f'{WAV2LIP_DIR}/inference.py'):
        print("  ✅ Wav2Lip already installed")
        return True

    print("  📦 Cloning Wav2Lip...")
    ok, _, err = run(f"git clone --depth=1 {WAV2LIP_REPO} {WAV2LIP_DIR}")
    if not ok:
        print(f"  ❌ Clone failed: {err}")
        return False

    run(f"pip install -r {WAV2LIP_DIR}/requirements.txt --quiet")
    print("  ✅ Wav2Lip ready")
    return True

def download_models():
    ckpt_dir  = f'{WAV2LIP_DIR}/checkpoints'
    sfd_dir   = f'{WAV2LIP_DIR}/face_detection/detection/sfd'
    os.makedirs(ckpt_dir, exist_ok=True)
    os.makedirs(sfd_dir, exist_ok=True)

    files = {
        f'{ckpt_dir}/wav2lip_gan.pth':   WAV2LIP_MODEL_URL,
        f'{sfd_dir}/s3fd-619a316812.pth': FACE_DETECT_URL,
    }

    for dest, url in files.items():
        if os.path.exists(dest) and os.path.getsize(dest) > 100000:
            print(f"  ✅ {os.path.basename(dest)} cached")
            continue
        print(f"  📥 Downloading {os.path.basename(dest)}...")
        r = subprocess.run(
            ['curl', '-L', '--silent', '--output', dest, url],
            capture_output=True, timeout=120
        )
        if r.returncode == 0:
            size_mb = os.path.getsize(dest) / 1024 / 1024
            print(f"  ✅ Downloaded ({size_mb:.1f}MB)")
        else:
            print(f"  ❌ Failed: {r.stderr.decode()}")
            return False
    return True

def prepare_face_video(duration):
    """Create looping face video from photo or existing video"""
    out = 'output/face_source.mp4'

    if os.path.exists(AVATAR_VIDEO):
        print(f"  📹 Using avatar video: {AVATAR_VIDEO}")
        run(
            f'ffmpeg -stream_loop -1 -i "{AVATAR_VIDEO}" '
            f'-t {duration} -c:v libx264 -an -r 25 '
            f'"{out}" -y'
        )
    elif os.path.exists(AVATAR_PHOTO):
        print(f"  📸 Animating female photo: {AVATAR_PHOTO}")
        frames = int(duration * 25)
        # Subtle breathing zoom effect — makes photo look alive
        ok, _, _ = run(
            f'ffmpeg -loop 1 -i "{AVATAR_PHOTO}" '
            f'-vf "scale=720:720:force_original_aspect_ratio=increase,'
            f'crop=720:720,'
            f'zoompan=z=\'1.02+0.008*sin(2*PI*t/4)\':'
            f'd={frames}:x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':s=720x720" '
            f'-t {duration} -r 25 -c:v libx264 -pix_fmt yuv420p '
            f'"{out}" -y',
            timeout=120
        )
        if not ok:
            # Simple fallback without zoom
            run(
                f'ffmpeg -loop 1 -i "{AVATAR_PHOTO}" '
                f'-vf "scale=720:720:force_original_aspect_ratio=increase,crop=720:720" '
                f'-t {duration} -r 25 -c:v libx264 -pix_fmt yuv420p '
                f'"{out}" -y',
                timeout=60
            )
    else:
        print("❌ No avatar.jpg or avatar_base.mp4 found!")
        print("💡 Upload a female model photo as 'avatar.jpg' to repo root")
        return None

    if os.path.exists(out):
        print(f"  ✅ Face video ready")
        return out
    return None

def run_wav2lip(face_video, audio_wav, output_mp4):
    """Run Wav2Lip inference — lip sync female face to female voice"""
    print("  💋 Running Wav2Lip lip sync (female face + female voice)...")
    print("  ⏳ ~3-5 minutes on CPU...")

    cmd = (
        f'python3 inference.py '
        f'--checkpoint_path checkpoints/wav2lip_gan.pth '
        f'--face "{os.path.abspath(face_video)}" '
        f'--audio "{os.path.abspath(audio_wav)}" '
        f'--outfile "{os.path.abspath(output_mp4)}" '
        f'--pads 0 20 0 0 '       # extra top padding = more natural for female face
        f'--resize_factor 1 '
        f'--wav2lip_batch_size 64 '
        f'--face_det_batch_size 16 '
        f'--nosmooth '
        f'--cpu'
    )

    ok, stdout, stderr = run(cmd, timeout=600, cwd=WAV2LIP_DIR)

    if ok and os.path.exists(output_mp4) and os.path.getsize(output_mp4) > 10000:
        size_mb = os.path.getsize(output_mp4) / 1024 / 1024
        print(f"  ✅ Lip sync complete! ({size_mb:.1f}MB)")
        return True

    print(f"  ❌ Wav2Lip failed")
    print(f"  {stderr[-400:]}")
    return False

def make_shorts_format(avatar_mp4, output_mp4):
    """
    Create YouTube Shorts 9:16 format
    Female presenter centered, dark purple-black gradient bg
    Professional clean look
    """
    print(f"  📱 Creating {SHORTS_WIDTH}x{SHORTS_HEIGHT} Shorts format...")

    # Dark gradient background — purple-black (female aesthetic)
    bg = '0x0d0d1a'

    ok, _, err = run(
        f'ffmpeg -i "{avatar_mp4}" '
        f'-vf "'
        f'scale={SHORTS_WIDTH}:-2:force_original_aspect_ratio=decrease,'
        f'pad={SHORTS_WIDTH}:{SHORTS_HEIGHT}:(ow-iw)/2:ih*0.08:'
        f'color={bg}'
        f'" '
        f'-c:v libx264 -c:a aac '
        f'-r {SHORTS_FPS} '
        f'"{output_mp4}" -y',
        timeout=120
    )

    if not ok:
        print(f"  ⚠️ Smart format failed — using simple pad")
        run(
            f'ffmpeg -i "{avatar_mp4}" '
            f'-vf "pad={SHORTS_WIDTH}:{SHORTS_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black" '
            f'-c:v libx264 -c:a aac '
            f'"{output_mp4}" -y',
            timeout=60
        )

    return os.path.exists(output_mp4)

def add_captions(video_path, script_text, output_path):
    """
    Bold word-by-word captions like Shorts/TikTok style
    White text, black background, bottom center
    Matches female voice timing
    """
    print("  💬 Adding Shorts-style captions...")

    if not script_text.strip():
        shutil.copy(video_path, output_path)
        return

    # Get duration
    duration = get_duration(video_path)

    # Split into chunks
    words = script_text.split()
    chunks = []
    for i in range(0, len(words), CAPTION_WORDS):
        chunk = ' '.join(words[i:i + CAPTION_WORDS])
        if chunk:
            chunks.append(chunk)

    if not chunks:
        shutil.copy(video_path, output_path)
        return

    time_per_chunk = duration / len(chunks)

    # Build drawtext filters
    filters = []
    for i, chunk in enumerate(chunks):
        t_start = i * time_per_chunk
        t_end   = t_start + time_per_chunk
        # Sanitize text for ffmpeg
        safe = (chunk
            .replace("'", " ")
            .replace('"', ' ')
            .replace(':', ' ')
            .replace('\\', ' ')
            .replace('[', '(')
            .replace(']', ')')
        )
        filters.append(
            f"drawtext="
            f"text='{safe}':"
            f"fontcolor={CAPTION_COLOR}:"
            f"fontsize={CAPTION_FONTSIZE}:"
            f"font=Arial:"
            f"fontweight=bold:"
            f"box=1:"
            f"boxcolor={CAPTION_BOX_COLOR}:"
            f"boxborderw=14:"
            f"x=(w-text_w)/2:"
            f"y={CAPTION_Y_POS}:"
            f"enable='between(t,{t_start:.2f},{t_end:.2f})'"
        )

    filter_str = ','.join(filters)

    ok, _, err = run(
        f'ffmpeg -i "{video_path}" '
        f'-vf "{filter_str}" '
        f'-c:v libx264 -c:a copy '
        f'"{output_path}" -y',
        timeout=180
    )

    if ok and os.path.exists(output_path):
        print("  ✅ Captions added!")
    else:
        print(f"  ⚠️ Captions failed — using without: {err[-200:]}")
        shutil.copy(video_path, output_path)

def add_branding(video_path, output_path, channel_name="AlForge"):
    """Add subtle channel branding — top left corner"""
    print("  🏷️ Adding channel branding...")

    safe_name = channel_name.replace("'", "")
    ok, _, _ = run(
        f'ffmpeg -i "{video_path}" '
        f'-vf "drawtext='
        f'text=\'{safe_name}\':'
        f'fontcolor=white@0.7:'
        f'fontsize=30:'
        f'font=Arial:'
        f'x=30:y=50:'
        f'enable=1" '
        f'-c:v libx264 -c:a copy '
        f'"{output_path}" -y',
        timeout=120
    )

    if ok and os.path.exists(output_path):
        print("  ✅ Branding added")
    else:
        shutil.copy(video_path, output_path)

def main():
    # ── Paths ──────────────────────────────────────────────────────────────────
    voiceover_mp3    = 'output/voiceover.mp3'
    voiceover_wav    = 'output/voiceover.wav'
    face_video       = 'output/face_source.mp4'
    wav2lip_raw      = 'output/wav2lip_raw.mp4'
    shorts_base      = 'output/shorts_base.mp4'
    shorts_captioned = 'output/shorts_captioned.mp4'
    shorts_branded   = 'output/shorts_branded.mp4'
    final_output     = 'output/final_video.mp4'

    # ── Read script ────────────────────────────────────────────────────────────
    script_text = ""
    if os.path.exists('output/voiceover_text.txt'):
        with open('output/voiceover_text.txt') as f:
            script_text = f.read().strip()

    # ── Read metadata for channel name ─────────────────────────────────────────
    channel_name = "AlForge"
    if os.path.exists('output/metadata.json'):
        import json
        try:
            meta = json.load(open('output/metadata.json'))
            channel_name = meta.get('channel_name', channel_name)
        except:
            pass

    print("🎭 Female AI Avatar Pipeline (Wav2Lip)")
    print("=" * 50)

    # ── Check voiceover ────────────────────────────────────────────────────────
    if not os.path.exists(voiceover_mp3):
        print("❌ voiceover.mp3 not found!")
        sys.exit(1)

    # ── Convert MP3 → WAV (Wav2Lip requirement) ────────────────────────────────
    print("\n🔄 Converting audio for Wav2Lip...")
    ok, _, err = run(
        f'ffmpeg -i "{voiceover_mp3}" '
        f'-ar 16000 -ac 1 -acodec pcm_s16le '
        f'"{voiceover_wav}" -y'
    )
    if not ok:
        print(f"❌ Audio conversion failed: {err}")
        sys.exit(1)

    # ── Get audio duration ─────────────────────────────────────────────────────
    duration = get_duration(voiceover_mp3)
    duration = min(duration, MAX_DURATION)
    print(f"  ⏱️ Duration: {duration:.1f}s (Shorts limit: {MAX_DURATION}s)")

    # ── Prepare face video ─────────────────────────────────────────────────────
    print(f"\n📸 Preparing female avatar face...")
    face = prepare_face_video(duration)
    if not face:
        print("❌ No face source available!")
        print("💡 Add 'avatar.jpg' (female model photo) to your repo root")
        sys.exit(1)

    # ── Install Wav2Lip ────────────────────────────────────────────────────────
    print(f"\n📦 Setting up Wav2Lip...")
    if not install_wav2lip():
        print("❌ Wav2Lip install failed!")
        sys.exit(1)

    # ── Download models ────────────────────────────────────────────────────────
    print(f"\n📥 Preparing models...")
    if not download_models():
        print("❌ Model download failed!")
        sys.exit(1)

    # ── Run lip sync ───────────────────────────────────────────────────────────
    print(f"\n💋 Lip syncing female face to female voice...")
    success = run_wav2lip(face, voiceover_wav, wav2lip_raw)

    if not success:
        print("⚠️ Wav2Lip failed — skipping avatar, keeping slide video")
        sys.exit(0)  # Don't fail whole pipeline

    # ── Format as Shorts ───────────────────────────────────────────────────────
    print(f"\n📱 Formatting as YouTube Shorts (9:16)...")
    if not make_shorts_format(wav2lip_raw, shorts_base):
        print("❌ Shorts formatting failed!")
        sys.exit(1)

    # ── Add captions ───────────────────────────────────────────────────────────
    print(f"\n💬 Adding captions...")
    add_captions(shorts_base, script_text, shorts_captioned)

    # ── Add branding ───────────────────────────────────────────────────────────
    print(f"\n🏷️ Adding channel branding...")
    cap_src = shorts_captioned if os.path.exists(shorts_captioned) else shorts_base
    add_branding(cap_src, shorts_branded, channel_name)

    # ── Set as final output ────────────────────────────────────────────────────
    final_src = shorts_branded if os.path.exists(shorts_branded) else cap_src
    shutil.copy(final_src, final_output)

    # ── Done ───────────────────────────────────────────────────────────────────
    size_mb = os.path.getsize(final_output) / 1024 / 1024
    print(f"\n{'='*50}")
    print(f"🎉 Female AI Avatar Short READY!")
    print(f"📁 {final_output} ({size_mb:.1f}MB)")
    print(f"📱 Format : {SHORTS_WIDTH}x{SHORTS_HEIGHT} vertical")
    print(f"💋 Lip sync: female face + female voice matched")
    print(f"💬 Captions: {CAPTION_WORDS} words/chunk, bottom center")
    print(f"🏷️ Branding: {channel_name} top left")
    print(f"{'='*50}")

if __name__ == '__main__':
    main()
