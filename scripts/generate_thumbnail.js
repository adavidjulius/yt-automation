// scripts/generate_thumbnail.js
// Generates a YouTube thumbnail using Pollinations.ai (FREE, no key)
// Then adds title text using FFmpeg

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const metadata = JSON.parse(fs.readFileSync('output/metadata.json', 'utf8'));
  const { title, thumbnail_prompt } = metadata;

  console.log('🖼️ Generating thumbnail...');

  // Build thumbnail prompt
  const prompt = encodeURIComponent(
    (thumbnail_prompt || title) +
    ', YouTube thumbnail, bold text background, high contrast, vibrant colors, professional, dramatic lighting, 4K'
  );

  const thumbnailUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1280&height=720&nologo=true&enhance=true&seed=999`;
  const rawThumb = 'output/thumbnail_raw.jpg';
  const finalThumb = 'output/thumbnail.jpg';

  // Download raw thumbnail
  await download(thumbnailUrl, rawThumb);
  await sleep(1000);

  // Add title text overlay with FFmpeg
  const safeTitle = title.replace(/'/g, "\\'").substring(0, 50);
  
  execSync(`ffmpeg -i "${rawThumb}" \
    -vf "scale=1280:720, \
    drawtext=text='${safeTitle}':fontcolor=white:fontsize=52:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:box=1:boxcolor=black@0.7:boxborderw=15:x=(w-text_w)/2:y=h-h/4, \
    drawtext=text='▶  WATCH NOW':fontcolor=yellow:fontsize=30:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:box=1:boxcolor=black@0.5:boxborderw=8:x=(w-text_w)/2:y=h-h/8" \
    "${finalThumb}" -y`);

  console.log('✅ Thumbnail created: output/thumbnail.jpg (1280x720)');
}

main().catch(err => {
  console.error('❌ Thumbnail generation failed:', err.message);
  // Copy first scene image as fallback thumbnail
  try {
    const manifest = JSON.parse(fs.readFileSync('output/images/manifest.json', 'utf8'));
    const first = manifest.imagePaths.find(p => p && fs.existsSync(p));
    if (first) {
      const { execSync } = require('child_process');
      execSync(`ffmpeg -i "${first}" -vf scale=1280:720 output/thumbnail.jpg -y`);
      console.log('⚠️ Using fallback thumbnail from first scene');
    }
  } catch {}
});
