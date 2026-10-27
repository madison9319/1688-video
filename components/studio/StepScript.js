import { useEffect, useState } from 'react';
import { WRITE_STYLES } from '../../lib/studioOptions';
import { syncLines, autoSplit, estimateSeconds, uid } from '../../lib/studioState';
import { planCuts, wordsToLines } from '../../lib/recording';
import RecordingPanel from './RecordingPanel';

// 第 1 步：文稿（自己貼、AI 幫我寫，或上傳自己的錄音自動轉文字）
export default function StepScript({ p, pid, update, ai, prices, busy, setBusy }) {
  const [text, setText] = useState(p.lines.map((l) => l.text).join('\n'));
  const [open, setOpen] = useState(!p.lines.length);
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState('story');
  const [seconds, setSeconds] = useState(60);
  const [drafts, setDrafts] = useState([]);
  const [err, setErr] = useState('');

  // 換專案時重新載入文字
  useEffect(() => { setText(p.lines.map((l) => l.text).join('\n')); }, [p._loadedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (t) => update((prev) => ({ ...prev, lines: syncLines(prev.lines, t) }));
  const onChange = (e) => { setText(e.target.value); commit(e.target.value); };

  const write = async () => {
    setErr(''); setBusy('write');
    try {
      const j = await ai('write', { topic, style, seconds, count: 1 });
      setDrafts(j.scripts);
    } catch (e) { setErr(e.message); }
    setBusy('');
  };
  const useDraft = (lines) => {
    const t = lines.join('\n');
    setText(t); commit(t); setDrafts([]); setOpen(false);
  };
  const split = () => { const t = autoSplit(text); setText(t); commit(t); };

  const isRec = p.voice.mode === 'record';
  // 切換「打字」和「自己的錄音」
  const setMode = (rec) => {
    if (rec === isRec) return;
    update((prev) => {
      if (!rec) return { ...prev, voice: { ...prev.voice, mode: 'ai' }, lines: syncLines([], prev.lines.map((l) => l.text).join('\n')) };
      const r = prev.recording;
      const lines = r ? wordsToLines(planCuts(r.words, r.duration, { cutFillers: r.cutFillers, cutPauses: r.cutPauses }).words).map((l) => ({ id: uid(), ...l })) : [];
      return { ...prev, voice: { ...prev.voice, mode: 'record' }, lines };
    });
    if (!rec) setText(p.lines.map((l) => l.text).join('\n'));
  };

  return (
    <div className="step">
      <h2>✍️ 影片要講什麼？</h2>
      <div className="chips" style={{ margin: '6px 0 10px' }}>
        <button className={`chip big${!isRec ? ' on' : ''}`} onClick={() => setMode(false)}>✍️ 打字（AI 配音）</button>
        <button className={`chip big${isRec ? ' on' : ''}`} onClick={() => setMode(true)}>🎙️ 我有錄音（自動轉字幕）</button>
      </div>
      {isRec ? (
        <RecordingPanel p={p} pid={pid} update={update} ai={ai} prices={prices} busy={busy} setBusy={setBusy} />
      ) : (
      <>
      <p className="mute">一句一行。這段文字會變成配音和字幕，AI 也會照內容配圖。</p>

      <div className={`ai-box${open ? ' open' : ''}`}>
        <button className="ai-toggle" onClick={() => setOpen(!open)}>✨ 不會寫？AI 幫我寫 {open ? '▲' : '▼'}</button>
        {open && (
          <div className="ai-body">
            <div className="fld">
              <label>想講什麼</label>
              <textarea className="ta" rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例如：早上起床第一件事喝溫水的好處；或貼上產品介紹" />
            </div>
            <div className="fld">
              <label>說話風格</label>
              <div className="chips">
                {WRITE_STYLES.map(([k, v]) => (
                  <button key={k} className={`chip${style === k ? ' on' : ''}`} onClick={() => setStyle(k)}>{v}</button>
                ))}
              </div>
            </div>
            <div className="fld">
              <label>影片大約幾秒</label>
              <div className="chips">
                {[30, 45, 60, 90].map((s) => (
                  <button key={s} className={`chip${seconds === s ? ' on' : ''}`} onClick={() => setSeconds(s)}>{s} 秒</button>
                ))}
              </div>
            </div>
            {err && <div className="err" style={{ margin: 0 }}>{err}</div>}
            <div className="row">
              <button className="btn pri" disabled={!!busy || !topic.trim()} onClick={write}>{busy === 'write' ? 'AI 寫稿中…' : '✨ 幫我寫（約 0.1 點）'}</button>
            </div>
            {drafts.map((d, i) => (
              <div key={i} className="draft">
                <div className="draft-text">{d.map((l, j) => <div key={j}>{l}</div>)}</div>
                <div className="row">
                  <button className="btn pri sm" onClick={() => useDraft(d)}>用這篇</button>
                  <button className="btn sm" disabled={!!busy} onClick={write}>再寫一篇</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <textarea className="ta script" rows={12} value={text} onChange={onChange} placeholder={'一句一行，例如：\n你知道嗎，每天早上喝一杯溫水\n可以幫助身體慢慢醒過來'} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="mute">共 {p.lines.length} 句，大約 {estimateSeconds(p)} 秒</span>
        <button className="btn sm" onClick={split} title="把太長的句子在標點切開">✂️ 長句自動切開</button>
      </div>
      </>
      )}
    </div>
  );
}
