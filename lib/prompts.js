// AI 提示詞（只在伺服器端用，不會送到瀏覽器）

const ZH = '一律使用台灣繁體中文、台灣慣用語，不要出現簡體字或中國用語。';

const WRITE_STYLE = {
  story: '用說故事的方式，有畫面感、有轉折，結尾帶出感動或啟發。',
  teach: '用教知識的方式，開頭先拋出問題吸引注意，中間條列重點，結尾一句話總結。',
  product: '用推薦產品的方式，開頭點出痛點，接著說明產品怎麼解決、有哪些賣點，結尾呼籲行動，不要誇大不實或保證療效。',
  inspire: '用激勵人心的方式，句子有力量、節奏明快，結尾給人正能量。',
  life: '用輕鬆聊生活的方式，像跟朋友聊天，口語自然。',
};

export function writePrompt({ topic, style, seconds, count }) {
  // AI 數字數不準，但數句數很準：用「幾句、每句幾個字」來控制長度
  const chars = Math.round(seconds * 3.6);
  const lines = Math.max(3, Math.round(chars / 14));
  return {
    system: `你是專門寫短影音口播稿的台灣文案高手。${ZH}
規則：
- 這段稿子會被 AI 念出來當配音，同時當字幕，所以要口語、好念、好懂。
- 長度很重要：每篇剛好 ${lines} 句，每句 10～16 個字，絕對不能超過。
- 一句一行，句尾不要加句號；可以用逗號、問號、驚嘆號。
- 開頭第一句要在 3 秒內抓住注意力。
- 不要寫「大家好」「歡迎收看」這類開場白，不要加表情符號、標題、編號、括號說明。
- ${WRITE_STYLE[style] || WRITE_STYLE.story}
只回傳 JSON：{"scripts":[["第一句","第二句",...], ...]}`,
    user: `主題：${topic}
每篇長度：${seconds} 秒的影片，剛好 ${lines} 句
要寫 ${count} 篇，每篇內容和角度都不一樣。`,
  };
}

export function storyboardPrompt({ lines, count, hasFace }) {
  // 有主角頭照：不能寫主角的性別、年紀、長相（會跟照片打架），一律叫 "the main character"
  const faceRule = hasFace
    ? '\nIMPORTANT: The main person will come from a reference photo. Call them only "the main character". Never mention their gender, age, ethnicity, hair, face or body; describe only what they do, wear and where they are. Set "character" to "".'
    : '';
  return {
    system: `You are a storyboard artist for short vertical videos. The narration is in Traditional Chinese (Taiwan).
Split the numbered narration lines into exactly the requested number of consecutive scenes (every line belongs to exactly one scene, in order, no gaps, each scene at least 1 line).
For each scene write one English image-generation prompt that visually illustrates what is being said: concrete subject, setting, action, mood, camera framing.
Each prompt must describe ONE single real moment that a camera could photograph: no collages, split panels, before/after, sequences, infographics, icons, symbols, diagrams, glowing overlays or abstract illustrations of body organs. People should look Taiwanese / East Asian unless the text says otherwise. Never include any text, letters, captions, logos or watermarks in the image.
Also write "character": a short English description of the main recurring person (age, gender, hair, clothing) so every image shows the same person; use "" if there is no recurring person.
Reply JSON only: {"character":"...","scenes":[{"from":0,"to":2,"prompt":"..."}]}  (from/to are 0-based line indexes, inclusive)${faceRule}`,
    user: `Number of scenes: ${count}
Narration lines:
${lines.map((l, i) => `${i}. ${l}`).join('\n')}`,
  };
}

const IMAGE_STYLE = {
  photo: 'Photorealistic photograph, natural lighting, shot on a full-frame camera, shallow depth of field, high detail.',
  illustration: 'Warm hand-drawn digital illustration, soft colors, gentle lighting, storybook feel.',
  anime: 'Japanese anime style illustration, clean line art, vibrant colors, soft cel shading.',
  cartoon3d: 'Cute 3D cartoon render, Pixar-like style, soft studio lighting, rounded shapes.',
  watercolor: 'Delicate watercolor painting, soft washes, paper texture, airy and calm.',
  cinematic: 'Cinematic film still, dramatic lighting, rich color grading, anamorphic look.',
};

export function imagePrompt({ prompt, style, character, withFace }) {
  return [
    withFace ? 'The main character of this scene is exactly the person in the reference photo: same gender, age, face, glasses and hairstyle, clearly recognizable. If the description below mentions a different kind of person for the main character, ignore that and use the person from the photo. Clothing and pose follow the scene.' : '',
    prompt,
    character && !withFace ? `Main character: ${character}.` : '',
    IMAGE_STYLE[style] || IMAGE_STYLE.photo,
    'Single image, not a collage or split panel. No text, no letters, no captions, no icons, no watermark, no logo.',
  ].filter(Boolean).join(' ');
}

