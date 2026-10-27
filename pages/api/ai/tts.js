import { requireMemberApi } from '../../../lib/auth';
import { getSettings } from '../../../lib/settings';
import { speech } from '../../../lib/openai';
import { ttsInstructions } from '../../../lib/prompts';
import { withFixedCharge, sendAiError } from '../../../lib/aiCharge';
import { VOICES, TONES } from '../../../lib/studioOptions';

export const config = { maxDuration: 120 };

// AI 配音一句：回傳 { b64（mp3）, points, balance }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const member = await requireMemberApi(req, res);
  if (!member) return;

  const text = String(req.body?.text || '').trim().slice(0, 600);
  const voice = VOICES.some(([k]) => k === req.body?.voice) ? req.body.voice : 'nova';
  const tone = TONES.some(([k]) => k === req.body?.tone) ? req.body.tone : 'natural';
  const speed = Math.min(1.5, Math.max(0.75, Number(req.body?.speed) || 1));
  if (!text) return res.status(400).json({ error: '這一句是空白的' });

  try {
    const st = await getSettings();
    const costTwd = Math.max(0.02, (text.length / 100) * Number(st.tts_price_per_100));
    const { result, points, balance } = await withFixedCharge(
      { member, costTwd, rate: st.point_rate, reason: 'AI 配音', meta: { type: 'tts', chars: text.length, voice } },
      () => speech({ model: st.tts_model, voice, text, speed, instructions: ttsInstructions(tone) })
    );
    res.status(200).json({ b64: result.toString('base64'), points, balance });
  } catch (e) {
    sendAiError(res, e);
  }
}
