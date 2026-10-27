import { useRef, useState } from 'react';
import { VOICES, TONES } from '../../lib/studioOptions';
import { uid, audioKey, fileToB64, runPool } from '../../lib/studioState';
import { saveFile, deleteFile, fileUrl } from '../../lib/accelerator';
import { fmtPoints } from '../../lib/format';

// 第 3 步：聲音（AI 配音、背景音樂）
export default function StepVoice({ p, pid, update, ai, prices, busy, setBusy }) {
  const [err, setErr] = useState('');
  const [working, setWorking] = useState({});
  const audioRef = useRef(null);
  const bgmInput = useRef(null);
  const v = p.voice;
  const per100 = prices?.ttsPer100 ?? 0;
  const linePrice = (l) => Math.max(0.02, (l.text.length / 100) * per100);
  const stale = p.lines.filter((l) => !l.audio || l.audioKey !== audioKey(l, v));

  const setVoice = (k, val) => update((prev) => ({ ...prev, voice: { ...prev.voice, [k]: val } }));

  const speak = async (line) => {
    setWorking((w) => ({ ...w, [line.id]: true }));
    try {
      const j = await ai('tts', { text: line.text, voice: v.voice, tone: v.tone, speed: v.speed });
      const name = `tts_${line.id}_${uid(4)}.mp3`;
      await saveFile(pid, name, j.b64);
      if (line.audio) deleteFile(pid, line.audio);
      const key = audioKey(line, v);
      update((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.id === line.id ? { ...l, audio: name, audioKey: key } : l)) }));
      return name;
    } catch (e) {
      setErr(e.message);
      throw e;
    } finally {
      setWorking((w) => { const x = { ...w }; delete x[line.id]; return x; });
    }
  };

  const speakAll = async () => {
    setErr(''); setBusy('tts');
    let stop = false;
    await runPool(stale, 3, async (l) => {
      if (stop) return;
      try { await speak(l); } catch (e) { if (/點數不夠/.test(e.message)) stop = true; }
    });
    setBusy('');
  };

  const play = (name) => {
    const a = audioRef.current;
    if (!a) return;
    a.src = fileUrl(pid, name);
    a.play().catch(() => {});
  };

  // 依序播放全部配音
  const playAll = () => {
    const names = p.lines.map((l) => l.audio).filter(Boolean);
    const a = audioRef.current;
    if (!a || !names.length) return;
    let i = 0;
    a.onended = () => { i++; if (i < names.length) { a.src = fileUrl(pid, names[i]); a.play().catch(() => {}); } else a.onended = null; };
    a.src = fileUrl(pid, names[0]);
    a.play().catch(() => {});
  };

  const addBgm = async (file) => {
    if (!file) return;
    setErr('');
    if (file.size > 40 * 1024 * 1024) return setErr('音樂檔太大（最多 40MB）');
    setBusy('bgm');
    try {
      const ext = (file.name.match(/\.(mp3|m4a|wav)$/i)?.[1] || 'mp3').toLowerCase();
      const name = `bgm_${uid(6)}.${ext}`;
      await saveFile(pid, name, await fileToB64(file));
      if (p.bgm?.file) deleteFile(pid, p.bgm.file);
      update((prev) => ({ ...prev, bgm: { file: name, name: file.name, volume: prev.voice.mode === 'ai' ? 0.12 : 0.5 } }));
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  return (
    <div className="step">
      <h2>🎙️ 影片的聲音</h2>
      <audio ref={audioRef} hidden />
      {v.mode === 'record' ? (
        <div className="ok">🎙️ 這支影片用你自己的錄音（在第 1 步上傳的）。想改用 AI 配音，請回第 1 步選「✍️ 打字」。</div>
      ) : (
      <>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip big${v.mode === 'ai' ? ' on' : ''}`} onClick={() => setVoice('mode', 'ai')}>🤖 AI 照文稿念（推薦）</button>
        <button className={`chip big${v.mode === 'none' ? ' on' : ''}`} onClick={() => setVoice('mode', 'none')}>🔇 不要人聲（只有音樂＋字幕）</button>
      </div>

      {v.mode === 'ai' ? (
        <>
          <div className="grid2">
            <div className="fld">
              <label>聲音</label>
              <select className="sel" value={v.voice} onChange={(e) => setVoice('voice', e.target.value)}>
                {VOICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="fld">
              <label>語氣</label>
              <select className="sel" value={v.tone} onChange={(e) => setVoice('tone', e.target.value)}>
                {TONES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="fld">
              <label>說話速度：{Number(v.speed).toFixed(2)} 倍</label>
              <input type="range" min="0.8" max="1.3" step="0.05" value={v.speed} onChange={(e) => setVoice('speed', Number(e.target.value))} />
            </div>
          </div>
          <p className="mute" style={{ fontSize: 13 }}>改了聲音、語氣、速度或文字，那幾句就要重新配音。建議先按某一句的「🎙 配這句」試聽，滿意再全部配。</p>
          <div className="row" style={{ margin: '8px 0 12px' }}>
            {stale.length > 0 && (
              <button className="btn acc" disabled={!!busy} onClick={speakAll}>
                {busy === 'tts' ? `配音中…（還剩 ${stale.length} 句）` : `🎙 產生 ${stale.length} 句配音（${fmtPoints(Math.round(stale.reduce((a, l) => a + linePrice(l), 0) * 100) / 100)} 點）`}
              </button>
            )}
            <button className="btn" onClick={playAll} disabled={!p.lines.some((l) => l.audio)}>▶ 從頭播放全部配音</button>
          </div>
          {err && <div className="err">{err}</div>}
          <div className="vlines">
            {p.lines.map((l, i) => {
              const ok = l.audio && l.audioKey === audioKey(l, v);
              return (
                <div key={l.id} className="vline">
                  <span className="mute">{i + 1}</span>
                  <span className="vtext">{l.text}</span>
                  {ok ? <span className="tag green">已配音</span> : l.audio ? <span className="tag red">要重配</span> : <span className="tag">還沒配</span>}
                  {l.audio && <button className="btn sm" onClick={() => play(l.audio)}>▶</button>}
                  <button className="btn sm" disabled={!!working[l.id] || busy === 'tts'} onClick={() => speak(l).then(play).catch(() => {})}>
                    {working[l.id] ? '…' : ok ? '🔄' : '🎙 配這句'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="mute">沒有人聲：影片只有背景音樂＋字幕，每句字幕顯示的時間依字數自動算。</p>
      )}
      </>
      )}

      <h3 style={{ marginTop: 22 }}>🎶 背景音樂（可以不放）</h3>
      {p.bgm ? (
        <div className="row">
          <span>🎵 {p.bgm.name}</span>
          <button className="btn sm" onClick={() => play(p.bgm.file)}>▶ 試聽</button>
          <button className="btn sm danger" onClick={() => { deleteFile(pid, p.bgm.file); update((prev) => ({ ...prev, bgm: null })); }}>移除</button>
          <label className="row" style={{ gap: 6 }}>
            <span className="mute">音量</span>
            <input type="range" min="0.03" max="0.8" step="0.01" value={p.bgm.volume} onChange={(e) => update((prev) => ({ ...prev, bgm: { ...prev.bgm, volume: Number(e.target.value) } }))} />
            <span className="mute">{Math.round(p.bgm.volume * 100)}%</span>
          </label>
        </div>
      ) : (
        <button className="btn" disabled={!!busy} onClick={() => bgmInput.current?.click()}>{busy === 'bgm' ? '上傳中…' : '🎵 選一首音樂（MP3、M4A、WAV）'}</button>
      )}
      <input ref={bgmInput} type="file" accept=".mp3,.m4a,.wav,audio/*" hidden onChange={(e) => { addBgm(e.target.files[0]); e.target.value = ''; }} />
      <p className="mute" style={{ fontSize: 13 }}>請用有授權的音樂（例如 YouTube 音效庫的免費音樂），音樂會自動重複播到影片結束、最後淡出。</p>
    </div>
  );
}
