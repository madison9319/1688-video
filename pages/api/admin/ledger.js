import { supabaseAdmin } from '../../../lib/supabase';
import { requireAdminApi } from '../../../lib/auth';

const PAGE = 50;

// 點數明細（可以篩選會員、種類）
export default async function handler(req, res) {
  const s = requireAdminApi(req, res);
  if (!s) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const page = Math.max(1, Number(req.query.page) || 1);
  let q = supabaseAdmin.from('vf_point_ledger')
    .select('id, member_id, delta, balance_after, kind, reason, cost_twd, created_at, vf_members(name, username)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (req.query.member) q = q.eq('member_id', req.query.member);
  if (req.query.kind) q = q.eq('kind', req.query.kind);

  const { data, count, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ rows: data || [], total: count || 0, pages: Math.max(1, Math.ceil((count || 0) / PAGE)) });
}
