// 前台、後台共用的顯示格式（瀏覽器端也能用，不碰資料庫）

export function fmtPoints(n) {
  const v = Number(n || 0);
  return Number.isInteger(v) ? v.toLocaleString('zh-TW') : v.toLocaleString('zh-TW', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

export const KIND_LABEL = {
  admin_add: '管理員加點',
  admin_deduct: '管理員扣點',
  usage: 'AI 使用',
  refund: '失敗退點',
};
