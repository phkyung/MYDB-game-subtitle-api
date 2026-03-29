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
  res.json({ status: 'ok', message: 'YouTube Subtitle API v4' });
});

app.get('/subtitle', async (req, res) => {
  const videoId = req.query.videoId;
  
  if (!videoId) {
    return res.status(400).json({ error: 'videoId required' });
  }

  const debug = [];
  
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    debug.push(`Processing: ${videoId}`);
    
    // 임시 파일 정리
    try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}
    
    let subtitleText = '';
    let lang = '';

    // 시도 1: 한국어 원본 자막
    try {
      const cmd1 = `yt-dlp --skip-download --write-sub --sub-lang ko --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`;
      debug.push(`Try 1: ${cmd1}`);
      execSync(cmd1, { encoding: 'utf-8', timeout: 60000 });
      const file = execSync(`ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
      if (file) {
        subtitleText = execSync(`cat "${file}"`, { encoding: 'utf-8' });
        lang = 'ko';
        debug.push(`Success: ko original`);
      }
    } catch (e) {
      debug.push(`Try 1 failed: ${e.message.substring(0, 100)}`);
    }

    // 시도 2: 영어 원본 자막
    if (!subtitleText) {
      try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}
      try {
        const cmd2 = `yt-dlp --skip-download --write-sub --sub-lang en --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`;
        debug.push(`Try 2: ${cmd2}`);
        execSync(cmd2, { encoding: 'utf-8', timeout: 60000 });
        const file = execSync(`ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
        if (file) {
          subtitleText = execSync(`cat "${file}"`, { encoding: 'utf-8' });
          lang = 'en';
          debug.push(`Success: en original`);
        }
      } catch (e) {
        debug.push(`Try 2 failed: ${e.message.substring(0, 100)}`);
      }
    }

    // 시도 3: 한국어 자동생성 자막
    if (!subtitleText) {
      try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}
      try {
        const cmd3 = `yt-dlp --skip-download --write-auto-sub --sub-lang ko --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`;
        debug.push(`Try 3: ${cmd3}`);
        execSync(cmd3, { encoding: 'utf-8', timeout: 60000 });
        const file = execSync(`ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
        if (file) {
          subtitleText = execSync(`cat "${file}"`, { encoding: 'utf-8' });
          lang = 'ko-auto';
          debug.push(`Success: ko auto`);
        }
      } catch (e) {
        debug.push(`Try 3 failed: ${e.message.substring(0, 100)}`);
      }
    }

    // 시도 4: 영어 자동생성 자막
    if (!subtitleText) {
      try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}
      try {
        const cmd4 = `yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`;
        debug.push(`Try 4: ${cmd4}`);
        execSync(cmd4, { encoding: 'utf-8', timeout: 60000 });
        const file = execSync(`ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
        if (file) {
          subtitleText = execSync(`cat "${file}"`, { encoding: 'utf-8' });
          lang = 'en-auto';
          debug.push(`Success: en auto`);
        }
      } catch (e) {
        debug.push(`Try 4 failed: ${e.message.substring(0, 100)}`);
      }
    }

    // 임시 파일 정리
    try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}

    if (!subtitleText || !subtitleText.includes('-->')) {
      return res.json({ _hasTranscript: false, _noSubtitle: true, _debug: debug });
    }

    const fullText = extractText(subtitleText);

    res.json({
      _hasTranscript: true,
      _captionLang: lang,
      fullText: fullText
    });

  } catch (error) {
    debug.push(`Fatal error: ${error.message}`);
    res.status(500).json({ _hasTranscript: false, _error: error.message, _debug: debug });
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
        !trimmed.startsWith('NOTE') &&
        !trimmed.startsWith('Kind:') &&
        !trimmed.startsWith('Language:')) {
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
