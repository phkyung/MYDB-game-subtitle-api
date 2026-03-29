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
    return res.status(400).json({ error: 'videoId 필요' });
  }

  try {
    // yt-dlp로 자막 정보 가져오기
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    // 자막 목록 확인
    const listCmd = `yt-dlp --list-subs --skip-download "${url}" 2>&1`;
    const listOutput = execSync(listCmd, { encoding: 'utf-8', timeout: 30000 });
    
    // 자막 다운로드 (한국어 우선, 없으면 영어, 없으면 자동생성)
    let subtitleText = '';
    let lang = '';
    
    const langs = ['ko', 'en'];
    for (const tryLang of langs) {
      try {
        const cmd = `yt-dlp --skip-download --write-sub --write-auto-sub --sub-lang ${tryLang} --sub-format vtt --output "/tmp/${videoId}" "${url}" 2>&1 && cat /tmp/${videoId}.${tryLang}.vtt 2>/dev/null || cat /tmp/${videoId}.*.vtt 2>/dev/null`;
        subtitleText = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
        if (subtitleText && subtitleText.includes('-->')) {
          lang = tryLang;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // 자막 파싱
    if (!subtitleText || !subtitleText.includes('-->')) {
      return res.json({ _hasTranscript: false, _noSubtitle: true });
    }

    const transcript = parseVTT(subtitleText);
    
    // 임시 파일 정리
    try { execSync(`rm -f /tmp/${videoId}.*`); } catch (e) {}

    res.json({
      _hasTranscript: true,
      _captionLang: lang,
      transcript: transcript,
      fullText: transcript.map(t => t.text).join(' ')
    });

  } catch (error) {
    res.status(500).json({ 
      _hasTranscript: false, 
      _error: er
