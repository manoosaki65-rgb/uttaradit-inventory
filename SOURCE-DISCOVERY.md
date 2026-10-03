# Inventory source discovery

อัปเดต: กู้ source จริงจาก snapshot AppDeploy v77 ครบ 15 ไฟล์แล้ว หลังผู้ใช้ระบุตัวแอปจากภาพ โดยใช้เครื่องมืออ่านเท่านั้น ดู LOGIC-AUDIT.md และ original/v77/ ข้อมูลด้านล่างเป็นผลค้นหาก่อนทราบตัวแอป

ตรวจสอบวันที่ 3 ตุลาคม 2569 โดยยังไม่เรียกใช้เครื่องมือ AppDeploy และไม่ deploy/import ข้อมูล

## ผลตรวจสอบ

- Repository uttaradit-inventory ไม่มี source, commit history หรือ Git remote ณ เวลาตรวจสอบ
- ค้นหาไฟล์ใน Documents/ChatGPT, Downloads, Documents และตรวจแหล่ง Google Drive ที่เชื่อมต่อ
- ยังไม่พบ source ที่ตรวจยืนยันว่าเป็นระบบทะเบียนรับ Inventory Final ล่าสุด
- พบ Google Drive folder `inventory-user-netlify (2)` แต่ตรวจ index.html แล้วเป็นแบบสำรวจอีเมลขอ User สำหรับเจ้าหน้าที่ 27 คน ไม่ใช่ทะเบียนรับ จึงไม่ใช้เป็นต้นฉบับ

## แหล่งที่พบ

- แบบสำรวจ: https://drive.google.com/drive/folders/1wCKZW8PawAyTuVpuGYER7fpXh11vJcnu
  - index.html (11,443 bytes): แบบสำรวจอีเมล มี CSS/JavaScript ในไฟล์เดียวและ Netlify Forms
  - thanks.html (2,959 bytes)
  - README.txt (246 bytes)
- Master ถึง 30 กันยายน 2569: https://docs.google.com/spreadsheets/d/1sz0roCb--SMs_3DIxt1GN250NoM8Fqoh/edit
  - พบ metadata จริงบน Drive แต่ยังไม่ดาวน์โหลด/ตรวจจำนวนแถว/import
  - แชตเดิมรายงาน 4,107 รายการ; จำนวนนี้ยังไม่ได้ตรวจจากเนื้อหาไฟล์ในงานนี้
- Downloads มี Master ถึง 10 กันยายน 2569 และ Report inventory 690910.xlsx ซึ่งเป็นข้อมูล ไม่ใช่ source หน้าเว็บ

## สิ่งที่ต้องได้ก่อนเริ่มระบบ

ต้องระบุ repository, ZIP หรือไฟล์ source ของทะเบียนรับ Inventory Final ล่าสุด และตรวจความครบของ frontend/backend/assets ก่อนคัดลอกเข้าโปรเจกต์นี้ ไม่สร้างหน้าเว็บจากการเดาและไม่ใช้แบบสำรวจ User แทนทะเบียนรับ

หากต้นฉบับมีเฉพาะบน AppDeploy ต้องชี้ตัวแอป/เวอร์ชันและยืนยันขอบเขตการอ่าน source เท่านั้นก่อน เพื่อรักษาข้อจำกัดที่ยังไม่แตะระบบเดิม
