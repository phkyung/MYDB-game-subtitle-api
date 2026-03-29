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
    
    // 모든 자막 다운로드 시도
    const cmd = `yt-dlp --skip-download --write-sub --write-auto-sub --sub-lang "ko.*,en.*,ko,en" --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1 || true`;
    execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
    
    // 다운로드된 자막 파일 찾기
    let subtitleText = '';
    let lang = '';
    
    try {
      const findCmd = `ls -la /tmp/${videoId}*.vtt 2>/dev/null || echo "no files"`;
      const fileList = execSync(findCmd, { encoding: 'utf-8' });
      console.log('Found files:', fileList);
      
      // 한국어 우선, 영어 차선
      const patterns = ['ko', 'kr', 'en'];
      for (const pattern of patterns) {
        try {
          const findLang = `ls /tmp/${videoId}*${pattern}*.vtt 2>/dev/null | head -1`;
          const foundFile = execSync(findLang, { encoding: 'utf-8' }).trim();
          if (foundFile) {
            subtitleText = execSync(`cat "${foundFile}"`, { encoding: 'utf-8' });
            lang = pattern;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      // 패턴 매칭 실패시 아무 vtt 파일이나
      if (!subtitleText) {
        const anyFile = `ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`;
        const foundFile = execSync(anyFile, { encoding: 'utf-8' }).trim();
        if (foundFile) {
          subtitleText = execSync(`cat "${foundFile}"`, { encoding: 'utf-8' });
          lang = 'unknown';
        }
      }
    } catch (e) {
      console.log('File search error:', e.message);
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
