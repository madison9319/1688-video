import { requireAdminApi } from '../../../lib/auth';
import { adjustPoints, round2 } from '../../../lib/points';

// 後台手動加點／扣點
export default async function handler(req, res) {
  const s = requireAdminApi(req, res);
  if (!s) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { memberId, reason } = req.body || {};
  const amount = round2(req.body?.amount);
  const type = req.body?.type === 'deduct' ? 'deduct' : 'add';
  if (!memberId) return res.status(400).json({ error: '缺少會員' });
  if (!(amount > 0) || amount > 1000000) return res.status(400).json({ error: '請輸入正確的點數' });

  try {
    const balance = await adjustPoints({
      memberId,
      delta: type === 'add' ? amount : -amount,
      kind: type === 'add' ? 'admin_add' : 'admin_deduct',
      reason: String(reason || '').trim() || (type === 'add' ? '管理員加點' : '管理員扣點'),
      adminId: s.id,
    });
    res.status(200).json({ ok: true, balance });
  } catch (e) {
    res.status(400).json({ error: e.code === 'INSUFFICIENT_POINTS' ? '會員點數不夠扣' : e.message });
  }
}
