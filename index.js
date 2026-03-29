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
    
    // 방법 1: 원본 한국어 자막 시도
    try {
      const cmd1 = `yt-dlp --skip-download --write-sub --sub-lang ko --sub-format vtt -o "/tmp/${videoId}_orig" "${url}" 2>&1`;
      execSync(cmd1, { encoding: 'utf-8', timeout: 60000 });
      const file1 = execSync(`ls /tmp/${videoId}_orig*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
      if (file1) {
        subtitleText = execSync(`cat "${file1}"`, { encoding: 'utf-8' });
        lang = 'ko';
      }
    } catch (e) {}

    // 방법 2: 원본 영어 자막 시도
    if (!subtitleText) {
      try {
        const cmd2 = `yt-dlp --skip-download --write-sub --sub-lang en --sub-format vtt -o "/tmp/${videoId}_orig" "${url}" 2>&1`;
        execSync(cmd2, { encoding: 'utf-8', timeout: 60000 });
        const file2 = execSync(`ls /tmp/${videoId}_orig*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
        if (file2) {
          subtitleText = execSync(`cat "${file2}"`, { encoding: 'utf-8' });
          lang = 'en';
        }
      } catch (e) {}
    }

    // 방법 3: 자동생성 한국어 자막 시도
    if (!subtitleText) {
      try {
        const cmd3 = `yt-dlp --skip-download --write-auto-sub --sub-lang ko --sub-format vtt -o "/tmp/${videoId}_auto" "${url}" 2>&1`;
        execSync(cmd3, { encoding: 'utf-8', timeout: 60000 });
        const file3 = execSync(`ls /tmp/${videoId}_auto*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
        if (file3) {
          subtitleText = execSync(`cat "${file3}"`, { encoding: 'utf-8' });
          lang = 'ko-auto';
        }
      } catch (e) {}
    }

    // 방법 4: 자동생성 영어 자막 시도
    if (!subtitleText) {
      try {
        const cmd4 = `yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt -o "/tmp/${videoId}_auto" "${url}" 2>&1`;
        execSync(cmd4, { encoding: 'utf-8', timeout: 60000 });
        const file4 = execSync(`ls /tmp/${videoId}_auto*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
        if (file4) {
          subtitleText = execSync(`cat "${file4}"`, { encoding: 'utf-8' });
          lang = 'en-auto';
        }
      } catch (e) {}
    }

    // 임시 파일 정리
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
