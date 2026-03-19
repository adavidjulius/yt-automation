// scripts/upload_youtube.js
// Uploads video to YouTube using YouTube Data API v3
// 100% free quota — 10,000 units/day, upload = 1600 units

const fs = require('fs');
const https = require('https');
const path = require('path');

// ─── OAuth2: Get access token from refresh token ─────────────────────────────
async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  }).toString();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.access_token) resolve(parsed.access_token);
        else reject(new Error('Token error: ' + data));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Step 1: Initialize resumable upload ────────────────────────────────────
async function initUpload(accessToken, metadata) {
  const body = JSON.stringify({
    snippet: {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      categoryId: metadata.category || '22',
      defaultLanguage: 'en'
    },
    status: {
      privacyStatus: 'public',      // Change to 'private' to review before publishing
      selfDeclaredMadeForKids: false
    }
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.googleapis.com',
      path: '/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': fs.statSync('output/final_video.mp4').size
      }
    };

    const req = https.request(options, res => {
      const uploadUrl = res.headers.location;
      if (uploadUrl) resolve(uploadUrl);
      else {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => reject(new Error('No upload URL. Response: ' + body)));
      }
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Step 2: Upload video file ────────────────────────────────────────────────
async function uploadVideo(uploadUrl, videoPath) {
  const fileSize = fs.statSync(videoPath).size;
  const fileStream = fs.createReadStream(videoPath);

  return new Promise((resolve, reject) => {
    const urlObj = new URL(uploadUrl);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': fileSize
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          const parsed = JSON.parse(data);
          resolve(parsed.id);
        } else {
          reject(new Error(`Upload failed (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', reject);

    // Stream file with progress
    let uploaded = 0;
    fileStream.on('data', chunk => {
      uploaded += chunk.length;
      const pct = ((uploaded / fileSize) * 100).toFixed(1);
      process.stdout.write(`\r  📤 Uploading: ${pct}% (${(uploaded/1024/1024).toFixed(1)}MB / ${(fileSize/1024/1024).toFixed(1)}MB)`);
    });
    fileStream.on('end', () => console.log(''));
    fileStream.pipe(req);
  });
}

// ─── Step 3: Upload thumbnail ─────────────────────────────────────────────────
async function uploadThumbnail(accessToken, videoId) {
  const thumbPath = 'output/thumbnail.jpg';
  if (!fs.existsSync(thumbPath)) return;

  const thumbData = fs.readFileSync(thumbPath);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.googleapis.com',
      path: `/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'image/jpeg',
        'Content-Length': thumbData.length
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`Thumbnail upload failed: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(thumbData);
    req.end();
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const metadata = JSON.parse(fs.readFileSync('output/metadata.json', 'utf8'));
  const videoPath = 'output/final_video.mp4';

  if (!fs.existsSync(videoPath)) throw new Error('final_video.mp4 not found!');

  const sizeMB = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
  console.log(`📤 Uploading to YouTube: "${metadata.title}" (${sizeMB}MB)`);

  // Get OAuth access token
  console.log('🔑 Getting access token...');
  const accessToken = await getAccessToken();

  // Initialize resumable upload
  console.log('🚀 Initializing upload...');
  const uploadUrl = await initUpload(accessToken, metadata);

  // Upload video
  const videoId = await uploadVideo(uploadUrl, videoPath);
  console.log(`✅ Video uploaded! ID: ${videoId}`);
  console.log(`🎬 YouTube URL: https://www.youtube.com/watch?v=${videoId}`);

  // Upload thumbnail
  try {
    console.log('🖼️ Uploading thumbnail...');
    await uploadThumbnail(accessToken, videoId);
    console.log('✅ Thumbnail uploaded!');
  } catch (e) {
    console.log('⚠️ Thumbnail upload failed:', e.message);
  }

  // Save result
  const result = {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: metadata.title,
    uploadedAt: new Date().toISOString()
  };

  fs.writeFileSync('output/upload_result.json', JSON.stringify(result, null, 2));
  console.log('\n🎉 Done! Video is live on YouTube:', result.url);
}

main().catch(err => {
  console.error('❌ YouTube upload failed:', err.message);
  process.exit(1);
});
