#!/usr/bin/env python3
# scripts/verify_images.py
# Verifies all images in manifest are valid before video assembly
# Replaces any corrupt images with FFmpeg-generated fallbacks

import os
import json
import subprocess
import struct

def is_valid_image(filepath):
    """Check if file is a real JPEG or PNG by magic bytes"""
    if not os.path.exists(filepath):
        return False
    if os.path.getsize(filepath) < 5000:
        return False
    with open(filepath, 'rb') as f:
        header = f.read(4)
    # JPEG: FF D8 FF
    if header[:3] == b'\xFF\xD8\xFF':
        return True
    # PNG: 89 50 4E 47
    if header[:4] == b'\x89PNG':
        return True
    return False

def create_fallback(filepath, index):
    """Create gradient image with FFmpeg"""
    colors = [
        ('1a1a2e', '16213e'),
        ('0f3460', '533483'),
        ('1b4332', '2d6a4f'),
        ('2b2d42', '8d99ae'),
        ('370617', '6a040f'),
        ('03071e', '023e8a'),
        ('10002b', '240046'),
    ]
    c = colors[index % len(colors)]
    cmd = [
        'ffmpeg', '-f', 'lavfi',
        '-i', f'color=c=#{c[0]}:size=1920x1080:duration=1',
        '-vframes', '1', filepath, '-y'
    ]
    try:
        subprocess.run(cmd, capture_output=True, check=True)
        return os.path.exists(filepath)
    except:
        return False

def main():
    manifest_path = 'output/images/manifest.json'
    if not os.path.exists(manifest_path):
        print("❌ manifest.json not found!")
        exit(1)

    with open(manifest_path) as f:
        manifest = json.load(f)

    paths = manifest.get('imagePaths', [])
    print(f"🔍 Verifying {len(paths)} images...")

    fixed = 0
    valid = 0

    for i, filepath in enumerate(paths):
        if is_valid_image(filepath):
            size_kb = os.path.getsize(filepath) // 1024
            print(f"  ✅ {os.path.basename(filepath)} ({size_kb}KB)")
            valid += 1
        else:
            print(f"  ⚠️ {os.path.basename(filepath)} is corrupt — replacing with gradient")
            try:
                os.remove(filepath)
            except:
                pass
            if create_fallback(filepath, i):
                print(f"  🎨 Created fallback for {os.path.basename(filepath)}")
                fixed += 1
            else:
                print(f"  ❌ Could not create fallback for {os.path.basename(filepath)}")

    print(f"\n✅ Verify complete: {valid} valid, {fixed} replaced with fallbacks")

    if valid + fixed == 0:
        print("❌ No usable images!")
        exit(1)

if __name__ == '__main__':
    main()
