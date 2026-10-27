import { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { requireAdminSSR } from '../../lib/auth';
import { api } from '../../lib/client';

export function getServerSideProps(ctx) {
  const g = requireAdminSSR(ctx);
  return g.redirect ? { redirect: g.redirect } : { props: { aiReady: !!process.env.OPENAI_API_KEY, wanReady: !!process.env.DASHSCOPE_API_KEY } };
}

export default function Settings({ aiReady, wanReady }) {
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/api/admin/settings').then((j) => setF(j.settings)).catch((e) => setErr(e.message));
  }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      const j = await api('/api/admin/settings', 'PUT', f);
      setF(j.settings);
      setMsg('已儲存');
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };

  return (
    <AdminLayout title="系統設定">
      <h1>系統設定</h1>
      {err && <div className="err">{err}</div>}
      {msg && <div className="ok">{msg}</div>}
      {!f ? <p className="mute">讀取中…</p> : (
        <form onSubmit={save} style={{ maxWidth: 620 }}>
          <div className="panel" style={{ display: 'grid', gap: 14 }}>
            <h2 style={{ margin: 0 }}>點數與匯率</h2>
            <div className="fld">
              <label>點數倍率</label>
              <input className="inp" type="number" step="0.01" value={f.point_rate} onChange={set('point_rate')} />
              <div className="help">扣的點數＝AI 實際成本（台幣）× 倍率。1＝照成本打平；之後開放給外面的人用，可以改成 1.5 或 2。</div>
            </div>
            <div className="fld">
              <label>美金匯率（1 USD ＝ NT$）</label>
              <input className="inp" type="number" step="0.01" value={f.usd_to_twd} onChange={set('usd_to_twd')} />
              <div className="help">OpenAI（AI 寫文案、畫圖、配音）收美金</div>
            </div>
            <div className="fld">
              <label>人民幣匯率（¥1 ＝ NT$）</label>
              <input className="inp" type="number" step="0.01" value={f.cny_to_twd} onChange={set('cny_to_twd')} />
              <div className="help">阿里雲萬相（分鏡短劇）收人民幣</div>
            </div>
          </div>
          <div className="panel" style={{ display: 'grid', gap: 14 }}>
            <h2 style={{ margin: 0 }}>AI 模型與價格</h2>
            <div className="help" style={{ fontSize: 13, color: 'var(--mute)' }}>
              AI 金鑰：{aiReady ? '✅ 已設定' : '❌ 還沒設定（要在主機的環境變數 OPENAI_API_KEY 填好）'}。價格都是台幣成本，扣點＝成本 × 點數倍率。
            </div>
            <div className="fld">
              <label>寫文案用的模型</label>
              <input className="inp" value={f.text_model} onChange={set('text_model')} />
              <div className="help">照實際用量扣點。美金價格（每 100 萬 tokens）：輸入
                <input className="inp" style={{ width: 80, display: 'inline-block', margin: '0 6px' }} type="number" step="0.01" value={f.text_price.input} onChange={(e) => setF({ ...f, text_price: { ...f.text_price, input: e.target.value } })} />
                輸出
                <input className="inp" style={{ width: 80, display: 'inline-block', margin: '0 6px' }} type="number" step="0.01" value={f.text_price.output} onChange={(e) => setF({ ...f, text_price: { ...f.text_price, output: e.target.value } })} />
              </div>
            </div>
            <div className="fld">
              <label>畫圖用的模型</label>
              <input className="inp" value={f.image_model} onChange={set('image_model')} />
              <div className="help">每張圖的台幣價格（換模型要一起改）：
                {[['low', '一般'], ['medium', '標準'], ['high', '精緻']].map(([q, l]) => (
                  <span key={q} style={{ whiteSpace: 'nowrap' }}> {l}
                    <input className="inp" style={{ width: 70, display: 'inline-block', margin: '0 6px' }} type="number" step="0.01" value={f.image_price[q]} onChange={(e) => setF({ ...f, image_price: { ...f.image_price, [q]: e.target.value } })} />
                  </span>
                ))}
                <span style={{ whiteSpace: 'nowrap' }}> 用主角頭照每張再加
                  <input className="inp" style={{ width: 70, display: 'inline-block', margin: '0 6px' }} type="number" step="0.01" value={f.face_price} onChange={set('face_price')} />
                </span>
              </div>
            </div>
            <div className="fld">
              <label>錄音轉文字用的模型（要有每個字的時間點，建議 whisper-1）</label>
              <input className="inp" value={f.stt_model} onChange={set('stt_model')} />
              <div className="help">每分鐘台幣
                <input className="inp" style={{ width: 80, display: 'inline-block', margin: '0 6px' }} type="number" step="0.01" value={f.stt_price_per_min} onChange={set('stt_price_per_min')} />
              </div>
            </div>
            <div className="fld">
              <label>配音用的模型</label>
              <input className="inp" value={f.tts_model} onChange={set('tts_model')} />
              <div className="help">每 100 個字台幣
                <input className="inp" style={{ width: 80, display: 'inline-block', margin: '0 6px' }} type="number" step="0.01" value={f.tts_price_per_100} onChange={set('tts_price_per_100')} />
              </div>
            </div>
          </div>
          <div className="panel" style={{ display: 'grid', gap: 14 }}>
            <h2 style={{ margin: 0 }}>萬相 Wan 3.0 分鏡短劇（阿里雲百煉）</h2>
            <div className="help" style={{ fontSize: 13, color: 'var(--mute)' }}>
              萬相金鑰：{wanReady ? '✅ 已設定' : '❌ 還沒設定（要在主機的環境變數 DASHSCOPE_API_KEY 填好）'}。端點、金鑰、模型必須是同一個地區。建議東京或香港（Global 地區，比新加坡便宜約 17%）。
            </div>
            <div className="fld">
              <label>畫 9 格分鏡總圖用的模型</label>
              <input className="inp" value={f.board_model} onChange={set('board_model')} />
              <div className="help">建議 gpt-image-2（便宜的模型常常排錯格子）。每張台幣
                <input className="inp" style={{ width: 80, display: 'inline-block', margin: '0 6px' }} type="number" step="0.01" value={f.board_price} onChange={set('board_price')} />
              </div>
            </div>
            <div className="fld">
              <label>端點網址</label>
              <input className="inp" value={f.wan_endpoint} onChange={set('wan_endpoint')} placeholder="https://你的WorkspaceId.ap-northeast-1.maas.aliyuncs.com（東京）" />
            </div>
            <div className="fld">
              <label>模型</label>
              <input className="inp" value={f.wan_model} onChange={set('wan_model')} />
              <div className="help">wan3.0-video（標準）；wan3.0-video-prime（比較快、比較貴）</div>
            </div>
            <div className="fld">
              <label>每秒價格（美金，照阿里雲帳單；有優惠時可以改低）</label>
              <div className="help">
                {['480P', '720P', '1080P'].map((r) => (
                  <span key={r} style={{ whiteSpace: 'nowrap' }}> {r}
                    <input className="inp" style={{ width: 80, display: 'inline-block', margin: '0 6px' }} type="number" step="0.001" value={f.wan_price_usd[r]} onChange={(e) => setF({ ...f, wan_price_usd: { ...f.wan_price_usd, [r]: e.target.value } })} />
                  </span>
                ))}
              </div>
              <div className="help">例：30 秒 720P ＝ 30 × {f.wan_price_usd['720P']} × {f.usd_to_twd} ≈ NT${Math.round(30 * Number(f.wan_price_usd['720P']) * Number(f.usd_to_twd))}</div>
            </div>
          </div>
          <div className="panel" style={{ display: 'grid', gap: 14 }}>
            <h2 style={{ margin: 0 }}>本機加速器</h2>
            <div className="fld">
              <label>下載網址</label>
              <input className="inp" value={f.accelerator_url} onChange={set('accelerator_url')} placeholder="https://…/1688影片加速器.zip" />
              <div className="help">會員在影片工廠按「下載本機加速器」會到這個網址</div>
            </div>
            <div className="fld">
              <label>最新版本</label>
              <input className="inp" value={f.accelerator_version} onChange={set('accelerator_version')} placeholder="1.0.0" />
              <div className="help">會員電腦上的加速器比這個版本舊，就會提醒他更新</div>
            </div>
          </div>
          <button className="btn pri lg" disabled={busy}>{busy ? '儲存中…' : '儲存設定'}</button>
        </form>
      )}
    </AdminLayout>
  );
}
