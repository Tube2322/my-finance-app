// Proxy ไปหา Alpha Vantage GLOBAL_QUOTE — ซ่อน API key ไว้ฝั่ง server เท่านั้น
const { rateLimited, cacheGet, cacheSet, sendOk, sendErr } = require('./_lib');

const TTL_SECONDS = 300; // ราคาแคช 5 นาที — พอสำหรับการวางแผน และช่วยประหยัดโควต้า

module.exports = async (req, res) => {
  if (rateLimited(req, res)) return;
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return sendErr(res, 500, 'no_key', 'ยังไม่ได้ตั้งค่า ALPHA_VANTAGE_API_KEY บน Vercel');
  const symbol = String(req.query.symbol || '').trim();
  if (!symbol) return sendErr(res, 400, 'bad_request', 'ไม่มี symbol');
  if (!/^[A-Za-z0-9.\-^=]{1,20}$/.test(symbol)) return sendErr(res, 400, 'bad_request', 'รูปแบบ symbol ไม่ถูกต้อง');

  const ck = 'quote:' + symbol.toUpperCase();
  const hit = cacheGet(ck);
  if (hit) return sendOk(res, hit, TTL_SECONDS);

  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.Note || data.Information) return sendErr(res, 429, 'rate_limited', 'ถึงโควต้า Alpha Vantage วันนี้แล้ว ลองใหม่พรุ่งนี้');
    const q = data['Global Quote'];
    const price = q && q['05. price'] ? parseFloat(q['05. price']) : null;
    if (price == null) return sendErr(res, 404, 'not_found', `ไม่พบราคาของ ${symbol}`);
    const out = { symbol, price, changePercent: q['10. change percent'] || null, fetchedAt: new Date().toISOString() };
    cacheSet(ck, out, TTL_SECONDS * 1000);
    sendOk(res, out, TTL_SECONDS);
  } catch (e) {
    sendErr(res, 502, 'upstream_error', 'เรียก Alpha Vantage ไม่สำเร็จ');
  }
};
