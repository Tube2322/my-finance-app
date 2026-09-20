// Proxy ไปหา Alpha Vantage SYMBOL_SEARCH — ซ่อน API key ไว้ฝั่ง server เท่านั้น
const { rateLimited, cacheGet, cacheSet, sendOk, sendErr } = require('./_lib');

const TTL_SECONDS = 6 * 3600; // ผลค้นหาชื่อหุ้นแทบไม่เปลี่ยน

module.exports = async (req, res) => {
  if (rateLimited(req, res)) return;
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return sendErr(res, 500, 'no_key', 'ยังไม่ได้ตั้งค่า ALPHA_VANTAGE_API_KEY บน Vercel');
  const q = String(req.query.q || '').trim();
  if (!q) return sendErr(res, 400, 'bad_request', 'ไม่มีคำค้นหา');
  if (q.length > 50) return sendErr(res, 400, 'bad_request', 'คำค้นหายาวเกินไป (สูงสุด 50 ตัวอักษร)');

  const ck = 'search:' + q.toLowerCase();
  const hit = cacheGet(ck);
  if (hit) return sendOk(res, hit, TTL_SECONDS);

  try {
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(q)}&apikey=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    // Alpha Vantage ตอบ 200 เสมอแม้โดน rate-limit — สัญญาณจริงอยู่ใน field เหล่านี้แทน HTTP status
    if (data.Note || data.Information) return sendErr(res, 429, 'rate_limited', 'ถึงโควต้า Alpha Vantage วันนี้แล้ว ลองใหม่พรุ่งนี้');
    const matches = (data.bestMatches || []).map(m => ({
      symbol: m['1. symbol'],
      name: m['2. name'],
      type: m['3. type'],
      region: m['4. region'],
      currency: m['8. currency'],
    }));
    const out = { matches };
    cacheSet(ck, out, TTL_SECONDS * 1000);
    sendOk(res, out, TTL_SECONDS);
  } catch (e) {
    sendErr(res, 502, 'upstream_error', 'เรียก Alpha Vantage ไม่สำเร็จ');
  }
};
