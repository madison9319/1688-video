import { requireMemberApi } from '../../../lib/auth';
import { getSettings } from '../../../lib/settings';
import { generateImage, editImage } from '../../../lib/openai';
import { imagePrompt } from '../../../lib/prompts';
import { withFixedCharge, sendAiError } from '../../../lib/aiCharge';
import { ASPECTS, IMAGE_STYLES, QUALITIES } from '../../../lib/studioOptions';

export const config = { maxDuration: 300, api: { responseLimit: '8mb', bodyParser: { sizeLimit: '3mb' } } };

// AI 畫一張圖：回傳 { b64（JPEG）, points, balance }
// 有 faceB64（主角頭照）→ 照這張臉畫
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const member = await requireMemberApi(req, res);
  if (!member) return;

  const prompt = String(req.body?.prompt || '').trim().slice(0, 2000);
  const character = String(req.body?.character || '').trim().slice(0, 400);
  const style = IMAGE_STYLES.some(([k]) => k === req.body?.style) ? req.body.style : 'photo';
  const quality = QUALITIES.some(([k]) => k === req.body?.quality) ? req.body.quality : 'medium';
  const aspect = ASPECTS.find(([k]) => k === req.body?.aspect) || ASPECTS[0];
  const face = req.body?.faceB64 ? Buffer.from(String(req.body.faceB64), 'base64') : null;
  if (!prompt) return res.status(400).json({ error: '請先寫這張圖要畫什麼' });
  if (face && face.length > 2 * 1024 * 1024) return res.status(400).json({ error: '頭照太大' });

  try {
    const st = await getSettings();
    const costTwd = (Number(st.image_price?.[quality]) || 1) + (face ? Number(st.face_price) || 0 : 0);
    const fullPrompt = imagePrompt({ prompt, style, character, withFace: !!face });
    const { result, points, balance } = await withFixedCharge(
      { member, costTwd, rate: st.point_rate, reason: face ? 'AI 畫圖（固定主角）' : 'AI 畫圖', meta: { type: 'image', quality, model: st.image_model, face: !!face } },
      () => (face
        ? editImage({ model: st.image_model, prompt: fullPrompt, size: aspect[4], quality, refJpeg: face })
        : generateImage({ model: st.image_model, prompt: fullPrompt, size: aspect[4], quality }))
    );
    res.status(200).json({ b64: result.b64, points, balance });
  } catch (e) {
    sendAiError(res, e);
  }
}
