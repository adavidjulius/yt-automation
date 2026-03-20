#!/usr/bin/env python3
# scripts/generate_avatar.py
# Wav2Lip lip sync — female model + female voice
# Outputs 9:16 Shorts format with captions

import os
import sys
import subprocess
import shutil
import json

AVATAR_PHOTO      = "avatar.jpg"
AVATAR_VIDEO      = "avatar_base.mp4"
WAV2LIP_REPO      = "https://github.com/justinjohn0306/Wav2Lip.git"
WAV2LIP_MODEL_URL = "https://github.com/justinjohn0306/Wav2Lip/releases/download/models/wav2lip_gan.pth"
FACE_DETECT_URL   = "https://github.com/justinjohn0306/Wav2Lip/releases/download/models/s3fd-619a316812.pth"
WAV2LIP_DIR       = "/tmp/Wav2Lip"

SHORTS_W          = 1080
SHORTS_H          = 1920
SHORTS_FPS        = 30
MAX_DURATION      = 58
CAPTION_WORDS     = 4

def run(cmd, timeout=300, cwd=None):
    result = subprocess.run(
        cmd, shell=True,
        capture_output=True,
        timeout=timeout,
        cwd=cwd
    )
    return result.returncode == 0, result.stdout.decode(), result.stderr.decode()

def tryrun(cmd, timeout=120, cwd=None):
    try:
        ok, out, err = run(cmd, timeout, cwd)
        return ok
    except Exception as e:
        print("  warning: " + str(e)[:100])
        return False

def get_duration(filepath):
    result = subprocess.run([
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filepath
    ], capture_output=True)
    try:
        d = float(result.stdout.decode().strip())
        return min(d, MAX_DURATION)
    except:
        return 55.0

def has_audio(filepath):
    try:
        r = subprocess.run([
            'ffprobe', '-v', 'error',
            '-select_streams', 'a:0',
            '-show_entries', 'stream=codec_type',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filepath
        ], capture_output=True)
        return r.stdout.decode().strip() == 'audio'
    except:
        return False

def install_wav2lip():
    if os.path.exists(os.path.join(WAV2LIP_DIR, 'inference.py')):
        print("  Wav2Lip already cloned")
    else:
        print("  Cloning Wav2Lip...")
        ok, _, err = run("git clone --depth=1 " + WAV2LIP_REPO + " " + WAV2LIP_DIR)
        if not ok:
            print("  Clone failed: " + err[:200])
            return False
        print("  Wav2Lip cloned")

    # Install requirements from file
    req_file = os.path.join(WAV2LIP_DIR, 'requirements.txt')
    if os.path.exists(req_file):
        print("  Installing Wav2Lip requirements...")
        tryrun("pip install -r " + req_file + " --quiet", timeout=300)

    # Install ALL extra deps that Wav2Lip needs
    print("  Installing extra dependencies...")
    deps = [
        "tqdm",
        "librosa",
        "resampy",
        "scipy",
        "batch_face",
        "numba",
        "llvmlite",
        "joblib",
        "scikit-learn",
        "imageio",
        "imageio-ffmpeg",
        "face_alignment",
    ]
    for dep in deps:
        result = subprocess.run(
            ["pip", "install", dep, "--quiet"],
            capture_output=True, timeout=60
        )
        if result.returncode == 0:
            print("  installed: " + dep)
        else:
            print("  warning - could not install: " + dep)

    print("  Wav2Lip ready")
    return True