const TONE = {
  natural: '自然親切，像在跟朋友說話',
  warm: '溫柔、放慢一點、帶點療癒感',
  lively: '活潑有朝氣、節奏輕快',
  pro: '專業穩重、清楚有自信',
  story: '像在說故事，有起伏和情緒',
};

export function ttsInstructions(tone) {
  return `用台灣口音的國語念，咬字清楚、不要有大陸腔。語氣：${TONE[tone] || TONE.natural}。`;
}

// 語音辨識的提示：放幾個贅字，辨識才會把「嗯、呃」也寫出來（才剪得掉）
export const STT_PROMPT = '嗯，呃，那個，就是，我們今天來聊聊。以下是台灣繁體中文的口語錄音，請用繁體中文。';

export function titlesPrompt({ lines }) {
  return {
    system: `你是台灣短影音的標題高手。${ZH}
依照影片文稿，寫 3 個會讓人想點進來看的影片標題。每個 6～12 個字（標點也算一個字），一定要是完整的一句話，不要加引號、表情符號、hashtag。三個標題角度要不同（例如：提問、數字、反差）。
只回傳 JSON：{"titles":["...","...","..."]}`,
    user: `以下是影片的口播文稿，請替這支影片想標題：\n${lines.join('\n')}`,
  };
}

// ═══ 萬相分鏡短劇 ═══
const AGE = { '20': '20 多歲', '30': '30 多歲', '40': '40 多歲', '50': '50 歲以上' };

export function roleNames(d) {
  const f = d.female?.name || '女主角';
  const m = d.male?.name || '男主角';
  return { f, m };
}

// AI 寫 30 秒短劇劇本：9 個鏡頭，每個鏡頭有英文畫面描述＋中文台詞
export function dramaScriptPrompt(d) {
  const { f, m } = roleNames(d);
  const two = d.roleMode === 'two';
  const presenter = d.narrator === 'male' ? m : f;
  const lines = Math.max(6, Math.round((d.seconds * 3.4) / 13));
  return {
    system: `你是台灣短影音廣告短劇的編劇。${ZH}
寫一支 ${d.seconds} 秒、直式手機觀看的真人短劇，分成剛好 9 個鏡頭（每個鏡頭約 ${Math.round(d.seconds / 9 * 10) / 10} 秒）。
角色：${two ? `${f}（女）和 ${m}（男）兩個人${d.relation ? `，關係：${d.relation}` : ''}。由「${presenter}」負責介紹產品、講賣點和結語，另一個人負責發問、懷疑、驚訝或反應。` : `只有「${presenter}」一個人，對著鏡頭說話。`}
規則：
- 台詞要口語、自然、像真人對話，全部台詞加起來約 ${lines} 句，每句 6～14 個字；有的鏡頭可以沒有台詞。
- 「你／妳」要用對：對男生說話用「你」，對女生說話用「妳」。
- 開頭 3 秒要有衝突、疑問或痛點，抓住注意力；結尾一句要呼籲行動（例如：留言＋1、點連結）。
- 不能誇大不實，不能說保證療效、治療疾病。
- visual 用英文寫這個鏡頭的畫面：場景、人物動作、表情、鏡頭（close-up / medium shot…）、產品出現的方式。人物只寫「the woman」「the man」，不要寫長相（長相會用照片）。不要出現任何文字或字幕。
只回傳 JSON：{"title":"影片標題（12 字內）","shots":[{"visual":"...","lines":[{"who":"female 或 male","text":"台詞"}]}]}`,
    user: `產品：${d.product?.name || '（沒有產品，純劇情）'}
產品說明：${d.product?.desc || '（無）'}
劇本情境：${d.scenario || '日常生活中自然帶出產品'}`,
  };
}

// AI 畫 3×3 分鏡總圖（9 格）
export function boardPrompt(d, refsLabel) {
  const panels = (d.script?.shots || []).slice(0, 9).map((s, i) => `Panel ${i + 1}: ${s.visual}`).join('\n');
  return `A storyboard sheet: a 3 by 3 grid of 9 equal vertical panels separated by thin white borders, read left-to-right, top-to-bottom, with a tiny panel number in each top-left corner.
Every panel is a photorealistic cinematic frame of the same short drama, with the same characters, outfits, location and product throughout.
Exactly 3 rows and 3 columns, 9 panels in total, all the same size.
${refsLabel ? `${refsLabel}\n` : 'The characters are Taiwanese (East Asian), in a Taiwanese home or city setting.\n'}${panels}
No speech bubbles, no captions, no other text or logos except the tiny panel numbers.`;
}

