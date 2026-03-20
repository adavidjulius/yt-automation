// scripts/download_images.js
// Uses Google Gemini Imagen 4 — best free AI image generation
// 500 images/day free, no visible watermark, commercial use allowed

const fs = require('fs');
const https = require('https');
const { execSync, spawnSync } = require('child_process');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createGradientFallback(filepath, index) {
  const colors = ['1a1a2e','0f3460','1b4332','2b2d42','370617','03071e','10002b'];
  const color = colors[index % colors.length];
  try {
    execSync(
      `ffmpeg -f lavfi -i "color=c=#${color}:size=1920x1080:duration=1" -vframes 1 "${filepath}" -y`,
      { stdio: 'pipe' }
    );
    return fs.existsSync(filepath);
  } catch { return false; }
}

function downloadWithCurl(url, filepath, headers = []) {
  const args = [
    '--location', '--silent', '--show-error',
    '--max-time', '30', '--retry', '2',
    '--output', filepath,
    '--user-agent', 'Mozilla/5.0'
  ];
  headers.forEach(h => args.push('--header', h));
  args.push(url);

  const result = spawnSync('curl', args, { timeout: 40000 });
  if (result.status !== 0 || !fs.existsSync(filepath)) return false;
  if (fs.statSync(filepath).size < 5000) {
    try { fs.unlinkSync(filepath); } catch {}
    return false;
  }
  // Check magic bytes
  const buf = Buffer.alloc(4);
  const fd = fs.openSync(filepath, 'r');
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  const valid = (buf[0]===0xFF && buf[1]===0xD8) || (buf[0]===0x89 && buf[1]===0x50);
  if (!valid) { try { fs.unlinkSync(filepath); } catch {} return false; }
  return true;
}

async function generateWithGemini(prompt, filepath, apiKey) {
  if (!apiKey) return false;

  console.log(`    🤖 Gemini Imagen 4 generating...`);

  const body = JSON.stringify({
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      responseSchema: {
        type: 'object',
        properties: { image: { type: 'string' } }
      }
    }
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/imagen-4.0-generate-preview-06-06:generateImages?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    // Use Gemini image generation endpoint
    const geminiBody = JSON.stringify({
      prompt: { text: prompt },
      number_of_images: 1,
      aspect_ratio: '16:9',
      safety_filter_level: 'block_some',
      person_generation: 'allow_adult'
    });

    const geminiOptions = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/imagen-4.0-generate-preview-06-06:predict?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(geminiBody)
      }
    };

    const req = https.request(geminiOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            console.log(`    ⚠️ Gemini error: ${json.error.message}`);
            return resolve(false);
          }

          // Extract base64 image
          const predictions = json.predictions || [];
          if (predictions.length === 0) {
            console.log(`    ⚠️ No predictions returned`);
            return resolve(false);
          }

          const b64 = predictions[0].bytesBase64Encoded;
          if (!b64) return resolve(false);

          // Save base64 as JPEG
          const imgBuffer = Buffer.from(b64, 'base64');
          fs.writeFileSync(filepath, imgBuffer);

          const kb = (imgBuffer.length / 1024).toFixed(0);
          console.log(`    ✅ Gemini image saved (${kb}KB)`);
          resolve(true);
        } catch (e) {
          console.log(`    ⚠️ Parse error: ${e.message}`);
          resolve(false);
        }
      });
    });

    req.on('error', (e) => {
      console.log(`    ⚠️ Request error: ${e.message}`);
      resolve(false);
    });

    req.write(geminiBody);
    req.end();
  });
}

async function generateWithGeminiFlash(prompt, filepath, apiKey) {
  // Alternative: Use Gemini 2.0 Flash experimental (also free, image output)
  if (!apiKey) return false;

  console.log(`    🤖 Trying Gemini Flash image generation...`);

  const body = JSON.stringify({
    contents: [{
      parts: [{ text: `Generate a photorealistic, cinematic, 16:9 YouTube video still image for: ${prompt}. Professional photography style, vibrant colors, 4K quality.` }]
    }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE']
    }
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            console.log(`    ⚠️ Flash error: ${json.error.message}`);
            return resolve(false);
          }

          // Find image part in response
          const parts = json.candidates?.[0]?.content?.parts || [];
          const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

          if (!imgPart) {
            console.log(`    ⚠️ No image in Flash response`);
            return resolve(false);
          }

          const imgBuffer = Buffer.from(imgPart.inlineData.data, 'base64');
          fs.writeFileSync(filepath, imgBuffer);

          // Resize to 1920x1080 using FFmpeg
          const resized = filepath.replace('.jpg', '_resized.jpg');
          execSync(`ffmpeg -i "${filepath}" -vf scale=1920:1080 "${resized}" -y`, { stdio: 'pipe' });
          fs.renameSync(resized, filepath);

          const kb = (fs.statSync(filepath).size / 1024).toFixed(0);
          console.log(`    ✅ Gemini Flash image saved (${kb}KB)`);
          resolve(true);
        } catch (e) {
          console.log(`    ⚠️ Flash parse error: ${e.message}`);
          resolve(false);
        }
      });
    });

    req.on('error', (e) => { console.log(`    ⚠️ ${e.message}`); resolve(false); });
    req.write(body);
    req.end();
  });
}