def download_models():
    ckpt_dir = os.path.join(WAV2LIP_DIR, 'checkpoints')
    sfd_dir  = os.path.join(WAV2LIP_DIR, 'face_detection', 'detection', 'sfd')
    os.makedirs(ckpt_dir, exist_ok=True)
    os.makedirs(sfd_dir, exist_ok=True)

    files = {
        os.path.join(ckpt_dir, 'wav2lip_gan.pth'): WAV2LIP_MODEL_URL,
        os.path.join(sfd_dir, 's3fd-619a316812.pth'): FACE_DETECT_URL,
    }

    for dest, url in files.items():
        if os.path.exists(dest) and os.path.getsize(dest) > 100000:
            print("  cached: " + os.path.basename(dest))
            continue
        print("  Downloading " + os.path.basename(dest) + "...")
        r = subprocess.run([
            'curl', '-L', '--silent',
            '--retry', '3',
            '--retry-delay', '5',
            '--output', dest,
            url
        ], capture_output=True, timeout=300)
        if r.returncode == 0 and os.path.exists(dest):
            size_mb = os.path.getsize(dest) / 1024 / 1024
            print("  Downloaded " + os.path.basename(dest) + " (" + str(round(size_mb, 1)) + "MB)")
        else:
            print("  Failed: " + r.stderr.decode()[:100])
            return False
    return True

def prepare_face_video(duration):
    out = 'output/face_source.mp4'

    if os.path.exists(out) and os.path.getsize(out) > 10000:
        print("  Face video already exists")
        return out

    if os.path.exists(AVATAR_VIDEO):
        print("  Using avatar_base.mp4 (looping to match duration)...")
        ok, _, err = run(
            'ffmpeg -stream_loop -1 -i "' + AVATAR_VIDEO + '" '
            '-t ' + str(duration) + ' '
            '-c:v libx264 -an -r 25 '
            '"' + out + '" -y',
            timeout=120
        )
        if not ok:
            print("  Loop failed: " + err[:150])
    elif os.path.exists(AVATAR_PHOTO):
        print("  Animating avatar.jpg with breathing zoom...")
        frames = int(duration * 25)
        ok, _, err = run(
            'ffmpeg -loop 1 -i "' + AVATAR_PHOTO + '" '
            '-vf "scale=720:720:force_original_aspect_ratio=increase,'
            'crop=720:720,'
            'zoompan=z=\'1.02+0.008*sin(2*PI*t/4)\':'
            'd=' + str(frames) + ':'
            'x=\'iw/2-(iw/zoom/2)\':'
            'y=\'ih/2-(ih/zoom/2)\':s=720x720" '
            '-t ' + str(duration) + ' '
            '-r 25 -c:v libx264 -pix_fmt yuv420p '
            '"' + out + '" -y',
            timeout=180
        )
        if not ok:
            print("  Zoom failed, trying simple static...")
            run(
                'ffmpeg -loop 1 -i "' + AVATAR_PHOTO + '" '
                '-vf "scale=720:720:force_original_aspect_ratio=increase,crop=720:720" '
                '-t ' + str(duration) + ' '
                '-r 25 -c:v libx264 -pix_fmt yuv420p '
                '"' + out + '" -y',
                timeout=60
            )
    else:
        print("  No avatar.jpg or avatar_base.mp4 found!")
        return None

    if os.path.exists(out) and os.path.getsize(out) > 1000:
        size_mb = os.path.getsize(out) / 1024 / 1024
        print("  Face video ready (" + str(round(size_mb, 1)) + "MB)")
        return out

    print("  Face video creation failed!")
    return None

def run_wav2lip(face_video, audio_wav, output_mp4):
    print("  Running Wav2Lip inference...")
    print("  This takes 3-6 minutes on CPU...")

    cmd = (
        'python3 inference.py '
        '--checkpoint_path checkpoints/wav2lip_gan.pth '
        '--face "' + os.path.abspath(face_video) + '" '
        '--audio "' + os.path.abspath(audio_wav) + '" '
        '--outfile "' + os.path.abspath(output_mp4) + '" '
        '--pads 0 20 0 0 '
        '--resize_factor 1 '
        '--wav2lip_batch_size 64 '
        '--face_det_batch_size 16 '
        '--nosmooth '
        '--cpu'
    )

    ok, stdout, stderr = run(cmd, timeout=600, cwd=WAV2LIP_DIR)

    if ok and os.path.exists(output_mp4) and os.path.getsize(output_mp4) > 10000:
        size_mb = os.path.getsize(output_mp4) / 1024 / 1024
        print("  Lip sync complete! (" + str(round(size_mb, 1)) + "MB)")
        return True

    print("  Wav2Lip failed!")
    print("  " + stderr[-500:])
    return False

