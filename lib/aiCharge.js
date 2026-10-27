import { adjustPoints, chargeUsage, refundUsage, round2 } from './points';
import { textCostUsd } from './openai';

// 固定價格的 AI（畫圖、配音）：先扣點 → 做 → 失敗就退點
// 回傳 { result, points, balance }
export async function withFixedCharge({ member, costTwd, rate, reason, meta }, fn) {
  const points = Math.max(0.01, round2(costTwd * rate));
  let balance = await chargeUsage({ memberId: member.id, costTwd, rate, reason, meta });
  try {
    const result = await fn();
    return { result, points, balance };
  } catch (e) {
    balance = await refundUsage({ memberId: member.id, points, reason: `退點：${reason}`, meta }).catch(() => balance);
    e.balance = balance;
    throw e;
  }
}

// 照用量算的 AI（寫文案）：先確認還有點數 → 做 → 照實際 tokens 扣
export async function withTextCharge({ member, settings, reason, meta }, fn) {
  if (Number(member.points) < 0.1) {
    const e = new Error('點數不夠，請聯絡管理員加點');
    e.status = 402;
    throw e;
  }
  const out = await fn();
  const costTwd = textCostUsd(out.usage, settings.text_price) * settings.usd_to_twd;
  const points = Math.max(0.01, round2(costTwd * settings.point_rate));
  let balance;
  try {
    balance = await adjustPoints({ memberId: member.id, delta: -points, kind: 'usage', reason, meta: { ...meta, usage: out.usage }, costTwd });
  } catch (e) {
    // 剛好被同時扣光：這次不另外扣，結果照樣給
    balance = 0;
  }
  return { result: out.data, points, balance };
}

export function sendAiError(res, e) {
  res.status(e.status || (e.code === 'INSUFFICIENT_POINTS' ? 402 : 500)).json({ error: e.message, balance: e.balance });
}
