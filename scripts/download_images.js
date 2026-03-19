// scripts/download_images.js
// Downloads scene images from Pollinations.ai — FREE, no API key, no limits

const fs = require('fs');
const https = require('https');
const path = require('path');

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      // Follow redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        return downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

function buildPollinationsURL(prompt, seed = 42) {
  const encoded = encodeURIComponent(
    prompt + ', cinematic, 4K, professional photography, vibrant colors, sharp focus'
  );
  return `https://image.pollinations.ai/prompt/${encoded}?width=1920&height=1080&seed=${seed}&nologo=true&enhance=true`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const scriptData = JSON.parse(fs.readFileSync('output/script.json', 'utf8'));
  const { sections, topic } = scriptData;

  // Create images directory
  if (!fs.existsSync('output/images')) fs.mkdirSync('output/images', { recursive: true });

  // Build scene prompts from script sections
  const scenes = [];
  
  // Add hook scene
  if (sections.HOOK) {
    scenes.push({ name: 'scene_hook', prompt: `${topic}: ${sections.HOOK}` });
  }

  // Add each numbered scene
  let i = 1;
  while (sections[`SCENE_${i}`]) {
    scenes.push({ 
      name: `scene_${i}`, 
      prompt: `${sections[`SCENE_${i}`]} related to ${topic}` 
    });
    i++;
  }

  // Add CTA scene
  if (sections.CTA) {
    scenes.push({ name: 'scene_cta', prompt: `Subscribe button YouTube channel ${topic} community` });
  }

  console.log(`🖼️ Downloading ${scenes.length} scene images from Pollinations.ai (FREE)...`);

  const imagePaths = [];
  for (let idx = 0; idx < scenes.length; idx++) {
    const scene = scenes[idx];
    const filepath = `output/images/${scene.name}.jpg`;
    const url = buildPollinationsURL(scene.prompt, idx * 7 + 42);

    try {
      console.log(`  📥 Scene ${idx + 1}/${scenes.length}: ${scene.name}`);
      await downloadImage(url, filepath);
      imagePaths.push(filepath);
      await sleep(1500); // Be nice to the free API
    } catch (err) {
      console.error(`  ⚠️ Failed scene ${scene.name}: ${err.message}`);
      // Use a fallback colored image via FFmpeg
      imagePaths.push(null);
    }
  }

  // Save the image manifest
  fs.writeFileSync('output/images/manifest.json', JSON.stringify({ scenes, imagePaths }, null, 2));
  console.log(`✅ Downloaded ${imagePaths.filter(Boolean).length}/${scenes.length} images`);
}

main().catch(err => {
  console.error('❌ Image download failed:', err.message);
  process.exit(1);
});
