# FinTrack — แอปวางแผนการเงินส่วนตัว

## โครงสร้าง
- `index.html` — ทั้งแอปอยู่ไฟล์เดียว (HTML + CSS + JS ล้วน ไม่มี framework ไม่มี build)
- `api/stock-search.js`, `api/stock-quote.js` — Vercel Serverless proxy ไป Alpha Vantage (key อยู่ใน env `ALPHA_VANTAGE_API_KEY` บน Vercel เท่านั้น)
- `api/_lib.js` — rate limit ต่อ IP + แคช (ไฟล์ขึ้นต้น `_` ไม่ถูกเปิดเป็น endpoint)
- `sw.js`, `manifest.webmanifest`, `icons/` — PWA (service worker ลงทะเบียนเฉพาะ https)
- `tests/calc.test.js` — ทดสอบสูตรคำนวณ ดึงสคริปต์จาก `index.html` มารันใน `vm`

## คำสั่ง
- ทดสอบ: `node --test` (ไม่ต้องติดตั้งอะไร)
- เช็ค syntax: ดึงเนื้อหา `<script>` ตัวสุดท้ายออกมาแล้ว `node --check`
- รันในเครื่อง: `python -m http.server 8899 --bind 127.0.0.1` แล้วเปิด http://127.0.0.1:8899/
- Deploy: push `main` → Vercel deploy อัตโนมัติ (https://my-finance-app-ecru-eight.vercel.app) — ถามผู้ใช้ก่อน push ทุกครั้ง

## ข้อมูล
- ข้อมูลผู้ใช้อยู่ใน `localStorage` key `ft8` เท่านั้น ไม่มี backend/ซิงก์ข้ามเครื่อง (ผู้ใช้ตัดสินใจแล้ว) — สำรอง/กู้คืนด้วยไฟล์ JSON
- `stateFrom(p)` คือจุดเดียวที่แปลงข้อมูลดิบเป็น state ใช้ทั้งตอนโหลดและกู้คืน — เพิ่มฟิลด์ใหม่ต้องเพิ่มใน `S` และ `stateFrom`
- `validateBackup(p)` ตรวจไฟล์ก่อนกู้คืน

## ข้อตกลง
- ข้อความ UI ภาษาไทย, ยอดเงินแสดงเลขเต็มเสมอ (`FM.cur` / `FM.compact` ไม่ย่อเป็น K/ล้าน)
- วันที่ใช้ `localYMD()` / `localYM()` ห้ามใช้ `toISOString()` หาวันนี้ (UTC ทำให้ช่วงเช้าเป็นเมื่อวาน)
- ยืนยันการกระทำด้วย `await ask(title,msg,{ok,danger})` ห้ามใช้ `confirm()`
- การโปะหนี้ทุกทางผ่าน `applyPrepayOnce` / `revertPrepay` เพื่อให้ยอดหนี้กับรายจ่ายตรงกัน
- ต้องใช้ได้บนมือถือ 375px ไม่มี scroll แนวนอน