def format_to_shorts(avatar_mp4, output_mp4, duration):
    print("  Formatting to " + str(SHORTS_W) + "x" + str(SHORTS_H) + " Shorts...")

    ok = tryrun(
        'ffmpeg -i "' + avatar_mp4 + '" '
        '-vf "scale=' + str(SHORTS_W) + ':-2:force_original_aspect_ratio=decrease,'
        'pad=' + str(SHORTS_W) + ':' + str(SHORTS_H) + ':(ow-iw)/2:80:color=#0d0d1a" '
        '-c:v libx264 -c:a aac '
        '-r ' + str(SHORTS_FPS) + ' '
        '-t ' + str(duration) + ' '
        '"' + output_mp4 + '" -y',
        timeout=180
    )

    if not ok or not os.path.exists(output_mp4):
        print("  Trying simple pad fallback...")
        tryrun(
            'ffmpeg -i "' + avatar_mp4 + '" '
            '-vf "pad=' + str(SHORTS_W) + ':' + str(SHORTS_H) + ':(ow-iw)/2:(oh-ih)/2:black" '
            '-c:v libx264 -c:a aac '
            '-t ' + str(duration) + ' '
            '"' + output_mp4 + '" -y',
            timeout=120
        )

    return os.path.exists(output_mp4)

def add_captions(video_path, script_text, output_path, duration):
    print("  Adding Shorts captions...")

    if not script_text or not script_text.strip():
        shutil.copy(video_path, output_path)
        return

    words = script_text.strip().split()
    chunks = []
    for i in range(0, len(words), CAPTION_WORDS):
        chunk = ' '.join(words[i:i + CAPTION_WORDS])
        if chunk:
            chunks.append(chunk)

    if not chunks:
        shutil.copy(video_path, output_path)
        return

    time_per_chunk = duration / len(chunks)
    filters = []

    for i, chunk in enumerate(chunks):
        t0 = round(i * time_per_chunk, 2)
        t1 = round((i + 1) * time_per_chunk, 2)
        safe = chunk\
            .replace("'", " ")\
            .replace('"', " ")\
            .replace(":", " ")\
            .replace("\\", " ")\
            .replace("[", "(")\
            .replace("]", ")")\
            .replace(",", " ")\
            .replace("%", " percent ")\
            .replace("&", " and ")\
            [:40]

        filters.append(
            "drawtext=text='" + safe + "':"
            "fontcolor=white:fontsize=58:font=Arial:"
            "box=1:boxcolor=black@0.55:boxborderw=14:"
            "x=(w-text_w)/2:y=h-250:"
            "enable='between(t," + str(t0) + "," + str(t1) + ")'"
        )

    filter_str = ','.join(filters)

    ok = tryrun(
        'ffmpeg -i "' + video_path + '" '
        '-vf "' + filter_str + '" '
        '-c:v libx264 -c:a copy '
        '"' + output_path + '" -y',
        timeout=180
    )

    if not ok or not os.path.exists(output_path):
        print("  Captions failed — using without captions")
        shutil.copy(video_path, output_path)
    else:
        print("  Captions added!")

def add_branding(video_path, output_path, channel_name):
    print("  Adding channel branding...")

    safe_name = channel_name.replace("'", "").replace('"', '')

    ok = tryrun(
        'ffmpeg -i "' + video_path + '" '
        '-vf "drawtext=text=\'' + safe_name + '\':"'
        'fontcolor=white@0.8:fontsize=32:font=Arial:'
        'x=30:y=50:enable=1" '
        '-c:v libx264 -c:a copy '
        '"' + output_path + '" -y',
        timeout=120
    )

    if not ok or not os.path.exists(output_path):
        shutil.copy(video_path, output_path)
    else:
        print("  Branding added")

