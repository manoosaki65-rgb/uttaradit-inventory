import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { Search, Upload, Pencil, Trash2, X, Save, Home } from 'lucide-react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type Row = {
  id: string;
  seq: number;
  item: string;
  unit: string;
  inventory: string;
  keyed: string;
  day: number;
  month: number;
  year: number;
  category: string;
  fund: string;
  fundYear?: string;
  amount: number;
  note: string;
  officer: string;
};
const repairLegacyThai = (value: unknown) => {
  const text = String(value ?? '');
  const chars = Array.from(text);
  const convertible = chars.filter(char => {
    const code = char.charCodeAt(0);
    return (code >= 0xa1 && code <= 0xda) || code === 0xdf || (code >= 0xe0 && code <= 0xfb);
  }).length;
  if (convertible < 3) return text;
  const repaired = chars.map(char => {
    const code = char.charCodeAt(0);
    if ((code >= 0xa1 && code <= 0xda) || (code >= 0xe0 && code <= 0xfb)) return String.fromCharCode(code + 0x0d60);
    if (code === 0xdf) return '฿';
    return char;
  }).join('');
  const thaiBefore = (text.match(/[ก-๙]/g) || []).length;
  const thaiAfter = (repaired.match(/[ก-๙]/g) || []).length;
  return thaiAfter > thaiBefore ? repaired : text;
};
const normalizeRow = (row: Row): Row => ({
  ...row,
  item: repairLegacyThai(row.item),
  unit: repairLegacyThai(row.unit),
  category: repairLegacyThai(row.category),
  fund: repairLegacyThai(row.fund),
  fundYear: String(row.fundYear ?? ''),
  note: repairLegacyThai(row.note),
  officer: repairLegacyThai(row.officer),
});
const seed: Omit<Row, 'id'>[] = [
  {
    seq: 43,
    item: 'จ้างทำตรายาง',
    unit: 'กลุ่มงานบริหารทั่วไป',
    inventory: '69-05229',
    keyed: '10/09/2569 09:18',
    day: 10,
    month: 9,
    year: 69,
    category: 'ค่าจ้างเหมาบริการทั่วไป',
    fund: 'เงินบำรุงโรงพยาบาล',
    amount: 310,
    note: '',
  },
  {
    seq: 44,
    item: 'เครื่องคำนวณ',
    unit: 'สำนักงานกลุ่มงานประกันสุขภาพ',
    inventory: '69-05230',
    keyed: '10/09/2569 09:30',
    day: 10,
    month: 9,
    year: 69,
    category: 'ครุภัณฑ์สำนักงาน',
    fund: 'เงินงบประมาณรายจ่ายประจำปี',
    amount: 4500,
    note: '',
  },
  {
    seq: 45,
    item: 'วัสดุประกอบอะไหล่',
    unit: 'หอผู้ป่วยศัลยกรรมกระดูกหญิง',
    inventory: '69-05231',
    keyed: '10/09/2569 09:35',
    day: 10,
    month: 9,
    year: 69,
    category: 'วัสดุซ่อมแซม',
    fund: 'เงินบำรุงโรงพยาบาล',
    amount: 440,
    note: '',
  },
  {
    seq: 46,
    item: 'กาวยางทาโฟเมก้า, โฟเมก้าขาว',
    unit: 'งานโลหิตวิทยา',
    inventory: '69-05237',
    keyed: '10/09/2569 11:06',
    day: 10,
    month: 9,
    year: 69,
    category: 'วัสดุก่อสร้างและประปา',
    fund: 'เงินบำรุงโรงพยาบาล',
    amount: 780,
    note: '',
  },
  {
    seq: 47,
    item: 'จ้างเปลี่ยนคอมเพรสเซอร์ขนาด 38000 บีทียู',
    unit: 'สำนักงานกลุ่มงานพัสดุ-งานจัดซื้อ',
    inventory: '69-05274',
    keyed: '10/09/2569 14:36',
    day: 10,
    month: 9,
    year: 69,
    category: 'ค่าจ้างซ่อมครุภัณฑ์สำนักงาน',
    fund: 'เงินบำรุงโรงพยาบาล',
    amount: 23540,
    note: '',
  },
];
function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Row | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState('');
  const [total,setTotal]=useState(0);
  const [page,setPage]=useState(1);
  const [pages,setPages]=useState(1);
  const [sender,setSender]=useState('นายมนูศักดิ์ อยู่บาง');
  const [receiver,setReceiver]=useState('นางวราพร จันทร์ศรีทอง');
  const [receiverRole,setReceiverRole]=useState('หัวหน้ากลุ่มงานพัสดุ');
  const [signEdit,setSignEdit]=useState(false);
  const [selectedFiles,setSelectedFiles]=useState<File[]>([]);
  const [previewMode,setPreviewMode]=useState(false);
  const [rangeOpen,setRangeOpen]=useState(false);
  const [fromDate,setFromDate]=useState('');
  const [toDate,setToDate]=useState('');
  const [dateBasis,setDateBasis]=useState<'keyed'|'received'>('received');
  const [printBasis,setPrintBasis]=useState<'keyed'|'received'>('received');
  const [printRange,setPrintRange]=useState('');
  const [section,setSection]=useState<'current'|'history'>('current');
  const tableScrollRef=useRef<HTMLDivElement | null>(null);
  const topScrollRef=useRef<HTMLDivElement | null>(null);
  const syncingScroll=useRef(false);
  const syncHorizontal=(source:'top'|'table')=>{if(syncingScroll.current)return;const from=source==='top'?topScrollRef.current:tableScrollRef.current;const to=source==='top'?tableScrollRef.current:topScrollRef.current;if(!from||!to)return;syncingScroll.current=true;to.scrollLeft=from.scrollLeft;window.requestAnimationFrame(()=>{syncingScroll.current=false;});};
  const thaiMonths=['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const formatRowDate=(r:Pick<Row,'day'|'month'|'year'>)=>`${r.day} ${thaiMonths[r.month]||r.month} ${r.year<100?2500+r.year:r.year}`;
  const formatIsoDate=(iso:string)=>{const [y,m,d]=iso.split('-').map(Number);return `${d} ${thaiMonths[m]||m} ${y+543}`;};
  const printDatePart=(r:Row,part:'day'|'month'|'year')=>{if(printBasis!=='keyed')return r[part];const text=String(r.keyed||'').trim();const iso=text.match(/^(\d{4})-(\d{2})-(\d{2})/);if(iso){const values={day:Number(iso[3]),month:Number(iso[2]),year:(Number(iso[1])+543)%100};return values[part];}const slash=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(slash){const rawYear=Number(slash[3]);const buddhistYear=rawYear<100?2500+rawYear:rawYear<2400?rawYear+543:rawYear;const values={day:Number(slash[1]),month:Number(slash[2]),year:buddhistYear%100};return values[part];}return r[part];};
  const rangeLabel=(list:Row[])=>{if(!list.length)return '';const sorted=[...list].sort((a,b)=>(a.year-b.year)||(a.month-b.month)||(a.day-b.day)||(a.seq-b.seq));return `ช่วงวันที่ : ${formatRowDate(sorted[0])} ถึง ${formatRowDate(sorted[sorted.length-1])}`;};
  const reportDate = printRange || rangeLabel(rows);
  const latestCurrentDate = useMemo(() => {
    if (section !== 'current' || !rows.length) return '';
    const latest = [...rows].sort((a,b)=>(a.year-b.year)||(a.month-b.month)||(a.day-b.day)||(a.seq-b.seq))[rows.length-1];
    return formatRowDate(latest);
  }, [rows, section]);
  const load = async (target?:number, search?:string, mode:'current'|'history'=section, attempt=0):Promise<void> => {
    try {
      const endpoint=mode==='history'?'/api/inventory':'/api/current';
      const params = new URLSearchParams({ page: String(target ?? (mode === 'history' ? 1 : '')), pageSize: '100', q: search ?? q });
      const r = await api.get(endpoint + '?' + params.toString());
      setRows((r.data.items as Row[]).map(normalizeRow)); setTotal(r.data.total); setPage(r.data.page); setPages(r.data.pages);
    } catch {
      if(attempt<1){await new Promise(resolve=>window.setTimeout(resolve,800));return load(target,search,mode,attempt+1);}
      setRows([]); setTotal(0); setMsg(mode==='history'?'โหลดประวัติเดิมไม่สำเร็จ กรุณาลองใหม่':'โหลดงานปัจจุบันไม่สำเร็จ กรุณาลองใหม่');
    }
  };
  useEffect(() => {
    load();
  }, []);
  const filtered = useMemo(() => section==='history'?rows:[...rows].sort((a,b)=>(a.year-b.year)||(a.month-b.month)||(a.day-b.day)||(a.seq-b.seq)), [rows,section]);
  const formatAmount=(value:number)=>Number(value||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
  const printTotal = useMemo(() => filtered.reduce((sum,row)=>sum+(Number(row.amount)||0),0), [filtered]);
  const missingFundYears = useMemo(() => section==='current' ? filtered.filter(row=>!String(row.fundYear||'').trim()).length : 0, [filtered,section]);
  const save = async () => {
    if (!edit) return;
    const endpoint=edit.id.startsWith('master:')?'/api/inventory/':'/api/current/';
    await api.put(endpoint + edit.id, edit);
    setEdit(null);
    setMsg('บันทึกการแก้ไขแล้ว');
    await load(page,q,section);
  };
  const saveFundYear=async(row:Row,value:string)=>{if(row.id.startsWith('master:'))return;const previous=String(row.fundYear||'');setRows(current=>current.map(item=>item.id===row.id?{...item,fundYear:value}:item));try{await api.put('/api/current/'+row.id,{fundYear:value});setMsg(`บันทึกปีแหล่งเงิน ${value} ให้ ${row.inventory} แล้ว`);}catch{setRows(current=>current.map(item=>item.id===row.id?{...item,fundYear:previous}:item));setMsg(`บันทึกปีแหล่งเงินของ ${row.inventory} ไม่สำเร็จ กรุณาลองใหม่`);}};
  const cancelReceived = async (row:Row) => {
    if (!window.confirm(`ยืนยันยกเลิกรายการ ${row.inventory} — ${row.item} ? รายการจะยังอยู่ในทะเบียนพร้อมหมายเหตุยกเลิก`)) return;
    try {
      const note = row.note.includes('ยกเลิก') ? row.note : ['ยกเลิก',row.note].filter(Boolean).join(' — ');
      await api.put('/api/current/'+encodeURIComponent(row.id),{note});
      setMsg(`ยกเลิกรายการ ${row.inventory} แล้ว`);
      await load(page,q,section);
    } catch {setMsg(`ยกเลิกรายการ ${row.inventory} ไม่สำเร็จ`);}
  };
  const removeReceived = async () => {
    if (!deleteTarget || deleteTarget.id.startsWith('master:') || deleting) return;
    setDeleting(true);
    try {
      await api.delete('/api/current/' + encodeURIComponent(deleteTarget.id));
      setDeleteTarget(null);
      setMsg('ลบรายการออกจากงานปัจจุบันและสำรองรายการที่ลบไว้แล้ว');
      await load(page,q,section);
    } catch {
      setMsg('ลบไม่สำเร็จ ข้อมูลเดิมยังอยู่ กรุณาลองใหม่');
    } finally {
      setDeleting(false);
    }
  };
  const search = async () => { await load(1,q,section); };
  const printSavedRows=()=>{const missing=rows.filter(row=>!String(row.fundYear||'').trim());if(section==='current'&&missing.length){setMsg(`ยังพิมพ์ไม่ได้ กรุณาเลือกปีแหล่งเงินให้ครบอีก ${missing.length} รายการ`);return;}setPrintBasis('received');setPrintRange(rangeLabel(rows));setPreviewMode(true);window.setTimeout(()=>window.print(),100);};
  const printDateRange=async()=>{if(!fromDate||!toDate||fromDate>toDate){setMsg('กรุณาเลือกช่วงวันที่ให้ถูกต้อง');return;}const basisLabel=dateBasis==='keyed'?'วันที่หน่วยงานคีย์':'รับวันที่';try{const params=new URLSearchParams({from:fromDate,to:toDate,basis:dateBasis});const r=await api.get('/api/print-range?'+params.toString());const items=(r.data.items as Row[]).map(normalizeRow);if(!items.length){setMsg(`ไม่พบรายการตาม${basisLabel}ในช่วงวันที่ที่เลือก`);return;}setRows(items);setTotal(items.length);setPage(1);setPages(1);setPrintBasis(dateBasis);setPrintRange(`ช่วงวันที่ : ${formatIsoDate(fromDate)} ถึง ${formatIsoDate(toDate)}`);setRangeOpen(false);setPreviewMode(true);setMsg(`เตรียมพิมพ์ ${items.length} รายการตาม${basisLabel}จากทะเบียนทั้งหมด`);window.setTimeout(()=>window.print(),150);}catch{setMsg('โหลดข้อมูลช่วงวันที่สำหรับพิมพ์ไม่สำเร็จ');}};
  const importFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []);
    if (!fs.length) return;
    setSelectedFiles(fs);
    setSection('current');
    setPreviewMode(false);
    setMsg('เลือกไฟล์แล้ว ' + fs.map(f => f.name).join(' + ') + ' — กด “อัปเดตงานปัจจุบัน” เพื่อบันทึกรายการของวันนั้นก่อนพิมพ์');
  };
  const processTestFiles = async () => {
    const excel=selectedFiles.find(f=>/\.xlsx?$/i.test(f.name));
    const pdf=selectedFiles.find(f=>/\.pdf$/i.test(f.name));
    if(!excel&&!pdf){setMsg('กรุณาเลือกไฟล์ Excel หรือ PDF');return;}
    const sourceFile=excel??pdf!;
    const m=sourceFile.name.match(/(\d{2})(\d{2})(\d{2})/);
    if(!m){setMsg('อ่านวันที่จากชื่อไฟล์ไม่ได้ เช่น Report 690910.pdf');return;}
    const year=Number(m[1]); const month=Number(m[2]); const day=Number(m[3]);
    type ImportRow=Omit<Row,'id'>;
    const parseExcel=async(file:File):Promise<ImportRow[]>=>{
      const data=await file.arrayBuffer();
      const book=XLSX.read(data,{type:'array',cellDates:false});
      let best:ImportRow[]=[];
      const clean=(value:unknown)=>repairLegacyThai(String(value??'').replace(/_x000D_/g,'').replace(/\s*\n\s*/g,' ').trim());
      for(const sheetName of book.SheetNames){
        const grid=XLSX.utils.sheet_to_json<(string|number|null)[]>(book.Sheets[sheetName],{header:1,defval:null,raw:false});
        const recordRows=grid.filter(r=>r.some(v=>/^\d{2}-\d{5}$/.test(clean(v))));
        let candidate:ImportRow[]=[];
        const headerIndex=grid.findIndex(r=>r.some(v=>/Inventory|เลขที่หนังสือ/.test(clean(v)))&&r.some(v=>clean(v).includes('รายการ')));
        if(headerIndex>=0){
          const header=grid[headerIndex].map(clean);
          const col=(names:string[])=>header.findIndex(h=>names.some(n=>h.includes(n)));
          const idx={seq:col(['ลำดับ','ที่']),item:col(['รายการที่ขอซื้อ','รายการ']),unit:col(['หน่วยงาน']),inventory:col(['Inventory','เลขที่หนังสือ']),keyed:col(['วันที่หน่วยงานคีย์','วันที่คีย์','วันที่บันทึกข้อมูล','วันบันทึก']),category:col(['หมวด']),fund:col(['ประเภทเงิน']),amount:col(['วงเงิน']),note:col(['หมายเหตุ'])};
          if(idx.inventory>=0&&idx.item>=0)candidate=grid.slice(headerIndex+1).filter(r=>/^\d{2}-\d{5}$/.test(clean(r[idx.inventory]))).map((r,i)=>({seq:Number(r[idx.seq])||i+1,item:clean(r[idx.item]),unit:clean(r[idx.unit]),inventory:clean(r[idx.inventory]),keyed:clean(r[idx.keyed]),day,month,year,category:clean(r[idx.category]),fund:clean(r[idx.fund]),amount:Number(clean(r[idx.amount]).replace(/,/g,''))||0,note:clean(r[idx.note]),officer:''}));
        }
        if(!candidate.length&&recordRows.length){
          const sample=recordRows[0];const inventoryIndex=sample.findIndex(v=>/^\d{2}-\d{5}$/.test(clean(v)));const seqIndex=sample.findIndex((v,i)=>i<inventoryIndex&&/^\d{1,3}$/.test(clean(v)));const itemIndex=sample.findIndex((v,i)=>i>seqIndex&&i<inventoryIndex&&Boolean(clean(v)));let unitIndex=-1;for(let i=itemIndex+1;i<inventoryIndex;i++)if(clean(sample[i]))unitIndex=i;
          if(inventoryIndex>=0&&seqIndex>=0&&itemIndex>=0&&unitIndex>=0)candidate=recordRows.map((r,i)=>({seq:Number(clean(r[seqIndex]))||i+1,item:clean(r[itemIndex]),unit:clean(r[unitIndex]),inventory:clean(r[inventoryIndex]),keyed:clean(r[inventoryIndex+1]),day,month,year,category:clean(r[inventoryIndex+4]),fund:clean(r[inventoryIndex+6]),amount:Number(clean(r[inventoryIndex+9]).replace(/,/g,''))||0,note:clean(r[inventoryIndex+10]),officer:''}));
        }
        const continuous=candidate.length>0&&candidate.every((row,index)=>row.seq===index+1);
        if(candidate.length<=200&&continuous&&candidate.length>best.length)best=candidate;
      }
      if(!best.length)throw new Error('excel-no-inventory-table');
      return best.sort((a,b)=>a.seq-b.seq);
    };
    const parsePdf=async(file:File):Promise<ImportRow[]>=>{
      const data=new Uint8Array(await file.arrayBuffer());
      const doc=await pdfjsLib.getDocument({data}).promise;
      const parsed:ImportRow[]=[];
      for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
        const page=await doc.getPage(pageNo);
        const content=await page.getTextContent();
        const items=content.items.filter(item=>'str' in item).map(item=>item as {str:string;transform:number[]}).filter(item=>item.str.trim()).map(item=>({text:item.str.trim(),x:item.transform[4],y:item.transform[5]}));
        const anchors=items.filter(item=>item.x<40&&/^\d{1,3}$/.test(item.text)).sort((a,b)=>b.y-a.y);
        for(let i=0;i<anchors.length;i++){
          const anchor=anchors[i];
          const band=items.filter(item=>Math.abs(item.y-anchor.y)<=6);
          const text=(from:number,to:number)=>band.filter(item=>item.x>=from&&item.x<to).sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ').trim();
          const inventory=text(326,374).match(/\d{2}-\d{5}/)?.[0]??'';
          if(!inventory) continue;
          parsed.push({seq:Number(anchor.text),item:text(44,227.5),unit:text(227.5,326),inventory,keyed:text(374,458),day,month,year,category:text(509,617),fund:text(617,739),amount:Number(text(739,785).replace(/,/g,'').match(/[\d.]+/)?.[0]??0),note:text(785,1100),officer:''});
        }
      }
      return parsed.sort((a,b)=>a.seq-b.seq);
    };
    try {
      let parsed:ImportRow[]=[]; let used=''; let excelError=false; let pdfError=false; let excelRows:ImportRow[]=[]; let pdfRows:ImportRow[]=[];
      if(excel){try{excelRows=await parseExcel(excel);if(!excelRows.length)excelError=true;}catch(cause){console.error('Excel import failed',cause);excelError=true;}}
      if(pdf){try{pdfRows=await parsePdf(pdf);if(!pdfRows.length)pdfError=true;}catch{pdfError=true;}}
      if(excelRows.length&&pdfRows.length){const pdfByKey=new Map(pdfRows.map(r=>[[r.seq,r.inventory].join('|'),r]));const excelKeys=new Set(excelRows.map(r=>[r.seq,r.inventory].join('|')));parsed=excelRows.map(r=>{const p=pdfByKey.get([r.seq,r.inventory].join('|'));return p?{...p,...r,item:r.item||p.item,unit:r.unit||p.unit,keyed:r.keyed||p.keyed,category:r.category||p.category,fund:r.fund||p.fund,amount:r.amount||p.amount,note:r.note||p.note}:r;});parsed.push(...pdfRows.filter(r=>!excelKeys.has([r.seq,r.inventory].join('|'))));used='Excel + PDF (ตรวจเทียบ)';}
      else if(excelRows.length){parsed=excelRows;used='Excel';}
      else if(pdfRows.length){parsed=pdfRows;used='PDF';}
      if(!parsed.length) throw new Error('no-rows');
      const unique=new Map<string,ImportRow>();for(const row of parsed.sort((a,b)=>a.seq-b.seq))unique.set([row.seq,row.inventory,row.day,row.month,row.year].join('|'),row);parsed=[...unique.values()].sort((a,b)=>a.seq-b.seq);
      const sequenceOk=parsed.every((row,index)=>row.seq===index+1);
      const sourceName=selectedFiles.map(f=>f.name).join(' + ');
      const r=await api.post('/api/current/import',{rows:parsed,source:sourceName});
      setRows((r.data.items as Row[]).map(normalizeRow)); setTotal(r.data.currentTotal??r.data.total); setPage(1); setPages(1); setPreviewMode(false);setPrintRange('');
      setMsg('อัปเดตงานปัจจุบันสำเร็จจาก ' + used + ' · อ่านได้ ' + parsed.length + ' รายการ · ' + (sequenceOk?'ลำดับ 1–'+parsed.length+' ครบ':'กรุณาตรวจลำดับรายการ') + ' · เพิ่มใหม่ ' + r.data.added + ' · ซ่อมข้อมูลเดิม ' + r.data.updated + ' · วันที่ ' + day + '/' + month + '/25' + year + ' · รวมวันนั้น ' + r.data.total + ' รายการ · กรุณาเลือกปีแหล่งเงิน 68 / 69 / 70 ให้ครบก่อนพิมพ์' + (excelError&&used==='PDF'?' · Excel อ่านไม่ผ่าน จึงใช้ PDF แทน':'') + (pdfError&&used==='Excel'?' · PDF อ่านไม่ผ่าน จึงใช้ Excel':''));
    } catch (cause) {
      console.error('Inventory import failed',cause);
      setMsg('อ่านทั้ง Excel/PDF ไม่สำเร็จ — ยังไม่ได้เพิ่มข้อมูล');
    }
  };
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="screen-only bg-gradient-to-r from-blue-800 to-cyan-600 text-white px-5 py-4 shadow">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:flex-wrap gap-3 justify-between items-stretch sm:items-center">
          <div className="flex items-center gap-3">
            <a href="https://uttaradit-procurement-hub.manoosaki65.chatgpt.site" aria-label="กลับ Homepage อาคารพัสดุ" className="bg-white/15 hover:bg-white/25 border border-white/25 rounded-xl p-3 transition-colors" title="กลับ Homepage อาคารพัสดุ">
              <Home size={21} />
            </a>
            <div>
              <div className="text-xs opacity-80">
                กลุ่มงานพัสดุ โรงพยาบาลอุตรดิตถ์
              </div>
              <h1 className="text-xl sm:text-2xl font-bold">ทะเบียนรับ Inventory</h1>
              <div className="text-sm opacity-90">
                ทะเบียนหนังสือรับขออนุมัติจัดซื้อจัดจ้าง (Tracking พัสดุ)
              </div>
            </div>
          </div>
          <label className="bg-white text-blue-800 px-4 py-2 rounded-xl font-semibold cursor-pointer flex gap-2 items-center justify-center shadow">
            <Upload size={18} />
            นำเข้าข้อมูล
            <input
              className="hidden"
              type="file"
              accept=".pdf,.xls,.xlsx"
              multiple
              onChange={importFile}
            />
          </label>
        </div>
      </header>
      <main className="max-w-[1600px] mx-auto p-4">
        <div className="screen-only flex flex-wrap gap-3 mb-4">
          <button onClick={()=>{setSection('current');setQ('');setMsg('');load(undefined,'','current')}} className={section==='current'?'bg-blue-700 text-white rounded-xl px-4 py-2 font-semibold':'bg-white border border-blue-200 text-blue-800 rounded-xl px-4 py-2 font-semibold'}>งานปัจจุบัน</button>
          <button onClick={()=>{setSection('history');setQ('');setMsg('');load(undefined,'','history')}} className={section==='history'?'bg-blue-700 text-white rounded-xl px-4 py-2 font-semibold':'bg-white border border-blue-200 text-blue-800 rounded-xl px-4 py-2 font-semibold'}>ประวัติเดิม 3,857 รายการ</button>
          <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl px-4 py-2 font-semibold">{section==='history'?'Master ประวัติเดิม':latestCurrentDate?`งานปัจจุบันล่าสุด ${latestCurrentDate}`:'งานปัจจุบัน'} · {total.toLocaleString()} รายการ · หน้า {page}/{pages}</div>
          {section==='current'&&selectedFiles.length>0 && <button onClick={processTestFiles} className="bg-emerald-600 text-white rounded-xl px-4 py-2 font-semibold">อัปเดตงานปัจจุบัน</button>}
          {section==='current'&&missingFundYears>0&&<div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-2 font-semibold">รอเลือกปีแหล่งเงิน {missingFundYears} รายการ</div>}
          {section==='current'&&<button onClick={printSavedRows} disabled={!rows.length} className="bg-white border border-blue-200 text-blue-800 rounded-xl px-4 py-2 font-semibold disabled:opacity-40">พรีวิว / พิมพ์รายงาน</button>}
          {section==='current'&&<button onClick={() => setRangeOpen(true)} className="bg-white border border-blue-200 text-blue-800 rounded-xl px-4 py-2 font-semibold">เลือกช่วงวันที่ / พิมพ์ย้อนหลัง</button>}
        </div>
        {selectedFiles.length>0 && <div className="screen-only mb-3 bg-white border rounded-xl px-4 py-3"><div className="font-semibold">ไฟล์ที่เลือกสำหรับทดสอบ</div><div className="text-sm text-slate-600 mt-1">{selectedFiles.map(f=>f.name).join(' + ')}</div></div>}
        {msg && <div className="screen-only mb-3 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl">{msg}</div>}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="screen-only p-4 flex flex-wrap sm:flex-nowrap gap-3 items-center">
            <Search className="text-slate-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')search()}}
              placeholder="ค้นหาเลข Inventory, รายการ, หน่วยงาน, หมายเหตุ, เจ้าหน้าที่จัดซื้อ..."
              className="min-w-0 flex-1 outline-none"
            />
            <button onClick={search} className="bg-blue-700 text-white rounded-lg px-4 py-2">ค้นหา</button>
          </div>
          <div ref={topScrollRef} onScroll={()=>syncHorizontal('top')} className="screen-only hidden lg:block overflow-x-scroll overflow-y-hidden border-y border-slate-200 bg-slate-50 h-[18px]">
            <div className="w-[1600px] h-px" />
          </div>
          <div ref={tableScrollRef} onScroll={()=>syncHorizontal('table')} className="screen-table screen-only hidden lg:block max-h-[calc(100vh-278px)] min-h-[320px] overflow-x-scroll overflow-y-auto overscroll-contain">
            <table className="min-w-[1600px] w-full table-fixed text-[12.5px] whitespace-nowrap">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  {[
                    'ลำดับ',
                    'รายการที่ขอซื้อ',
                    'หน่วยงาน',
                    'เลข Inventory',
                    'วันที่หน่วยงานคีย์',
                    'รับวันที่',
                    'เดือน',
                    'ปี',
                    'หมวด',
                    'ประเภทเงิน',
                    'ปีแหล่งเงิน',
                    'วงเงิน',
                    'หมายเหตุ',
                    'เจ้าหน้าที่จัดซื้อ',
                    '',
                  ].map(x => (
                    <th key={x || 'actions'} className={[
                      'px-2 py-2.5 text-left',
                      x === 'ลำดับ' ? 'w-[50px]' : '',
                      x === 'รายการที่ขอซื้อ' ? 'w-[260px]' : '',
                      x === 'หน่วยงาน' ? 'w-[155px]' : '',
                      x === 'เลข Inventory' ? 'w-[100px]' : '',
                      x === 'วันที่หน่วยงานคีย์' ? 'w-[120px]' : '',
                      x === 'รับวันที่' ? 'w-[55px]' : '',
                      x === 'เดือน' || x === 'ปี' ? 'w-[45px]' : '',
                      x === 'หมวด' ? 'w-[145px]' : '',
                      x === 'ประเภทเงิน' ? 'w-[135px]' : '',
                      x === 'ปีแหล่งเงิน' ? 'w-[82px]' : '',
                      x === 'วงเงิน' ? 'w-[110px]' : '',
                      x === 'หมายเหตุ' ? 'w-[120px]' : '',
                      x === 'เจ้าหน้าที่จัดซื้อ' ? 'screen-only w-[130px]' : '',
                      x === '' ? 'screen-only w-[45px]' : '',
                    ].filter(Boolean).join(' ')}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr
                    key={r.id}
                    className={
                      r.note.includes('ยกเลิก')
                        ? 'bg-red-50 border-t'
                        : 'border-t hover:bg-blue-50'
                    }
                  >
                    <td className="w-[50px] px-2 py-2.5 text-center">{r.seq}</td>
                    <td className="w-[260px] px-2 py-2.5 leading-snug whitespace-normal break-words">{r.item}</td>
                    <td className="w-[155px] px-2 py-2.5 leading-snug whitespace-normal">{r.unit}</td>
                    <td className="w-[100px] px-2 py-2.5 font-semibold text-blue-700">{r.inventory}</td>
                    <td className="w-[120px] px-2 py-2.5 whitespace-normal">{r.keyed}</td>
                    <td className="w-[55px] px-2 py-2.5 text-center"><span className="screen-only">{r.day}</span><span className="print-only">{printDatePart(r,'day')}</span></td>
                    <td className="w-[45px] px-2 py-2.5 text-center"><span className="screen-only">{r.month}</span><span className="print-only">{printDatePart(r,'month')}</span></td>
                    <td className="w-[45px] px-2 py-2.5 text-center"><span className="screen-only">{r.year}</span><span className="print-only">{printDatePart(r,'year')}</span></td>
                    <td className="w-[145px] px-2 py-2.5 leading-snug whitespace-normal">{r.category}</td>
                    <td className="w-[135px] px-2 py-2.5 leading-snug whitespace-normal">{r.fund}</td>
                    <td className="w-[82px] px-1.5 py-2">
                      {section==='current' ? <select aria-label={'ปีแหล่งเงิน '+r.inventory} value={r.fundYear||''} onChange={e=>saveFundYear(r,e.currentTarget.value)} className={`w-full rounded-lg border px-2 py-1.5 font-semibold outline-none ${r.fundYear?'border-emerald-300 bg-emerald-50 text-emerald-800':'border-amber-300 bg-amber-50 text-amber-900'}`}><option value="">เลือกปี</option><option value="68">68</option><option value="69">69</option><option value="70">70</option></select> : <span className="block text-center">{r.fundYear||'—'}</span>}
                    </td>
                    <td className="w-[110px] px-2 py-2.5 text-right font-medium">{formatAmount(r.amount)}</td>
                    <td className="w-[120px] px-2 py-2.5 leading-snug whitespace-normal">{r.note}</td>
                    <td className="screen-only w-[130px] px-2 py-2.5 leading-snug whitespace-normal">{r.officer}</td>
                    <td className="screen-only w-[100px] px-1.5">
                      <div className="flex gap-1">
                        <button onClick={() => setEdit({ ...r })} className="px-2 py-1 rounded-lg hover:bg-blue-100 text-blue-700 inline-flex items-center gap-1" aria-label={'แก้ไข ' + r.inventory} title="แก้ไข"><Pencil size={16} /><span>แก้ไข</span></button>
                        {section==='current' && !r.id.startsWith('master:') && <button onClick={() => cancelReceived(r)} className="px-2 py-1 rounded-lg hover:bg-amber-100 text-amber-800" aria-label={'ยกเลิก ' + r.inventory} title="ยกเลิกรายการ">ยกเลิก</button>}
                        {section==='current' && !r.id.startsWith('master:') && <button onClick={() => setDeleteTarget(r)} className="p-2 rounded-lg hover:bg-red-100 text-red-700" aria-label={'ลบ ' + r.inventory} title="ลบรายการ"><Trash2 size={17} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="print-only print-pages">
            {Array.from({ length: Math.ceil(filtered.length / 25) }, (_, pageIndex) => (
              <section className="print-page" key={`print-page-${pageIndex}`}>
                <div className="report-heading">
                  <div className="text-sm font-bold">โรงพยาบาลอุตรดิตถ์</div>
                  <div className="report-title">ทะเบียนหนังสือรับขออนุมัติจัดซื้อจัดจ้าง (Tracking พัสดุ)</div>
                  <div className="report-date">{reportDate}</div>
                </div>
                <table className="print-report-table">
                  <thead>
                    <tr>
                      {['ลำดับ','รายการที่ขอซื้อ','หน่วยงาน','เลข Inventory','วันที่หน่วยงานคีย์','รับวันที่','เดือน','ปี','หมวด','ประเภทเงิน','ปีแหล่งเงิน','วงเงิน','หมายเหตุ'].map(x => <th key={x}>{x}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(pageIndex * 25, pageIndex * 25 + 25).map(r => (
                      <tr key={`print-${r.id}`}>
                        <td>{r.seq}</td>
                        <td>{r.item}</td>
                        <td>{r.unit}</td>
                        <td>{r.inventory}</td>
                        <td>{r.keyed}</td>
                        <td>{printDatePart(r,'day')}</td>
                        <td>{printDatePart(r,'month')}</td>
                        <td>{printDatePart(r,'year')}</td>
                        <td>{r.category}</td>
                        <td>{r.fund}</td>
                        <td>{r.fundYear||''}</td>
                        <td>{formatAmount(r.amount)}</td>
                        <td>{r.note}</td>
                      </tr>
                    ))}
                    {pageIndex===Math.ceil(filtered.length/25)-1 && (
                      <tr className="print-total-row">
                        <td colSpan={11}>รวมยอดเงินทั้งสิ้น รายการ 1 ถึง {filtered.length}</td>
                        <td>{printTotal.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                        <td></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
          <div className="mobile-cards screen-only lg:hidden divide-y">
            {filtered.map(r => (
              <article key={r.id} className={r.note.includes('ยกเลิก') ? 'bg-red-50 p-4' : 'bg-white p-4'}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-500">ลำดับ {r.seq}</span>
                  <strong className="text-blue-700">{r.inventory}</strong>
                </div>
                <h3 className="mt-2 text-base font-semibold leading-relaxed break-words">{r.item}</h3>
                <p className="mt-1 text-sm text-slate-600">{r.unit}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <span>รับ {r.day}/{r.month}/{r.year}</span>
                  <span className="text-right">{r.category}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm text-slate-600">{r.fund}</span>
                  {section==='current'&&<select aria-label={'ปีแหล่งเงิน '+r.inventory} value={r.fundYear||''} onChange={e=>saveFundYear(r,e.currentTarget.value)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${r.fundYear?'border-emerald-300 bg-emerald-50 text-emerald-800':'border-amber-300 bg-amber-50 text-amber-900'}`}><option value="">เลือกปีแหล่งเงิน</option><option value="68">68</option><option value="69">69</option><option value="70">70</option></select>}
                  <span className="font-semibold text-slate-700">{formatAmount(r.amount)} บาท</span>
                  <div className="flex gap-2"><button onClick={() => setEdit({ ...r })} className="border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700 flex gap-2 items-center" aria-label={'แก้ไข ' + r.inventory}><Pencil size={16} />แก้ไข</button>{section==='current' && !r.id.startsWith('master:') && <button onClick={() => cancelReceived(r)} className="border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800" aria-label={'ยกเลิก ' + r.inventory}>ยกเลิก</button>}{section==='current' && !r.id.startsWith('master:') && <button onClick={() => setDeleteTarget(r)} className="border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex gap-2 items-center" aria-label={'ลบ ' + r.inventory}><Trash2 size={16} />ลบ</button>}</div>
                </div>
                {r.note && <div className="mt-2 text-sm text-red-700">หมายเหตุ: {r.note}</div>}
              </article>
            ))}
          </div>
          <div className="screen-only p-3 border-t flex justify-between items-center"><button disabled={page<=1} onClick={()=>load(page-1,q,section)} className="border rounded-lg px-3 py-2 disabled:opacity-40">ก่อนหน้า</button><span className="text-sm">{section==='history'?'ประวัติเดิม Master':'งานปัจจุบัน'} · {total.toLocaleString()} รายการ</span><button disabled={page>=pages} onClick={()=>load(page+1,q,section)} className="border rounded-lg px-3 py-2 disabled:opacity-40">ถัดไป</button></div>
        </div>
        <div className="screen-only mt-4 bg-white border rounded-2xl p-4 flex flex-wrap items-end gap-4">
          <div><div className="text-xs text-slate-500">ผู้ส่ง</div><div className="font-semibold">{sender}</div></div>
          <div><div className="text-xs text-slate-500">ผู้รับ</div><div className="font-semibold">{receiver}</div><div className="text-sm">{receiverRole}</div></div>
          <button onClick={()=>setSignEdit(true)} className="border rounded-lg px-3 py-2 text-blue-700 flex gap-2 items-center"><Pencil size={16}/>เปลี่ยนชื่อก่อนพิมพ์</button>
        </div>
        <div className="print-only signatures"><div className="signature"><div>ผู้ส่ง ............................................................</div><div>({sender})</div></div><div className="signature"><div>ผู้รับ ............................................................</div><div>({receiver})</div><div>{receiverRole}</div></div></div>
      </main>
      {rangeOpen && <div className="screen-only fixed inset-0 bg-black/40 flex items-center justify-center p-3 z-50"><div className="bg-white rounded-2xl shadow-xl w-full max-w-lg"><div className="p-4 border-b flex justify-between"><b>เลือกช่วงวันที่จากทะเบียนทั้งหมด</b><button onClick={()=>setRangeOpen(false)}><X/></button></div><div className="p-4 grid sm:grid-cols-2 gap-3"><div className="sm:col-span-2"><div className="text-sm font-semibold text-slate-700">เลือกวันที่จากช่อง</div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setDateBasis('keyed')} className={`rounded-xl border px-3 py-3 text-left ${dateBasis==='keyed'?'border-blue-700 bg-blue-50 text-blue-800 ring-2 ring-blue-100':'border-slate-200'}`}><span className="block font-semibold">วันที่หน่วยงานคีย์</span><span className="block text-xs mt-1 opacity-75">เช่น วันที่ 8–9 ก.ย.</span></button><button type="button" onClick={()=>setDateBasis('received')} className={`rounded-xl border px-3 py-3 text-left ${dateBasis==='received'?'border-blue-700 bg-blue-50 text-blue-800 ring-2 ring-blue-100':'border-slate-200'}`}><span className="block font-semibold">รับวันที่</span><span className="block text-xs mt-1 opacity-75">วันที่ลงรับเอกสาร</span></button></div></div><label className="block"><span className="text-xs text-slate-500">วันที่เริ่มต้น</span><input type="date" value={fromDate} onChange={e=>setFromDate(e.currentTarget.value)} className="mt-1 w-full border rounded-xl px-3 py-2"/></label><label className="block"><span className="text-xs text-slate-500">วันที่สิ้นสุด</span><input type="date" value={toDate} onChange={e=>setToDate(e.currentTarget.value)} className="mt-1 w-full border rounded-xl px-3 py-2"/></label></div><div className="p-4 border-t flex justify-end gap-2"><button onClick={()=>setRangeOpen(false)} className="border rounded-xl px-4 py-2">ยกเลิก</button><button onClick={printDateRange} className="bg-blue-700 text-white rounded-xl px-5 py-2">พรีวิว / พิมพ์ช่วงวันที่</button></div></div></div>}
      {signEdit && <div className="screen-only fixed inset-0 bg-black/40 flex items-center justify-center p-3 z-50"><div className="bg-white rounded-2xl shadow-xl w-full max-w-lg"><div className="p-4 border-b flex justify-between"><b>เปลี่ยนชื่อผู้ส่ง / ผู้รับก่อนพิมพ์</b><button onClick={()=>setSignEdit(false)}><X/></button></div><div className="p-4 space-y-3"><label className="block"><span className="text-xs text-slate-500">ผู้ส่ง</span><input value={sender} onChange={e=>setSender(e.target.value)} className="mt-1 w-full border rounded-xl px-3 py-2"/></label><label className="block"><span className="text-xs text-slate-500">ผู้รับ</span><input value={receiver} onChange={e=>setReceiver(e.target.value)} className="mt-1 w-full border rounded-xl px-3 py-2"/></label><label className="block"><span className="text-xs text-slate-500">ตำแหน่งผู้รับ</span><input value={receiverRole} onChange={e=>setReceiverRole(e.target.value)} className="mt-1 w-full border rounded-xl px-3 py-2"/></label></div><div className="p-4 border-t flex justify-end"><button onClick={()=>setSignEdit(false)} className="bg-blue-700 text-white rounded-xl px-5 py-2">ใช้ชื่อนี้</button></div></div></div>}
      {deleteTarget && <div className="screen-only fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl"><h2 className="font-bold text-xl text-red-800">ยืนยันลบรายการ Inventory</h2><p className="mt-3 font-semibold">{deleteTarget.inventory} — {deleteTarget.item}</p><p className="mt-2 text-sm text-slate-600">รายการจะถูกนำออกจากงานปัจจุบัน โดยเก็บสำรองข้อมูลที่ลบไว้ ไม่กระทบ Master ประวัติเดิม</p><div className="mt-5 flex justify-end gap-2"><button disabled={deleting} onClick={()=>setDeleteTarget(null)} className="border rounded-xl px-4 py-2">ยกเลิก</button><button disabled={deleting} onClick={removeReceived} className="bg-red-700 text-white rounded-xl px-4 py-2 disabled:opacity-50">{deleting?'กำลังลบ...':'ยืนยันลบ'}</button></div></div></div>}
      {edit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-3 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-auto">
            <div className="p-4 border-b flex justify-between">
              <b>แก้ไข {edit.inventory}</b>
              <button onClick={() => setEdit(null)}>
                <X />
              </button>
            </div>
            <div className="p-4 grid md:grid-cols-2 gap-3">
              {(
                [
                  ['seq', 'ลำดับที่'],
                  ['item', 'รายการที่ขอซื้อ'],
                  ['unit', 'หน่วยงาน'],
                  ['inventory', 'เลข Inventory'],
                  ['keyed', 'วันที่หน่วยงานคีย์'],
                  ['day', 'รับวันที่'],
                  ['month', 'รับเดือน'],
                  ['year', 'รับปี'],
                  ['category', 'หมวด'],
                  ['fund', 'ประเภทเงิน'],
                  ['fundYear', 'ปีแหล่งเงิน (68 / 69 / 70)'],
                  ['amount', 'วงเงิน'],
                  ['note', 'หมายเหตุ'],
                  ['officer', 'เจ้าหน้าที่จัดซื้อ'],
                ] as [keyof Row, string][]
              ).map(([k, label]) => (
                <label
                  className={
                    k === 'item' || k === 'note' ? 'md:col-span-2' : ''
                  }
                >
                  <span className="text-xs text-slate-500">{label}</span>
                  <input
                    value={String(edit[k] ?? '')}
                    onChange={e =>
                      setEdit({
                        ...edit,
                        [k]: ['seq', 'day', 'month', 'year', 'amount'].includes(
                          k
                        )
                          ? Number(e.target.value)
                          : e.target.value,
                      })
                    }
                    className="mt-1 w-full border rounded-xl px-3 py-2"
                  />
                </label>
              ))}
            </div>
            <div className="p-4 border-t flex justify-end">
              <button
                onClick={save}
                className="bg-blue-700 text-white rounded-xl px-5 py-2 flex gap-2"
              >
                <Save size={18} />
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Card({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm flex justify-between">
      <div>
        <div className="text-xs text-slate-500">{title}</div>
        <div className="text-xl font-bold mt-1">{value}</div>
      </div>
      <div className="text-blue-600">{icon}</div>
    </div>
  );
}
export default App;
