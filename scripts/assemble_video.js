const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

var SHORTS_W = 1080;
var SHORTS_H = 1920;
var SHORTS_FPS = 30;
var MAX_SECS = 58;

function run(cmd, timeout) {
  timeout = timeout || 300;
  console.log('  running: ' + cmd.substring(0, 80) + '...');
  var r = spawnSync('bash', ['-c', cmd], { stdio: 'pipe', timeout: timeout * 1000 });
  if (r.status !== 0) {
    var err = r.stderr ? r.stderr.toString().slice(-400) : 'Command failed';
    throw new Error(err);
  }
  return r.stdout ? r.stdout.toString() : '';
}

function tryRun(cmd, timeout) {
  try { run(cmd, timeout || 120); return true; }
  catch (e) { console.log('  warning: ' + e.message.slice(0, 120)); return false; }
}

function getDuration(filepath) {
  try {
    var r = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filepath
    ], { stdio: 'pipe' });
    var d = parseFloat(r.stdout.toString().trim());
    return isNaN(d) ? 55 : Math.min(d, MAX_SECS);
  } catch (e) { return 55; }
}

function isValidVideo(filepath) {
  if (!fs.existsSync(filepath)) return false;
  if (fs.statSync(filepath).size < 10000) return false;
  try {
    var r = spawnSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_type',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filepath
    ], { stdio: 'pipe' });
    return r.stdout.toString().trim() === 'video';
  } catch (e) { return false; }
}

function isValidAudio(filepath) {
  if (!fs.existsSync(filepath)) return false;
  if (fs.statSync(filepath).size < 1000) return false;
  try {
    var r = spawnSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_type',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filepath
    ], { stdio: 'pipe' });
    return r.stdout.toString().trim() === 'audio';
  } catch (e) { return false; }
}

function hasAudioStream(filepath) {
  try {
    var r = spawnSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_type',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filepath
    ], { stdio: 'pipe' });
    return r.stdout.toString().trim() === 'audio';
  } catch (e) { return false; }
}

function createGradientVideo(outputPath, duration) {
  console.log('  creating gradient background...');
  tryRun(
    'ffmpeg -f lavfi ' +
    '-i "color=c=#0d0d1a:size=' + SHORTS_W + 'x' + SHORTS_H + ':duration=' + duration + ':rate=' + SHORTS_FPS + '" ' +
    '-c:v libx264 -pix_fmt yuv420p ' +
    '"' + outputPath + '" -y'
  );
}

function formatToShorts(inputVideo, outputVideo, duration) {
  console.log('  formatting to ' + SHORTS_W + 'x' + SHORTS_H + '...');
  var ok = tryRun(
    'ffmpeg -i "' + inputVideo + '" ' +
    '-vf "scale=' + SHORTS_W + ':-2:force_original_aspect_ratio=decrease,' +
    'pad=' + SHORTS_W + ':' + SHORTS_H + ':(ow-iw)/2:80:color=#0d0d1a" ' +
    '-c:v libx264 -c:a aac ' +
    '-r ' + SHORTS_FPS + ' -t ' + duration + ' ' +
    '"' + outputVideo + '" -y',
    180
  );
  if (!ok) {
    tryRun(
      'ffmpeg -i "' + inputVideo + '" ' +
      '-vf "pad=' + SHORTS_W + ':' + SHORTS_H + ':(ow-iw)/2:(oh-ih)/2:black" ' +
      '-c:v libx264 -c:a aac -t ' + duration + ' ' +
      '"' + outputVideo + '" -y',
      120
    );
  }
}

