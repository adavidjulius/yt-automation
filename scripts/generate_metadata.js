// scripts/generate_metadata.js
// Groq API — YouTube Shorts metadata with #Shorts tag

const fs = require('fs');
const https = require('https');

async function callGroq(prompt) {
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 700,
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: 'You are a YouTube SEO expert specializing in Shorts. Respond ONLY with valid raw JSON — no markdown, no backticks, no explanation.'
      },
      { role: 'user', content: prompt }
    ]
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
          if (!json.choices?.[0]) throw new Error('No choices: ' + data);
          resolve(json.choices[0].message.content);
        } catch (e) {
          reject(new Error('Groq error: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch {}
  const stripped = text.replace(/```json|```/gi, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

function buildFallback(topic) {
  return {
    title: `${topic} #Shorts`,
    description: `#Shorts #Short\n\n${topic} — Watch till the end!\n\nLike and follow for daily AI tips! 🔥\n\n#AI #${topic.replace(/\s+/g, '')} #YouTube #Viral`,
    tags: [topic, 'shorts', 'AI', 'viral', 'tutorial', '2026', 'free', 'tips'],
    category: '22',
    thumbnail_prompt: `YouTube Shorts thumbnail for "${topic}", bold text, vibrant colors, dark background`
  };
}

async function main() {
  if (!fs.existsSync('output/script.json')) throw new Error('script.json not found');

  const { topic, raw } = JSON.parse(fs.readFileSync('output/script.json', 'utf8'));
  console.log(`📝 Generating Shorts metadata for: "${topic}"`);

  const prompt = `Generate YouTube Shorts metadata for a video about "${topic}".

Script:
${(raw || '').substring(0, 1000)}

Return ONLY raw JSON — no markdown, no backticks:
{
  "title": "Catchy Shorts title under 60 chars — add #Shorts at end",
  "description": "Start with #Shorts #Short on first line, then 2-3 line description, then relevant hashtags",
  "tags": ["shorts", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],
  "category": "22",
  "thumbnail_prompt": "Detailed image prompt for thumbnail"
}`;

  let metadata = null;
  try {
    const response = await callGroq(prompt);
    metadata = extractJSON(response);
    if (!metadata) {
      console.log('⚠️ Could not parse JSON — using fallback');
      metadata = buildFallback(topic);
    }
  } catch (err) {
    console.log(`⚠️ Groq failed: ${err.message} — using fallback`);
    metadata = buildFallback(topic);
  }

  // Validate + sanitize
  if (!metadata.title) metadata.title = buildFallback(topic).title;
  if (!metadata.description) metadata.description = buildFallback(topic).description;
  if (!Array.isArray(metadata.tags)) metadata.tags = buildFallback(topic).tags;
  if (!metadata.category) metadata.category = '22';

  // Force #Shorts in title and description
  if (!metadata.title.includes('#Shorts')) metadata.title += ' #Shorts';
  if (!metadata.description.includes('#Shorts')) {
    metadata.description = '#Shorts #Short\n\n' + metadata.description;
  }

  // Enforce YouTube limits
  metadata.title = metadata.title.substring(0, 100);
  metadata.description = metadata.description.substring(0, 5000);
  metadata.tags = metadata.tags.slice(0, 15).map(t => String(t).substring(0, 30));

  fs.writeFileSync('output/metadata.json', JSON.stringify(metadata, null, 2));
  console.log('✅ Metadata saved');
  console.log('📌 Title:', metadata.title);
  console.log('🏷️ Tags:', metadata.tags.slice(0, 5).join(', '));
}

main().catch(err => {
  console.error('❌ Metadata failed:', err.message);
  process.exit(1);
});    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
          if (!json.choices || !json.choices[0]) throw new Error('No choices in response: ' + data);
          resolve(json.choices[0].message.content);
        } catch (e) {
          reject(new Error('Groq API error: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function buildFallbackMetadata(topic) {
  const cleanTopic = topic.replace(/\s+/g, '');
  return {
    title: `${topic} | Complete Guide ${new Date().getFullYear()}`,
    description: `In this video, we cover everything you need to know about ${topic}.\n\n` +
      `Whether you're a beginner or advanced, this guide will help you understand ${topic} step by step.\n\n` +
      `📌 Timestamps:\n0:00 - Introduction\n0:15 - Main Points\n1:00 - Summary\n\n` +
      `👍 Like this video if it helped!\n🔔 Subscribe for daily AI & tech tips!\n💬 Comment your questions below!\n\n` +
      `#${cleanTopic} #AI #YouTube #Tutorial #${new Date().getFullYear()}`,
    tags: [
      topic,
      `${topic} tutorial`,
      `${topic} guide`,
      'AI tools',
      'free AI',
      'YouTube automation',
      'tutorial',
      'how to',
      `${new Date().getFullYear()}`,
      'beginners guide'
    ],
    category: '22',
    thumbnail_prompt: `Eye-catching YouTube thumbnail for "${topic}", bold text overlay, vibrant neon colors, dark background, professional studio lighting, high contrast, 4K`
  };
}

function extractJSON(text) {
  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch {}

  // Strip markdown code fences
  const stripped = text.replace(/```json|```/gi, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {}

  // Find first { ... } block
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }

  // Give up — return null
  return null;
}

async function main() {
  // Read script data
  if (!fs.existsSync('output/script.json')) {
    throw new Error('output/script.json not found — run generate_script.js first');
  }

  const scriptData = JSON.parse(fs.readFileSync('output/script.json', 'utf8'));
  const { topic, raw } = scriptData;

  console.log(`📝 Generating YouTube metadata for: "${topic}"`);

  const prompt = `Generate YouTube metadata for a video about "${topic}".

Here is the video script:
${raw.substring(0, 1500)}

Return ONLY a valid raw JSON object — no markdown, no backticks, no explanation.
Use exactly this structure:
{
  "title": "Engaging YouTube title under 70 characters — make it curiosity-driven and clickable",
  "description": "SEO-optimized description between 150-200 words. Include a hook sentence, 3-4 key points covered in the video, timestamps placeholder, call to subscribe, and 3-5 relevant hashtags at the end.",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"],
  "category": "22",
  "thumbnail_prompt": "Detailed image generation prompt for a YouTube thumbnail — describe colors, mood, subject, text overlay ideas"
}`;

  let metadata = null;

  try {
    const response = await callGroq(prompt);
    console.log('🔍 Raw Groq response received, parsing...');
    metadata = extractJSON(response);

    if (!metadata) {
      console.log('⚠️ Could not parse JSON from Groq response — using fallback');
      metadata = buildFallbackMetadata(topic);
    }
  } catch (err) {
    console.log(`⚠️ Groq call failed: ${err.message} — using fallback metadata`);
    metadata = buildFallbackMetadata(topic);
  }

  // Validate and sanitize all fields
  if (!metadata.title || typeof metadata.title !== 'string') {
    metadata.title = buildFallbackMetadata(topic).title;
  }
  if (!metadata.description || typeof metadata.description !== 'string') {
    metadata.description = buildFallbackMetadata(topic).description;
  }
  if (!Array.isArray(metadata.tags) || metadata.tags.length === 0) {
    metadata.tags = buildFallbackMetadata(topic).tags;
  }
  if (!metadata.category) metadata.category = '22';
  if (!metadata.thumbnail_prompt) {
    metadata.thumbnail_prompt = buildFallbackMetadata(topic).thumbnail_prompt;
  }

  // Enforce YouTube limits
  metadata.title = metadata.title.substring(0, 100);
  metadata.description = metadata.description.substring(0, 5000);
  metadata.tags = metadata.tags.slice(0, 15).map(t => String(t).substring(0, 30));

  // Save
  fs.writeFileSync('output/metadata.json', JSON.stringify(metadata, null, 2));

  console.log('✅ Metadata saved to output/metadata.json');
  console.log('📌 Title:', metadata.title);
  console.log('🏷️ Tags:', metadata.tags.slice(0, 5).join(', ') + '...');
}

main().catch(err => {
  console.error('❌ Metadata generation failed:', err.message);
  process.exit(1);
});
