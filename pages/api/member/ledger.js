import { supabaseAdmin } from '../../../lib/supabase';
import { requireMemberApi } from '../../../lib/auth';

const PAGE = 30;

// 會員自己的點數明細（不顯示成本）
export default async function handler(req, res) {
  const m = await requireMemberApi(req, res);
  if (!m) return;
  const page = Math.max(1, Number(req.query.page) || 1);
  const { data, count, error } = await supabaseAdmin.from('vf_point_ledger')
    .select('id, delta, balance_after, kind, reason, created_at', { count: 'exact' })
    .eq('member_id', m.id)
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ rows: data || [], pages: Math.max(1, Math.ceil((count || 0) / PAGE)) });
}