def main():
    voiceover_mp3 = 'output/voiceover.mp3'
    voiceover_wav = 'output/voiceover.wav'
    face_video    = 'output/face_source.mp4'
    wav2lip_raw   = 'output/wav2lip_raw.mp4'
    shorts_base   = 'output/shorts_base.mp4'
    shorts_cap    = 'output/shorts_captioned.mp4'
    shorts_brand  = 'output/shorts_branded.mp4'
    final_output  = 'output/final_video.mp4'

    script_text  = ''
    channel_name = 'AlForge'

    if os.path.exists('output/voiceover_text.txt'):
        with open('output/voiceover_text.txt') as f:
            script_text = f.read().strip()

    if os.path.exists('output/metadata.json'):
        try:
            meta = json.load(open('output/metadata.json'))
            channel_name = meta.get('channel_name', channel_name)
        except:
            pass

    print("Female AI Avatar Pipeline (Wav2Lip)")
    print("=" * 50)

    # Check voiceover
    if not os.path.exists(voiceover_mp3):
        print("voiceover.mp3 not found!")
        sys.exit(1)

    # Convert MP3 to WAV for Wav2Lip
    print("\nConverting audio to WAV...")
    ok, _, err = run(
        'ffmpeg -i "' + voiceover_mp3 + '" '
        '-ar 16000 -ac 1 -acodec pcm_s16le '
        '"' + voiceover_wav + '" -y'
    )
    if not ok:
        print("Audio conversion failed: " + err[:150])
        sys.exit(1)

    # Get duration
    duration = get_duration(voiceover_mp3)
    print("Duration: " + str(round(duration, 1)) + "s (Shorts limit: " + str(MAX_DURATION) + "s)")

    # Prepare face video
    print("\nPreparing female avatar face...")
    face = prepare_face_video(duration)
    if not face:
        print("No face source available!")
        print("Add avatar.jpg to repo root!")
        sys.exit(1)

    # Install Wav2Lip
    print("\nSetting up Wav2Lip...")
    if not install_wav2lip():
        print("Wav2Lip install failed!")
        sys.exit(1)

    # Download models
    print("\nDownloading models...")
    if not download_models():
        print("Model download failed!")
        sys.exit(1)

    # Run lip sync
    print("\nRunning lip sync...")
    success = run_wav2lip(face, voiceover_wav, wav2lip_raw)

    if not success:
        print("Wav2Lip failed — skipping avatar, keeping slide video")
        sys.exit(0)

    # Format to Shorts 9:16
    print("\nFormatting to Shorts...")
    if not format_to_shorts(wav2lip_raw, shorts_base, duration):
        print("Shorts formatting failed!")
        sys.exit(1)

    # Add captions
    print("\nAdding captions...")
    add_captions(shorts_base, script_text, shorts_cap, duration)
    cap_src = shorts_cap if os.path.exists(shorts_cap) else shorts_base

    # Add branding
    print("\nAdding branding...")
    add_branding(cap_src, shorts_brand, channel_name)
    brand_src = shorts_brand if os.path.exists(shorts_brand) else cap_src

    # Set as final output
    shutil.copy(brand_src, final_output)

    # Cleanup temp files
    for f in [wav2lip_raw, shorts_base, shorts_cap, shorts_brand, voiceover_wav]:
        try:
            if os.path.exists(f):
                os.remove(f)
        except:
            pass

    size_mb = os.path.getsize(final_output) / 1024 / 1024
    print("\n" + "=" * 50)
    print("Female AI Avatar Short READY!")
    print("File    : " + final_output)
    print("Size    : " + str(round(size_mb, 1)) + "MB")
    print("Format  : " + str(SHORTS_W) + "x" + str(SHORTS_H) + " vertical")
    print("Duration: " + str(round(duration, 0)) + "s")
    print("=" * 50)

if __name__ == '__main__':
    main()
