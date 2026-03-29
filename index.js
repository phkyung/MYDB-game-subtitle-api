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
  res.json({ status: 'ok', message: 'YouTube Subtitle API v5' });
});

app.get('/subtitle', async (req, res) => {
  const videoId = req.query.videoId;
  
  if (!videoId) {
    return res.status(400).json({ error: 'videoId required' });
  }

  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    // 임시 파일 정리
    try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}
    
    let subtitleText = '';
    let lang = '';

    // 시도 1: 한국어 원본 자막
    try {
      execSync(`yt-dlp --skip-download --write-sub --sub-lang ko --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`, { encoding: 'utf-8', timeout: 60000 });
      const file = execSync(`ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
      if (file) {
        subtitleText = execSync(`cat "${file}"`, { encoding: 'utf-8' });
        lang = 'ko';
      }
    } catch (e) {}

    // 시도 2: 영어 원본 자막
    if (!subtitleText) {
      try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}
      try {
        execSync(`yt-dlp --skip-download --write-sub --sub-lang en --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`, { encoding: 'utf-8', timeout: 60000 });
        const file = execSync(`ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
        if (file) {
          subtitleText = execSync(`cat "${file}"`, { encoding: 'utf-8' });
          lang = 'en';
        }
      } catch (e) {}
    }

    // 시도 3: 한국어 자동생성 자막
    if (!subtitleText) {
      try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}
      try {
        execSync(`yt-dlp --skip-download --write-auto-sub --sub-lang ko --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`, { encoding: 'utf-8', timeout: 60000 });
        const file = execSync(`ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
        if (file) {
          subtitleText = execSync(`cat "${file}"`, { encoding: 'utf-8' });
          lang = 'ko-auto';
        }
      } catch (e) {}
    }

    // 시도 4: 영어 자동생성 자막
    if (!subtitleText) {
      try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}
      try {
        execSync(`yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`, { encoding: 'utf-8', timeout: 60000 });
        const file = execSync(`ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
        if (file) {
          subtitleText = execSync(`cat "${file}"`, { encoding: 'utf-8' });
          lang = 'en-auto';
        }
      } catch (e) {}
    }

    // 임시 파일 정리
    try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}

    if (!subtitleText || !subtitleText.includes('-->')) {
      return res.json({ _hasTranscript: false, _noSubtitle: true });
    }

    const { transcript, fullText } = parseVTT(subtitleText);

    res.json({
      _hasTranscript: true,
      _captionLang: lang,
      transcript: transcript,
      fullText: fullText
    });

  } catch (error) {
    res.status(500).json({ _hasTranscript: false, _error: error.message });
  }
});

function parseVTT(vttText) {
  const lines = vttText.split('\n');
  const transcript = [];
  const seen = new Set();
  let currentTime = null;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // 타임스탬프 라인 (00:00:00.000 --> 00:00:00.000)
    if (trimmed.includes('-->')) {
      const match = trimmed.match(/(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/);
      if (match) {
        currentTime = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
      } else {
        // MM:SS.mmm 형식
        const match2 = trimmed.match(/(\d{2}):(\d{2})[.,](\d{3})/);
        if (match2) {
          currentTime = parseInt(match2[1]) * 60 + parseInt(match2[2]);
        }
      }
    }
    // 텍스트 라인
    else if (trimmed && 
             !trimmed.startsWith('WEBVTT') && 
             !trimmed.match(/^\d+$/) &&
             !trimmed.startsWith('NOTE') &&
             !trimmed.startsWith('Kind:') &&
             !trimmed.startsWith('Language:') &&
             currentTime !== null) {
      const cleanText = trimmed.replace(/<[^>]*>/g, '').trim();
      if (cleanText && !seen.has(cleanText)) {
        seen.add(cleanText);
        transcript.push({
          start: currentTime,
          text: cleanText
        });
      }
    }
  }

  const fullText = transcript.map(t => t.text).join(' ');
  
  return { transcript, fullText };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
