import fs from 'node:fs';
import * as XLSX from 'xlsx';
fs.mkdirSync('audit/fixtures',{recursive:true});
const header=['ลำดับ','รายการที่ขอซื้อ','หน่วยงาน','เลข Inventory','วันที่หน่วยงานคีย์','วันที่รับเรื่อง','หมวด','ประเภทเงิน','วงเงิน','หมายเหตุ'];
const records=[
 [1,'Test Alpha','Unit A','69-90001','2026-09-08:10:00:00','10/9/2026','Category A','Fund A',1250,'Note A'],
 [2,'Test Beta','Unit B','69-90002','2026-09-09:11:00:00','11/9/2569','Category B','Fund B',2500,'Note B'],
 [3,'Test Gamma','Unit A','69-90003','2026-09-10:12:00:00','2026-09-10','Category A','Fund A',3750,'Note C']
];
function excel(name,rows){const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([header,...rows]),'Inventory');XLSX.writeFile(b,'audit/fixtures/'+name);}
excel('small-misleading-690101.xls',records);excel('small-no-date.xlsx',records);excel('small-missing-date.xlsx',records.map(r=>r.map((v,i)=>i===5?'':v)));excel('small-invalid-date.xlsx',records.map(r=>r.map((v,i)=>i===5?'31/9/2026':v)));
const escape=s=>s.replace(/[\\()]/g,'\\$&');
let stream='';
records.forEach((r,i)=>{const y=490-i*20;const tokens=[[20,String(r[0])],[44,r[1]],[228,r[2]],[326,r[3]],[374,String(r[4]).slice(0,10)],[460,i===1?'11/9/2026':'10/9/2026'],[510,r[6]],[618,r[7]],[736,Number(r[8]).toFixed(2)],[786,r[9]]];for(const [x,s]of tokens)stream+=`BT /F1 8 Tf ${x} ${y} Td (${escape(s)}) Tj ET\n`;});
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`];
let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
fs.writeFileSync('audit/fixtures/small-misleading-690102.pdf',pdf);
console.log('Small test fixtures created: 3 rows; dates come from data.');
