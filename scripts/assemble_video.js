// scripts/assemble_video.js
// Shorts-first assembler
// Priority: avatar video (Wav2Lip output) → fallback gradient
// NO image dependency — avatar IS the video

const fs = require('fs');
const { spawnSync, execSync } = require('child_process');
const path = require('path');

// ─── Shorts Config ────────────────────────────────────────────────────────────
const SHORTS_W   = 1080;
const SHORTS_H   = 1920;
const SHORTS_FPS = 30;
const MAX_SECS   = 58;

function run(cmd, timeout = 300) {
  console.log(`  🔧 ${cmd.substring(0, 90)}...`);
  const r = spawnSync('bash', ['-c', cmd], { stdio: 'pipe', timeout: timeout * 1000 });
  if (r.status !== 0) {
    throw new Error(r.stderr ? r.stderr.toString().slice(-400) : 'Command failed');
  }
  return r.stdout ? r.stdout.toString() : '';
}

function tryRun(cmd, timeout = 120) {
  try { run(cmd, timeout); return true; }
  catch (e) { console.log(`  ⚠️ ${e.message.slice(0, 120)}`); return false; }
}

function getDuration(filepath) {
  try {
    const r = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filepath
    ], { stdio: 'pipe' });
    const d = parseFloat(r.stdout.toString().trim());
    return isNaN(d) ? 55 : Math.min(d, MAX_SECS);
  } catch { return 55; }
}

function isValidVideo(filepath) {
  if (!fs.existsSync(filepath)) return false;
  if (fs.statSync(filepath).size < 10000) return false;
  try {
    const r = spawnSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_type',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filepath
    ], { stdio: 'pipe' });
    return r.stdout.toString().trim() === 'video';
  } catch { return false; }
}

function isValidAudio(filepath) {
  if (!fs.existsSync(filepath)) return false;
  if (fs.statSync(filepath).size < 1000) return false;
  try {
    const r = spawnSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_type',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filepath
    ], { stdio: 'pipe' });
    return r.stdout.toString().trim() === 'audio';
  } catch { return false; }
}

function createGradientVideo(outputPath, duration) {
  console.log('  🎨 Creating gradient background video...');
  // Dark purple-black gradient — matches female avatar aesthetic
  tryRun(
    `ffmpeg -f lavfi ` +
    `-i "color=c=#0d0d1a:size=${SHORTS_W}x${SHORTS_H}:duration=${duration}:rate=${SHORTS_FPS}" ` +
    `-c:v libx264 -pix_fmt yuv420p ` +
    `"${outputPath}" -y`
  );
}

function formatToShorts(inputVideo, outputVideo, duration) {
  console.log(`  📱 Formatting to ${SHORTS_W}x${SHORTS_H} Shorts...`);

  // Scale + pad to 9:16 with dark background, avatar centered top area
  const ok = tryRun(
    `ffmpeg -i "${inputVideo}" ` +
    `-vf "scale=${SHORTS_W}:-2:force_original_aspect_ratio=decrease,` +
    `pad=${SHORTS_W}:${SHORTS_H}:(ow-iw)/2:80:color=#0d0d1a" ` +
    `-c:v libx264 -c:a aac ` +
    `-r ${SHORTS_FPS} -t ${duration} ` +
    `"${outputVideo}" -y`,
    120
  );

  if (!ok) {
    // Simple fallback pad
    tryRun(
      `ffmpeg -i "${inputVideo}" ` +
      `-vf "scale=${SHORTS_W}:${SHORTS_H}:force_original_aspect_ratio=decrease,` +
      `pad=${SHORTS_W}:${SHORTS_H}:(ow-iw)/2:(oh-ih)/2:black" ` +
      `-c:v libx264 -c:a aac -t ${duration} ` +
      `"${outputVideo}" -y`,
      120
    );
  }
}

function addVoiceover(videoPath, audioPath, outputPath, duration) {
  console.log('  🎙️ Mixing voiceover audio...');

  const musicPath = 'output/background_music.mp3';
  const hasMusic = isValidAudio(musicPath);

  if (hasMusic) {
    tryRun(
      `ffmpeg -i "${videoPath}" ` +
      `-i "${audioPath}" ` +
      `-i "${musicPath}" ` +
      `-filter_complex "[1:a]volume=1.0[voice];[2:a]volume=0.06,apad[music];[voice][music]amix=inputs=2:duration=first[audio]" ` +
      `-map 0:v -map "[audio]" ` +
      `-c:v copy -c:a aac -b:a 128k ` +
      `-shortest -t ${duration} ` +
      `"${outputPath}" -y`,
      120
    );
  } else {
    tryRun(
      `ffmpeg -i "${videoPath}" ` +
      `-i "${audioPath}" ` +
      `-map 0:v -map 1:a ` +
      `-c:v copy -c:a aac -b:a 128k ` +
      `-shortest -t ${duration} ` +
      `"${outputPath}" -y`,
      120
    );
  }
}

