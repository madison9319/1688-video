import { requireMemberApi } from '../../../lib/auth';
import { getSettings } from '../../../lib/settings';
import { supabaseAdmin } from '../../../lib/supabase';
import { adjustPoints } from '../../../lib/points';
import { wanStatus } from '../../../lib/wan';

export const config = { maxDuration: 30 };

// 問萬相做好了沒：回傳 { status: running|succeeded|failed, videoUrl, error, balance }
// 失敗會自動退點（同一筆工作只會退一次）
export default async function handler(req, res) {
  const member = await requireMemberApi(req, res);
  if (!member) return;
  res.setHeader('Cache-Control', 'no-store');

  const { data: job } = await supabaseAdmin.from('vf_jobs').select('*').eq('id', String(req.query.job || '')).eq('member_id', member.id).maybeSingle();
  if (!job) return res.status(404).json({ error: '找不到這個生成工作' });
  if (job.status === 'succeeded') return res.status(200).json({ status: 'succeeded', videoUrl: job.result_url });
  if (job.status !== 'pending') return res.status(200).json({ status: 'failed', error: job.error || '生成失敗，點數已經退回' });
  if (!job.provider_task_id) return res.status(200).json({ status: 'running' });

  let r;
  try {
    r = await wanStatus(await getSettings(), job.provider_task_id);
  } catch (e) {
    // 暫時問不到：當作還在做，下次再問
    return res.status(200).json({ status: 'running', note: e.message });
  }

  if (r.status === 'succeeded') {
    await supabaseAdmin.from('vf_jobs').update({ status: 'succeeded', result_url: r.videoUrl, finished_at: new Date().toISOString(), meta: { ...job.meta, usage: r.usage } }).eq('id', job.id).eq('status', 'pending');
    return res.status(200).json({ status: 'succeeded', videoUrl: r.videoUrl });
  }
  if (r.status === 'failed') {
    // 只有「還在 pending」的那一次會改成 refunded，所以不會重複退點
    const { data: flipped } = await supabaseAdmin.from('vf_jobs')
      .update({ status: 'refunded', error: r.error, finished_at: new Date().toISOString() })
      .eq('id', job.id).eq('status', 'pending').select('id');
    let balance;
    if (flipped?.length) {
      balance = await adjustPoints({ memberId: member.id, delta: Number(job.points), kind: 'refund', reason: '退點：萬相短劇生成失敗', meta: { job: job.id } }).catch(() => undefined);
    }
    return res.status(200).json({ status: 'failed', error: `萬相生成失敗（${r.error}），點數已經退回`, balance });
  }
  res.status(200).json({ status: 'running' });
}
