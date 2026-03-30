const express = require('express');
const { execSync, exec } = require('child_process');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'YouTube Subtitle API v7' });
});

// 상세 디버그 엔드포인트
app.get('/test', async (req, res) => {
  const videoId = req.query.videoId || 'dQw4w9WgXcQ';
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  const results = {};
  
  // yt-dlp 버전 확인
  try {
    results.ytdlpVersion = execSync('yt-dlp --version', { encoding: 'utf-8' }).trim();
  } catch (e) {
    results.ytdlpVersion = `Error: ${e.message}`;
  }
  
  // 자막 목록 확인
  try {
    const listCmd = `yt-dlp --list-subs "${url}" 2>&1`;
    results.subtitleList = execSync(listCmd, { encoding: 'utf-8', timeout: 60000 });
  } catch (e) {
    results.subtitleList = `Error: ${e.message}\nStderr: ${e.stderr || 'none'}\nStdout: ${e.stdout || 'none'}`;
  }
  
  res.json(results);
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
    
    // yt-dlp 버전 확인
    try {
      const version = execSync('yt-dlp --version', { encoding: 'utf-8' }).trim();
      debug.push(`yt-dlp version: ${version}`);
    } catch (e) {
      debug.push(`yt-dlp version check failed: ${e.message}`);
    }
    
    // 임시 파일 정리
    try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}
    
    let subtitleText = '';
    let lang = '';

    // 시도 1: 한국어 원본 자막
    try {
      const cmd1 = `yt-dlp --skip-download --write-sub --sub-lang ko --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`;
      debug.push(`Try 1 (ko original): running...`);
      const output1 = execSync(cmd1, { encoding: 'utf-8', timeout: 60000 });
      debug.push(`Try 1 output: ${output1}`);
      const file = execSync(`ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
      if (file) {
        subtitleText = execSync(`cat "${file}"`, { encoding: 'utf-8' });
        lang = 'ko';
        debug.push(`Try 1 SUCCESS: ${file}`);
      }
    } catch (e) {
      debug.push(`Try 1 failed: ${e.message}`);
      if (e.stdout) debug.push(`Try 1 stdout: ${e.stdout}`);
      if (e.stderr) debug.push(`Try 1 stderr: ${e.stderr}`);
    }

    // 시도 2: 영어 원본 자막
    if (!subtitleText) {
      try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}
      try {
        const cmd2 = `yt-dlp --skip-download --write-sub --sub-lang en --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`;
        debug.push(`Try 2 (en original): running...`);
        const output2 = execSync(cmd2, { encoding: 'utf-8', timeout: 60000 });
        debug.push(`Try 2 output: ${output2}`);
        const file = execSync(`ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
        if (file) {
          subtitleText = execSync(`cat "${file}"`, { encoding: 'utf-8' });
          lang = 'en';
          debug.push(`Try 2 SUCCESS: ${file}`);
        }
      } catch (e) {
        debug.push(`Try 2 failed: ${e.message}`);
      }
    }

    // 시도 3: 한국어 자동생성 자막
    if (!subtitleText) {
      try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}
      try {
        const cmd3 = `yt-dlp --skip-download --write-auto-sub --sub-lang ko --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`;
        debug.push(`Try 3 (ko auto): running...`);
        const output3 = execSync(cmd3, { encoding: 'utf-8', timeout: 60000 });
        debug.push(`Try 3 output: ${output3}`);
        const file = execSync(`ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
        if (file) {
          subtitleText = execSync(`cat "${file}"`, { encoding: 'utf-8' });
          lang = 'ko-auto';
          debug.push(`Try 3 SUCCESS: ${file}`);
        }
      } catch (e) {
        debug.push(`Try 3 failed: ${e.message}`);
      }
    }

    // 시도 4: 영어 자동생성 자막
    if (!subtitleText) {
      try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}
      try {
        const cmd4 = `yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt -o "/tmp/${videoId}" "${url}" 2>&1`;
        debug.push(`Try 4 (en auto): running...`);
        const output4 = execSync(cmd4, { encoding: 'utf-8', timeout: 60000 });
        debug.push(`Try 4 output: ${output4}`);
        const file = execSync(`ls /tmp/${videoId}*.vtt 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
        if (file) {
          subtitleText = execSync(`cat "${file}"`, { encoding: 'utf-8' });
          lang = 'en-auto';
          debug.push(`Try 4 SUCCESS: ${file}`);
        }
      } catch (e) {
        debug.push(`Try 4 failed: ${e.message}`);
      }
    }

    // 임시 파일 정리
    try { execSync(`rm -f /tmp/${videoId}*`); } catch (e) {}

    if (!subtitleText || !subtitleText.includes('-->')) {
      debug.push(`No subtitle found after all tries`);
      return res.json({ _hasTranscript: false, _noSubtitle: true, _debug: debug });
    }

    const { transcript, fullText } = parseVTT(subtitleText);
    debug.push(`Parsed: ${transcript.length} segments`);

    res.json({
      _hasTranscript: true,
      _captionLang: lang,
      transcript: transcript,
      fullText: fullText
    });

  } catch (error) {
    debug.push(`Fatal error: ${error.message}`);
    res.status(500).json({ _hasTranscript: false, _error: error.message, _debug: debug });
  }
});

function parseVTT(vttText) {
  const lines = vttText.split('\n');
  const transcript = [];
  const seen = new Set();
  let currentTime = null;

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.includes('-->')) {
      const match = trimmed.match(/(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/);
      if (match) {
        currentTime = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
      } else {
        const match2 = trimmed.match(/(\d{2}):(\d{2})[.,](\d{3})/);
        if (match2) {
          currentTime = parseInt(match2[1]) * 60 + parseInt(match2[2]);
        }
      }
    }
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
