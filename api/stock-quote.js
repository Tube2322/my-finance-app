// Proxy ไปหา Alpha Vantage GLOBAL_QUOTE — ซ่อน API key ไว้ฝั่ง server เท่านั้น
module.exports = async (req, res) => {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'no_key', message: 'ยังไม่ได้ตั้งค่า ALPHA_VANTAGE_API_KEY บน Vercel' });
    return;
  }
  const symbol = (req.query.symbol || '').trim();
  if (!symbol) {
    res.status(400).json({ error: 'bad_request', message: 'ไม่มี symbol' });
    return;
  }
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.Note || data.Information) {
      res.status(429).json({ error: 'rate_limited', message: 'ถึงโควต้า Alpha Vantage วันนี้แล้ว ลองใหม่พรุ่งนี้' });
      return;
    }
    const q = data['Global Quote'];
    const price = q && q['05. price'] ? parseFloat(q['05. price']) : null;
    if (price == null) {
      res.status(404).json({ error: 'not_found', message: `ไม่พบราคาของ ${symbol}` });
      return;
    }
    res.status(200).json({
      symbol,
      price,
      changePercent: q['10. change percent'] || null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(502).json({ error: 'upstream_error', message: 'เรียก Alpha Vantage ไม่สำเร็จ' });
  }
};
