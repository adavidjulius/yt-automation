// scripts/assemble_video.js
// Assembles images + voiceover + music into final MP4 using FFmpeg

const fs = require('fs');
const { execSync, spawnSync } = require('child_process');
const path = require('path');

function run(cmd) {
  console.log(`  🔧 ${cmd.substring(0, 80)}...`);
  const result = spawnSync('bash', ['-c', cmd], { stdio: 'pipe', timeout: 120000 });
  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString() : '';
    throw new Error(`FFmpeg error: ${stderr}`);
  }
}

function getAudioDuration(audioPath) {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
      { stdio: 'pipe' }
    ).toString().trim();
    const dur = parseFloat(result);
    if (isNaN(dur) || dur <= 0) return 90;
    return dur;
  } catch {
    return 90;
  }
}

function isValidAudio(filepath) {
  if (!fs.existsSync(filepath)) return false;
  if (fs.statSync(filepath).size < 1000) return false;
  try {
    // Check if ffprobe sees it as having an audio stream
    const result = execSync(
      `ffprobe -v error -select_streams a -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${filepath}"`,
      { stdio: 'pipe' }
    ).toString().trim();
    return result.includes('audio');
  } catch {
    return false;
  }
}

function createSilentAudio(filepath, duration) {
  try {
    execSync(
      `ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t ${duration} "${filepath}" -y`,
      { stdio: 'pipe' }
    );
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync('output/images/manifest.json', 'utf8'));
  const { imagePaths } = manifest;
  const validImages = imagePaths.filter(p => p && fs.existsSync(p));

  if (validImages.length === 0) throw new Error('No valid images found!');

  const voiceoverPath = 'output/voiceover.mp3';
  const musicPath = 'output/background_music.mp3';
  const outputPath = 'output/final_video.mp4';

  console.log(`🎬 Assembling video with ${validImages.length} scenes...`);

  // ─── Validate voiceover ──────────────────────────────────────────────────
  if (!isValidAudio(voiceoverPath)) {
    throw new Error('Voiceover file is missing or not valid audio!');
  }

  const totalDuration = getAudioDuration(voiceoverPath);
  const sceneDuration = totalDuration / validImages.length;
  console.log(`  ⏱️ Total duration: ${totalDuration.toFixed(1)}s`);
  console.log(`  🎞️ Scene duration: ${sceneDuration.toFixed(1)}s each`);

  // ─── Validate background music ───────────────────────────────────────────
  let hasMusic = false;
  if (fs.existsSync(musicPath)) {
    if (isValidAudio(musicPath)) {
      hasMusic = true;
      console.log('  🎵 Background music: valid ✅');
    } else {
      console.log('  ⚠️ background_music.mp3 is not valid audio — skipping music');
      // Remove the corrupt file so it doesn't cause issues
      try { fs.unlinkSync(musicPath); } catch {}
    }
  } else {
    console.log('  ⚠️ No background music file found — continuing without music');
  }

  // ─── Step 1: Create video segment for each image ────────────────────────
  const segmentPaths = [];
  for (let i = 0; i < validImages.length; i++) {
    const segPath = `output/segment_${i}.mp4`;
    const frames = Math.ceil(sceneDuration * 25);
    const zoomDir = i % 2 === 0 ? '+' : '-';
    const zoomEnd = i % 2 === 0 ? '1.05' : '0.97';

    run(`ffmpeg -loop 1 -i "${validImages[i]}" \
      -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(zoom+0.0015,${zoomEnd})':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080,setsar=1" \
      -t ${sceneDuration} \
      -c:v libx264 -pix_fmt yuv420p -r 25 \
      "${segPath}" -y`);

    segmentPaths.push(segPath);
  }

  // ─── Step 2: Concatenate segments ───────────────────────────────────────
  const concatFile = 'output/concat_list.txt';
  fs.writeFileSync(concatFile, segmentPaths.map(p => `file '${path.resolve(p)}'`).join('\n'));

  const concatenatedPath = 'output/concatenated.mp4';
  run(`ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${concatenatedPath}" -y`);

  // ─── Step 3: Mix audio ───────────────────────────────────────────────────
  if (hasMusic) {
    // Voiceover + background music
    run(`ffmpeg -i "${concatenatedPath}" \
      -i "${voiceoverPath}" \
      -i "${musicPath}" \
      -filter_complex "[1:a]volume=1.0[voice];[2:a]volume=0.08,apad[music];[voice][music]amix=inputs=2:duration=first[audio]" \
      -map 0:v -map "[audio]" \
      -c:v copy -c:a aac -b:a 128k \
      -shortest \
      "${outputPath}" -y`);
  } else {
    // Voiceover only — no background music
    run(`ffmpeg -i "${concatenatedPath}" \
      -i "${voiceoverPath}" \
      -map 0:v -map 1:a \
      -c:v copy -c:a aac -b:a 128k \
      -shortest \
      "${outputPath}" -y`);
  }

  // ─── Step 4: Add title overlay ───────────────────────────────────────────
  const metadata = JSON.parse(fs.readFileSync('output/metadata.json', 'utf8'));
  const title = metadata.title.replace(/[':]/g, '').substring(0, 50);
  const finalWithTitle = 'output/final_titled.mp4';

  run(`ffmpeg -i "${outputPath}" \
    -vf "drawtext=text='${title}':fontcolor=white:fontsize=44:box=1:boxcolor=black@0.6:boxborderw=10:x=(w-text_w)/2:y=h-150:enable='lt(t,4)'" \
    -c:v libx264 -c:a copy \
    "${finalWithTitle}" -y`);

  fs.renameSync(finalWithTitle, outputPath);

  // ─── Cleanup ─────────────────────────────────────────────────────────────
  segmentPaths.forEach(p => { try { fs.unlinkSync(p); } catch {} });
  try { fs.unlinkSync(concatenatedPath); } catch {}
  try { fs.unlinkSync(concatFile); } catch {}

  const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n✅ Video assembled: ${outputPath}`);
  console.log(`📦 File size: ${sizeMB} MB`);
  console.log(`⏱️ Duration: ${totalDuration.toFixed(0)} seconds`);
}

main().catch(err => {
  console.error('❌ Video assembly failed:', err.message);
  process.exit(1);
});
