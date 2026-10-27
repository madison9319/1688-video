import { supabaseAdmin } from '../../../lib/supabase';
import { requireAdminApi } from '../../../lib/auth';

// 後台總覽數字
export default async function handler(req, res) {
  const s = requireAdminApi(req, res);
  if (!s) return;
  if (!process.env.SUPABASE_URL) return res.status(200).json({});

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [{ data: members }, { data: month }] = await Promise.all([
    supabaseAdmin.from('vf_members').select('points, status'),
    supabaseAdmin.from('vf_point_ledger').select('delta, kind, cost_twd').gte('created_at', monthStart.toISOString()),
  ]);

  let monthUsedPoints = 0, monthCost = 0, monthAdded = 0;
  for (const r of month || []) {
    if (r.kind === 'usage' || r.kind === 'refund') { monthUsedPoints -= Number(r.delta); monthCost += Number(r.cost_twd || 0); }
    if (r.kind === 'admin_add') monthAdded += Number(r.delta);
  }
  res.status(200).json({
    memberCount: (members || []).length,
    activeCount: (members || []).filter((m) => m.status === 'active').length,
    totalPoints: (members || []).reduce((a, m) => a + Number(m.points), 0),
    monthUsedPoints,
    monthCost,
    monthAdded,
  });
}
