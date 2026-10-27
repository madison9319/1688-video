import { requireMemberApi } from '../../../lib/auth';
import { getSettings } from '../../../lib/settings';
import { chatJson } from '../../../lib/openai';
import { storyboardPrompt } from '../../../lib/prompts';
import { withTextCharge, sendAiError } from '../../../lib/aiCharge';

export const config = { maxDuration: 120 };

// 把文稿分成幾個畫面，每個畫面寫一段畫圖描述
// 回傳 { character, scenes: [{ from, to, prompt }] }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const member = await requireMemberApi(req, res);
  if (!member) return;

  const lines = (Array.isArray(req.body?.lines) ? req.body.lines : []).map((l) => String(l).trim().slice(0, 200)).filter(Boolean).slice(0, 200);
  if (!lines.length) return res.status(400).json({ error: '請先在第 1 步寫好文稿' });
  const count = Math.min(lines.length, Math.max(1, Number(req.body?.count) || 1), 40);
  const hasFace = !!req.body?.hasFace;

  try {
    const st = await getSettings();
    const { system, user } = storyboardPrompt({ lines, count, hasFace });
    const { result, points, balance } = await withTextCharge(
      { member, settings: st, reason: 'AI 規劃畫面', meta: { type: 'storyboard', count } },
      () => chatJson({ model: st.text_model, system, user, maxTokens: 2000 + count * 300 })
    );
    res.status(200).json({ character: String(result.character || ''), scenes: normalize(result.scenes, lines.length, count), points, balance });
  } catch (e) {
    sendAiError(res, e);
  }
}

// AI 偶爾分錯（重疊、漏句），這裡整理成連續、不重疊、涵蓋全部句子
function normalize(raw, n, count) {
  const list = (Array.isArray(raw) ? raw : [])
    .map((s) => ({ from: Math.floor(Number(s.from)), prompt: String(s.prompt || '').trim() }))
    .filter((s) => Number.isFinite(s.from) && s.from >= 0 && s.from < n && s.prompt)
    .sort((a, b) => a.from - b.from)
    .filter((s, i, arr) => i === 0 || s.from > arr[i - 1].from);
  if (!list.length) {
    // 完全不能用：平均分配
    return Array.from({ length: count }, (_, i) => ({ from: Math.floor((i * n) / count), to: Math.floor(((i + 1) * n) / count) - 1, prompt: '' }));
  }
  list[0].from = 0;
  return list.map((s, i) => ({ from: s.from, to: i + 1 < list.length ? list[i + 1].from - 1 : n - 1, prompt: s.prompt }));
}
