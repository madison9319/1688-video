import { requireMemberApi } from '../../../lib/auth';
import { getSettings } from '../../../lib/settings';

// 會員自己的資料：名字、剩餘點數、加速器下載網址與最新版本
export default async function handler(req, res) {
  const m = await requireMemberApi(req, res);
  if (!m) return;
  const st = await getSettings();
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    member: { name: m.name, username: m.username, points: Number(m.points) },
    accelerator: { url: st.accelerator_url, version: st.accelerator_version },
    // 給畫面「先顯示要用幾點」用
    prices: {
      aiReady: !!process.env.OPENAI_API_KEY,
      image: Object.fromEntries(Object.entries(st.image_price || {}).map(([k, v]) => [k, Math.round(v * st.point_rate * 100) / 100])),
      ttsPer100: Math.round(st.tts_price_per_100 * st.point_rate * 100) / 100,
      face: Math.round(st.face_price * st.point_rate * 100) / 100,
      sttPerMin: Math.round(st.stt_price_per_min * st.point_rate * 100) / 100,
    },
  });
}
