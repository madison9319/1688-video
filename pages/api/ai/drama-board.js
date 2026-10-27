import { requireMemberApi } from '../../../lib/auth';
import { getSettings } from '../../../lib/settings';
import { generateImage, editImage } from '../../../lib/openai';
import { boardPrompt } from '../../../lib/prompts';
import { withFixedCharge, sendAiError } from '../../../lib/aiCharge';
import { cleanDrama, b64Image } from '../../../lib/dramaInput';

export const config = { maxDuration: 300, api: { responseLimit: '8mb', bodyParser: { sizeLimit: '4.4mb' } } };

const LABEL = { female: 'the woman', male: 'the man', product: 'the product' };

// AI 畫 9 格分鏡總圖：refs＝[{ kind: female|male|product, b64 }]（最多 4 張）
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const member = await requireMemberApi(req, res);
  if (!member) return;

  const d = cleanDrama(req.body);
  if (!d.script?.shots?.length) return res.status(400).json({ error: '請先寫好劇本' });
  const refs = (Array.isArray(req.body?.refs) ? req.body.refs : []).slice(0, 4)
    .map((r) => ({ kind: LABEL[r?.kind] ? r.kind : 'product', buf: b64Image(r?.b64) }))
    .filter((r) => r.buf);
  const label = refs.length
    ? `Reference photos in order: ${refs.map((r, i) => `photo ${i + 1} is ${LABEL[r.kind]}`).join('; ')}. Keep their faces and the product exactly like the photos.`
    : '';

  try {
    const st = await getSettings();
    const quality = 'medium';
    const costTwd = (Number(st.board_price) || 1.5) + refs.length * (Number(st.face_price) || 0);
    const prompt = boardPrompt(d, label);
    const { result, points, balance } = await withFixedCharge(
      { member, costTwd, rate: st.point_rate, reason: 'AI 畫分鏡總圖', meta: { type: 'drama-board', refs: refs.length, model: st.board_model } },
      () => (refs.length
        ? editImage({ model: st.board_model, prompt, size: '1024x1536', quality, refs: refs.map((r) => r.buf) })
        : generateImage({ model: st.board_model, prompt, size: '1024x1536', quality }))
    );
    res.status(200).json({ b64: result.b64, points, balance });
  } catch (e) {
    sendAiError(res, e);
  }
}
