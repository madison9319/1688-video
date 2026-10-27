import { supabaseAdmin } from './supabase';

// 後台可以改的設定（預設值跟 schema.sql 一樣）
export const SETTING_DEFAULTS = {
  usd_to_twd: 32, // 美金匯率（OpenAI 收美金）
  cny_to_twd: 4.5, // 人民幣匯率（阿里雲萬相收人民幣）
  point_rate: 1, // 點數倍率：扣點＝成本 × 倍率（1＝照成本打平）
  accelerator_url: '', // 本機加速器下載網址
  accelerator_version: '1.0.0', // 最新版加速器版本（舊版會提醒更新）
  // ── AI 模型與價格（成本都換成台幣；扣點＝台幣 × 點數倍率）──
  text_model: 'gpt-5-mini', // 寫文案、分鏡、標題
  text_price: { input: 0.25, output: 2 }, // 文字模型美金價格（每 100 萬 tokens），照實際用量算
  image_model: 'gpt-image-1-mini', // 畫圖
  image_price: { low: 0.15, medium: 0.45, high: 1.7 }, // 每張圖台幣（gpt-image-1-mini 直式實測 low 約 0.12），先顯示給會員看
  tts_model: 'gpt-4o-mini-tts', // 配音
  tts_price_per_100: 0.3, // 配音每 100 個字台幣
  face_price: 0.1, // 用主角頭照畫圖，每張多加的台幣（參考照片要多算一點）
  stt_model: 'whisper-1', // 錄音轉文字（要每個字的時間點，所以用 whisper-1）
  stt_price_per_min: 0.2, // 錄音轉文字每分鐘台幣
  // ── 萬相 Wan 3.0 分鏡短劇（阿里雲百煉，國際版新加坡）──
  board_model: 'gpt-image-2', // 畫 9 格分鏡總圖（要照格子排版，便宜模型常排錯，所以用 gpt-image-2）
  board_price: 1.5, // 每張分鏡總圖台幣（實測約 NT$1.3）
  wan_endpoint: '', // https://你的WorkspaceId.ap-northeast-1.maas.aliyuncs.com（東京；東京、香港等 Global 地區比新加坡便宜）
  wan_model: 'wan3.0-video',
  wan_price_usd: { '480P': 0.041256, '720P': 0.082513, '1080P': 0.165025 }, // 每秒美金（Global 地區官方定價；新加坡是 0.05／0.1／0.2）
};

export async function getSettings() {
  const out = { ...SETTING_DEFAULTS };
  if (!process.env.SUPABASE_URL) return out;
  const { data } = await supabaseAdmin.from('vf_settings').select('key, value');
  for (const row of data || []) if (row.key in out) out[row.key] = row.value;
  return out;
}

export async function saveSettings(patch) {
  const rows = Object.entries(patch)
    .filter(([k]) => k in SETTING_DEFAULTS)
    .map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
  if (!rows.length) return;
  const { error } = await supabaseAdmin.from('vf_settings').upsert(rows);
  if (error) throw new Error(error.message);
}
