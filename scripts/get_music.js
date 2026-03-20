// scripts/get_music.js
// Background music — Pixabay free API
// Never crashes pipeline — music is optional

const fs = require('fs');
const https = require('https');
const { spawnSync } = require('child_process');

function download(url, dest) {
  return new Promise((resolve) => {
    const file = require('fs').createWriteStream(dest);
    const proto = url.startsWith('https') ? https : require('http');
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return download(res.headers.location, dest).then(resolve);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
      file.on('error', () => { resolve(false); });
    }).on('error', () => { resolve(false); });
  });
}

function isValidAudio(filepath) {
  if (!fs.existsSync(filepath)) return false;
  if (fs.statSync(filepath).size < 10000) return false;
  try {
    const r = spawnSync('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_type',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filepath
    ], { stdio: 'pipe' });
    return r.stdout.toString().trim() === 'audio';
  } catch { return false; }
}

function createSilent(filepath) {
  try {
    spawnSync('bash', ['-c',
      `ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 120 "${filepath}" -y`
    ], { stdio: 'pipe' });
    console.log('  🔇 Silent background track created');
  } catch {}
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const output = 'output/background_music.mp3';
  if (!fs.existsSync('output')) fs.mkdirSync('output');

  // Already exists and valid
  if (isValidAudio(output)) {
    console.log('🎵 Music already exists — skipping');
    return;
  }

  const apiKey = process.env.PIXABAY_API_KEY;

  if (apiKey) {
    try {
      console.log('🎵 Fetching from Pixabay...');
      const url = `https://pixabay.com/api/?key=${apiKey}&media_type=music&category=background&per_page=10&order=popular`;
      const data = JSON.parse(await httpsGet(url));

      if (data.hits?.length > 0) {
        // Pick random from top 5
        const track = data.hits[Math.floor(Math.random() * Math.min(5, data.hits.length))];
        const audioUrl = track.audio;

        if (audioUrl) {
          console.log(`  🎶 Downloading: "${track.tags?.substring(0, 40)}"`);
          await download(audioUrl, output);

          if (isValidAudio(output)) {
            console.log(`✅ Music ready (${(fs.statSync(output).size/1024).toFixed(0)}KB)`);
            return;
          }
        }
      }
    } catch (e) {
      console.log(`  ⚠️ Pixabay failed: ${e.message}`);
    }
  } else {
    console.log('⚠️ No PIXABAY_API_KEY — skipping music');
  }

  // Silent fallback — never crash
  createSilent(output);
}

// Never crash the pipeline — music is optional
main().catch(err => {
  console.log(`⚠️ Music step error: ${err.message} — continuing without music`);
});
