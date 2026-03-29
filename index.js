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

// 디버그용 - 자막 목록만 확인
app.get('/debug', async (req, res) => {
  const videoId = req.query.videoId;
  
  if (!videoId) {
    return res.status(400).json({ error: 'videoId required' });
  }

  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const cmd = `yt-dlp --list-subs "${url}" 2>&1`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
    res.json({ videoId, subtitleList: output });
  } catch (error) {
    res.json({ error: error.message, stderr: error.stderr });
  }
});

app.get('/subtitle', async (req, res) => {
  const videoId = req.query.videoId;
  
  if (!videoId) {
    return res.status(400).json({ error: 'videoId required' });
  }

  const logs = [];

  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    logs.push(`URL: ${url}`);
    
    // 먼저 자막 목록 확인
    try {
      const listCmd = `yt-dlp --list-subs "${url}" 2>&1`;
      const listOutput = execSync(listCmd, { encoding: 'utf-8', timeout: 30000 });
      logs.push(`Available subs: ${listOutput.substring(0, 500)}`);
    } catch (e) {
      logs.push(`List error: ${e.message}`);
    }
    
    // 모든 자막 다운로드 시도 (더 넓은 범위)
    const cmd = `yt-dlp --skip-download --all-subs --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`;
    logs.push(`Command: ${cmd}`);
    
    const cmdOutput = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
    logs.push(`yt-dlp output: ${cmdOutput.substring(0, 500)}`);
    
    // 다운로드된 파일 확인
    let subtitleText = '';
    let lang = '';
    
    const findCmd = `ls -la /tmp/ | grep ${videoId} 2>&1 || echo "no files found"`;
    const fileList = execSync(findCmd, { encoding: 'utf-8' });
    logs.push(`Files: ${fileList}`);
    
    // 한국어 우선, 영어 차선
    const patterns = ['ko', 'kr', 'en'];
    for (const pattern of patterns) {
      try {
        const findLang = `ls /tmp/${videoId}*${pattern}*.vtt 2>/dev/null | head -1`;
        const foundFile = execSync(findLang, { encoding: 'utf-8' }).trim();
        if (foundFile) {
          logs.push(`Found file: ${foundFile}`);
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
      try {
        const anyFile = `ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`;
        const foundFile = execSync(anyFile, { encoding: 'utf-8' }).trim();
        if (foundFile) {
          logs.push(`Fallback file: ${foundFile}`);
          subtitleText = execSync(`cat "${foundFile}"`, { encoding: 'utf-8' });
          lang = 'unknown';
        }
      } catch (e) {
        logs.push(`No vtt files found`);
      }
    }

    // 임시 파일 정리
    try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}

    if (!subtitleText || !subtitleText.includes('-->')) {
      return res.json({ _hasTranscript: false, _noSubtitle: true, _debug: logs });
    }

    const fullText = extractText(subtitleText);

    res.json({
      _hasTranscript: true,
      _captionLang: lang,
      fullText: fullText
    });

  } catch (error) {
    logs.push(`Error: ${error.message}`);
    res.status(500).json({ _hasTranscript: false, _error: error.message, _debug: logs });
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
