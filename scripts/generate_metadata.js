// scripts/generate_metadata.js
// Uses Grok to generate YouTube title, description, tags from the script

const fs = require('fs');
const https = require('https');

async function callGrok(prompt) {
  const body = JSON.stringify({
    model: 'grok-3-fast',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }]
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.x.ai',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).choices[0].message.content);
        } catch (e) {
          reject(new Error('Parse error: ' + data));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const scriptData = JSON.parse(fs.readFileSync('output/script.json', 'utf8'));
  const { topic, raw } = scriptData;

  console.log('📝 Generating YouTube metadata...');

  const prompt = `Based on this YouTube video script about "${topic}", generate metadata.

Script:
${raw}

Return ONLY a valid JSON object with no markdown, no backticks, exactly this structure:
{
  "title": "Clickbait but accurate YouTube title under 70 characters",
  "description": "SEO-optimized YouTube description, 150-200 words. Include timestamps, relevant keywords, and a CTA to subscribe.",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"],
  "category": "22",
  "thumbnail_prompt": "A vivid, detailed image generation prompt for a YouTube thumbnail that represents this video"
}`;

  const response = await callGrok(prompt);
  
  // Clean and parse JSON
  const cleaned = response.replace(/```json|```/g, '').trim();
  let metadata;
  try {
    metadata = JSON.parse(cleaned);
  } catch (e) {
    // Fallback metadata if parse fails
    metadata = {
      title: `${topic} - Everything You Need to Know`,
      description: `In this video, we cover everything about ${topic}. Watch till the end for the best insights!\n\n#${topic.replace(/\s+/g, '')} #YouTube #Education`,
      tags: topic.split(' ').concat(['youtube', 'tutorial', 'guide', '2026']),
      category: '22',
      thumbnail_prompt: `Professional YouTube thumbnail about ${topic}, bold text, vibrant colors, high contrast`
    };
  }

  fs.writeFileSync('output/metadata.json', JSON.stringify(metadata, null, 2));
  console.log('✅ Metadata saved');
  console.log('📌 Title:', metadata.title);
}

main().catch(err => {
  console.error('❌ Metadata generation failed:', err.message);
  process.exit(1);
});
