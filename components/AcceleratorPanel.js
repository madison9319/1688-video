import { useCallback, useEffect, useState } from 'react';
import { checkAccelerator, testRender, openOutputFolder, chooseOutputFolder, isOlder } from '../lib/accelerator';

// 本機加速器狀態：每 5 秒偵測一次；沒開就教他下載、開啟
export default function AcceleratorPanel({ download }) {
  const [st, setSt] = useState(null); // null＝偵測中
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const refresh = useCallback(async () => setSt(await checkAccelerator()), []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const run = (label, fn, okText) => async () => {
    setBusy(label); setErr(''); setMsg('');
    try {
      const j = await fn();
      if (okText) setMsg(okText(j));
      refresh();
    } catch (e) {
      setErr(e.message);
    }
    setBusy('');
  };

  if (!st) return <div className="accel"><div className="hd"><span className="dot" />正在偵測本機加速器…</div></div>;

  if (!st.online) {
    return (
      <div className="accel off">
        <div className="hd"><span className="dot" />還沒偵測到本機加速器</div>
        <div>做影片要用你自己的電腦剪，速度比較快。第一次使用請照下面做（只要做一次）：</div>
        <ol>
          <li>
            {download.url
              ? <a className="btn acc sm" href={download.url} target="_blank" rel="noreferrer">⬇ 下載本機加速器</a>
              : <span className="mute">（管理員還沒放下載網址，請跟管理員拿檔案）</span>}
          </li>
          <li>下載好的壓縮檔按右鍵 →「解壓縮全部」，放到桌面</li>
          <li>打開資料夾，點兩下 <code>1688影片加速器.exe</code>（第一次 Windows 可能會跳藍色警告：按「其他資訊」→「仍要執行」）</li>
          <li>黑色視窗出現「加速器已經開好了」就完成，<b>做影片時不要關掉它</b></li>
          <li>回到這個網頁，幾秒後這裡就會變成綠色。如果瀏覽器跳出「要允許存取本機網路裝置嗎」，請按「允許」</li>
        </ol>
      </div>
    );
  }

  const old = download.version && isOlder(st.version, download.version);
  return (
    <div className="accel on">
      <div className="hd"><span className="dot" />本機加速器已連線<span className="tag green">版本 {st.version}</span></div>
      {old && (
        <div className="err" style={{ margin: 0 }}>
          有新版加速器（{download.version}）。請關掉黑色視窗，重新下載解壓縮後再打開。
          {download.url && <> <a href={download.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>下載新版</a></>}
        </div>
      )}
      {!st.ffmpeg && <div className="err" style={{ margin: 0 }}>加速器少了剪片程式（ffmpeg.exe），請重新下載加速器完整解壓縮。</div>}
      <div>做好的影片會存在：<code>{st.outputDir}</code></div>
      <div className="row">
        <button className="btn pri" disabled={!!busy || !st.ffmpeg} onClick={run('test', testRender, (j) => `✅ 測試影片做好了！花了 ${j.seconds} 秒，存在：${j.file}`)}>
          {busy === 'test' ? '做測試影片中…' : '🎬 做一支 5 秒測試影片'}
        </button>
        <button className="btn" disabled={!!busy} onClick={run('open', openOutputFolder)}>📂 打開影片資料夾</button>
        <button className="btn" disabled={!!busy} onClick={run('choose', chooseOutputFolder, (j) => (j.outputDir ? `已改成存在：${j.outputDir}` : '沒有變更'))}>
          {busy === 'choose' ? '請在跳出的視窗選資料夾…' : '🗂 改存檔資料夾'}
        </button>
      </div>
      {msg && <div className="ok" style={{ margin: 0 }}>{msg}</div>}
      {err && <div className="err" style={{ margin: 0 }}>{err}</div>}
    </div>
  );
}
