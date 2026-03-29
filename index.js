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
  res.json({ status: 'ok', message: 'YouTube Subtitle API v3' });
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
    
    // 모든 자막 한번에 다운로드 시도
    const cmd = `yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs "ko,en,ko-orig,en-orig" --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`;
    debug.push(`Command: ${cmd}`);
    
    let cmdOutput = '';
    try {
      cmdOutput = execSync(cmd, { encoding: 'utf-8', timeout: 120000 });
      debug.push(`yt-dlp output: ${cmdOutput}`);
    } catch (e) {
      debug.push(`yt-dlp error: ${e.message}`);
      cmdOutput = e.stdout || '';
    }
    
    // 다운로드된 파일 확인
    let files = '';
    try {
      files = execSync(`ls -la /tmp/${videoId}* 2>&1 || echo "no files"`, { encoding: 'utf-8' });
      debug.push(`Files found: ${files}`);
    } catch (e) {
      debug.push(`ls error: ${e.message}`);
    }
    
    // 자막 파일 찾기
    let subtitleText = '';
    let lang = '';
    let foundFile = '';
    
    try {
      foundFile = execSync(`ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
      debug.push(`Found vtt file: ${foundFile}`);
    } catch (e) {
      debug.push(`No vtt files found`);
    }
    
    if (foundFile) {
      subtitleText = execSync(`cat "${foundFile}"`, { encoding: 'utf-8' });
      // 파일명에서 언어 추출
      const langMatch = foundFile.match(/\.([a-z]{2}(-[a-z]+)?)\./i);
      lang = langMatch ? langMatch[1] : 'unknown';
      debug.push(`Language detected: ${lang}`);
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
      fullText: fullText,
      _debug: debug
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
