// 呼叫阿里雲百煉「萬相 Wan 3.0」做影片（只在伺服器端用）
// 送出工作 → 拿到 task_id → 每 15 秒問一次 → 成功拿到影片網址（24 小時內有效）

function cfg(settings) {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) {
    const e = new Error('系統還沒設定萬相（阿里雲百煉）金鑰，請聯絡管理員');
    e.status = 503;
    throw e;
  }
  const base = String(settings.wan_endpoint || '').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+\.aliyuncs\.com$/.test(base)) {
    const e = new Error('萬相的端點網址還沒設定好，請管理員到「系統設定」填寫');
    e.status = 503;
    throw e;
  }
  return { key, base };
}

async function call(url, key, init) {
  let r;
  try {
    r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  } catch (e) {
    throw new Error(`連不到萬相：${e.message}`);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.code) {
    const msg = j.message || `萬相發生錯誤（${r.status}）`;
    throw new Error(/inappropriate|green|moderation|safety/i.test(msg) ? '萬相認為內容不適合生成，請改一下劇本或分鏡圖' : `萬相發生錯誤：${msg}`);
  }
  return j;
}

// images：['data:image/jpeg;base64,...'] 依序是 Image 1、Image 2…
export async function submitWan(settings, { prompt, images, duration, resolution, ratio, audio }) {
  const { key, base } = cfg(settings);
  const j = await call(`${base}/api/v1/services/aigc/video-generation/video-synthesis`, key, {
    method: 'POST',
    headers: { 'X-DashScope-Async': 'enable' },
    body: JSON.stringify({
      model: settings.wan_model,
      input: { prompt, media: images.map((url) => ({ type: 'reference_image', url })) },
      parameters: { resolution, ratio, duration, audio: !!audio, prompt_extend: true, watermark: false },
    }),
  });
  const taskId = j.output?.task_id;
  if (!taskId) throw new Error('萬相沒有回傳工作編號，請再試一次');
  return taskId;
}

// 回傳 { status: 'running'|'succeeded'|'failed', videoUrl, error }
export async function wanStatus(settings, taskId) {
  const { key, base } = cfg(settings);
  const j = await call(`${base}/api/v1/tasks/${encodeURIComponent(taskId)}`, key, { method: 'GET' });
  const o = j.output || {};
  const s = String(o.task_status || '').toUpperCase();
  if (s === 'SUCCEEDED') return { status: 'succeeded', videoUrl: o.video_url, usage: j.usage };
  if (s === 'FAILED' || s === 'CANCELED' || s === 'UNKNOWN') return { status: 'failed', error: o.message || o.code || '萬相生成失敗' };
  return { status: 'running' };
}

// 費用（台幣）：秒數 × 每秒美金價格 × 匯率
export function wanCostTwd(settings, { duration, resolution }) {
  const perSec = Number(settings.wan_price_usd?.[resolution]) || 0.2;
  return duration * perSec * Number(settings.usd_to_twd);
}
