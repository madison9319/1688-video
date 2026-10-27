import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../../../lib/supabase';
import { requireAdminApi } from '../../../lib/auth';

const COLS = 'id, username, name, note, points, status, last_login_at, created_at';

// 會員管理：GET 列表（含本月用量）、POST 新增、PATCH 修改（名字/備註/停用/重設密碼）
export default async function handler(req, res) {
  const s = requireAdminApi(req, res);
  if (!s) return;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin.from('vf_members').select(COLS).order('created_at');
    if (error) return res.status(500).json({ error: error.message });

    // 本月 AI 用量（扣掉的點數、實際成本）
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { data: usage } = await supabaseAdmin.from('vf_point_ledger')
      .select('member_id, delta, cost_twd, kind')
      .in('kind', ['usage', 'refund'])
      .gte('created_at', monthStart.toISOString());
    const used = {};
    for (const u of usage || []) {
      const m = (used[u.member_id] ||= { points: 0, cost: 0 });
      m.points -= Number(u.delta);
      m.cost += Number(u.cost_twd || 0);
    }
    return res.status(200).json({
      members: (data || []).map((m) => ({ ...m, month_points: used[m.id]?.points || 0, month_cost: used[m.id]?.cost || 0 })),
    });
  }

  if (req.method === 'POST') {
    const username = String(req.body?.username || '').trim();
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) return res.status(400).json({ error: '帳號要 3～30 個英文字母或數字' });
    if (!name) return res.status(400).json({ error: '請填寫名字' });
    if (password.length < 6) return res.status(400).json({ error: '密碼至少 6 個字' });

    const { data, error } = await supabaseAdmin.from('vf_members')
      .insert({ username, name, note: String(req.body?.note || '').trim() || null, password_hash: bcrypt.hashSync(password, 10) })
      .select(COLS).single();
    if (error) return res.status(400).json({ error: /duplicate|unique/i.test(error.message) ? '這個帳號已經有人用了' : error.message });
    return res.status(200).json({ member: data });
  }

  if (req.method === 'PATCH') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: '缺少會員' });
    const patch = {};
    if (req.body.name != null) {
      patch.name = String(req.body.name).trim();
      if (!patch.name) return res.status(400).json({ error: '名字不能空白' });
    }
    if (req.body.note != null) patch.note = String(req.body.note).trim() || null;
    if (req.body.status != null) {
      if (!['active', 'disabled'].includes(req.body.status)) return res.status(400).json({ error: '狀態不正確' });
      patch.status = req.body.status;
    }
    if (req.body.password) {
      if (String(req.body.password).length < 6) return res.status(400).json({ error: '密碼至少 6 個字' });
      patch.password_hash = bcrypt.hashSync(String(req.body.password), 10);
    }
    const { data, error } = await supabaseAdmin.from('vf_members').update(patch).eq('id', id).select(COLS).single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ member: data });
  }

  res.status(405).json({ error: 'Method Not Allowed' });
}
