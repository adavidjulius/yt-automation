const fs = require('fs');
const https = require('https');

async function callGroq(prompt) {
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 1000,
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: 'You are a JSON generator. Output ONLY a valid JSON object. Never use markdown. Never use backticks. Never add explanation. Start with { and end with }.'
      },
      {
        role: 'user',
        content: prompt
      },
      {
        role: 'assistant',
        content: '{'
      }
    ]
  });

  return new Promise(function(resolve, reject) {
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.GROK_API_KEY,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          const json = JSON.parse(data);
          if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
          if (!json.choices || !json.choices[0]) throw new Error('No choices: ' + data);
          resolve('{' + json.choices[0].message.content);
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
  if (!text) return null;
  try { return JSON.parse(text.trim()); } catch (e) {}
  var stripped = text.replace(/```json|```/gi, '').trim();
  try { return JSON.parse(stripped); } catch (e) {}
  var match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (e) {}
  }
  return null;
}

function buildFallback(topic) {
  var clean = (topic || 'AI').replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
  return {
    title: (topic || 'AI Tips') + ' #Shorts',
    description: '#Shorts #Short\n\n' + (topic || 'AI Tips') + ' — Watch till the end!\n\nLike and follow for daily AI tips!\n\n#AI #' + clean + ' #YouTube #Viral #2026',
    tags: ['shorts', 'AI', 'viral', 'tutorial', '2026', 'free', 'tips', 'howto'],
    category: '22',
    thumbnail_prompt: 'YouTube Shorts thumbnail for ' + (topic || 'AI') + ', bold text, vibrant colors, dark background, professional'
  };
}

async function main() {
  if (!fs.existsSync('output/script.json')) {
    throw new Error('script.json not found');
  }

  var scriptData = JSON.parse(fs.readFileSync('output/script.json', 'utf8'));
  var topic = scriptData.topic || 'AI Tools';
  var raw = scriptData.raw || '';

  console.log('Generating Shorts metadata for: ' + topic);

  var prompt = 'Generate YouTube Shorts metadata for a video about "' + topic + '".\n\n' +
    'Script preview:\n' + raw.substring(0, 800) + '\n\n' +
    'Return ONLY a raw JSON object with these exact keys:\n' +
    '"title": catchy Shorts title under 60 chars,\n' +
    '"description": start with #Shorts #Short then 2-3 lines then hashtags,\n' +
    '"tags": array of 8 relevant string tags,\n' +
    '"category": "22",\n' +
    '"thumbnail_prompt": detailed image generation prompt for thumbnail';

  var metadata = null;

  try {
    var response = await callGroq(prompt);
    console.log('Raw response preview: ' + response.substring(0, 100));
    metadata = extractJSON(response);
    if (!metadata) {
      console.log('Could not parse JSON — using fallback');
      metadata = buildFallback(topic);
    } else {
      console.log('JSON parsed successfully');
    }
  } catch (err) {
    console.log('Groq failed: ' + err.message + ' — using fallback');
    metadata = buildFallback(topic);
  }

  if (!metadata.title) metadata.title = buildFallback(topic).title;
  if (!metadata.description) metadata.description = buildFallback(topic).description;
  if (!Array.isArray(metadata.tags) || metadata.tags.length === 0) metadata.tags = buildFallback(topic).tags;
  if (!metadata.category) metadata.category = '22';
  if (!metadata.thumbnail_prompt) metadata.thumbnail_prompt = buildFallback(topic).thumbnail_prompt;

  if (metadata.title.indexOf('#Shorts') === -1) {
    metadata.title = metadata.title + ' #Shorts';
  }
  if (metadata.description.indexOf('#Shorts') === -1) {
    metadata.description = '#Shorts #Short\n\n' + metadata.description;
  }

  metadata.title = metadata.title.substring(0, 100);
  metadata.description = metadata.description.substring(0, 5000);
  metadata.tags = metadata.tags.slice(0, 15).map(function(t) {
    return String(t).substring(0, 30);
  });

  fs.writeFileSync('output/metadata.json', JSON.stringify(metadata, null, 2));
  console.log('Metadata saved');
  console.log('Title: ' + metadata.title);
  console.log('Tags: ' + metadata.tags.slice(0, 5).join(', '));
}

main().catch(function(err) {
  console.error('Metadata generation failed: ' + err.message);
  process.exit(1);
});
