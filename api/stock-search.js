// Proxy ไปหา Alpha Vantage SYMBOL_SEARCH — ซ่อน API key ไว้ฝั่ง server เท่านั้น
module.exports = async (req, res) => {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'no_key', message: 'ยังไม่ได้ตั้งค่า ALPHA_VANTAGE_API_KEY บน Vercel' });
    return;
  }
  const q = (req.query.q || '').trim();
  if (!q) {
    res.status(400).json({ error: 'bad_request', message: 'ไม่มีคำค้นหา' });
    return;
  }
  try {
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(q)}&apikey=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    // Alpha Vantage ตอบ 200 เสมอแม้โดน rate-limit — สัญญาณจริงอยู่ใน field เหล่านี้แทน HTTP status
    if (data.Note || data.Information) {
      res.status(429).json({ error: 'rate_limited', message: 'ถึงโควต้า Alpha Vantage วันนี้แล้ว ลองใหม่พรุ่งนี้' });
      return;
    }
    const matches = (data.bestMatches || []).map(m => ({
      symbol: m['1. symbol'],
      name: m['2. name'],
      type: m['3. type'],
      region: m['4. region'],
      currency: m['8. currency'],
    }));
    res.status(200).json({ matches });
  } catch (e) {
    res.status(502).json({ error: 'upstream_error', message: 'เรียก Alpha Vantage ไม่สำเร็จ' });
  }
};
