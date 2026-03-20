// scripts/download_images.js
// Downloads images using curl (most reliable on GitHub Actions)
// Primary: Pollinations.ai — FREE, no key
// Fallback: Pure FFmpeg generated images — 100% reliable

const fs = require('fs');
const { execSync, spawnSync } = require('child_process');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createColorImage(filepath, index) {
  // Generate beautiful gradient background images using FFmpeg
  // These always work — no network needed
  const gradients = [
    'ffmpeg -f lavfi -i "gradients=s=1920x1080:c0=0x1a1a2e:c1=0x16213e:x0=0:y0=0:x1=1920:y1=1080" -vframes 1',
    'ffmpeg -f lavfi -i "gradients=s=1920x1080:c0=0x0f3460:c1=0x533483:x0=0:y0=1080:x1=1920:y1=0" -vframes 1',
    'ffmpeg -f lavfi -i "gradients=s=1920x1080:c0=0x1b4332:c1=0x2d6a4f:x0=0:y0=0:x1=1920:y1=1080" -vframes 1',
    'ffmpeg -f lavfi -i "gradients=s=1920x1080:c0=0x2b2d42:c1=0x8d99ae:x0=1920:y0=0:x1=0:y1=1080" -vframes 1',
    'ffmpeg -f lavfi -i "gradients=s=1920x1080:c0=0x370617:c1=0x6a040f:x0=0:y0=0:x1=1920:y1=1080" -vframes 1',
    'ffmpeg -f lavfi -i "gradients=s=1920x1080:c0=0x03071e:c1=0x023e8a:x0=0:y0=1080:x1=1920:y1=0" -vframes 1',
    'ffmpeg -f lavfi -i "gradients=s=1920x1080:c0=0x10002b:c1=0x240046:x0=0:y0=0:x1=1920:y1=1080" -vframes 1',
  ];

  const cmd = gradients[index % gradients.length];

  // Try gradient first
  try {
    execSync(`${cmd} "${filepath}" -y`, { stdio: 'pipe' });
    if (fs.existsSync(filepath) && fs.statSync(filepath).size > 1000) {
      return true;
    }
  } catch {}

  // Fallback to solid color
  const colors = ['1a1a2e', '0f3460', '1b4332', '2b2d42', '370617', '03071e', '10002b'];
  const color = colors[index % colors.length];
  try {
    execSync(
      `ffmpeg -f lavfi -i "color=c=#${color}:size=1920x1080:duration=1" -vframes 1 "${filepath}" -y`,
      { stdio: 'pipe' }
    );
    return fs.existsSync(filepath) && fs.statSync(filepath).size > 1000;
  } catch {
    return false;
  }
}

function downloadWithCurl(url, filepath) {
  // curl is the most reliable downloader on GitHub Actions
  const result = spawnSync('curl', [
    '--location',           // follow redirects
    '--silent',
    '--show-error',
    '--max-time', '25',     // 25 second timeout
    '--retry', '2',
    '--retry-delay', '3',
    '--output', filepath,
    '--user-agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    url
  ], { timeout: 35000 });

  if (result.status !== 0) {
    return false;
  }

  // Verify it's a real image
  if (!fs.existsSync(filepath)) return false;
  const size = fs.statSync(filepath).size;
  if (size < 5000) return false;

  // Check magic bytes
  const buf = Buffer.alloc(4);
  const fd = fs.openSync(filepath, 'r');
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);

  const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  const isPng  = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;

  return isJpeg || isPng;
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
    scenes.push({ name: 'scene_hook', prompt: `${topic} concept overview` });
  }
  let i = 1;
  while (sections[`SCENE_${i}`]) {
    scenes.push({
      name: `scene_${i}`,
      prompt: sections[`SCENE_${i}`].substring(0, 80) + ' ' + topic
    });
    i++;
  }
  scenes.push({ name: 'scene_cta', prompt: `${topic} success results achievement` });

  console.log(`🖼️ Getting ${scenes.length} scene images...\n`);

  const imagePaths = [];
  let pollSuccess = 0;
  let fallbackCount = 0;

  for (let idx = 0; idx < scenes.length; idx++) {
    const scene = scenes[idx];
    const filepath = `output/images/${scene.name}.jpg`;

    console.log(`  📥 Scene ${idx + 1}/${scenes.length}: ${scene.name}`);

    // Build Pollinations URL
    const cleanPrompt = scene.prompt
      .replace(/[^a-zA-Z0-9\s,.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 150);

    const fullPrompt = encodeURIComponent(
      cleanPrompt + ', cinematic, 4K, professional photography, vibrant colors'
    );
    const url = `https://image.pollinations.ai/prompt/${fullPrompt}?width=1920&height=1080&seed=${idx * 17 + 42}&nologo=true&model=flux`;

    // Try Pollinations with curl
    let success = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt > 1) {
        console.log(`    🔄 Retry ${attempt}...`);
        await sleep(4000);
      }

      success = downloadWithCurl(url, filepath);
      if (success) {
        const kb = (fs.statSync(filepath).size / 1024).toFixed(0);
        console.log(`    ✅ Downloaded from Pollinations (${kb}KB)`);
        pollSuccess++;
        break;
      } else {
        console.log(`    ⚠️ Pollinations failed (attempt ${attempt})`);
        try { fs.unlinkSync(filepath); } catch {}
      }
    }

    // Fallback: generate with FFmpeg
    if (!success) {
      console.log(`    🎨 Using FFmpeg gradient image`);
      createColorImage(filepath, idx);
      fallbackCount++;
    }

    imagePaths.push(filepath);

    // Wait between requests
    if (idx < scenes.length - 1) await sleep(2000);
  }

  fs.writeFileSync(
    'output/images/manifest.json',
    JSON.stringify({ scenes, imagePaths }, null, 2)
  );

  console.log(`\n✅ Done: ${pollSuccess} from Pollinations, ${fallbackCount} FFmpeg gradients`);
  console.log(`📁 Total: ${imagePaths.length} images ready for video assembly`);
}

main().catch(err => {
  console.error('❌ Image download failed:', err.message);
  process.exit(1);
});
