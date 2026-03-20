// scripts/generate_script.js
// Groq API — 55-second YouTube Shorts script

const fs = require('fs');
const https = require('https');

const topic = process.argv[2] || 'Top AI Tools in 2026';

async function callGroq(prompt) {
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 800,
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: 'You are an expert YouTube Shorts scriptwriter. You write punchy, viral 55-second scripts that hook viewers in the first 2 seconds. Energetic, conversational tone. Short sentences.'
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

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
          if (!json.choices?.[0]) throw new Error('No choices: ' + data);
          resolve(json.choices[0].message.content);
        } catch (e) {
          reject(new Error('Groq parse error: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log(`🎬 Generating 55-sec Shorts script: "${topic}"`);
  if (!fs.existsSync('output')) fs.mkdirSync('output');

  const prompt = `Write a 55-second YouTube Shorts script about: "${topic}"

Format EXACTLY like this (keep labels):

HOOK:
[1 punchy sentence — hook viewer in 2 seconds, start with "Did you know" or shocking fact]

SCENE_1:
[First point — 2 short sentences max]

SCENE_2:
[Second point — 2 short sentences max]

SCENE_3:
[Third point — 2 short sentences max]

SCENE_4:
[Final point + wrap up — 1-2 short sentences]

CTA:
[1 sentence — like, follow, comment. Natural not forced]

VOICEOVER:
[Complete script as ONE flowing paragraph for narrator — natural speech, no labels, max 130 words]`;

  const script = await callGroq(prompt);

  // Parse sections
  const sections = {};
  const lines = script.split('\n');
  let currentSection = null;
  let currentContent = [];

  for (const line of lines) {
    const match = line.match(/^(HOOK|SCENE_\d+|CTA|VOICEOVER):$/);
    if (match) {
      if (currentSection) sections[currentSection] = currentContent.join('\n').trim();
      currentSection = match[1];
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  if (currentSection) sections[currentSection] = currentContent.join('\n').trim();

  fs.writeFileSync('output/script.json', JSON.stringify({ topic, sections, raw: script }, null, 2));
  fs.writeFileSync('output/voiceover_text.txt', sections.VOICEOVER || script);

  console.log('✅ Script saved');
  console.log('📝 Scenes:', Object.keys(sections).filter(k => k.startsWith('SCENE')).length);
  console.log('🎤 Voiceover preview:', (sections.VOICEOVER || '').substring(0, 80) + '...');
}

main().catch(err => {
  console.error('❌ Script generation failed:', err.message);
  process.exit(1);
});
