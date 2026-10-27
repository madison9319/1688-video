import { requireMemberApi } from '../../../lib/auth';
import { getSettings } from '../../../lib/settings';
import { chatJson } from '../../../lib/openai';
import { dramaScriptPrompt } from '../../../lib/prompts';
import { withTextCharge, sendAiError } from '../../../lib/aiCharge';
import { cleanDrama, cleanScript } from '../../../lib/dramaInput';

export const config = { maxDuration: 120 };

// AI 寫短劇劇本：回傳 { script: { title, shots: [{ visual, lines: [{ who, text }] }] } }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const member = await requireMemberApi(req, res);
  if (!member) return;

  const d = cleanDrama(req.body);
  if (!d.product.name && !d.scenario) return res.status(400).json({ error: '請先寫產品或劇本情境' });

  try {
    const st = await getSettings();
    const { system, user } = dramaScriptPrompt(d);
    const { result, points, balance } = await withTextCharge(
      { member, settings: st, reason: 'AI 寫短劇劇本', meta: { type: 'drama-script' } },
      () => chatJson({ model: st.text_model, system, user, maxTokens: 5000 })
    );
    const script = cleanScript(result);
    if (!script || !script.shots.length) throw new Error('AI 沒有寫出劇本，請再試一次');
    // 一人分飾：台詞全部給主講的人
    if (d.roleMode === 'one') script.shots.forEach((x) => x.lines.forEach((l) => { l.who = d.narrator; }));
    res.status(200).json({ script, points, balance });
  } catch (e) {
    sendAiError(res, e);
  }
}
