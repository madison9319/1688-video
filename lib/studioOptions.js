// 做影片頁的選項（前後端共用；只有名稱，真正的提示詞在 lib/prompts.js，只在伺服器）

export const WRITE_STYLES = [
  ['story', '🧡 說故事'],
  ['teach', '📚 教知識'],
  ['product', '🛍️ 推產品'],
  ['inspire', '💪 激勵人心'],
  ['life', '☕ 聊生活'],
];

export const IMAGE_STYLES = [
  ['photo', '📷 真實照片'],
  ['illustration', '🎨 溫暖插畫'],
  ['anime', '🌸 日系動漫'],
  ['cartoon3d', '🧸 3D 卡通'],
  ['watercolor', '🖌️ 水彩'],
  ['cinematic', '🎬 電影感'],
];

export const ASPECTS = [
  ['9:16', '📱 直式 9:16（抖音、Reels、Shorts）', 1080, 1920, '1024x1536'],
  ['16:9', '🖥️ 橫式 16:9（YouTube）', 1920, 1080, '1536x1024'],
  ['1:1', '⬜ 方形 1:1（FB、IG 貼文）', 1080, 1080, '1024x1024'],
];

export const QUALITIES = [
  ['low', '一般（最便宜）'],
  ['medium', '標準（推薦）'],
  ['high', '精緻（最貴）'],
];

export const VOICES = [
  ['nova', '溫柔女聲'],
  ['shimmer', '明亮女聲'],
  ['coral', '親切女聲'],
  ['sage', '沉穩女聲'],
  ['alloy', '中性聲音'],
  ['echo', '年輕男聲'],
  ['ash', '清爽男聲'],
  ['onyx', '低沉男聲'],
];

export const TONES = [
  ['natural', '自然親切'],
  ['warm', '溫柔療癒'],
  ['lively', '活潑有朝氣'],
  ['pro', '專業穩重'],
  ['story', '說故事的感覺'],
];

// AI 配音中文一秒大約念 3.6 個字（實測 nova 聲音；估算影片長度用）
export const CHARS_PER_SEC = 3.6;
