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
          if (!json.choices || !json.choices[0]) throw new Error('No choices: ' + data);
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
  try { return JSON.parse(text.trim()); } catch (e) {}
  const stripped = text.replace(/```json|```/gi, '').trim();
  try { return JSON.parse(stripped); } catch (e) {}
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (e) {}
  }
  return null;
}

function buildFallback(topic) {
  const clean = (topic || 'AI').replace(/\s+/g, '');
  return {
    title: topic + ' #Shorts',
    description: '#Shorts #Short\n\n' + topic + ' — Watch till the end!\n\nLike and follow for daily AI tips!\n\n#AI #' + clean + ' #YouTube #Viral',
    tags: [topic, 'shorts', 'AI', 'viral', 'tutorial', '2026', 'free', 'tips'],
    category: '22',
    thumbnail_prompt: 'YouTube Shorts thumbnail for "' + topic + '", bold text, vibrant colors, dark background'
  };
}

async function main() {
  if (!fs.existsSync('output/script.json')) {
    throw new Error('script.json not found');
  }

  const scriptData = JSON.parse(fs.readFileSync('output/script.json', 'utf8'));
  const topic = scriptData.topic || 'AI Tools';
  const raw = scriptData.raw || '';

  console.log('📝 Generating Shorts metadata for: "' + topic + '"');

  const prompt = 'Generate YouTube Shorts metadata for a video about "' + topic + '".\n\n' +
    'Script:\n' + raw.substring(0, 1000) + '\n\n' +
    'Return ONLY raw JSON — no markdown, no backticks:\n' +
    '{\n' +
    '  "title": "Catchy Shorts title under 60 chars — add #Shorts at end",\n' +
    '  "description": "Start with #Shorts #Short on first line, then 2-3 line description, then hashtags",\n' +
    '  "tags": ["shorts", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],\n' +
    '  "category": "22",\n' +
    '  "thumbnail_prompt": "Detailed image prompt for thumbnail"\n' +
    '}';

  let metadata = null;

  try {
    const response = await callGroq(prompt);
    metadata = extractJSON(response);
    if (!metadata) {
      console.log('⚠️ Could not parse JSON — using fallback');
      metadata = buildFallback(topic);
    }
  } catch (err) {
    console.log('⚠️ Groq failed: ' + err.message + ' — using fallback');
    metadata = buildFallback(topic);
  }

  // Validate all fields
  if (!metadata.title) metadata.title = buildFallback(topic).title;
  if (!metadata.description) metadata.description = buildFallback(topic).description;
  if (!Array.isArray(metadata.tags)) metadata.tags = buildFallback(topic).tags;
  if (!metadata.category) metadata.category = '22';
  if (!metadata.thumbnail_prompt) metadata.thumbnail_prompt = buildFallback(topic).thumbnail_prompt;

  // Force #Shorts in title and description
  if (!metadata.title.includes('#Shorts')) {
    metadata.title = metadata.title + ' #Shorts';
  }
  if (!metadata.description.includes('#Shorts')) {
    metadata.description = '#Shorts #Short\n\n' + metadata.description;
  }

  // Enforce YouTube limits
  metadata.title = metadata.title.substring(0, 100);
  metadata.description = metadata.description.substring(0, 5000);
  metadata.tags = metadata.tags.slice(0, 15).map(function(t) {
    return String(t).substring(0, 30);
  });

  fs.writeFileSync('output/metadata.json', JSON.stringify(metadata, null, 2));
  console.log('✅ Metadata saved');
  console.log('📌 Title: ' + metadata.title);
  console.log('🏷️ Tags: ' + metadata.tags.slice(0, 5).join(', '));
}

main().catch(function(err) {
  console.error('❌ Metadata failed: ' + err.message);
  process.exit(1);
});
