// 瀏覽器端小工具

export async function api(url, method = 'GET', body) {
  const r = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (r.status === 401 && typeof window !== 'undefined') {
    const admin = url.startsWith('/api/admin');
    window.location.href = admin ? '/admin/login' : `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!r.ok) throw new Error(j.error || `發生錯誤（${r.status}）`);
  return j;
}

export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
