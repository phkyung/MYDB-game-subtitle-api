const express = require('express');
const { execSync } = require('child_process');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'YouTube Subtitle API' });
});

app.get('/subtitle', async (req, res) => {
  const videoId = req.query.videoId;
  
  if (!videoId) {
    return res.status(400).json({ error: 'videoId required' });
  }

  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    let subtitleText = '';
    let lang = '';
    
    const langs = ['ko', 'en'];
    for (const tryLang of langs) {
      try {
        const cmd = `yt-dlp --skip-download --write-sub --write-auto-sub --sub-lang ${tryLang} --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`;
        execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
        
        try {
          subtitleText = execSync(`cat /tmp/${videoId}.${tryLang}.vtt`, { encoding: 'utf-8' });
          lang = tryLang;
          break;
        } catch (e) {
          const findCmd = `ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`;
          const foundFile = execSync(findCmd, { encoding: 'utf-8' }).trim();
          if (foundFile) {
            subtitleText = execSync(`cat "${foundFile}"`, { encoding: 'utf-8' });
            lang = tryLang;
            break;
          }
        }
      } catch (e) {
        continue;
      }
    }

    try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}

    if (!subtitleText || !subtitleText.includes('-->')) {
      return res.json({ _hasTranscript: false, _noSubtitle: true });
    }

    const fullText = extractText(subtitleText);

    res.json({
      _hasTranscript: true,
      _captionLang: lang,
      fullText: fullText
    });

  } catch (error) {
    res.status(500).json({ _hasTranscript: false, _error: error.message });
  }
});

function extractText(vttText) {
  const lines = vttText.split('\n');
  const textParts = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed && 
        !trimmed.includes('-->') && 
        !trimmed.startsWith('WEBVTT') && 
        !trimmed.match(/^\d+$/) &&
        !trimmed.startsWith('NOTE')) {
      const cleanText = trimmed.replace(/<[^>]*>/g, '').trim();
      if (cleanText && !seen.has(cleanText)) {
        seen.add(cleanText);
        textParts.push(cleanText);
      }
    }
  }
  
  return textParts.join(' ');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
