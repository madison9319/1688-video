import { useState } from 'react';

const PLATFORMS = [['fb', 'Facebook'], ['ig', 'Instagram'], ['yt', 'YouTube Shorts'], ['tiktok', '抖音／TikTok']];

// 影片做好後：AI 幫我寫發文文案（可以複製貼到社群）
export default function PostCaption({ ai, title, lines }) {
  const [platform, setPlatform] = useState('fb');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const write = async () => {
    setErr(''); setBusy(true); setCopied(false);
    try {
      const j = await ai('caption', { title, lines, platform });
      setText(j.text);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch (e) { setErr('複製失敗，請自己選取文字複製'); }
  };

  return (
    <div className="panel sub" style={{ margin: 0 }}>
      <h3>✍️ 發文文案</h3>
      <div className="chips">
        {PLATFORMS.map(([k, v]) => <button key={k} className={`chip${platform === k ? ' on' : ''}`} onClick={() => setPlatform(k)}>{v}</button>)}
      </div>
      <div className="row" style={{ margin: '10px 0' }}>
        <button className="btn pri" disabled={busy} onClick={write}>{busy ? 'AI 寫文案中…' : text ? '🔄 再寫一篇（約 0.01 點）' : '✍️ 幫我寫發文文案（約 0.01 點）'}</button>
        {text && <button className="btn" onClick={copy}>{copied ? '✓ 已複製' : '📋 複製'}</button>}
      </div>
      {err && <div className="err" style={{ margin: 0 }}>{err}</div>}
      {text && <textarea className="ta" rows={9} value={text} onChange={(e) => setText(e.target.value)} />}
    </div>
  );
}
