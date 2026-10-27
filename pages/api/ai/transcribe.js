import { requireMemberApi } from '../../../lib/auth';
import { getSettings } from '../../../lib/settings';
import { transcribe } from '../../../lib/openai';
import { STT_PROMPT } from '../../../lib/prompts';
import { adjustPoints, round2 } from '../../../lib/points';
import { sendAiError } from '../../../lib/aiCharge';

// 錄音檔已經在加速器轉成 16kHz 單聲道 mp3（10 分鐘約 2.4MB）
export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '4.4mb' } } };

const MAX_MIN = 15;

// 錄音轉文字：回傳 { duration, words: [{ w, s, e }], points, balance }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const member = await requireMemberApi(req, res);
  if (!member) return;

  const mp3 = Buffer.from(String(req.body?.b64 || ''), 'base64');
  const claimed = Number(req.body?.duration) || 0;
  if (!mp3.length) return res.status(400).json({ error: '沒有收到錄音' });
  if (claimed > MAX_MIN * 60) return res.status(400).json({ error: `錄音最長 ${MAX_MIN} 分鐘，請分段上傳` });

  try {
    const st = await getSettings();
    const estimate = round2((Math.max(claimed, 10) / 60) * st.stt_price_per_min * st.point_rate);
    if (Number(member.points) < estimate) {
      const e = new Error('點數不夠，請聯絡管理員加點');
      e.status = 402;
      throw e;
    }
    // 已經知道台詞（萬相短劇）：把台詞當提示，辨識會準很多
    const hint = String(req.body?.hint || '').trim().slice(0, 400);
    const r = await transcribe({ model: st.stt_model, mp3, prompt: hint ? `${hint}\n以下是台灣繁體中文的口語錄音，請用繁體中文。` : STT_PROMPT });
    if (!r.words.length) throw new Error('聽不出錄音裡有說話，請確認錄音有聲音');
    // 照 AI 回報的實際長度扣點
    const costTwd = (Math.max(r.duration, 10) / 60) * st.stt_price_per_min;
    const points = Math.max(0.01, round2(costTwd * st.point_rate));
    let balance;
    try {
      balance = await adjustPoints({ memberId: member.id, delta: -points, kind: 'usage', reason: '錄音轉文字', meta: { type: 'stt', seconds: Math.round(r.duration) }, costTwd });
    } catch (e) {
      balance = 0;
    }
    res.status(200).json({ duration: r.duration, words: r.words, points, balance });
  } catch (e) {
    sendAiError(res, e);
  }
}
