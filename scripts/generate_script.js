// scripts/generate_script.js
// Calls Groq API to generate a YouTube video script
// Free tier: 1000 requests/day — no credit card needed

const fs = require('fs');
const https = require('https');

const topic = process.argv[2] || 'Top 5 AI Tools in 2026';

async function callGroq(prompt) {
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 1000,
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: 'You are an expert YouTube scriptwriter. You write viral, engaging scripts that keep viewers hooked. Always use a conversational, energetic tone.'
      },
      {
        role: 'user',
        content: prompt
      }
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
          if (!json.choices || !json.choices[0]) throw new Error('No choices in response: ' + data);
          resolve(json.choices[0].message.content);
        } catch (e) {
          reject(new Error('Failed to parse Groq response: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log(`🎬 Generating script for: "${topic}"`);

  if (!fs.existsSync('output')) fs.mkdirSync('output');

  const prompt = `Write a 90-second YouTube video script about: "${topic}"

Format your response EXACTLY like this (keep the labels):

HOOK:
[A punchy 1-2 sentence hook that grabs attention in the first 3 seconds]

SCENE_1:
[First main point - 2-3 sentences, vivid and specific]

SCENE_2:
[Second main point - 2-3 sentences, build on scene 1]

SCENE_3:
[Third main point - 2-3 sentences, most impactful]

SCENE_4:
[Fourth point or deeper insight - 2-3 sentences]

SCENE_5:
[Fifth point - wrap up the main value]

CTA:
[Call to action: like, subscribe, comment. Make it feel natural, not forced]

VOICEOVER:
[The complete script as one flowing paragraph the narrator will read aloud - natural speech, no scene labels]`;

  const script = await callGroq(prompt);

  const sections = {};
  const lines = script.split('\n');
  let currentSection = null;
  let currentContent = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^(HOOK|SCENE_\d+|CTA|VOICEOVER):$/);
    if (sectionMatch) {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = sectionMatch[1];
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  fs.writeFileSync('output/script.json', JSON.stringify({ topic, sections, raw: script }, null, 2));
  fs.writeFileSync('output/voiceover_text.txt', sections.VOICEOVER || script);

  console.log('✅ Script saved to output/script.json');
  console.log('📝 Scenes found:', Object.keys(sections).filter(k => k.startsWith('SCENE')).length);
}

main().catch(err => {
  console.error('❌ Script generation failed:', err.message);
  process.exit(1);
});
