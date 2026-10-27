// 做影片頁的資料結構與小工具（瀏覽器端）
import { ASPECTS, CHARS_PER_SEC } from './studioOptions';

export const uid = (n = 8) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');

export function newProject() {
  return {
    name: '',
    aspect: '9:16',
    lines: [], // [{ id, text, audio, audioKey }]
    scenes: [], // [{ id, from, prompt, file, source:'ai'|'upload' }]
    character: '',
    imageStyle: 'photo',
    quality: 'medium',
    voice: { mode: 'ai', voice: 'nova', tone: 'natural', speed: 1 }, // mode: ai／record（自己的錄音）／none
    // 自己的錄音：{ source, name, duration, words, cutFillers, cutPauses, voiceFile, voiceDuration }
    recording: null,
    face: null, // 主角頭照 { file }
    bgm: null, // { file, name, volume }
    title: { text: '', size: 80, color: '#ffd84d' },
    subtitle: { enabled: true, size: 72, color: '#ffffff', outlineColor: '#000000', position: 'bottom', maxChars: 13 },
    intro: { type: 'text', text: '', sub: '', bg: 'first', color: '#c2410c', duration: 3 },
    outro: { type: 'text', text: '謝謝收看', sub: '', color: '#1e1640', duration: 3 },
    motion: true,
    insert: null, // 中場插播 { file, kind:'image'|'video', thumb, duration, at:'middle'|秒數, keepAudio }
    logo: null, // 角落 Logo { file, position:'tl'|'tr'|'bl'|'br', size, opacity }
    output: 'normal',
  };
}

// 文字框內容 → 句子（保留原本句子的配音）
export function syncLines(oldLines, text) {
  const pool = [...oldLines];
  return text.split('\n').map((t) => t.trim()).filter(Boolean).map((t) => {
    const i = pool.findIndex((l) => l.text === t);
    if (i >= 0) return pool.splice(i, 1)[0];
    return { id: uid(), text: t, audio: null, audioKey: '' };
  });
}

// 長句自動切開：先在句號、問號、驚嘆號切；太長再在逗號切
export function autoSplit(text, max = 22) {
  const out = [];
  for (const raw of text.split('\n')) {
    const sents = raw.split(/(?<=[。！？!?；;])/).map((s) => s.trim()).filter(Boolean);
    for (const s of sents) {
      if (s.length <= max) { out.push(s); continue; }
      let cur = '';
      for (const p of s.split(/(?<=[，,、：:])/)) {
        if (cur && (cur + p).length > max) { out.push(cur); cur = ''; }
        cur += p;
      }
      if (cur) out.push(cur);
    }
  }
  return out.map((s) => s.replace(/[。.]+$/, '')).filter(Boolean).join('\n');
}

// 畫面對應的句子要合理：照順序、不重複、第一個從第 0 句開始、不超過句數
export function normalizeScenes(scenes, nLines) {
  if (!nLines) return scenes;
  const list = [...scenes].sort((a, b) => a.from - b.from).map((s) => ({ ...s, from: Math.min(Math.max(0, s.from), nLines - 1) }));
  for (let i = 0; i < list.length; i++) {
    if (i === 0) list[i].from = 0;
    else if (list[i].from <= list[i - 1].from) list[i].from = Math.min(nLines - 1, list[i - 1].from + 1);
  }
  return list;
}

// 把句子平均分給每個畫面
export function spreadScenes(scenes, nLines) {
  const n = scenes.length;
  return scenes.map((s, i) => ({ ...s, from: Math.min(Math.max(0, nLines - 1), Math.floor((i * nLines) / Math.max(1, n))) }));
}

export function sceneRange(scenes, i, nLines) {
  const to = i + 1 < scenes.length ? scenes[i + 1].from - 1 : nLines - 1;
  return [scenes[i].from, Math.max(scenes[i].from, to)];
}

export const audioKey = (line, v) => `${v.voice}|${v.tone}|${v.speed}|${line.text}`;

export function estimateSeconds(p) {
  const chars = p.lines.reduce((a, l) => a + l.text.length, 0);
  const body = p.voice.mode === 'record' && p.recording?.voiceDuration ? p.recording.voiceDuration : chars / CHARS_PER_SEC + p.lines.length * 0.25;
  const intro = p.intro.type !== 'none' ? Number(p.intro.duration) || 3 : 0;
  const outro = p.outro.type !== 'none' ? Number(p.outro.duration) || 3 : 0;
  return Math.round(body + intro + outro);
}

// 建議畫面數：大約每 5 秒換一張
export function suggestSceneCount(p) {
  const chars = p.lines.reduce((a, l) => a + l.text.length, 0);
  return Math.max(1, Math.min(p.lines.length || 1, Math.round(chars / CHARS_PER_SEC / 5)));
}

export function aspectInfo(key) {
  const a = ASPECTS.find(([k]) => k === key) || ASPECTS[0];
  return { key: a[0], label: a[1], width: a[2], height: a[3], size: a[4] };
}

