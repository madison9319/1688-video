import { requireMemberApi } from '../../../lib/auth';
import { getSettings } from '../../../lib/settings';
import { supabaseAdmin } from '../../../lib/supabase';
import { adjustPoints, round2 } from '../../../lib/points';
import { submitWan, wanCostTwd } from '../../../lib/wan';
import { wanPrompt, talkPrompt } from '../../../lib/prompts';
import { cleanDrama, b64Image } from '../../../lib/dramaInput';
import { sendAiError } from '../../../lib/aiCharge';

export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '4.4mb' } } };

const RES = ['480P', '720P', '1080P'];
const RATIO = ['9:16', '16:9', '1:1'];

// 送出萬相短劇：先扣點、記一筆工作，再送給萬相。回傳 { jobId, points, balance }
// 只看價錢（不送出）：body.quote = true → 回傳 { points }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const member = await requireMemberApi(req, res);
  if (!member) return;

  const d = cleanDrama(req.body);
  const duration = Math.min(30, Math.max(2, Math.round(Number(req.body?.duration) || d.seconds)));
  const resolution = RES.includes(req.body?.resolution) ? req.body.resolution : '720P';
  const ratio = RATIO.includes(req.body?.ratio) ? req.body.ratio : '9:16';
  const audio = req.body?.audio !== false;

  let st;
  try {
    st = await getSettings();
  } catch (e) {
    return sendAiError(res, e);
  }
  const costTwd = wanCostTwd(st, { duration, resolution });
  const points = Math.max(0.01, round2(costTwd * st.point_rate));
  if (req.body?.quote) return res.status(200).json({ points });

  if (!d.script?.shots?.length) return res.status(400).json({ error: '請先寫好劇本' });
  const cells = (Array.isArray(req.body?.cells) ? req.body.cells : []).slice(0, 9).map((b) => b64Image(b, 2 * 1024 * 1024));
  if (!cells.length || cells.some((c) => !c)) return res.status(400).json({ error: '分鏡圖還沒準備好（每一格都要有圖）' });
  const product = req.body?.productB64 ? b64Image(req.body.productB64, 2 * 1024 * 1024) : null;
  if (cells.length + (product ? 1 : 0) > 10) return res.status(400).json({ error: '圖片太多（萬相最多 10 張）' });

  // 照片開口說話：只有一張照片
  if (d.mode === 'talk' && cells.length !== 1) return res.status(400).json({ error: '照片開口說話只要一張照片' });
  const prompt = d.mode === 'talk' ? talkPrompt(d, { duration }) : wanPrompt(d, { duration, cells: cells.length, hasProduct: !!product });
  const images = [...cells, ...(product ? [product] : [])].map((b) => `data:image/jpeg;base64,${b.toString('base64')}`);

  // ① 先扣點
  let balance;
  try {
    balance = await adjustPoints({ memberId: member.id, delta: -points, kind: 'usage', reason: `${d.mode === 'talk' ? '照片開口說話' : '萬相短劇'} ${duration} 秒 ${resolution}`, meta: { type: 'wan', duration, resolution }, costTwd });
  } catch (e) {
    return sendAiError(res, e);
  }
  const { data: job, error } = await supabaseAdmin.from('vf_jobs')
    .insert({ member_id: member.id, kind: 'wan', points, cost_twd: round2(costTwd), meta: { duration, resolution, ratio, title: d.script.title } })
    .select('id').single();
  if (error) {
    await adjustPoints({ memberId: member.id, delta: points, kind: 'refund', reason: '退點：萬相短劇（系統錯誤）' }).catch(() => {});
    return res.status(500).json({ error: `系統錯誤：${error.message}` });
  }

  // ② 送給萬相；失敗就退點
  try {
    const taskId = await submitWan(st, { prompt, images, duration, resolution, ratio, audio });
    await supabaseAdmin.from('vf_jobs').update({ provider_task_id: taskId }).eq('id', job.id);
    res.status(200).json({ jobId: job.id, points, balance });
  } catch (e) {
    await supabaseAdmin.from('vf_jobs').update({ status: 'refunded', error: e.message, finished_at: new Date().toISOString() }).eq('id', job.id);
    e.balance = await adjustPoints({ memberId: member.id, delta: points, kind: 'refund', reason: '退點：萬相短劇送出失敗' }).catch(() => balance);
    sendAiError(res, e);
  }
}
