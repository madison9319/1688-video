import { useEffect, useRef, useState } from 'react';
import { buildSpec, checkReady, estimateSeconds } from '../../lib/studioState';
import { startRender, renderStatus, outputUrl, openFile, openOutputFolder } from '../../lib/accelerator';
import PostCaption from './PostCaption';

// 第 5 步：做影片
export default function StepRender({ p, pid, update, flush, goStep, ai }) {
  const [job, setJob] = useState(null); // { status, progress, message, file, fileName, preview }
  const [err, setErr] = useState('');
  const timer = useRef(null);
  const errs = checkReady(p);
  const blocking = errs.filter((e) => !/會被跳過/.test(e));
  useEffect(() => () => clearInterval(timer.current), []);

  const go = async (preview) => {
    setErr('');
    try {
      await flush();
      const { jobId } = await startRender(pid, buildSpec(p, { preview }));
      setJob({ status: 'running', progress: 0, message: '準備中', preview });
      clearInterval(timer.current);
      timer.current = setInterval(async () => {
        try {
          const s = await renderStatus(jobId);
          setJob({ ...s, preview });
          if (s.status !== 'running') {
            clearInterval(timer.current);
            if (s.status === 'done' && !preview) update((prev) => ({ ...prev, lastVideo: { file: s.file, fileName: s.fileName, at: Date.now() } }));
          }
        } catch (e) {
          clearInterval(timer.current);
          setErr(`跟加速器斷線了：${e.message}`);
          setJob(null);
        }
      }, 1000);
    } catch (e) { setErr(e.message); }
  };

  const running = job?.status === 'running';
  const done = job?.status === 'done' ? job : (!job && p.lastVideo) ? { ...p.lastVideo, status: 'done', old: true } : null;

  return (
    <div className="step">
      <h2>🎁 最後確認一下，就可以開始做了</h2>
      <div className="summary">
        <div><span>文稿</span><b>{p.lines.length} 句</b></div>
        <div><span>畫面</span><b>{p.scenes.filter((s) => s.file).length} 張圖</b></div>
        <div><span>聲音</span><b>{p.voice.mode === 'ai' ? 'AI 配音' : p.voice.mode === 'record' ? '自己的錄音' : '沒有人聲'}{p.bgm ? '＋音樂' : ''}</b></div>
        <div><span>大約長度</span><b>{estimateSeconds(p)} 秒</b></div>
      </div>
      {errs.length > 0 && (
        <div className="err">
          {errs.map((e) => <div key={e}>⚠️ {e}</div>)}
          <div className="row" style={{ marginTop: 6, gap: 6 }}>
            {[1, 2, 3].map((n) => <button key={n} className="btn sm" onClick={() => goStep(n)}>回第 {n} 步</button>)}
          </div>
        </div>
      )}

      <div className="fld" style={{ maxWidth: 420 }}>
        <label>影片清晰度</label>
        <select className="sel" value={p.output} onChange={(e) => update((prev) => ({ ...prev, output: e.target.value }))}>
          <option value="normal">1080p 普通（推薦，發社群很清楚）</option>
          <option value="high">1080p 高畫質（檔案比較大、做比較久）</option>
        </select>
      </div>
      <p className="mute" style={{ fontSize: 13 }}>做影片用的是你電腦上的加速器，不會扣點數。做的時候不要關掉黑色視窗。</p>

      <div className="row" style={{ margin: '12px 0' }}>
        <button className="btn lg" disabled={running || blocking.length > 0} onClick={() => go(true)}>👀 先試看 10 秒</button>
        <button className="btn pri lg" disabled={running || blocking.length > 0} onClick={() => go(false)}>🎬 開始做影片</button>
      </div>
      {err && <div className="err">{err}</div>}

      {running && (
        <div className="progress-box">
          <div className="mute">{job.preview ? '試看版' : '影片'}製作中，泡杯茶等一下…（{job.message}）</div>
          <div className="bar"><i style={{ width: `${job.progress}%` }} /></div>
          <b>{job.progress}%</b>
        </div>
      )}
      {job?.status === 'error' && <div className="err">做影片失敗：{job.error}</div>}

      {done && (
        <div className="done-box">
          <h3>{done.preview ? '👀 試看版做好了' : done.old ? '🎬 上次做好的影片' : '🎉 影片做好了！'}</h3>
          <video key={done.fileName} src={outputUrl(done.fileName)} controls playsInline className="result-video" />
          <div className="mute" style={{ fontSize: 13, wordBreak: 'break-all' }}>存在你的電腦：{done.file}</div>
          <div className="row">
            <button className="btn pri" onClick={() => openFile(done.file).catch((e) => setErr(e.message))}>📂 打開影片所在的資料夾</button>
            <button className="btn" onClick={() => openOutputFolder().catch(() => {})}>📁 打開成片資料夾</button>
          </div>
          <p className="mute" style={{ fontSize: 13, margin: 0 }}>影片已經在你的電腦裡了，直接上傳到 FB、IG、YouTube、抖音就可以。</p>
          {!done.preview && <PostCaption ai={ai} title={p.title.text} lines={p.lines.map((l) => l.text)} />}
        </div>
      )}
    </div>
  );
}