// 送給萬相的影片描述（伺服器組好，會員看不到）
export function wanPrompt(d, { duration, cells, hasProduct }) {
  const { f, m } = roleNames(d);
  const who = (w) => (w === 'male' ? `${m}（${AGE[d.male?.age] || '30 多歲'}男聲）` : `${f}（${AGE[d.female?.age] || '30 多歲'}女聲）`);
  const shots = (d.script?.shots || []).slice(0, cells);
  const per = duration / Math.max(1, shots.length);
  const t = (x) => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`;
  const speed = d.speed === 'slow' ? '說話速度稍慢、清楚' : d.speed === 'fast' ? '說話速度輕快' : '說話速度自然';
  const body = shots.map((s, i) => {
    const say = (s.lines || []).filter((l) => l.text).map((l) => `${who(l.who)}說：「${l.text}」`).join(' ');
    return `(${t(i * per)} - ${t((i + 1) * per)}) Shot ${i + 1}, follow Image ${i + 1}: ${s.visual}${say ? ` ${say}` : ''}`;
  }).join('\n');
  return `Image 1 to Image ${shots.length} are the storyboard frames of shot 1 to shot ${shots.length}, in order.${hasProduct ? ` Image ${shots.length + 1} is the product${d.product?.name ? `「${d.product.name}」` : ''}; show it exactly like this photo.` : ''}
Create one continuous ${duration}-second vertical live-action short drama that follows the shots in order, keeping the same characters, faces, outfits, location and product as in the frames. Realistic, natural acting and natural lip sync.
All dialogue is spoken in Mandarin Chinese with a Taiwanese accent, ${speed}. No subtitles, no captions, no on-screen text.
${body}`;
}

// ═══ 發文文案 ═══
const PLATFORM = {
  fb: 'Facebook 貼文：開頭一句吸睛，3～5 段短句，適度用表情符號，結尾問一個問題引導留言，最後 3～5 個 hashtag。',
  ig: 'Instagram 貼文：第一行就是重點（會被截斷），分段短句、表情符號多一點，結尾呼籲收藏或分享，最後 8～12 個 hashtag。',
  yt: 'YouTube Shorts：標題一行（40 字內，含關鍵字），空一行後 2～3 句說明，最後 3～5 個 hashtag（#Shorts 放第一個）。',
  tiktok: '抖音／TikTok：一到兩句口語短文，帶懸念或情緒，最後 4～6 個熱門 hashtag。',
};

export function captionPrompt({ title, lines, platform }) {
  return {
    system: `你是台灣社群小編。${ZH}
依照短影音的內容，寫一篇${PLATFORM[platform] || PLATFORM.fb}
不要誇大不實，不要保證療效。只回傳 JSON：{"text":"貼文全文"}`,
    user: `影片標題：${title || '（無）'}\n影片內容：\n${lines.join('\n')}`,
  };
}

// 照片開口說話：一張照片＋一段台詞，萬相讓照片裡的人（或寵物）對著鏡頭說話
export function talkPrompt(d, { duration }) {
  const lines = (d.script?.shots || []).flatMap((s) => s.lines).filter((l) => l.text);
  const total = lines.reduce((a, l) => a + l.text.length, 0) || 1;
  const t = (x) => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`;
  const who = d.narrator === 'male' ? `${AGE[d.male?.age] || '30 多歲'}男聲` : `${AGE[d.female?.age] || '30 多歲'}女聲`;
  let at = 0;
  const body = lines.map((l) => {
    const len = (duration * l.text.length) / total;
    const s = `(${t(at)} - ${t(at + len)}) 說：「${l.text}」`;
    at += len;
    return s;
  }).join('\n');
  return `Image 1 is the main subject. Keep exactly the same face, appearance and outfit as in the photo (if it is a pet, animate the pet naturally and give it a cute talking voice).
Create one continuous ${duration}-second video of the subject talking directly to the camera, with natural head movement, blinking, facial expressions, hand gestures and accurate lip sync.${d.scenario ? ` Setting and action: ${d.scenario}.` : ' Keep the background of the photo.'}
All dialogue is spoken in Mandarin Chinese with a Taiwanese accent by a ${who}, ${d.speed === 'slow' ? '說話速度稍慢' : d.speed === 'fast' ? '說話速度輕快' : '說話速度自然'}. No subtitles, no on-screen text.
${body}`;
}
