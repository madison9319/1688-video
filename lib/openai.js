// 呼叫 OpenAI（只在伺服器端用；金鑰和提示詞都不會送到瀏覽器）

const BASE = 'https://api.openai.com/v1';

function key() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) {
    const e = new Error('系統還沒設定 AI 金鑰，請聯絡管理員');
    e.status = 503;
    throw e;
  }
  return k;
}

// 逾時包含「下載完整個回應」；retries＝逾時或伺服器錯誤時自動重試幾次
async function post(path, body, { raw = false, timeoutMs = 120000, retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await postOnce(path, body, { raw, timeoutMs });
    } catch (e) {
      if (attempt >= retries || !e.retryable) throw e;
    }
  }
}

async function postOnce(path, body, { raw, timeoutMs }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let r;
    try {
      r = await fetch(BASE + path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw retryable(e.name === 'AbortError' ? 'AI 回應太久，請再試一次' : `連不到 AI：${e.message}`);
    }
    if (!r.ok) throw await apiError(r);
    try {
      return raw ? Buffer.from(await r.arrayBuffer()) : await r.json();
    } catch (e) {
      throw retryable('AI 回應太久，請再試一次');
    }
  } finally {
    clearTimeout(t);
  }
}

function retryable(msg) {
  const e = new Error(msg);
  e.retryable = true;
  return e;
}

async function apiError(r) {
  let msg = `AI 發生錯誤（${r.status}）`;
  try {
    const j = await r.json();
    if (j.error?.code === 'moderation_blocked' || /safety|moderation/i.test(j.error?.message || '')) msg = 'AI 認為這段內容不適合生成，請換個說法';
    else if (r.status === 429) msg = 'AI 現在太忙或額度用完，請稍後再試';
    else if (j.error?.message) msg = `AI 發生錯誤：${j.error.message}`;
  } catch (e) {}
  const e = new Error(msg);
  e.retryable = r.status >= 500;
  return e;
}

// 文字：回傳 { data（JSON 物件）, usage }
export async function chatJson({ model, system, user, maxTokens = 4000 }) {
  const body = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
    max_completion_tokens: maxTokens,
  };
  if (/^gpt-5/.test(model)) body.reasoning_effort = 'minimal';
  const j = await post('/chat/completions', body);
  const text = j.choices?.[0]?.message?.content || '';
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('AI 回覆的格式不對，請再試一次');
  }
  return { data, usage: j.usage || {} };
}

// 畫圖：回傳 { b64, usage }
export async function generateImage({ model, prompt, size, quality }) {
  const j = await post('/images/generations', {
    model,
    prompt,
    size,
    quality,
    n: 1,
    output_format: 'jpeg',
    output_compression: 85,
  }, { timeoutMs: 180000 });
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error('AI 沒有畫出圖片，請再試一次');
  return { b64, usage: j.usage || {} };
}

// 照參考照片畫圖（固定主角）：回傳 { b64, usage }
// refs：參考照片（Buffer）可以一張或好幾張（產品照、主角照）
export async function editImage({ model, prompt, size, quality, refJpeg, refs }) {
  const fd = new FormData();
  fd.append('model', model);
  (refs || [refJpeg]).forEach((buf, i) => fd.append('image[]', new Blob([buf], { type: 'image/jpeg' }), `ref${i + 1}.jpg`));
  fd.append('prompt', prompt);
  fd.append('size', size);
  fd.append('quality', quality);
  fd.append('output_format', 'jpeg');
  fd.append('output_compression', '85');
  const j = await postForm('/images/edits', fd, 180000);
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error('AI 沒有畫出圖片，請再試一次');
  return { b64, usage: j.usage || {} };
}

// 語音辨識（每個字都有時間點）：回傳 { text, duration, words: [{ w, s, e }] }
export async function transcribe({ model, mp3, prompt }) {
  const fd = new FormData();
  fd.append('model', model);
  fd.append('file', new Blob([mp3], { type: 'audio/mpeg' }), 'voice.mp3');
  fd.append('language', 'zh');
  fd.append('response_format', 'verbose_json');
  fd.append('timestamp_granularities[]', 'word');
  fd.append('timestamp_granularities[]', 'segment');
  if (prompt) fd.append('prompt', prompt);
  const j = await postForm('/audio/transcriptions', fd, 280000);
  return {
    text: j.text || '',
    duration: Number(j.duration) || 0,
    words: (j.words || []).map((w) => ({ w: String(w.word), s: Number(w.start), e: Number(w.end) })),
  };
}

async function postForm(path, fd, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let r;
    try {
      r = await fetch(BASE + path, { method: 'POST', headers: { Authorization: `Bearer ${key()}` }, body: fd, signal: ctrl.signal });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'AI 回應太久，請再試一次' : `連不到 AI：${e.message}`);
    }
    if (!r.ok) throw await apiError(r);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// 配音：回傳 mp3 Buffer
export async function speech({ model, voice, text, speed, instructions }) {
  const body = { model, voice, input: text, response_format: 'mp3' };
  if (speed && speed !== 1) body.speed = speed;
  if (instructions && /gpt-4o/.test(model)) body.instructions = instructions;
  // 正常一句 2 秒內好，但偶爾會卡 20～30 秒：12 秒沒好就重來，最多重試 3 次
  return post('/audio/speech', body, { raw: true, timeoutMs: 12000, retries: 3 });
}

// 文字模型的實際成本（美金），價格是每 100 萬 tokens
export function textCostUsd(usage, price) {
  return ((usage.prompt_tokens || 0) * price.input + (usage.completion_tokens || 0) * price.output) / 1e6;
}
