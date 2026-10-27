import { aspectInfo, sceneRange } from '../../lib/studioState';
import { fileUrl } from '../../lib/accelerator';

// 右邊的手機畫面：大概看一下標題、字幕的樣子
export default function PhonePreview({ p, pid, pickId }) {
  const a = aspectInfo(p.aspect);
  const W = 250;
  const H = Math.round((W * a.height) / a.width);
  const k = W / a.width; // 實際影片 px → 預覽 px
  const scale = a.height / 1920 > a.width / 1920 ? Math.min(a.width, a.height) / 1080 : a.width / 1920;
  const idx = Math.max(0, p.scenes.findIndex((s) => s.id === pickId));
  const scene = p.scenes[idx];
  const [from] = scene ? sceneRange(p.scenes, idx, p.lines.length) : [0];
  const sample = p.lines[from]?.text || '字幕會在這裡';
  const max = p.subtitle.maxChars;
  const subText = sample.replace(/[，,、。]+$/, '').slice(0, max);
  const pos = p.subtitle.position === 'middle' ? 0.42 : p.subtitle.position === 'high' ? 0.25 : 0.12;
  const outline = (c, w) => `${c} ${w}px 0 0, ${c} -${w}px 0 0, ${c} 0 ${w}px 0, ${c} 0 -${w}px 0, ${c} ${w}px ${w}px 0, ${c} -${w}px -${w}px 0, ${c} ${w}px -${w}px 0, ${c} -${w}px ${w}px 0`;

  return (
    <div className="phone-wrap">
      <div className="mute" style={{ fontSize: 13, marginBottom: 6 }}>📱 影片大概長這樣</div>
      <div className="phone" style={{ width: W, height: H }}>
        {scene?.file ? <img src={fileUrl(pid, scene.kind === 'video' ? scene.thumb || scene.file : scene.file)} alt="" /> : <div className="phone-empty">畫面會在這裡</div>}
        {p.title.text && (
          <div className="ph-title" style={{ top: H * 0.07, fontSize: p.title.size * scale * k, color: p.title.color, textShadow: outline('#000', Math.max(1, p.title.size * scale * k / 12)) }}>
            {p.title.text}
          </div>
        )}
        {p.subtitle.enabled && (
          <div className="ph-sub" style={{ bottom: H * pos, fontSize: p.subtitle.size * scale * k, color: p.subtitle.color, textShadow: outline(p.subtitle.outlineColor, Math.max(1, p.subtitle.size * scale * k / 12)) }}>
            {subText}
          </div>
        )}
      </div>
      {p.scenes.length > 1 && <div className="mute" style={{ fontSize: 12, marginTop: 6 }}>滑鼠移到第 2 步的圖，這裡會換成那張</div>}
    </div>
  );
}
