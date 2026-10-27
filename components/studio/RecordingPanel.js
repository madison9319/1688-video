import { useRef, useState } from 'react';
import { uid } from '../../lib/studioState';
import { uploadRaw, probeFile, prepareStt, cutAudio, fileB64, deleteFile, fileUrl } from '../../lib/accelerator';
import { planCuts, wordsToLines } from '../../lib/recording';
import { fmtPoints } from '../../lib/format';

const MAX_MIN = 15;

// 上傳自己的錄音 → 轉文字 → 剪掉贅字和停頓 → 一句一句（時間固定、可以改錯字）
export default function RecordingPanel({ p, pid, update, ai, prices, busy, setBusy }) {
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const input = useRef(null);
  const audio = useRef(null);
  const rec = p.recording;

  // 依目前選項剪錄音、重排句子（不用再花點數）
  const applyCuts = async (r, opts) => {
    const plan = planCuts(r.words, r.duration, opts);
    const lines = wordsToLines(plan.words);
    let voiceFile = r.source;
    let voiceDuration = r.duration;
    if (opts.cutFillers || opts.cutPauses) {
      voiceFile = `voice_${uid(6)}.m4a`;
      const out = await cutAudio(pid, r.source, plan.keep, voiceFile);
      voiceDuration = out.duration;
    }
    if (r.voiceFile && r.voiceFile !== r.source && r.voiceFile !== voiceFile) deleteFile(pid, r.voiceFile);
    update((prev) => ({
      ...prev,
      recording: { ...r, ...opts, voiceFile, voiceDuration },
      lines: lines.map((l) => ({ id: uid(), text: l.text, start: l.start, end: l.end })),
    }));
    return plan;
  };

  const onFile = async (file) => {
    if (!file) return;
    setErr(''); setMsg('');
    const ext = (file.name.match(/\.(mp3|m4a|wav|aac|ogg|webm|mp4|mov)$/i)?.[1] || '').toLowerCase();
    if (!ext) return setErr('請選錄音檔（MP3、M4A、WAV）');
    setBusy('rec');
    try {
      setMsg('上傳錄音中…');
      const source = `rec_${uid(6)}.${ext}`;
      await uploadRaw(pid, source, file);
      const info = await probeFile(pid, source);
      if (!info.hasAudio) throw new Error('這個檔案裡沒有聲音');
      if (info.duration > MAX_MIN * 60) throw new Error(`錄音最長 ${MAX_MIN} 分鐘，請剪短或分段`);
      setMsg('整理錄音中…');
      const stt = await prepareStt(pid, source);
      setMsg(`AI 聽打中（${Math.round(info.duration)} 秒的錄音，大約要 ${Math.max(10, Math.round(info.duration / 4))} 秒）…`);
      const b64 = await fileB64(pid, stt.name);
      deleteFile(pid, stt.name);
      const j = await ai('transcribe', { b64, duration: info.duration });
      if (rec?.source) deleteFile(pid, rec.source);
      const r = { source, name: file.name, duration: j.duration || info.duration, words: j.words };
      update((prev) => ({ ...prev, voice: { ...prev.voice, mode: 'record' } }));
      setMsg('剪掉贅字和停頓…');
      const plan = await applyCuts(r, { cutFillers: true, cutPauses: true });
      setMsg(`✅ 轉好了！找到 ${plan.fillers} 個「嗯、呃」，共剪掉 ${plan.removed.toFixed(1)} 秒。請一句一句看過，有錯字直接改。`);
    } catch (e) { setErr(e.message); setMsg(''); }
    setBusy('');
  };

  const toggle = async (k) => {
    setErr(''); setBusy('rec');
    try {
      const plan = await applyCuts(rec, { cutFillers: rec.cutFillers, cutPauses: rec.cutPauses, [k]: !rec[k] });
      setMsg(`已更新：錄音剪完剩 ${plan.duration.toFixed(1)} 秒`);
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const setText = (id, text) => update((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.id === id ? { ...l, text } : l)) }));

  const playFrom = (t) => {
    const a = audio.current;
    if (!a || !rec?.voiceFile) return;
    if (!a.src.endsWith(encodeURIComponent(rec.voiceFile))) a.src = fileUrl(pid, rec.voiceFile);
    a.currentTime = t;
    a.play().catch(() => {});
  };

  return (
    <div>
      <audio ref={audio} controls={!!rec?.voiceFile} src={rec?.voiceFile ? fileUrl(pid, rec.voiceFile) : undefined} style={{ width: '100%', display: rec?.voiceFile ? 'block' : 'none', margin: '8px 0' }} />
      <div className="row" style={{ margin: '8px 0' }}>
        <button className="btn acc" disabled={!!busy} onClick={() => input.current?.click()}>
          {busy === 'rec' ? '處理中…' : rec ? '🎵 換一個錄音檔' : '🎵 選錄音檔（手機錄音 M4A、MP3、WAV）'}
        </button>
        <input ref={input} type="file" accept="audio/*,.m4a,.mp3,.wav,video/mp4" hidden onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
        <span className="mute" style={{ fontSize: 13 }}>AI 聽打每分鐘 {fmtPoints(prices?.sttPerMin ?? 0)} 點，最長 {MAX_MIN} 分鐘</span>
      </div>
      {msg && <div className="ok">{msg}</div>}
      {err && <div className="err">{err}</div>}

      {rec && (
        <>
          <div className="row" style={{ gap: 16, margin: '6px 0 10px' }}>
            <span className="mute">🎵 {rec.name}（原本 {Math.round(rec.duration)} 秒 → 剪完 {Math.round(rec.voiceDuration || rec.duration)} 秒）</span>
            <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={!!rec.cutFillers} disabled={!!busy} onChange={() => toggle('cutFillers')} /> ✂️ 剪掉「嗯、呃」</label>
            <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={!!rec.cutPauses} disabled={!!busy} onChange={() => toggle('cutPauses')} /> ⏩ 縮短太長的停頓</label>
          </div>
          <p className="mute" style={{ fontSize: 13, margin: '0 0 6px' }}>🔒 每一句已經對好錄音時間，只能改錯字（不能換行、合併）。點 ▶ 聽那一句。</p>
          <div className="vlines">
            {p.lines.map((l, i) => (
              <div key={l.id} className="vline" style={{ gridTemplateColumns: '24px auto minmax(0,1fr) 60px' }}>
                <span className="mute">{i + 1}</span>
                <button className="btn sm" onClick={() => playFrom(l.start)}>▶</button>
                <input className="inp" value={l.text} onChange={(e) => setText(l.id, e.target.value)} />
                <span className="mute" style={{ fontSize: 12 }}>{l.start.toFixed(1)}s</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
