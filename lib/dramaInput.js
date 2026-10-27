// 短劇 API 共用：把會員送來的短劇設定整理乾淨（伺服器端）

const s = (v, n) => String(v || '').trim().slice(0, n);
const AGES = ['20', '30', '40', '50'];

export function cleanDrama(b = {}) {
  const person = (p = {}) => ({ name: s(p.name, 20), age: AGES.includes(String(p.age)) ? String(p.age) : '30' });
  return {
    mode: b.mode === 'talk' ? 'talk' : 'drama',
    roleMode: b.roleMode === 'one' ? 'one' : 'two',
    narrator: b.narrator === 'male' ? 'male' : 'female',
    product: { name: s(b.product?.name, 60), desc: s(b.product?.desc, 3000) },
    female: person(b.female),
    male: person(b.male),
    relation: s(b.relation, 60),
    scenario: s(b.scenario, 800),
    seconds: Math.min(30, Math.max(10, Number(b.seconds) || 30)),
    speed: ['slow', 'normal', 'fast'].includes(b.speed) ? b.speed : 'normal',
    script: cleanScript(b.script),
  };
}

export function cleanScript(sc) {
  if (!sc || !Array.isArray(sc.shots)) return null;
  return {
    title: s(sc.title, 30),
    shots: sc.shots.slice(0, 9).map((x) => ({
      visual: s(x?.visual, 600),
      lines: (Array.isArray(x?.lines) ? x.lines : []).slice(0, 4).map((l) => ({ who: l?.who === 'male' ? 'male' : 'female', text: s(l?.text, 60) })).filter((l) => l.text),
    })),
  };
}

// base64 圖片 → Buffer（限制大小）
export function b64Image(b64, maxBytes = 3 * 1024 * 1024) {
  const buf = Buffer.from(String(b64 || ''), 'base64');
  if (!buf.length || buf.length > maxBytes) return null;
  return buf;
}
