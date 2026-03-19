// scripts/download_images.js
// Downloads scene images from Pollinations.ai — FREE, no API key, no limits

const fs = require('fs');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Validate downloaded file is actually a real image
function isValidImage(filepath) {
  try {
    const stats = fs.statSync(filepath);
    if (stats.size < 5000) return false; // Less than 5KB = definitely not a real image

    const buffer = Buffer.alloc(4);
    const fd = fs.openSync(filepath, 'r');
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);

    // Check JPEG magic bytes: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
    // Check PNG magic bytes: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;

    return false;
  } catch {
    return false;
  }
}

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);

    const request = proto.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; bot/1.0)',
        'Accept': 'image/jpeg,image/png,image/*'
      },
      timeout: 30000
    }, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        file.close();
        fs.unlinkSync(filepath);
        return downloadFile(res.headers.location, filepath).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(filepath);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    });

    request.on('error', (err) => {
      file.close();
      try { fs.unlinkSync(filepath); } catch {}
      reject(err);
    });

    request.on('timeout', () => {
      request.destroy();
      file.close();
      try { fs.unlinkSync(filepath); } catch {}
      reject(new Error('Download timeout'));
    });
  });
}

// Create a solid color fallback image using FFmpeg if download fails
function createFallbackImage(filepath, index) {
  const colors = ['#1a1a2e', '#16213e', '#0f3460', '#533483', '#2b2d42', '#8d99ae', '#2d6a4f', '#1b4332'];
  const color = colors[index % colors.length].replace('#', '');
  try {
    execSync(
      `ffmpeg -f lavfi -i "color=c=${color}:size=1920x1080:duration=1" -vframes 1 "${filepath}" -y`,
      { stdio: 'pipe' }
    );
    console.log(`    🎨 Created fallback color image for scene ${index + 1}`);
    return true;
  } catch {
    return false;
  }
}

async function downloadWithRetry(url, filepath, index, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`    🔄 Attempt ${attempt}/${maxRetries}...`);
      await downloadFile(url, filepath);

      if (isValidImage(filepath)) {
        return true;
      } else {
        console.log(`    ⚠️ Downloaded file is not a valid image (attempt ${attempt})`);
        try { fs.unlinkSync(filepath); } catch {}
      }
    } catch (err) {
      console.log(`    ⚠️ Download error: ${err.message}`);
      try { fs.unlinkSync(filepath); } catch {}
    }

    if (attempt < maxRetries) {
      const waitMs = attempt * 3000; // 3s, 6s, 9s
      console.log(`    ⏳ Waiting ${waitMs / 1000}s before retry...`);
      await sleep(waitMs);
    }
  }
  return false;
}

function buildPollinationsURL(prompt, seed) {
  // Clean and encode the prompt
  const cleanPrompt = prompt
    .replace(/[^\w\s,.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200);

  const fullPrompt = `${cleanPrompt}, cinematic photography, professional, vibrant, sharp focus, 4K`;
  const encoded = encodeURIComponent(fullPrompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=1920&height=1080&seed=${seed}&nologo=true&model=flux`;
}

async function main() {
  const scriptData = JSON.parse(fs.readFileSync('output/script.json', 'utf8'));
  const { sections, topic } = scriptData;

  if (!fs.existsSync('output/images')) {
    fs.mkdirSync('output/images', { recursive: true });
  }

  // Build scene list
  const scenes = [];

  if (sections.HOOK) {
    scenes.push({ name: 'scene_hook', prompt: `${topic} introduction concept` });
  }

  let i = 1;
  while (sections[`SCENE_${i}`]) {
    const sceneText = sections[`SCENE_${i}`].substring(0, 100);
    scenes.push({
      name: `scene_${i}`,
      prompt: `${sceneText} ${topic}`
    });
    i++;
  }

  scenes.push({ name: 'scene_cta', prompt: `${topic} success achievement results` });

  console.log(`🖼️ Downloading ${scenes.length} scene images from Pollinations.ai...`);
  console.log('⏳ This may take 1-2 minutes — Pollinations generates images on demand\n');

  const imagePaths = [];
  let successCount = 0;

  for (let idx = 0; idx < scenes.length; idx++) {
    const scene = scenes[idx];
    const filepath = `output/images/${scene.name}.jpg`;

    console.log(`  📥 Scene ${idx + 1}/${scenes.length}: ${scene.name}`);

    const url = buildPollinationsURL(scene.prompt, idx * 13 + 100);
    console.log(`    🌐 URL: ${url.substring(0, 80)}...`);

    // Wait before each request to avoid rate limiting
    if (idx > 0) {
      await sleep(2000);
    }

    const success = await downloadWithRetry(url, filepath, idx);

    if (success) {
      const size = (fs.statSync(filepath).size / 1024).toFixed(0);
      console.log(`    ✅ Downloaded (${size}KB)`);
      imagePaths.push(filepath);
      successCount++;
    } else {
      console.log(`    🎨 Using fallback color image`);
      createFallbackImage(filepath, idx);
      imagePaths.push(filepath);
    }
  }

  // Save manifest
  fs.writeFileSync(
    'output/images/manifest.json',
    JSON.stringify({ scenes, imagePaths }, null, 2)
  );

  console.log(`\n✅ Images ready: ${successCount}/${scenes.length} from Pollinations, rest are fallbacks`);

  if (imagePaths.length === 0) {
    throw new Error('No images available at all!');
  }
}

main().catch(err => {
  console.error('❌ Image download failed:', err.message);
  process.exit(1);
});
