// scripts/assemble_video.js
// Assembles images + voiceover + music into a final MP4 using FFmpeg
// FFmpeg is 100% free, open source, no watermarks

const fs = require('fs');
const { execSync, exec } = require('child_process');
const path = require('path');

function run(cmd) {
  console.log(`  🔧 ${cmd.substring(0, 80)}...`);
  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch (err) {
    throw new Error(`FFmpeg error: ${err.stderr?.toString() || err.message}`);
  }
}

async function getAudioDuration(audioPath) {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    ).toString().trim();
    return parseFloat(result);
  } catch {
    return 90; // Default 90 seconds
  }
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync('output/images/manifest.json', 'utf8'));
  const { imagePaths } = manifest;
  const validImages = imagePaths.filter(p => p && fs.existsSync(p));

  if (validImages.length === 0) {
    throw new Error('No valid images found!');
  }

  const voiceoverPath = 'output/voiceover.mp3';
  const musicPath = 'output/background_music.mp3';
  const outputPath = 'output/final_video.mp4';

  console.log(`🎬 Assembling video with ${validImages.length} scenes...`);

  // Get voiceover duration
  const totalDuration = await getAudioDuration(voiceoverPath);
  const sceneDuration = totalDuration / validImages.length;
  
  console.log(`  ⏱️ Total duration: ${totalDuration.toFixed(1)}s`);
  console.log(`  🎞️ Scene duration: ${sceneDuration.toFixed(1)}s each`);

  // ─── Step 1: Create video segments for each image ───────────────────────
  const segmentPaths = [];
  for (let i = 0; i < validImages.length; i++) {
    const segPath = `output/segment_${i}.mp4`;
    
    // Create video from image with Ken Burns effect (slow zoom)
    const scale = i % 2 === 0 ? '1.05' : '0.95'; // alternating zoom in/out
    run(`ffmpeg -loop 1 -i "${validImages[i]}" \
      -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(zoom+0.0015,${scale})':d=${Math.ceil(sceneDuration * 25)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080,setsar=1" \
      -t ${sceneDuration} \
      -c:v libx264 -pix_fmt yuv420p \
      -r 25 \
      "${segPath}" -y`);
    
    segmentPaths.push(segPath);
  }

  // ─── Step 2: Concatenate all segments ───────────────────────────────────
  const concatFile = 'output/concat_list.txt';
  const concatContent = segmentPaths.map(p => `file '${path.resolve(p)}'`).join('\n');
  fs.writeFileSync(concatFile, concatContent);

  const concatenatedPath = 'output/concatenated.mp4';
  run(`ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${concatenatedPath}" -y`);

  // ─── Step 3: Add voiceover + background music ────────────────────────────
  const hasMusic = fs.existsSync(musicPath);
  
  if (hasMusic) {
    run(`ffmpeg -i "${concatenatedPath}" \
      -i "${voiceoverPath}" \
      -i "${musicPath}" \
      -filter_complex "[1:a]volume=1.0[voice];[2:a]volume=0.08[music];[voice][music]amix=inputs=2:duration=first[audio]" \
      -map 0:v -map "[audio]" \
      -c:v copy -c:a aac \
      -shortest \
      "${outputPath}" -y`);
  } else {
    run(`ffmpeg -i "${concatenatedPath}" \
      -i "${voiceoverPath}" \
      -map 0:v -map 1:a \
      -c:v copy -c:a aac \
      -shortest \
      "${outputPath}" -y`);
  }

  // ─── Step 4: Add subtitles / captions overlay ───────────────────────────
  // Add title card at the beginning
  const metadata = JSON.parse(fs.readFileSync('output/metadata.json', 'utf8'));
  const title = metadata.title.replace(/'/g, "\\'");
  
  const finalWithTitle = 'output/final_with_title.mp4';
  run(`ffmpeg -i "${outputPath}" \
    -vf "drawtext=text='${title}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.6:boxborderw=10:x=(w-text_w)/2:y=h-h/5:enable='lt(t,4)'" \
    -c:v libx264 -c:a copy \
    "${finalWithTitle}" -y`);

  // Rename to final
  fs.renameSync(finalWithTitle, outputPath);

  // ─── Cleanup temp files ────────────────────────────────────────────────
  segmentPaths.forEach(p => { try { fs.unlinkSync(p); } catch {} });
  try { fs.unlinkSync(concatenatedPath); } catch {}

  // Check output size
  const stats = fs.statSync(outputPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1);

  console.log(`✅ Video assembled: ${outputPath}`);
  console.log(`📦 File size: ${sizeMB} MB`);
  console.log(`⏱️ Duration: ${totalDuration.toFixed(0)} seconds`);
}

main().catch(err => {
  console.error('❌ Video assembly failed:', err.message);
  process.exit(1);
});