// 交給加速器的做影片設定
export function buildSpec(p, { preview }) {
  const a = aspectInfo(p.aspect);
  const useVoice = p.voice.mode === 'ai';
  const scale = p.output === 'high' ? 1 : p.output === 'low' ? 2 / 3 : 1;
  // 片頭選文字但沒寫字 → 用影片標題；還是沒有就不要片頭
  const intro = { ...p.intro };
  if (intro.type === 'text' && !intro.text.trim()) {
    intro.text = p.title.text;
    if (!intro.text) intro.type = 'none';
  }
  if (intro.type === 'image' && !intro.imageFile) intro.type = 'none';
  const outro = { ...p.outro };
  if ((outro.type === 'text' && !outro.text.trim() && !outro.sub.trim()) || (outro.type === 'image' && !outro.imageFile)) outro.type = 'none';
  return {
    name: p.name || p.title.text || p.lines[0]?.text.slice(0, 12) || '影片',
    preview,
    width: Math.round((a.width * (preview ? 0.5 : scale)) / 2) * 2,
    height: Math.round((a.height * (preview ? 0.5 : scale)) / 2) * 2,
    quality: p.output,
    lines: p.voice.mode === 'record'
      ? p.lines.map((l) => ({ text: l.text, start: l.start, end: l.end }))
      : p.lines.map((l) => ({ text: l.text, audio: useVoice ? l.audio : null })),
    voiceFile: p.voice.mode === 'record' ? p.recording?.voiceFile || null : null,
    scenes: p.scenes.filter((s) => s.file).map((s) => ({ file: s.file, from: s.from })),
    subtitle: p.subtitle,
    title: p.title,
    intro,
    outro,
    bgm: p.bgm ? { file: p.bgm.file, volume: p.bgm.volume } : null,
    insert: p.insert?.file ? { file: p.insert.file, duration: p.insert.duration, at: p.insert.at, keepAudio: p.insert.keepAudio } : null,
    logo: p.logo?.file ? p.logo : null,
    motion: p.motion,
    transition: 'fade',
  };
}

// 做影片前檢查：回傳 [錯誤...]（空的就可以做）
export function checkReady(p) {
  const errs = [];
  if (!p.lines.length) errs.push('第 1 步還沒寫文稿');
  if (!p.scenes.some((s) => s.file)) errs.push('第 2 步還沒有任何圖片');
  else if (p.scenes.some((s) => !s.file)) errs.push(`第 2 步還有 ${p.scenes.filter((s) => !s.file).length} 個畫面沒有圖片（沒圖的畫面會被跳過）`);
  if (p.voice.mode === 'record' && !p.recording?.voiceFile) errs.push('第 1 步的錄音還沒轉成文稿');
  if (p.voice.mode === 'ai') {
    const missing = p.lines.filter((l) => !l.audio || l.audioKey !== audioKey(l, p.voice)).length;
    if (missing) errs.push(`第 3 步還有 ${missing} 句沒有配音（或改過要重新配音）`);
  }
  return errs;
}

// 讀照片 → 縮到最長邊 maxSide → JPEG base64（不含 data: 開頭）
export function photoToB64(file, maxSide = 2160) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error(`「${file.name}」不是圖片檔`));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.9).split(',')[1]);
    };
    img.onerror = () => reject(new Error(`「${file.name}」無法讀取`));
    img.src = url;
  });
}

export function fileToB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error(`「${file.name}」無法讀取`));
    r.readAsDataURL(file);
  });
}

// 同時最多跑 n 個工作
export async function runPool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

// 「我的固定樣式」：哪些設定要存起來給下一支影片用（文字內容不存，只存樣子）
export function pickStyle(p) {
  return {
    aspect: p.aspect,
    imageStyle: p.imageStyle,
    quality: p.quality,
    voice: { ...p.voice, mode: p.voice.mode === 'record' ? 'ai' : p.voice.mode },
    title: { size: p.title.size, color: p.title.color },
    subtitle: p.subtitle,
    intro: { ...p.intro, text: '' },
    outro: p.outro,
    motion: p.motion,
    output: p.output,
    bgm: p.bgm,
    logo: p.logo,
  };
}

// 樣式會用到的檔案（存樣式時要一起複製）
export function styleFiles(p) {
  return [p.bgm?.file, p.logo?.file, p.intro?.imageFile, p.outro?.imageFile].filter(Boolean);
}

// 新專案套用固定樣式
export function applyStyleTo(base, st) {
  if (!st) return base;
  return {
    ...base,
    ...['aspect', 'imageStyle', 'quality', 'motion', 'output', 'subtitle', 'outro', 'bgm', 'logo'].reduce((o, k) => (st[k] != null ? { ...o, [k]: st[k] } : o), {}),
    voice: { ...base.voice, ...(st.voice || {}) },
    title: { ...base.title, ...(st.title || {}) },
    intro: { ...base.intro, ...(st.intro || {}) },
  };
}
