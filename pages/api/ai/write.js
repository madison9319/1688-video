import { requireMemberApi } from '../../../lib/auth';
import { getSettings } from '../../../lib/settings';
import { chatJson } from '../../../lib/openai';
import { writePrompt } from '../../../lib/prompts';
import { withTextCharge, sendAiError } from '../../../lib/aiCharge';
import { WRITE_STYLES } from '../../../lib/studioOptions';

export const config = { maxDuration: 120 };

// AI 寫文案：回傳 { scripts: [[句子...], ...] }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const member = await requireMemberApi(req, res);
  if (!member) return;

  const topic = String(req.body?.topic || '').trim().slice(0, 800);
  const style = WRITE_STYLES.some(([k]) => k === req.body?.style) ? req.body.style : 'story';
  const seconds = Math.min(180, Math.max(15, Number(req.body?.seconds) || 60));
  const count = Math.min(5, Math.max(1, Number(req.body?.count) || 1));
  if (!topic) return res.status(400).json({ error: '請先寫你想講什麼' });

  try {
    const st = await getSettings();
    const { system, user } = writePrompt({ topic, style, seconds, count });
    const { result, points, balance } = await withTextCharge(
      { member, settings: st, reason: 'AI 寫文案', meta: { type: 'write', count } },
      () => chatJson({ model: st.text_model, system, user, maxTokens: 3000 + seconds * 40 * count })
    );
    const scripts = (Array.isArray(result.scripts) ? result.scripts : [])
      .map((s) => (Array.isArray(s) ? s : String(s).split('\n')).map((l) => String(l).trim()).filter(Boolean))
      .filter((s) => s.length);
    if (!scripts.length) throw new Error('AI 沒有寫出內容，請再試一次');
    res.status(200).json({ scripts, points, balance });
  } catch (e) {
    sendAiError(res, e);
  }
}
