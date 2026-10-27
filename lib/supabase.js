import { createClient } from '@supabase/supabase-js';

// 素材檔案放的 Storage 空間（schema.sql 會建立）
export const BUCKET = 'vf-assets';

// 延遲建立 client：build 階段（collect page data）只 import 這個模組、不會實際存取，
// 所以到請求時才需要環境變數。
let _client = null;
function getClient() {
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return _client;
}

export const supabaseAdmin = new Proxy(
  {},
  {
    get(_t, prop) {
      const c = getClient();
      const v = c[prop];
      return typeof v === 'function' ? v.bind(c) : v;
    },
  }
);
