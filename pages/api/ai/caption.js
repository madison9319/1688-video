import { requireMemberApi } from '../../../lib/auth';
import { getSettings } from '../../../lib/settings';
import { chatJson } from '../../../lib/openai';
import { captionPrompt } from '../../../lib/prompts';
import { withTextCharge, sendAiError } from '../../../lib/aiCharge';

export const config = { maxDuration: 60 };

// AI 寫發文文案：platform＝fb／ig／yt／tiktok，回傳 { text }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const member = await requireMemberApi(req, res);
  if (!member) return;

  const lines = (Array.isArray(req.body?.lines) ? req.body.lines : []).map((l) => String(l).trim().slice(0, 200)).filter(Boolean).slice(0, 200);
  const title = String(req.body?.title || '').trim().slice(0, 40);
  const platform = ['fb', 'ig', 'yt', 'tiktok'].includes(req.body?.platform) ? req.body.platform : 'fb';
  if (!lines.length) return res.status(400).json({ error: '這支影片沒有文稿，AI 不知道要寫什麼' });

  try {
    const st = await getSettings();
    const { system, user } = captionPrompt({ title, lines, platform });
    const { result, points, balance } = await withTextCharge(
      { member, settings: st, reason: 'AI 寫發文文案', meta: { type: 'caption', platform } },
      () => chatJson({ model: st.text_model, system, user, maxTokens: 2500 })
    );
    const text = String(result.text || '').trim();
    if (!text) throw new Error('AI 沒有寫出文案，請再試一次');
    res.status(200).json({ text, points, balance });
  } catch (e) {
    sendAiError(res, e);
  }
}
