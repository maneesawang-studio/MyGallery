# มาตรฐานงานออกแบบ MNSW Studio

ค่ากลางของเว็บไซต์อยู่ใน `style.css` ภายใต้ `:root` และหน้า Admin ใช้ค่าชุดเดียวกันผ่าน `admin/admin.css` ให้ใช้ token เหล่านี้ก่อนกำหนดค่าใหม่ เพื่อให้หน้า Home, Gallery, About, Project Detail และ Admin มีรูปแบบสอดคล้องกัน

## ภาษาและฟอนต์

- หน้าเว็บสาธารณะเริ่มต้นภาษาอังกฤษ (`lang="en"`) และผู้ใช้สลับเป็นไทยได้
- Admin ยังคงเป็นภาษาไทย
- ใช้ `"Outfit", "Prompt", sans-serif` เป็น font stack: ตัวอักษรละตินแสดงด้วย Outfit และตัวอักษรไทย fallback เป็น Prompt ได้ แม้อยู่ในบรรทัดเดียวกัน
- โหลดน้ำหนักฟอนต์ที่มีจริงเท่านั้น: `400` regular, `500` medium และ `600` semibold
- ภาษาไทยใช้ line-height `1.8`; ภาษาอังกฤษใช้ `1.65`

## Typography

| Token | ค่า | ใช้กับ |
| --- | --- | --- |
| `--font-size-xs` | `12px` | ป้ายกำกับและข้อความช่วย |
| `--font-size-sm` | `14px` | เมนู ปุ่ม และข้อความรอง |
| `--font-size-base` | `16px` | เนื้อหาหลักและฟอร์ม |
| `--font-size-lg` | `18px` | หัวข้อย่อย |
| `--font-size-xl` | `20px` | หัวข้อส่วน |
| `--font-size-2xl` | `24px` | หัวข้อเด่น |
| `--font-size-3xl` | `32px` | หัวข้อระดับใหญ่ |
| `--font-size-display` | `clamp(40px, 6vw, 72px)` | หัวเรื่องหน้า |
| `--font-size-page-title` | `clamp(32px, 4.5vw, 56px)` | ชื่อผลงาน |

ใช้ `--font-weight-regular`, `--font-weight-medium` และ `--font-weight-semibold` แทนน้ำหนักอื่น เพื่อไม่ให้เบราว์เซอร์สังเคราะห์น้ำหนักฟอนต์

## ระยะและองค์ประกอบ

- ระยะห่างใช้ `--space-1` ถึง `--space-16` ตามสเกล 4, 8, 12, 16, 20, 24, 32, 40, 48 และ 64 พิกเซล
- มุมโค้งใช้ `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl` และ `--radius-pill`
- ระยะขอบหน้าจอใช้ `--page-gutter`; ความกว้างเนื้อหาใช้ `--content-width`
- สีข้อความ พื้นผิว เส้นขอบ และ focus ใช้ token `--color-*`; เงาการ์ดใช้ `--shadow-soft`
- ปุ่ม ลิงก์ และช่องกรอกต้องมี focus state ที่มองเห็นได้ และรับฟอนต์จากค่าเดียวกับหน้า
- ใช้ responsive breakpoints ที่มีอยู่ใน `style.css` และ `admin/admin.css` เมื่อเพิ่ม layout ใหม่
