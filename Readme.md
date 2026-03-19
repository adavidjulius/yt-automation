# 🎬 YouTube Auto-Poster — 100% Free GitHub Actions Bot

Automatically generates and uploads YouTube videos every day using:
- **Grok API** (xAI) — AI script + metadata writer
- **gTTS / edge-tts** — Free voiceover (no API key)
- **Pollinations.ai** — Free AI images (no API key)
- **FFmpeg** — Free video assembly (no watermark)
- **YouTube Data API v3** — Free upload
- **GitHub Actions** — Free scheduler (2,000 min/month)

---

## 📦 Setup Guide

### Step 1 — Fork This Repo
Click **Fork** on GitHub → name it `youtube-auto-poster`

---

### Step 2 — Get Your API Keys

#### 🤖 Grok API Key (xAI)
1. Go to [console.x.ai](https://console.x.ai)
2. Sign up → get **$25 free credits**
3. Go to **Settings → Data Sharing → Enable** → get **+$150/month free**
4. Click **API Keys → Create Key**
5. Copy the key

#### 📺 YouTube API (OAuth2)
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project
3. Enable **YouTube Data API v3**
4. Go to **APIs & Services → Credentials → Create OAuth 2.0 Client ID**
5. Type: **Desktop App**
6. Download the JSON — get `client_id` and `client_secret`
7. Run this to get your refresh token:

```bash
# Install google auth tool
pip install google-auth-oauthlib-tool

# Run OAuth flow
google-oauthlib-tool --client-secrets credentials.json \
  --scope https://www.googleapis.com/auth/youtube.upload \
  --save --headless
```

Copy the `refresh_token` from the output.

#### 🎵 Pixabay API Key (Optional — for background music)
1. Go to [pixabay.com/api/docs](https://pixabay.com/api/docs/)
2. Sign up (free) → get your API key instantly

---

### Step 3 — Add GitHub Secrets
Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Where to Get |
|---|---|
| `GROK_API_KEY` | console.x.ai |
| `YOUTUBE_CLIENT_ID` | Google Cloud Console |
| `YOUTUBE_CLIENT_SECRET` | Google Cloud Console |
| `YOUTUBE_REFRESH_TOKEN` | OAuth flow above |
| `PIXABAY_API_KEY` | pixabay.com (optional) |

---

### Step 4 — Customize Your Topics
Edit `topics.txt` — one topic per line. The bot picks a random one daily.

Or trigger manually from **Actions → Run workflow** and type your own topic.

---

### Step 5 — Enable GitHub Actions
Go to **Actions tab** → click **Enable workflows**

The bot runs every day at **9:00 AM UTC** automatically! 🎉

---

## 🗂️ Project Structure

```
youtube-auto-poster/
├── .github/
│   └── workflows/
│       └── youtube-agent.yml    ← Main automation
├── scripts/
│   ├── generate_script.js       ← Grok AI scriptwriter
│   ├── generate_metadata.js     ← Grok AI metadata
│   ├── generate_tts.py          ← Free voiceover (gTTS)
│   ├── download_images.js       ← Pollinations.ai images
│   ├── get_music.js             ← Pixabay background music
│   ├── assemble_video.js        ← FFmpeg video builder
│   ├── generate_thumbnail.js    ← Auto thumbnail
│   └── upload_youtube.js        ← YouTube uploader
├── topics.txt                   ← Your video topics
└── logs/
    └── history.txt              ← Upload history
```

---

## 💰 Cost Breakdown

| Service | Cost |
|---|---|
| GitHub Actions | ✅ Free (2,000 min/month) |
| Grok API | ✅ Free ($25 + $150/mo credits) |
| gTTS / edge-tts | ✅ Free forever |
| Pollinations.ai | ✅ Free forever |
| FFmpeg | ✅ Free forever |
| Pixabay Music | ✅ Free (with free API key) |
| YouTube API | ✅ Free |
| **Total** | **$0/month** |

---

## ⏱️ GitHub Actions Free Tier Math

- Each video generation run ≈ **8–12 minutes**
- Daily runs: 30 × 12 = **360 minutes/month**
- GitHub free tier: **2,000 minutes/month**
- Remaining: **1,640 minutes** to spare ✅

---

## 🔧 Manual Trigger

Go to **Actions → YouTube Auto-Poster → Run workflow**
Type a custom topic and click **Run** — video uploads in ~10 minutes!

---

## ❓ Troubleshooting

**Upload quota exceeded?**
YouTube allows ~6 uploads/day on new channels. Space out your posts.

**Grok API error?**
Check your credits at console.x.ai. Enable data sharing for $150/month free.

**No thumbnail?**
Thumbnail upload requires YouTube channel verification. The video still uploads.
