// ตัวช่วยร่วมของ API proxy (ไฟล์ขึ้นต้นด้วย _ ไม่ถูกเปิดเป็น endpoint)
// - จำกัดความถี่ต่อ IP: กันคนอื่นเรียกจนโควต้า Alpha Vantage (~25 ครั้ง/วัน) หมด
//   หมายเหตุ: เป็น in-memory ต่อ instance ของ serverless จึงเป็น best-effort ไม่ใช่การรับประกัน
// - แคชผลสำเร็จ: ทั้งใน memory และผ่าน Cache-Control ให้ CDN ของ Vercel แคชต่อ URL
const hits = new Map();
const cache = new Map();
const RATE_LIMIT = 20;          // ครั้งต่อ IP
const RATE_WINDOW_MS = 60000;   // ต่อ 1 นาที
const MAX_CACHE_ENTRIES = 500;

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return (Array.isArray(xff) ? xff[0] : (xff || '')).split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
}

// คืน true ถ้าเกินลิมิต (และตอบ 429 ให้แล้ว)
function rateLimited(req, res) {
  const now = Date.now();
  const ip = clientIp(req);
  let h = hits.get(ip);
  if (!h || now > h.reset) { h = { count: 0, reset: now + RATE_WINDOW_MS }; hits.set(ip, h); }
  h.count++;
  if (hits.size > 2000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
  if (h.count > RATE_LIMIT) {
    res.setHeader('Retry-After', Math.ceil((h.reset - now) / 1000));
    res.setHeader('Cache-Control', 'no-store');
    res.status(429).json({ error: 'too_many_requests', message: 'เรียกถี่เกินไป รอสักครู่แล้วลองใหม่' });
    return true;
  }
  return false;
}

function cacheGet(key) {
  const c = cache.get(key);
  if (c && Date.now() < c.exp) return c.data;
  cache.delete(key);
  return null;
}
function cacheSet(key, data, ttlMs) {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { data, exp: Date.now() + ttlMs });
}

function sendOk(res, data, ttlSeconds) {
  res.setHeader('Cache-Control', `public, s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 24}`);
  res.status(200).json(data);
}
function sendErr(res, status, error, message) {
  res.setHeader('Cache-Control', 'no-store'); // ห้ามแคชข้อผิดพลาด (เช่น rate-limit ของ Alpha Vantage)
  res.status(status).json({ error, message });
}

module.exports = { rateLimited, cacheGet, cacheSet, sendOk, sendErr };
