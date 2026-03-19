// scripts/get_music.js
// Downloads free background music from Pixabay API
// Free API key: register at pixabay.com (takes 30 seconds)

const fs = require('fs');
const https = require('https');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const outputPath = 'output/background_music.mp3';

  // If already downloaded, skip
  if (fs.existsSync(outputPath)) {
    console.log('🎵 Music already exists, skipping download');
    return;
  }

  const apiKey = process.env.PIXABAY_API_KEY;

  if (apiKey) {
    try {
      console.log('🎵 Fetching music from Pixabay (free)...');
      const url = `https://pixabay.com/api/?key=${apiKey}&media_type=music&category=background&per_page=10&order=popular`;
      const data = JSON.parse(await httpsGet(url));

      if (data.hits && data.hits.length > 0) {
        // Pick a random track from top results
        const track = data.hits[Math.floor(Math.random() * Math.min(5, data.hits.length))];
        const musicUrl = track.audio || track.userImageURL;

        if (musicUrl) {
          console.log(`  🎶 Downloading: "${track.tags}"`);
          await download(musicUrl, outputPath);
          console.log('✅ Background music downloaded from Pixabay');
          return;
        }
      }
    } catch (e) {
      console.log('⚠️ Pixabay failed, using fallback...');
    }
  }

  // Fallback: Generate a simple silent audio track with FFmpeg
  // (video will still work, just no background music)
  console.log('⚠️ No Pixabay key — generating silent background track');
  const { execSync } = require('child_process');
  execSync(`ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 300 ${outputPath} -y`);
  console.log('✅ Silent background track created (add PIXABAY_API_KEY secret for real music)');
}

main().catch(err => {
  console.error('❌ Music fetch failed:', err.message);
  // Don't exit — music is optional
  const { execSync } = require('child_process');
  execSync(`ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 300 output/background_music.mp3 -y`);
});