function extractKeywords(sceneText, topic) {
  const stopWords = new Set(['the','a','an','is','are','was','were','be','been',
    'have','has','had','do','does','did','will','would','could','should',
    'this','that','these','those','with','from','for','and','but','or','in','on','at','to','of']);
  const words = (sceneText + ' ' + topic)
    .toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
  return [...new Set(words)].slice(0, 4).join(' ') || topic;
}

async function main() {
  const scriptData = JSON.parse(fs.readFileSync('output/script.json', 'utf8'));
  const { sections, topic } = scriptData;
  const geminiKey = process.env.GEMINI_API_KEY;
  const unsplashKey = process.env.UNSPLASH_API_KEY;

  if (!geminiKey) console.log('⚠️ GEMINI_API_KEY not set — get free key at aistudio.google.com');

  if (!fs.existsSync('output/images')) {
    fs.mkdirSync('output/images', { recursive: true });
  }

  // Build scenes
  const scenes = [];
  if (sections.HOOK) scenes.push({ name: 'scene_hook', text: sections.HOOK });
  let i = 1;
  while (sections[`SCENE_${i}`]) {
    scenes.push({ name: `scene_${i}`, text: sections[`SCENE_${i}`] });
    i++;
  }
  scenes.push({ name: 'scene_cta', text: `subscribe results success ${topic}` });

  console.log(`🖼️ Generating ${scenes.length} AI images with Gemini...\n`);

  const imagePaths = [];
  let geminiCount = 0;
  let unsplashCount = 0;
  let fallbackCount = 0;

  for (let idx = 0; idx < scenes.length; idx++) {
    const scene = scenes[idx];
    const filepath = `output/images/${scene.name}.jpg`;
    const keywords = extractKeywords(scene.text, topic);

    // Build cinematic prompt for better results
    const imagePrompt = `Cinematic YouTube video thumbnail still image about "${keywords}". 
      Professional photography, dramatic lighting, vibrant colors, 16:9 aspect ratio, 
      ultra high definition, photorealistic, no text overlay.`;

    console.log(`  🎨 Scene ${idx + 1}/${scenes.length}: ${scene.name}`);
    console.log(`    📝 "${keywords}"`);

    let success = false;

    // 1. Try Gemini Imagen 4 (best quality — 500/day free)
    if (geminiKey && !success) {
      success = await generateWithGemini(imagePrompt, filepath, geminiKey);
      if (success) geminiCount++;
      await sleep(1000);
    }

    // 2. Try Gemini Flash (also free, good quality)
    if (geminiKey && !success) {
      success = await generateWithGeminiFlash(imagePrompt, filepath, geminiKey);
      if (success) geminiCount++;
      await sleep(1000);
    }

    // 3. Try Unsplash (real photos, free 50/hr)
    if (!success && unsplashKey) {
      const query = encodeURIComponent(keywords);
      const apiUrl = `https://api.unsplash.com/photos/random?query=${query}&orientation=landscape`;
      const metaResult = spawnSync('curl', [
        '--silent', '--max-time', '10',
        '--header', `Authorization: Client-ID ${unsplashKey}`,
        '--header', 'Accept-Version: v1',
        apiUrl
      ], { timeout: 15000 });

      if (metaResult.status === 0) {
        try {
          const data = JSON.parse(metaResult.stdout.toString());
          const imgUrl = data?.urls?.regular;
          if (imgUrl) {
            success = downloadWithCurl(imgUrl, filepath);
            if (success) {
              // Resize to 1920x1080
              execSync(`ffmpeg -i "${filepath}" -vf scale=1920:1080 "${filepath}.tmp.jpg" -y && mv "${filepath}.tmp.jpg" "${filepath}"`, { stdio: 'pipe' });
              console.log(`    ✅ Unsplash photo`);
              unsplashCount++;
            }
          }
        } catch {}
      }
      await sleep(1200);
    }

    // 4. Final fallback: gradient
    if (!success) {
      console.log(`    🎨 Using gradient fallback`);
      createGradientFallback(filepath, idx);
      fallbackCount++;
    }

    imagePaths.push(filepath);
  }

  fs.writeFileSync('output/images/manifest.json',
    JSON.stringify({ scenes, imagePaths }, null, 2));

  console.log(`\n✅ Images complete!`);
  console.log(`   🤖 Gemini AI: ${geminiCount}`);
  console.log(`   📸 Unsplash: ${unsplashCount}`);
  console.log(`   🎨 Gradients: ${fallbackCount}`);
}

main().catch(err => {
  console.error('❌ Image generation failed:', err.message);
  process.exit(1);
});
