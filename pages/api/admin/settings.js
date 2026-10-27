import { requireAdminApi } from '../../../lib/auth';
import { getSettings, saveSettings } from '../../../lib/settings';

export default async function handler(req, res) {
  const s = requireAdminApi(req, res);
  if (!s) return;

  if (req.method === 'GET') return res.status(200).json({ settings: await getSettings() });

  if (req.method === 'PUT') {
    const b = req.body || {};
    const num = (v, min, max) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max ? n : null;
    };
    const patch = {};
    if (b.usd_to_twd != null) {
      if ((patch.usd_to_twd = num(b.usd_to_twd, 1, 100)) == null) return res.status(400).json({ error: '美金匯率不正確' });
    }
    if (b.cny_to_twd != null) {
      if ((patch.cny_to_twd = num(b.cny_to_twd, 0.1, 20)) == null) return res.status(400).json({ error: '人民幣匯率不正確' });
    }
    if (b.point_rate != null) {
      if ((patch.point_rate = num(b.point_rate, 0.1, 10)) == null) return res.status(400).json({ error: '點數倍率要在 0.1～10 之間' });
    }
    if (b.accelerator_url != null) {
      const u = String(b.accelerator_url).trim();
      if (u && !/^https:\/\//.test(u)) return res.status(400).json({ error: '下載網址要用 https:// 開頭' });
      patch.accelerator_url = u;
    }
    if (b.accelerator_version != null) {
      const v = String(b.accelerator_version).trim();
      if (!/^\d+\.\d+\.\d+$/.test(v)) return res.status(400).json({ error: '版本號格式像 1.0.0' });
      patch.accelerator_version = v;
    }
    if (b.face_price != null) {
      if ((patch.face_price = num(b.face_price, 0, 20)) == null) return res.status(400).json({ error: '頭照加價不正確' });
    }
    if (b.stt_price_per_min != null) {
      if ((patch.stt_price_per_min = num(b.stt_price_per_min, 0.01, 20)) == null) return res.status(400).json({ error: '錄音轉文字價格不正確' });
    }
    if (b.wan_endpoint != null) {
      const u = String(b.wan_endpoint).trim().replace(/\/+$/, '');
      if (u && !/^https:\/\/[a-z0-9.-]+\.aliyuncs\.com$/.test(u)) return res.status(400).json({ error: '萬相端點要像 https://你的WorkspaceId.ap-northeast-1.maas.aliyuncs.com（後面不要加路徑）' });
      patch.wan_endpoint = u;
    }
    if (b.wan_price_usd != null) {
      const wp = {};
      for (const r of ['480P', '720P', '1080P']) {
        if ((wp[r] = num(b.wan_price_usd[r], 0.001, 5)) == null) return res.status(400).json({ error: '萬相每秒價格不正確' });
      }
      patch.wan_price_usd = wp;
    }
    if (b.board_price != null) {
      if ((patch.board_price = num(b.board_price, 0.01, 50)) == null) return res.status(400).json({ error: '分鏡總圖價格不正確' });
    }
    for (const k of ['text_model', 'image_model', 'tts_model', 'stt_model', 'wan_model', 'board_model']) {
      if (b[k] == null) continue;
      const v = String(b[k]).trim();
      if (!/^[a-z0-9][a-z0-9.\-]{1,60}$/i.test(v)) return res.status(400).json({ error: `模型名稱不正確：${v}` });
      patch[k] = v;
    }
    if (b.text_price != null) {
      const input = num(b.text_price.input, 0, 100), output = num(b.text_price.output, 0, 500);
      if (input == null || output == null) return res.status(400).json({ error: '文字模型價格不正確' });
      patch.text_price = { input, output };
    }
    if (b.image_price != null) {
      const ip = {};
      for (const q of ['low', 'medium', 'high']) {
        if ((ip[q] = num(b.image_price[q], 0.01, 100)) == null) return res.status(400).json({ error: '圖片價格要在 0.01～100 之間' });
      }
      patch.image_price = ip;
    }
    if (b.tts_price_per_100 != null) {
      if ((patch.tts_price_per_100 = num(b.tts_price_per_100, 0.01, 20)) == null) return res.status(400).json({ error: '配音價格不正確' });
    }
    try {
      await saveSettings(patch);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
    return res.status(200).json({ settings: await getSettings() });
  }

  res.status(405).json({ error: 'Method Not Allowed' });
}