function addVoiceover(videoPath, audioPath, outputPath, duration) {
  console.log('  mixing voiceover...');
  var musicPath = 'output/background_music.mp3';
  var hasMusic = isValidAudio(musicPath);

  if (hasMusic) {
    tryRun(
      'ffmpeg -i "' + videoPath + '" ' +
      '-i "' + audioPath + '" ' +
      '-i "' + musicPath + '" ' +
      '-filter_complex "[1:a]volume=1.0[voice];[2:a]volume=0.06,apad[music];[voice][music]amix=inputs=2:duration=first[audio]" ' +
      '-map 0:v -map "[audio]" ' +
      '-c:v copy -c:a aac -b:a 128k ' +
      '-shortest -t ' + duration + ' ' +
      '"' + outputPath + '" -y',
      120
    );
  } else {
    tryRun(
      'ffmpeg -i "' + videoPath + '" ' +
      '-i "' + audioPath + '" ' +
      '-map 0:v -map 1:a ' +
      '-c:v copy -c:a aac -b:a 128k ' +
      '-shortest -t ' + duration + ' ' +
      '"' + outputPath + '" -y',
      120
    );
  }
}

function addCaptions(videoPath, scriptText, outputPath, duration) {
  console.log('  adding captions...');

  if (!scriptText || !scriptText.trim()) {
    fs.copyFileSync(videoPath, outputPath);
    return;
  }

  var words = scriptText.trim().split(/\s+/);
  var chunkSize = 4;
  var chunks = [];
  var i;
  for (i = 0; i < words.length; i += chunkSize) {
    var chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk) chunks.push(chunk);
  }

  if (chunks.length === 0) {
    fs.copyFileSync(videoPath, outputPath);
    return;
  }

  var timePerChunk = duration / chunks.length;
  var filters = [];

  for (i = 0; i < chunks.length; i++) {
    var t0 = (i * timePerChunk).toFixed(2);
    var t1 = ((i + 1) * timePerChunk).toFixed(2);
    var safe = chunks[i]
      .replace(/'/g, ' ')
      .replace(/"/g, ' ')
      .replace(/:/g, ' ')
      .replace(/\\/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')')
      .replace(/,/g, ' ')
      .substring(0, 40);

    filters.push(
      'drawtext=text=\'' + safe + '\':' +
      'fontcolor=white:fontsize=58:font=Arial:' +
      'box=1:boxcolor=black@0.55:boxborderw=14:' +
      'x=(w-text_w)/2:y=h-250:' +
      'enable=\'between(t,' + t0 + ',' + t1 + ')\''
    );
  }

  var filterStr = filters.join(',');
  var ok = tryRun(
    'ffmpeg -i "' + videoPath + '" ' +
    '-vf "' + filterStr + '" ' +
    '-c:v libx264 -c:a copy ' +
    '"' + outputPath + '" -y',
    180
  );

  if (!ok || !fs.existsSync(outputPath)) {
    console.log('  captions failed — using without captions');
    fs.copyFileSync(videoPath, outputPath);
  }
}

function addTitleCard(videoPath, title, outputPath) {
  console.log('  adding title card...');
  if (!title) {
    fs.copyFileSync(videoPath, outputPath);
    return;
  }

  var safe = title
    .replace(/'/g, ' ')
    .replace(/"/g, ' ')
    .replace(/:/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/#/g, '')
    .substring(0, 45);

  var ok = tryRun(
    'ffmpeg -i "' + videoPath + '" ' +
    '-vf "drawtext=text=\'' + safe + '\':' +
    'fontcolor=white:fontsize=36:font=Arial:' +
    'box=1:boxcolor=black@0.6:boxborderw=10:' +
    'x=(w-text_w)/2:y=60:' +
    'enable=\'lt(t,3)\'" ' +
    '-c:v libx264 -c:a copy ' +
    '"' + outputPath + '" -y',
    120
  );

  if (!ok || !fs.existsSync(outputPath)) {
    fs.copyFileSync(videoPath, outputPath);
  }
}

function cleanup(files) {
  files.forEach(function(f) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {}
  });
}

async function main() {
  console.log('Assembling YouTube Short...');

  if (!fs.existsSync('output')) fs.mkdirSync('output');

  var scriptText = '';
  var title = '';

  try {
    var s = JSON.parse(fs.readFileSync('output/script.json', 'utf8'));
    scriptText = (s.sections && s.sections.VOICEOVER) ? s.sections.VOICEOVER : (s.raw || '');
    console.log('Script preview: ' + scriptText.substring(0, 60));
  } catch (e) { console.log('No script.json found'); }

  try {
    var m = JSON.parse(fs.readFileSync('output/metadata.json', 'utf8'));
    title = m.title || '';
    console.log('Title: ' + title);
  } catch (e) { console.log('No metadata.json found'); }

  var voiceoverPath = 'output/voiceover.mp3';
  if (!isValidAudio(voiceoverPath)) {
    throw new Error('voiceover.mp3 missing or invalid!');
  }
  var duration = getDuration(voiceoverPath);
  console.log('Duration: ' + duration.toFixed(1) + 's');

  // Find best base video
  console.log('Finding base video...');
  var baseVideo = null;

  var candidates = [
    'output/final_video.mp4',
    'output/wav2lip_raw.mp4',
    'output/face_source.mp4',
    'avatar_base.mp4'
  ];

  var j;
  for (j = 0; j < candidates.length; j++) {
    if (isValidVideo(candidates[j])) {
      var size = fs.statSync(candidates[j]).size;
      console.log('  found: ' + candidates[j] + ' (' + (size/1024/1024).toFixed(1) + 'MB)');
      if (candidates[j] === 'output/final_video.mp4' && size > 500000) {
        baseVideo = candidates[j];
        break;
      } else if (candidates[j] !== 'output/final_video.mp4') {
        baseVideo = candidates[j];
        break;
      }
    }
  }

  if (!baseVideo) {
    console.log('No avatar video found — using gradient fallback');
    var gradPath = 'output/gradient_bg.mp4';
    createGradientVideo(gradPath, duration);
    baseVideo = gradPath;
  }

  console.log('Using base video: ' + baseVideo);

  // Format to Shorts
  var shortsFormatted = 'output/shorts_formatted.mp4';
  var alreadyFormatted = (baseVideo === 'output/final_video.mp4');

  if (alreadyFormatted) {
    console.log('Avatar already formatted — copying');
    fs.copyFileSync(baseVideo, shortsFormatted);
  } else {
    formatToShorts(baseVideo, shortsFormatted, duration);
  }

  if (!fs.existsSync(shortsFormatted)) {
    throw new Error('Shorts formatting failed!');
  }

  // Add voiceover
  var withAudio = 'output/shorts_audio.mp4';
  var baseAlreadyHasAudio = hasAudioStream(shortsFormatted);

  if (baseAlreadyHasAudio && alreadyFormatted) {
    console.log('Avatar already has audio — skipping voiceover mix');
    fs.copyFileSync(shortsFormatted, withAudio);
  } else {
    addVoiceover(shortsFormatted, voiceoverPath, withAudio, duration);
    if (!fs.existsSync(withAudio)) {
      fs.copyFileSync(shortsFormatted, withAudio);
    }
  }

  // Add captions
  var withCaptions = 'output/shorts_captions.mp4';
  addCaptions(withAudio, scriptText, withCaptions, duration);
  var captionSrc = fs.existsSync(withCaptions) ? withCaptions : withAudio;

  // Add title card
  var withTitle = 'output/shorts_titled.mp4';
  addTitleCard(captionSrc, title, withTitle);
  var finalSrc = fs.existsSync(withTitle) ? withTitle : captionSrc;

  // Copy to final output
  fs.copyFileSync(finalSrc, 'output/final_video.mp4');

  // Cleanup
  cleanup([
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
    'output/avatar_raw.mp4'
  ]);

  var finalPath = 'output/final_video.mp4';
  if (!fs.existsSync(finalPath)) throw new Error('Final video missing!');

  var sizeMB = (fs.statSync(finalPath).size / 1024 / 1024).toFixed(1);
  console.log('');
  console.log('YouTube Short READY!');
  console.log('File: ' + finalPath);
  console.log('Size: ' + sizeMB + 'MB');
  console.log('Duration: ' + duration.toFixed(0) + 's');
  console.log('Format: ' + SHORTS_W + 'x' + SHORTS_H + ' vertical');
  console.log('Base: ' + baseVideo);
}

main().catch(function(err) {
  console.error('Video assembly failed: ' + err.message);
  process.exit(1);
});
