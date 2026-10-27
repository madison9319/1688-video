import { supabaseAdmin } from './supabase';

// 所有加點、扣點都走資料庫的 vf_adjust_points（一次完成，不會扣成負數）
// 成功回傳新的餘額；餘額不夠丟出 code = 'INSUFFICIENT_POINTS' 的錯誤
export async function adjustPoints({ memberId, delta, kind, reason, meta = {}, costTwd = null, adminId = null }) {
  const { data, error } = await supabaseAdmin.rpc('vf_adjust_points', {
    p_member: memberId,
    p_delta: round2(delta),
    p_kind: kind,
    p_reason: reason,
    p_meta: meta,
    p_cost_twd: costTwd == null ? null : round2(costTwd),
    p_admin: adminId,
  });
  if (error) {
    const e = new Error(
      /INSUFFICIENT_POINTS/.test(error.message) ? '點數不夠，請聯絡管理員加點'
        : /MEMBER_NOT_FOUND/.test(error.message) ? '找不到這個會員'
          : error.message
    );
    e.code = /INSUFFICIENT_POINTS/.test(error.message) ? 'INSUFFICIENT_POINTS' : 'DB_ERROR';
    throw e;
  }
  return Number(data);
}

// AI 用量扣點（第二階段起，每個 AI 功能都呼叫這個）
// costTwd：實際成本（台幣）；扣的點數＝成本 × 後台設定的點數倍率（現在是 1，照成本打平）
export async function chargeUsage({ memberId, costTwd, reason, meta, rate = 1 }) {
  const pts = Math.max(0.01, round2(costTwd * rate));
  return adjustPoints({ memberId, delta: -pts, kind: 'usage', reason, meta, costTwd });
}

// AI 失敗時把點數退回
export async function refundUsage({ memberId, points, reason, meta }) {
  return adjustPoints({ memberId, delta: Math.abs(points), kind: 'refund', reason, meta });
}

export function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