function addCaptions(videoPath, scriptText, outputPath, duration) {
  console.log('  💬 Adding Shorts captions...');
  if (!scriptText || !scriptText.trim()) {
    fs.copyFileSync(videoPath, outputPath);
    return;
  }

  const words = scriptText.trim().split(/\s+/);
  const chunkSize = 4;
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }

  if (chunks.length === 0) {
    fs.copyFileSync(videoPath, outputPath);
    return;
  }

  const timePerChunk = duration / chunks.length;

  const filters = chunks.map((chunk, i) => {
    const t0 = (i * timePerChunk).toFixed(2);
    const t1 = ((i + 1) * timePerChunk).toFixed(2);
    const safe = chunk
      .replace(/'/g, ' ')
      .replace(/"/g, ' ')
      .replace(/:/g, ' ')
      .replace(/\\/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')')
      .replace(/,/g, ' ')
      .substring(0, 40);
    return (
      `drawtext=text='${safe}':` +
      `fontcolor=white:fontsize=58:font=Arial:` +
      `box=1:boxcolor=black@0.55:boxborderw=14:` +
      `x=(w-text_w)/2:y=h-250:` +
      `enable='between(t,${t0},${t1})'`
    );
  }).join(',');

  const ok = tryRun(
    `ffmpeg -i "${videoPath}" ` +
    `-vf "${filters}" ` +
    `-c:v libx264 -c:a copy ` +
    `"${outputPath}" -y`,
    180
  );

  if (!ok || !fs.existsSync(outputPath)) {
    console.log('  ⚠️ Captions failed — using without');
    fs.copyFileSync(videoPath, outputPath);
  }
}

function addTitleCard(videoPath, title, outputPath) {
  console.log('  🏷️ Adding title card...');
  const safe = (title || '')
    .replace(/'/g, ' ')
    .replace(/"/g, ' ')
    .replace(/:/g, ' ')
    .replace(/\\/g, ' ')
    .substring(0, 45);

  const ok = tryRun(
    `ffmpeg -i "${videoPath}" ` +
    `-vf "drawtext=text='${safe}':` +
    `fontcolor=white:fontsize=36:font=Arial:` +
    `box=1:boxcolor=black@0.6:boxborderw=10:` +
    `x=(w-text_w)/2:y=60:` +
    `enable='lt(t,3)'" ` +
    `-c:v libx264 -c:a copy ` +
    `"${outputPath}" -y`,
    120
  );

  if (!ok || !fs.existsSync(outputPath)) {
    fs.copyFileSync(videoPath, outputPath);
  }
}

async function main() {
  console.log('🎬 Assembling YouTube Short...\n');
  console.log('='.repeat(50));

  if (!fs.existsSync('output')) fs.mkdirSync('output');

  // ── Read script + metadata ─────────────────────────────────────────────────
  let scriptText = '';
  let title = '';
  try {
    const s = JSON.parse(fs.readFileSync('output/script.json', 'utf8'));
    scriptText = s.sections?.VOICEOVER || s.raw || '';
    console.log(`  📝 Script: ${scriptText.substring(0, 60)}...`);
  } catch { console.log('  ⚠️ No script.json found'); }

  try {
    const m = JSON.parse(fs.readFileSync('output/metadata.json', 'utf8'));
    title = m.title || '';
    console.log(`  📌 Title: ${title}`);
  } catch { console.log('  ⚠️ No metadata.json found'); }

  // ── Check voiceover ────────────────────────────────────────────────────────
  const voiceoverPath = 'output/voiceover.mp3';
  if (!isValidAudio(voiceoverPath)) {
    throw new Error('voiceover.mp3 missing or invalid!');
  }
  const duration = getDuration(voiceoverPath);
  console.log(`\n  ⏱️ Duration: ${duration.toFixed(1)}s`);

  // ── Step 1: Get base video ─────────────────────────────────────────────────
  console.log('\n📹 Step 1: Finding base video...');

  const avatarOut = 'output/final_video.mp4';    // Wav2Lip output
  const rawAvatar = 'output/wav2lip_raw.mp4';    // Raw Wav2Lip
  const faceSource = 'output/face_source.mp4';   // Face video

  let baseVideo = null;

  // Priority 1 — Wav2Lip fully processed avatar (best)
  if (isValidVideo(avatarOut) && fs.statSync(avatarOut).size > 500000) {
    console.log('  ✅ Using Wav2Lip processed avatar (output/final_video.mp4)');
    baseVideo = avatarOut;
  }
  // Priority 2 — Raw Wav2Lip output
  else if (isValidVideo(rawAvatar)) {
    console.log('  ✅ Using raw Wav2Lip output (output/wav2lip_raw.mp4)');
    baseVideo = rawAvatar;
  }
  // Priority 3 — Face source video (avatar_base.mp4 animated)
  else if (isValidVideo(faceSource)) {
    console.log('  ✅ Using face source video (output/face_source.mp4)');
    baseVideo = faceSource;
  }
  // Priority 4 — Original avatar_base.mp4 from repo
  else if (isValidVideo('avatar_base.mp4')) {
    console.log('  ✅ Using avatar_base.mp4 directly');
    baseVideo = 'avatar_base.mp4';
  }
  // Priority 5 — Generate gradient fallback
  else {
    console.log('  ⚠️ No avatar video found — using gradient background');
    const gradPath = 'output/gradient_bg.mp4';
    createGradientVideo(gradPath, duration);
    baseVideo = gradPath;
  }

  console.log(`  📁 Base video: ${baseVideo}`);

  // ── Step 2: Format to Shorts 9:16 ─────────────────────────────────────────
  console.log('\n📱 Step 2: Formatting to 9:16 Shorts...');
  const shortsFormatted = 'output/shorts_formatted.mp4';

  // If already final_video.mp4 from avatar pipeline (already 9:16), skip reformat
  if (baseVideo === avatarOut) {
    console.log('  ✅ Avatar already formatted — skipping reformat');
    fs.copyFileSync(avatarOut, shortsFormatted);
  } else {
    formatToShorts(baseVideo, shortsFormatted, duration);
  }

  if (!fs.existsSync(shortsFormatted)) {
    throw new Error('Shorts formatting failed!');
  }

  // ── Step 3: Add voiceover (only if not already in avatar video) ────────────
  console.log('\n🎙️ Step 3: Adding voiceover...');
  const withAudio = 'output/shorts_audio.mp4';

  // Check if base already has good audio (Wav2Lip output does)
  const baseHasAudio = (() => {
    try {
      const r = spawnSync('ffprobe', [
        '-v', 'error', '-select_streams', 'a:0',
        '-show_entries', 'stream=codec_type',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        shortsFormatted
      ], { stdio: 'pipe' });
      return r.stdout.toString().trim() === 'audio';
    } catch { return false; }
  })();

  if (baseHasAudio && (baseVideo === avatarOut || baseVideo === rawAvatar)) {
    console.log('  ✅ Avatar video already has voiceover audio');
    fs.copyFileSync(shortsFormatted, withAudio);
  } else {
    addVoiceover(shortsFormatted, voiceoverPath, withAudio, duration);
    if (!fs.existsSync(withAudio)) {
      fs.copyFileSync(shortsFormatted, withAudio);
    }
  }

  // ── Step 4: Add captions ───────────────────────────────────────────────────
  console.log('\n💬 Step 4: Adding captions...');
  const withCaptions = 'output/shorts_captions.mp4';
  addCaptions(withAudio, scriptText, withCaptions, duration);
  const captionSrc = fs.existsSync(withCaptions) ? withCaptions : withAudio;

  // ── Step 5: Add title card ─────────────────────────────────────────────────
  console.log('\n🏷️ Step 5: Adding title card...');
  const withTitle = 'output/shorts_titled.mp4';
  if (title) {
    addTitleCard(captionSrc, title, withTitle);
  } else {
    fs.copyFileSync(captionSrc, withTitle);
  }
  const titleSrc = fs.existsSync(withTitle) ? withTitle : captionSrc;

  // ── Step 6: Final output ───────────────────────────────────────────────────
  console.log('\n✅ Step 6: Finalizing...');
  fs.copyFileSync(titleSrc, 'output/final_video.mp4');

  // ── Cleanup temp files ─────────────────────────────────────────────────────
  const temps = [
    'output/shorts_formatted.mp4',
    'output/shorts_audio.mp4',
    'output/shorts_captions.mp4',
    'output/shorts_titled.mp4',
    'output/gradient_bg.mp4',
    'output/voiceover.wav',
    'output/wav2lip_raw.mp4',
    'output/face_source.mp4',
    'output/shorts_base.mp4',
    'output/shorts_branded.mp4',
    'output/avatar_raw.mp4',
  ];
  temps.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} });

  // ── Final stats ────────────────────────────────────────────────────────────
  const finalPath = 'output/final_video.mp4';
  if (!fs.existsSync(finalPath)) throw new Error('Final video missing!');

  const sizeMB = (fs.statSync(finalPath).size / 1024 / 1024).toFixed(1);
  console.log('\n' + '='.repeat(50));
  console.log(`🎉 YouTube Short READY!`);
  console.log(`📁 File    : ${finalPath}`);
  console.log(`📦 Size    : ${sizeMB}MB`);
  console.log(`⏱️ Duration: ${duration.toFixed(0)}s`);
  console.log(`📱 Format  : ${SHORTS_W}x${SHORTS_H} vertical`);
  console.log(`💋 Avatar  : ${baseVideo}`);
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('❌ Video assembly failed:', err.message);
  process.exit(1);
});
```

---

## What This Does
```
avatar output exists?
    ↓ YES → use it (already lip synced + formatted)
    ↓ NO  → use wav2lip_raw.mp4
    ↓ NO  → use face_source.mp4
    ↓ NO  → use avatar_base.mp4 directly
    ↓ NO  → gradient fallback

    + voiceover audio mixed in
    + bold captions (4 words/chunk)
    + title card (first 3 seconds)
    = final_video.mp4 (Shorts 9:16)
