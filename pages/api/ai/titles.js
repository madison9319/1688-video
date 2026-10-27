import { requireMemberApi } from '../../../lib/auth';
import { getSettings } from '../../../lib/settings';
import { chatJson } from '../../../lib/openai';
import { titlesPrompt } from '../../../lib/prompts';
import { withTextCharge, sendAiError } from '../../../lib/aiCharge';

export const config = { maxDuration: 60 };

// AI 依文稿想 3 個標題（每個最多 12 字）
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const member = await requireMemberApi(req, res);
  if (!member) return;

  const lines = (Array.isArray(req.body?.lines) ? req.body.lines : []).map((l) => String(l).trim().slice(0, 200)).filter(Boolean).slice(0, 200);
  if (!lines.length) return res.status(400).json({ error: '請先在第 1 步寫好文稿' });

  try {
    const st = await getSettings();
    const { system, user } = titlesPrompt({ lines });
    const { result, points, balance } = await withTextCharge(
      { member, settings: st, reason: 'AI 想標題', meta: { type: 'titles' } },
      () => chatJson({ model: st.text_model, system, user, maxTokens: 1500 })
    );
    // 不硬切字數（切了會變半句話）；太長的放後面，影片上會自動排成兩行
    const titles = (Array.isArray(result.titles) ? result.titles : [])
      .map((t) => String(t).trim().replace(/^["「『]|["」』]$/g, '').slice(0, 24))
      .filter(Boolean)
      .sort((a, b) => (a.length > 14) - (b.length > 14))
      .slice(0, 3);
    if (!titles.length) throw new Error('AI 沒有想出標題，請再試一次');
    res.status(200).json({ titles, points, balance });
  } catch (e) {
    sendAiError(res, e);
  }
}
