# Dashboard Checklist Sheet 026

Dashboard HTML สำหรับเผยแพร่ด้วย GitHub Pages และตรวจข้อมูลใหม่อัตโนมัติทุก 15 วินาที

## ไฟล์สำคัญ

- `index.html` หน้า Dashboard และข้อมูลสำรองในตัว
- `data.json` ข้อมูลปัจจุบันที่ Dashboard ดึงมาแสดง
- `config.js` URL แหล่งข้อมูลและรอบเวลารีเฟรช
- `drive-unit-gearbox.png` รูปประกอบ

## นำขึ้น GitHub Pages

1. สร้าง GitHub repository ใหม่ แล้วอัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้
2. ใช้ branch ชื่อ `main`
3. ไปที่ **Settings → Pages → Build and deployment**
4. เลือก **Source: GitHub Actions**
5. เมื่อ workflow ทำงานสำเร็จ หน้าเว็บจะอยู่ที่ `https://<username>.github.io/<repository>/`

## การอัปเดตข้อมูล

ค่าเริ่มต้นใน `config.js` คือ `./data.json` หน้าเว็บจะตรวจไฟล์นี้ใหม่ทุก 15 วินาที

```js
window.DASHBOARD_CONFIG = {
  dataUrl: "./data.json",
  refreshIntervalMs: 15000,
};
```

การแก้ `data.json` ใน GitHub จะอัปเดตหน้าเว็บหลัง GitHub Pages deploy เสร็จ จึงเป็น near real-time ไม่ใช่ทันทีระดับวินาที หากต้องการให้ข้อมูลจาก Google Sheets, Supabase หรือ Firebase เปลี่ยนแล้วขึ้นทันที ให้เปลี่ยน `dataUrl` เป็น API สาธารณะที่คืน JSON โครงสร้างเดียวกับ `data.json` และอนุญาต CORS จากโดเมน GitHub Pages

ห้ามใส่ API key หรือรหัสลับไว้ใน `config.js` เพราะผู้เข้าชมเว็บมองเห็นไฟล์นี้ได้
