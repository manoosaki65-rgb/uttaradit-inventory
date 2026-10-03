import { useEffect, useMemo, useRef, useState } from 'react';
import { api, auth } from './inventory-client';
import { Search, Upload, Pencil, Trash2, X, Save, Home } from 'lucide-react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { receivedDateFromData } from './inventory-rules';
import reportCss from './index.css?raw';

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
const OWNER_EMAIL = 'manoosaki65@gmail.com';

function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [filterSeq,setFilterSeq]=useState('');
  const [filterItem,setFilterItem]=useState('');
  const [filterUnit,setFilterUnit]=useState('');
  const [filterInventory,setFilterInventory]=useState('');
  const [filterKeyed,setFilterKeyed]=useState('');
  const [filterDay,setFilterDay]=useState('');
  const [filterMonth,setFilterMonth]=useState('');
  const [filterYear,setFilterYear]=useState('');
  const [filterCategory,setFilterCategory]=useState('');
  const [filterFund,setFilterFund]=useState('');
  const [filterFundYear,setFilterFundYear]=useState('');
  const [filterAmount,setFilterAmount]=useState('');
  const [filterNote,setFilterNote]=useState('');
  const [filterOfficer,setFilterOfficer]=useState('');
  const [filterOptions,setFilterOptions]=useState<{years:string[];months:number[];units:string[];categories:string[];funds:string[];fundYears:string[];officers:string[]}>({years:[],months:[],units:[],categories:[],funds:[],fundYears:[],officers:[]});
  const [edit, setEdit] = useState<Row | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState(new URLSearchParams(window.location.search).has('local-test')?'โหมดทดสอบ Local — ใช้ข้อมูลรายวันแยกจากทะเบียนหลัก ไม่ใช่ Master 4,107 รายการ':'');
  const [total,setTotal]=useState(0);
  const [page,setPage]=useState(1);
  const [pages,setPages]=useState(1);
  const [sender,setSender]=useState('นายมนูศักดิ์ อยู่บาง');
  const [receiver,setReceiver]=useState('นางวราพร จันทร์ศรีทอง');
  const [receiverRole,setReceiverRole]=useState('หัวหน้ากลุ่มงานพัสดุ');
  const [signEdit,setSignEdit]=useState(false);
  const [selectedFiles,setSelectedFiles]=useState<File[]>([]);
  const [previewMode,setPreviewMode]=useState(false);
  const [previewDocument,setPreviewDocument]=useState('');
  const previewFrameRef=useRef<HTMLIFrameElement | null>(null);
  const [importing,setImporting]=useState(false);
  const importBusy=useRef(false);
  const [rangeOpen,setRangeOpen]=useState(false);
  const [fromDate,setFromDate]=useState('');
  const [toDate,setToDate]=useState('');
  const [dateBasis,setDateBasis]=useState<'keyed'|'received'>('received');
  const [printBasis,setPrintBasis]=useState<'keyed'|'received'>('received');
  const [printRange,setPrintRange]=useState('');
  const [ownerEmail,setOwnerEmail]=useState('');
  const [authBusy,setAuthBusy]=useState(false);
  const tableScrollRef=useRef<HTMLDivElement | null>(null);
  const topScrollRef=useRef<HTMLDivElement | null>(null);
  const syncingScroll=useRef(false);
  const initialLatestScrollDone=useRef(false);
  const syncHorizontal=(source:'top'|'table')=>{if(syncingScroll.current)return;const from=source==='top'?topScrollRef.current:tableScrollRef.current;const to=source==='top'?tableScrollRef.current:topScrollRef.current;if(!from||!to)return;syncingScroll.current=true;to.scrollLeft=from.scrollLeft;window.requestAnimationFrame(()=>{syncingScroll.current=false;});};
  const thaiMonths=['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const formatRowDate=(r:Pick<Row,'day'|'month'|'year'>)=>`${r.day} ${thaiMonths[r.month]||r.month} ${r.year<100?2500+r.year:r.year}`;
  const formatIsoDate=(iso:string)=>{const [y,m,d]=iso.split('-').map(Number);return `${d} ${thaiMonths[m]||m} ${y+543}`;};
  const printDatePart=(r:Row,part:'day'|'month'|'year')=>{if(printBasis!=='keyed')return r[part];const text=String(r.keyed||'').trim();const iso=text.match(/^(\d{4})-(\d{2})-(\d{2})/);if(iso){const values={day:Number(iso[3]),month:Number(iso[2]),year:(Number(iso[1])+543)%100};return values[part];}const slash=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(slash){const rawYear=Number(slash[3]);const buddhistYear=rawYear<100?2500+rawYear:rawYear<2400?rawYear+543:rawYear;const values={day:Number(slash[1]),month:Number(slash[2]),year:buddhistYear%100};return values[part];}return r[part];};
  const rangeLabel=(list:Row[])=>{if(!list.length)return '';const sorted=[...list].sort((a,b)=>(a.year-b.year)||(a.month-b.month)||(a.day-b.day)||(a.seq-b.seq));return `ช่วงวันที่ : ${formatRowDate(sorted[0])} ถึง ${formatRowDate(sorted[sorted.length-1])}`;};
  const reportDate = printRange || rangeLabel(rows);
  useEffect(()=>{
    if(!previewMode)return;
    const pages=document.querySelector('.print-pages')?.outerHTML||'';
    const signatures=document.querySelector('.print-only.signatures')?.outerHTML||'';
    const css=reportCss.replace('@media print','@media all');
    setPreviewDocument(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายงานทะเบียนรับ Inventory</title><style>${css}\n@media screen { body { background:#e2e8f0 !important; padding:12px; } #root { background:white; margin:auto !important; width:287mm !important; padding:5mm; } .print-page:not(:last-child) { margin-bottom:10mm !important; } }</style></head><body><div id="root"><div><main>${pages}${signatures}</main></div></div></body></html>`);
  },[previewMode,rows,printBasis,printRange,sender,receiver,receiverRole]);
  const load = async (target?:number, search?:string, attempt=0):Promise<void> => {
    try {
      const params = new URLSearchParams({ page: String(target ?? ''), pageSize: '5000', q: search ?? q, seq:filterSeq, item:filterItem, unit:filterUnit, inventory:filterInventory, keyed:filterKeyed, day:filterDay, month:filterMonth, year:filterYear, category:filterCategory, fund:filterFund, fundYear:filterFundYear, amount:filterAmount, note:filterNote, officer:filterOfficer });
      const r = await api.get('/api/current?' + params.toString());
      setRows((r.data.items as Row[]).map(normalizeRow));
      setTotal(r.data.total);
      setPage(r.data.page);
      setPages(r.data.pages);
      if(r.data.filterOptions)setFilterOptions(r.data.filterOptions);
    } catch {
      if (attempt < 1) {
        await new Promise(resolve => window.setTimeout(resolve,800));
        return load(target,search,attempt+1);
      }
      setRows([]);
      setTotal(0);
      setMsg('โหลด Master Inventory ไม่สำเร็จ กรุณาลองใหม่');
    }
  };
  useEffect(() => {
    load();
    auth.getUser().then(user => setOwnerEmail(String(user?.email ?? '').toLowerCase())).catch(() => setOwnerEmail(''));
  }, []);
  useEffect(()=>{
    if(!rows.length||initialLatestScrollDone.current)return;
    initialLatestScrollDone.current=true;
    window.requestAnimationFrame(()=>{
      const el=tableScrollRef.current;
      if(el)el.scrollTop=el.scrollHeight;
    });
  },[rows]);
  const filtered = useMemo(() => [...rows].sort((a,b)=>(a.year-b.year)||(a.month-b.month)||(a.day-b.day)||(a.seq-b.seq)), [rows]);
  const formatAmount=(value:number)=>Number(value||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
  const printTotal = useMemo(() => filtered.reduce((sum,row)=>sum+(Number(row.amount)||0),0), [filtered]);
  const missingFundYears = useMemo(() => filtered.filter(row=>!String(row.fundYear||'').trim()).length, [filtered]);
  const save = async () => {
    if (!edit) return;
    try { await api.put('/api/current/' + encodeURIComponent(edit.id), edit);
      setEdit(null); setMsg('บันทึกการแก้ไขใน Local แล้ว'); await load(page,q);
    } catch(cause) {setMsg(cause instanceof Error?cause.message:'บันทึกไม่สำเร็จ');}
  };
  const saveFundYear=async(row:Row,value:string)=>{
    const previous=String(row.fundYear||'');
    setRows(current=>current.map(item=>item.id===row.id?{...item,fundYear:value}:item));
    try{
      await api.put('/api/current/'+encodeURIComponent(row.id),{fundYear:value});
      setMsg(`บันทึกปีแหล่งเงิน ${value} ให้ ${row.inventory} แล้ว`);
    }catch{
      setRows(current=>current.map(item=>item.id===row.id?{...item,fundYear:previous}:item));
      setMsg(`บันทึกปีแหล่งเงินของ ${row.inventory} ไม่สำเร็จ กรุณาลองใหม่`);
    }
  };
  const cancelReceived = async (row:Row) => {
    try {
      const note = row.note.includes('ยกเลิก') ? row.note : ['ยกเลิก',row.note].filter(Boolean).join(' — ');
      await api.put('/api/current/'+encodeURIComponent(row.id),{note});
      setEdit(null);
      setCancelTarget(null);
      setMsg(`ยกเลิกรายการ ${row.inventory} แล้ว และเก็บไว้ในทะเบียน Local`);
      await load(page,q);
    } catch { setMsg(`ยกเลิกรายการ ${row.inventory} ไม่สำเร็จ`); }
  };
  const requestDelete = async (row:Row) => {
    let email=ownerEmail;
    if(email!==OWNER_EMAIL){
      setAuthBusy(true);
      try{
        const result=await auth.signIn({scope:'openid email profile offline_access'});
        email=String(result.user.email??'').toLowerCase();
        setOwnerEmail(email);
      }catch(cause){
        const code=(cause as {code?:string})?.code;
        setMsg(code==='popup_closed'?'ยกเลิกการเข้าสู่ระบบแล้ว':cause instanceof Error?cause.message:'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่');
        setAuthBusy(false);
        return;
      }
      setAuthBusy(false);
    }
    if(email!==OWNER_EMAIL){
      setMsg('บัญชีนี้ไม่มีสิทธิ์ลบรายการ — สิทธิ์ลบกำหนดให้ manoosaki65@gmail.com เท่านั้น');
      return;
    }
    setDeleteTarget(row);
    setEdit(null);
  };
  const removeReceived = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await api.delete('/api/current/' + encodeURIComponent(deleteTarget.id));
      setDeleteTarget(null);
      setMsg('ลบรายการออกจาก Master แล้ว และเก็บข้อมูลสำรองไว้แล้ว');
      await load(page,q);
    } catch {
      setMsg('ลบไม่สำเร็จ หรือบัญชีนี้ไม่มีสิทธิ์ลบ ข้อมูลเดิมยังอยู่');
    } finally { setDeleting(false); }
  };
  const search = async () => { await load(1,q); };
  useEffect(()=>{load(undefined,q);},[filterSeq,filterItem,filterUnit,filterInventory,filterKeyed,filterDay,filterMonth,filterYear,filterCategory,filterFund,filterFundYear,filterAmount,filterNote,filterOfficer]);
  const clearFilters=()=>{setFilterSeq('');setFilterItem('');setFilterUnit('');setFilterInventory('');setFilterKeyed('');setFilterDay('');setFilterMonth('');setFilterYear('');setFilterCategory('');setFilterFund('');setFilterFundYear('');setFilterAmount('');setFilterNote('');setFilterOfficer('');};
  const hasColumnFilter=Boolean(filterSeq||filterItem||filterUnit||filterInventory||filterKeyed||filterDay||filterMonth||filterYear||filterCategory||filterFund||filterFundYear||filterAmount||filterNote||filterOfficer);
  const printSavedRows=()=>{if(!rows.length)return;const missing=rows.filter(row=>!String(row.fundYear||'').trim());if(missing.length){setMsg(`ยังพิมพ์ไม่ได้ กรุณาเลือกปีแหล่งเงินให้ครบอีก ${missing.length} รายการ`);return;}setPrintBasis('received');setPrintRange(rangeLabel(rows));setPreviewMode(true);};
  const printDateRange=async()=>{if(!fromDate||!toDate||fromDate>toDate){setMsg('กรุณาเลือกช่วงวันที่ให้ถูกต้อง');return;}const basisLabel=dateBasis==='keyed'?'วันที่หน่วยงานคีย์':'รับวันที่';try{const params=new URLSearchParams({from:fromDate,to:toDate,basis:dateBasis});const r=await api.get('/api/print-range?'+params.toString());const items=(r.data.items as Row[]).map(normalizeRow);if(!items.length){setMsg(`ไม่พบรายการตาม${basisLabel}ในช่วงวันที่ที่เลือก`);return;}const missing=items.filter(row=>!String(row.fundYear||'').trim());if(missing.length){setMsg(`ยังพิมพ์ไม่ได้ กรุณาเลือกปีแหล่งเงินให้ครบอีก ${missing.length} รายการ`);return;}setRows(items);setTotal(items.length);setPage(1);setPages(1);setPrintBasis(dateBasis);setPrintRange(`ช่วงวันที่ : ${formatIsoDate(fromDate)} ถึง ${formatIsoDate(toDate)}`);setRangeOpen(false);setPreviewMode(true);setMsg(`เตรียมพิมพ์ ${items.length} รายการตาม${basisLabel}จากทะเบียน Local`);}catch(cause){setMsg(cause instanceof Error?cause.message:'โหลดข้อมูลช่วงวันที่สำหรับพิมพ์ไม่สำเร็จ');}};
  const importFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []);
    if (!fs.length) return;
    setSelectedFiles(fs);
    setPreviewMode(false);
    setMsg('เลือกไฟล์แล้ว ' + fs.map(f => f.name).join(' + ') + ' — กด “อัปเดต Master” เพื่อรวมรายการของวันนั้นเข้าทะเบียนเดียว');
  };
  const processTestFiles = async () => {
    if(importBusy.current)return;
    const excel=selectedFiles.find(f=>/\.xlsx?$/i.test(f.name));
    const pdf=selectedFiles.find(f=>/\.pdf$/i.test(f.name));
    if(!excel&&!pdf){setMsg('กรุณาเลือกไฟล์ Excel หรือ PDF');return;}
    if(selectedFiles.length>2||selectedFiles.filter(f=>/\.xlsx?$/i.test(f.name)).length>1||selectedFiles.filter(f=>/\.pdf$/i.test(f.name)).length>1||selectedFiles.some(f=>!(/\.(xlsx?|pdf)$/i.test(f.name)))){setMsg('เลือก Excel 1 ไฟล์ และ/หรือ PDF 1 ไฟล์ของวันเดียวกันต่อครั้ง');return;}
    importBusy.current=true;setImporting(true);
    type ImportRow=Omit<Row,'id'>;
    const parseExcel=async(file:File):Promise<ImportRow[]>=>{
      const data=await file.arrayBuffer();
      const book=XLSX.read(data,{type:'array',cellDates:false});
      let best:ImportRow[]=[];
      const clean=(value:unknown)=>repairLegacyThai(String(value??'').replace(/_x000D_/g,'').replace(/\s*\n\s*/g,' ').trim());
      const normalizeInventory=(value:unknown)=>clean(value).replace(/[–—−]/g,'-').replace(/\s+/g,'');
      const isInventory=(value:unknown)=>/^\d{2}-\d{5}$/.test(normalizeInventory(value));
      for(const sheetName of book.SheetNames){
        const sheet=book.Sheets[sheetName];
        const grid=XLSX.utils.sheet_to_json<(string|number|null)[]>(sheet,{header:1,defval:null,raw:false});
        for(const merge of sheet['!merges']??[]){
          if(merge.s.c!==merge.e.c) continue;
          const value=grid[merge.s.r]?.[merge.s.c];
          if(value===null||value===undefined||clean(value)==='') continue;
          for(let rowIndex=merge.s.r;rowIndex<=merge.e.r;rowIndex++){
            if(!grid[rowIndex]) grid[rowIndex]=[];
            if(grid[rowIndex][merge.s.c]===null||grid[rowIndex][merge.s.c]===undefined||clean(grid[rowIndex][merge.s.c])==='') grid[rowIndex][merge.s.c]=value;
          }
        }
        const recordRows=grid.filter(r=>r.some(v=>isInventory(v)));
        let candidate:ImportRow[]=[];
        const headerIndex=grid.findIndex(r=>r.some(v=>/inventory|เลขที่หนังสือ/i.test(clean(v)))&&r.some(v=>clean(v).includes('รายการ')));
        if(headerIndex>=0){
          const header=grid[headerIndex].map(clean);
          const col=(names:string[])=>header.findIndex(h=>names.some(n=>h.includes(n)));
          const idx={received:col(['วันที่รับเรื่อง','วันที่รับเอกสาร','รับวันที่']),receivedMonth:col(['รับเดือน','เดือน']),receivedYear:col(['รับปี','ปี']),seq:col(['ลำดับ','ที่']),item:col(['รายการที่ขอซื้อ','รายการ']),unit:col(['หน่วยงาน']),inventory:col(['Inventory','เลขที่หนังสือ']),keyed:col(['วันที่หน่วยงานคีย์','วันที่คีย์','วันที่บันทึกข้อมูล','วันบันทึก']),category:col(['หมวด']),fund:col(['ประเภทเงิน']),amount:col(['วงเงิน']),note:col(['หมายเหตุ'])};
          if(idx.inventory>=0&&idx.item>=0)candidate=grid.slice(headerIndex+1).filter(r=>r.some(v=>isInventory(v))).map((r,i)=>{const actualInventoryIndex=r.findIndex(v=>isInventory(v));const inventoryIndex=actualInventoryIndex>=0?actualInventoryIndex:idx.inventory;const legacyHosp=inventoryIndex===7;const seqValue=legacyHosp?Number(clean(r[1])):(idx.seq>=0?Number(clean(r[idx.seq])):0);const leftStart=idx.seq>=0?idx.seq+1:0;const leftValues=r.slice(leftStart,inventoryIndex).map(clean).filter(Boolean);const item=legacyHosp?clean(r[2]):clean(r[idx.item])||leftValues[0]||'';const unit=legacyHosp?clean(r[5]):(idx.unit>=0?clean(r[idx.unit])||leftValues.find(value=>value!==item)||'':leftValues.find(value=>value!==item)||'');return {seq:seqValue||i+1,item,unit,inventory:normalizeInventory(r[inventoryIndex]),keyed:legacyHosp?clean(r[8]):(idx.keyed>=0?clean(r[idx.keyed]):clean(r[inventoryIndex+1])),...receivedDateFromData(legacyHosp?r[10]:idx.received>=0?(idx.receivedMonth>=0&&idx.receivedYear>=0?[clean(r[idx.received]),clean(r[idx.receivedMonth]),clean(r[idx.receivedYear])].join('/') : r[idx.received]):''),category:legacyHosp?clean(r[11]):(idx.category>=0?clean(r[idx.category]):clean(r[inventoryIndex+4])),fund:legacyHosp?clean(r[13]):(idx.fund>=0?clean(r[idx.fund]):clean(r[inventoryIndex+6])),amount:Number((legacyHosp?clean(r[16]):idx.amount>=0?clean(r[idx.amount]):clean(r[inventoryIndex+9])).replace(/,/g,''))||0,note:legacyHosp?clean(r[17]):(idx.note>=0?clean(r[idx.note]):clean(r[inventoryIndex+10])),officer:''};});
        }
        if(!candidate.length&&recordRows.length){
          const sample=recordRows[0];const inventoryIndex=sample.findIndex(v=>isInventory(v));const seqIndex=sample.findIndex((v,i)=>i<inventoryIndex&&/^\d{1,3}$/.test(clean(v)));const itemIndex=sample.findIndex((v,i)=>i>seqIndex&&i<inventoryIndex&&Boolean(clean(v)));let unitIndex=-1;for(let i=itemIndex+1;i<inventoryIndex;i++)if(clean(sample[i]))unitIndex=i;
          if(inventoryIndex>=0&&seqIndex>=0&&itemIndex>=0&&unitIndex>=0)candidate=recordRows.map((r,i)=>({seq:Number(clean(r[seqIndex]))||i+1,item:clean(r[itemIndex]),unit:clean(r[unitIndex]),inventory:normalizeInventory(r[inventoryIndex]),keyed:clean(r[inventoryIndex+1]),...receivedDateFromData(r[inventoryIndex+2]),category:clean(r[inventoryIndex+4]),fund:clean(r[inventoryIndex+6]),amount:Number(clean(r[inventoryIndex+9]).replace(/,/g,''))||0,note:clean(r[inventoryIndex+10]),officer:''}));
        }
        const usable=candidate.filter(row=>isInventory(row.inventory)&&Boolean(row.item));
        if(usable.length<=1000&&usable.length>best.length)best=usable;
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
          // The original PDF right-aligns million-baht values at x=736.14 (before 739).
          const amountText=band.filter(item=>item.x>=730&&item.x<785&&/^\d[\d,]*\.\d{2}$/.test(item.text)).map(item=>item.text).join('');
          parsed.push({seq:Number(anchor.text),item:text(44,227.5),unit:text(227.5,326),inventory,keyed:text(374,458),...receivedDateFromData(text(458,509)),category:text(509,617),fund:text(617,730),amount:Number((amountText||text(739,785)).replace(/,/g,'').match(/[\d.]+/)?.[0]??0),note:text(785,1100),officer:''});
        }
      }
      return parsed.sort((a,b)=>a.seq-b.seq);
    };
    try {
      let parsed:ImportRow[]=[]; let used=''; let excelError=false; let pdfError=false; let excelRows:ImportRow[]=[]; let pdfRows:ImportRow[]=[];
      if(excel){try{excelRows=await parseExcel(excel);if(!excelRows.length)excelError=true;}catch(cause){console.error('Excel import failed',cause);excelError=true;}}
      if(pdf){try{pdfRows=await parsePdf(pdf);if(!pdfRows.length)pdfError=true;}catch{pdfError=true;}}
      if(excelRows.length&&pdfRows.length){const pdfByKey=new Map(pdfRows.map(r=>[[r.seq,r.inventory].join('|'),r]));const excelKeys=new Set(excelRows.map(r=>[r.seq,r.inventory].join('|')));parsed=excelRows.map(r=>{const p=pdfByKey.get([r.seq,r.inventory].join('|'));if(p&&[r.day,r.month,r.year].join('/')!==[p.day,p.month,p.year].join('/'))throw new Error('วันที่รับเอกสารใน Excel และ PDF ไม่ตรงกัน');return p?{...p,...r,item:r.item||p.item,unit:r.unit||p.unit,keyed:r.keyed||p.keyed,category:r.category||p.category,fund:r.fund||p.fund,amount:r.amount||p.amount,note:r.note||p.note}:r;});parsed.push(...pdfRows.filter(r=>!excelKeys.has([r.seq,r.inventory].join('|'))));used='Excel + PDF (ตรวจเทียบ)';}
      else if(excelRows.length){parsed=excelRows;used='Excel';}
      else if(pdfRows.length){parsed=pdfRows;used='PDF';}
      if(excelError||pdfError)throw new Error('อ่านไฟล์หรือวันที่รับเอกสารในข้อมูลไม่ครบ — ยังไม่ได้บันทึก');
      if(!parsed.length) throw new Error('ไม่พบรายการ Inventory ที่อ่านได้');
      const unique=new Map<string,ImportRow>();for(const row of parsed.sort((a,b)=>a.seq-b.seq))unique.set([row.seq,row.inventory,row.day,row.month,row.year].join('|'),row);parsed=[...unique.values()].sort((a,b)=>a.seq-b.seq);
      const sequenceOk=parsed.every((row,index)=>row.seq===index+1);
      const sourceName=selectedFiles.map(f=>f.name).join(' + ');
      const r=await api.post('/api/current/import',{rows:parsed,source:sourceName});
      setRows((r.data.items as Row[]).map(normalizeRow)); setTotal(r.data.total); setPage(1); setPages(1); setPreviewMode(false);setPrintRange('');
      if(r.data.filterOptions)setFilterOptions(r.data.filterOptions);
      setMsg('อัปเดตทะเบียน Local สำเร็จจาก ' + used + ' · อ่านได้ ' + parsed.length + ' รายการ · ' + (sequenceOk?'ลำดับ 1–'+parsed.length+' ครบ':'กรุณาตรวจลำดับรายการ') + ' · เพิ่มใหม่ ' + r.data.added + ' · ซ่อมข้อมูลเดิม ' + r.data.updated + ' · ' + rangeLabel(parsed as Row[]) + ' · รวมวันนั้น ' + r.data.total + ' รายการ · กรุณาเลือกปีแหล่งเงิน 68 / 69 / 70 ให้ครบก่อนพิมพ์' + (excelError&&used==='PDF'?' · Excel อ่านไม่ผ่าน จึงใช้ PDF แทน':'') + (pdfError&&used==='Excel'?' · PDF อ่านไม่ผ่าน จึงใช้ Excel':''));
    } catch (cause) {
      console.error('Inventory import failed',cause);
      setMsg(cause instanceof Error?cause.message:'อ่านทั้ง Excel/PDF ไม่สำเร็จ — ยังไม่ได้เพิ่มข้อมูลใน Local');
    } finally {importBusy.current=false;setImporting(false);}
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
          {selectedFiles.length>0 && <button onClick={processTestFiles} disabled={importing} className="bg-emerald-600 text-white rounded-xl px-4 py-2 font-semibold disabled:opacity-40">{importing?'กำลังอ่านไฟล์...':'อัปเดต Master'}</button>}
          {missingFundYears>0&&<div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-2 font-semibold">รอเลือกปีแหล่งเงิน {missingFundYears} รายการในหน้านี้</div>}
          <button onClick={printSavedRows} disabled={!rows.length} className="bg-white border border-blue-200 text-blue-800 rounded-xl px-4 py-2 font-semibold disabled:opacity-40">พรีวิว / พิมพ์รายงาน</button>
          <button onClick={() => setRangeOpen(true)} className="bg-white border border-blue-200 text-blue-800 rounded-xl px-4 py-2 font-semibold">เลือกช่วงวันที่ / พิมพ์ย้อนหลัง</button>
        </div>
        {selectedFiles.length>0 && <div className="screen-only mb-3 bg-white border rounded-xl px-4 py-3"><div className="font-semibold">ไฟล์ที่เลือกสำหรับทดสอบ</div><div className="text-sm text-slate-600 mt-1">{selectedFiles.map(f=>f.name).join(' + ')}</div></div>}
        {msg && <div className="screen-only mb-3 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl">{msg}</div>}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="screen-only p-4 border-b space-y-2">
            <div className="flex flex-wrap sm:flex-nowrap gap-3 items-center">
              <Search className="text-slate-400" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')search()}}
                placeholder="ค้นหาเลข Inventory, รายการ, หน่วยงาน, หมายเหตุ, เจ้าหน้าที่จัดซื้อ..."
                className="min-w-0 flex-1 outline-none"
              />
              <button onClick={search} className="bg-blue-700 text-white rounded-lg px-4 py-2">ค้นหา</button>
              {hasColumnFilter && <button onClick={clearFilters} className="border rounded-lg px-3 py-2 text-slate-600">ล้างตัวกรอง</button>}
            </div>
            <div className="text-xs text-slate-500">ผลลัพธ์ {total.toLocaleString('th-TH')} รายการ · กรองจากหัวตารางเหมือน Excel</div>
          </div>
          <div ref={topScrollRef} onScroll={()=>syncHorizontal('top')} className="screen-only hidden lg:block overflow-x-scroll overflow-y-hidden border-y border-slate-200 bg-slate-50 h-[18px]">
            <div className="w-[1266px] h-px" />
          </div>
          <div ref={tableScrollRef} onScroll={()=>syncHorizontal('table')} className="screen-table screen-only hidden lg:block h-[330px] overflow-x-scroll overflow-y-auto overscroll-contain">
            <table className="min-w-[1266px] w-full table-fixed text-[12px] whitespace-nowrap">
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
                      x === 'ลำดับ' ? 'w-[42px]' : '',
                      x === 'รายการที่ขอซื้อ' ? 'w-[180px]' : '',
                      x === 'หน่วยงาน' ? 'w-[105px]' : '',
                      x === 'เลข Inventory' ? 'w-[90px]' : '',
                      x === 'วันที่หน่วยงานคีย์' ? 'w-[100px]' : '',
                      x === 'รับวันที่' ? 'w-[48px]' : '',
                      x === 'เดือน' || x === 'ปี' ? 'w-[38px]' : '',
                      x === 'หมวด' ? 'w-[90px]' : '',
                      x === 'ประเภทเงิน' ? 'w-[95px]' : '',
                      x === 'ปีแหล่งเงิน' ? 'w-[72px]' : '',
                      x === 'วงเงิน' ? 'w-[90px]' : '',
                      x === 'หมายเหตุ' ? 'w-[110px]' : '',
                      x === 'เจ้าหน้าที่จัดซื้อ' ? 'screen-only w-[90px]' : '',
                      x === '' ? 'screen-only sticky right-0 z-20 w-[78px] min-w-[78px] bg-slate-50' : '',
                    ].filter(Boolean).join(' ')}>
                      {x==='ลำดับ' ? <div className="space-y-1"><div>{x}</div><input aria-label="กรองลำดับ" value={filterSeq} onChange={e=>setFilterSeq(e.currentTarget.value)} placeholder="ค้น" className="w-full border rounded px-1 py-1 bg-white font-normal text-[11px]"/></div> :
                       x==='รายการที่ขอซื้อ' ? <div className="space-y-1"><div>{x}</div><input aria-label="กรองรายการที่ขอซื้อ" value={filterItem} onChange={e=>setFilterItem(e.currentTarget.value)} placeholder="ค้นรายการ" className="w-full border rounded px-1 py-1 bg-white font-normal text-[11px]"/></div> :
                       x==='หน่วยงาน' ? <div className="space-y-1"><div>{x}</div><select aria-label="กรองหน่วยงาน" value={filterUnit} onChange={e=>setFilterUnit(e.currentTarget.value)} className="w-full border rounded px-1 py-1 bg-white font-normal text-[11px]"><option value="">ทั้งหมด</option>{filterOptions.units.map(unit=><option key={unit} value={unit}>{unit}</option>)}</select></div> :
                       x==='เลข Inventory' ? <div className="space-y-1"><div>{x}</div><input aria-label="กรองเลข Inventory" value={filterInventory} onChange={e=>setFilterInventory(e.currentTarget.value)} placeholder="69-..." className="w-full border rounded px-1 py-1 bg-white font-normal text-[11px]"/></div> :
                       x==='วันที่หน่วยงานคีย์' ? <div className="space-y-1"><div>{x}</div><input aria-label="กรองวันที่หน่วยงานคีย์" value={filterKeyed} onChange={e=>setFilterKeyed(e.currentTarget.value)} placeholder="ค้น" className="w-full border rounded px-1 py-1 bg-white font-normal text-[11px]"/></div> :
                       x==='รับวันที่' ? <div className="space-y-1"><div>{x}</div><select aria-label="กรองวันที่รับ" value={filterDay} onChange={e=>setFilterDay(e.currentTarget.value)} className="w-full border rounded px-1 py-1 bg-white font-normal text-[11px]"><option value="">ทั้งหมด</option>{Array.from({length:31},(_,i)=>i+1).map(day=><option key={day} value={day}>{day}</option>)}</select></div> :
                       x==='เดือน' ? <div className="space-y-1"><div>{x}</div><select aria-label="กรองเดือนรับ" value={filterMonth} onChange={e=>setFilterMonth(e.currentTarget.value)} className="w-full border rounded px-1 py-1 bg-white font-normal text-[11px]"><option value="">ทั้งหมด</option>{filterOptions.months.map(month=><option key={month} value={month}>{month}</option>)}</select></div> :
                       x==='ปี' ? <div className="space-y-1"><div>{x}</div><select aria-label="กรองปีรับ" value={filterYear} onChange={e=>setFilterYear(e.currentTarget.value)} className="w-full border rounded px-1 py-1 bg-white font-normal text-[11px]"><option value="">ทั้งหมด</option>{filterOptions.years.map(y=><option key={y} value={y}>{y}</option>)}</select></div> :
                       x==='หมวด' ? <div className="space-y-1"><div>{x}</div><select aria-label="กรองหมวด" value={filterCategory} onChange={e=>setFilterCategory(e.currentTarget.value)} className="w-full border rounded px-1 py-1 bg-white font-normal text-[11px]"><option value="">ทั้งหมด</option>{filterOptions.categories.map(v=><option key={v} value={v}>{v}</option>)}</select></div> :
                       x==='ประเภทเงิน' ? <div className="space-y-1"><div>{x}</div><select aria-label="กรองประเภทเงิน" value={filterFund} onChange={e=>setFilterFund(e.currentTarget.value)} className="w-full border rounded px-1 py-1 bg-white font-normal text-[11px]"><option value="">ทั้งหมด</option>{filterOptions.funds.map(v=><option key={v} value={v}>{v}</option>)}</select></div> :
                       x==='ปีแหล่งเงิน' ? <div className="space-y-1"><div>{x}</div><select aria-label="กรองปีแหล่งเงิน" value={filterFundYear} onChange={e=>setFilterFundYear(e.currentTarget.value)} className="w-full border rounded px-1 py-1 bg-white font-normal text-[11px]"><option value="">ทั้งหมด</option>{filterOptions.fundYears.map(v=><option key={v} value={v}>{v}</option>)}</select></div> :
                       x==='วงเงิน' ? <div className="space-y-1"><div>{x}</div><input aria-label="กรองวงเงิน" value={filterAmount} onChange={e=>setFilterAmount(e.currentTarget.value)} placeholder="ตัวเลข" className="w-full border rounded px-1 py-1 bg-white font-normal text-[11px]"/></div> :
                       x==='หมายเหตุ' ? <div className="space-y-1"><div>{x}</div><input aria-label="กรองหมายเหตุ" value={filterNote} onChange={e=>setFilterNote(e.currentTarget.value)} placeholder="ค้น" className="w-full border rounded px-1 py-1 bg-white font-normal text-[11px]"/></div> :
                       x==='เจ้าหน้าที่จัดซื้อ' ? <div className="space-y-1"><div>{x}</div><select aria-label="กรองเจ้าหน้าที่จัดซื้อ" value={filterOfficer} onChange={e=>setFilterOfficer(e.currentTarget.value)} className="w-full border rounded px-1 py-1 bg-white font-normal text-[11px]"><option value="">ทั้งหมด</option>{filterOptions.officers.map(v=><option key={v} value={v}>{v}</option>)}</select></div> : x}
                    </th>
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
                    <td className="w-[42px] px-1.5 py-2.5 text-center">{r.seq}</td>
                    <td className="w-[180px] px-2 py-2.5 leading-snug whitespace-normal break-words">{r.item}</td>
                    <td className="w-[105px] px-2 py-2.5 leading-snug whitespace-normal break-words">{r.unit}</td>
                    <td className="w-[90px] px-2 py-2.5 font-semibold text-blue-700 whitespace-normal">{r.inventory}</td>
                    <td className="w-[100px] px-2 py-2.5 whitespace-normal break-words">{r.keyed}</td>
                    <td className="w-[48px] px-1.5 py-2.5 text-center"><span className="screen-only">{r.day}</span><span className="print-only">{printDatePart(r,'day')}</span></td>
                    <td className="w-[38px] px-1 py-2.5 text-center"><span className="screen-only">{r.month}</span><span className="print-only">{printDatePart(r,'month')}</span></td>
                    <td className="w-[38px] px-1 py-2.5 text-center"><span className="screen-only">{r.year}</span><span className="print-only">{printDatePart(r,'year')}</span></td>
                    <td className="w-[90px] px-2 py-2.5 leading-snug whitespace-normal break-words">{r.category}</td>
                    <td className="w-[95px] px-2 py-2.5 leading-snug whitespace-normal break-words">{r.fund}</td>
                    <td className="w-[72px] px-1.5 py-2">
                      <select aria-label={'ปีแหล่งเงิน '+r.inventory} value={r.fundYear||''} onChange={e=>saveFundYear(r,e.currentTarget.value)} className={`w-full rounded-lg border px-2 py-1.5 font-semibold outline-none ${r.fundYear?'border-emerald-300 bg-emerald-50 text-emerald-800':'border-amber-300 bg-amber-50 text-amber-900'}`}><option value="">เลือกปี</option><option value="68">68</option><option value="69">69</option><option value="70">70</option></select>
                    </td>
                    <td className="w-[90px] px-2 py-2.5 text-right font-medium tabular-nums">{formatAmount(r.amount)}</td>
                    <td className="w-[110px] px-2 py-2.5 leading-snug whitespace-normal break-words">{r.note}</td>
                    <td className="screen-only w-[90px] px-2 py-2.5 leading-snug whitespace-normal break-words">{r.officer}</td>
                    <td className="screen-only sticky right-0 z-10 w-[78px] min-w-[78px] bg-white px-1 shadow-[-6px_0_8px_-8px_rgba(15,23,42,0.35)]">
                      <div className="flex gap-1">
                        <button onClick={() => setEdit({ ...r })} className="px-2 py-1 rounded-lg hover:bg-blue-100 text-blue-700 inline-flex items-center gap-1" aria-label={'แก้ไข ' + r.inventory} title="แก้ไข"><Pencil size={16} /><span>แก้ไข</span></button>
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
                  <select aria-label={'ปีแหล่งเงิน '+r.inventory} value={r.fundYear||''} onChange={e=>saveFundYear(r,e.currentTarget.value)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${r.fundYear?'border-emerald-300 bg-emerald-50 text-emerald-800':'border-amber-300 bg-amber-50 text-amber-900'}`}><option value="">เลือกปีแหล่งเงิน</option><option value="68">68</option><option value="69">69</option><option value="70">70</option></select>
                  <span className="font-semibold text-slate-700">{formatAmount(r.amount)} บาท</span>
                  <div className="flex gap-2"><button onClick={() => setEdit({ ...r })} className="border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700 flex gap-2 items-center" aria-label={'แก้ไข ' + r.inventory}><Pencil size={16} />แก้ไข</button></div>
                </div>
                {r.note && <div className="mt-2 text-sm text-red-700">หมายเหตุ: {r.note}</div>}
              </article>
            ))}
          </div>
          <div className="screen-only p-3 border-t flex justify-between items-center"><button disabled={page<=1} onClick={()=>load(page-1,q)} className="border rounded-lg px-3 py-2 disabled:opacity-40">ก่อนหน้า</button><button disabled={page>=pages} onClick={()=>load(page+1,q)} className="border rounded-lg px-3 py-2 disabled:opacity-40">ถัดไป</button></div>
        </div>
        <div className="screen-only mt-4 bg-white border rounded-2xl p-4 flex flex-wrap items-end gap-4">
          <div><div className="text-xs text-slate-500">ผู้ส่ง</div><div className="font-semibold">{sender}</div></div>
          <div><div className="text-xs text-slate-500">ผู้รับ</div><div className="font-semibold">{receiver}</div><div className="text-sm">{receiverRole}</div></div>
          <button onClick={()=>setSignEdit(true)} className="border rounded-lg px-3 py-2 text-blue-700 flex gap-2 items-center"><Pencil size={16}/>เปลี่ยนชื่อก่อนพิมพ์</button>
        </div>
        <div className="print-only signatures"><div className="signature"><div>ผู้ส่ง ............................................................</div><div>({sender})</div></div><div className="signature"><div>ผู้รับ ............................................................</div><div>({receiver})</div><div>{receiverRole}</div></div></div>
      </main>
      {previewMode && <div role="dialog" aria-modal="true" aria-label="พรีวิวรายงาน Inventory" className="screen-only fixed inset-0 bg-black/40 z-[70] flex flex-col p-3"><div className="bg-white p-3 flex items-center justify-between rounded-t-xl"><b>พรีวิวรายงาน Inventory</b><div className="flex gap-2"><button onClick={()=>previewFrameRef.current?.contentWindow?.print()} className="bg-blue-700 text-white rounded-lg px-4 py-2">พิมพ์รายงาน</button><button onClick={()=>{setPreviewMode(false);load(page,q);}} className="border rounded-lg px-4 py-2">ปิดพรีวิว</button></div></div><iframe title="หน้าพิมพ์ทะเบียนรับ Inventory" ref={previewFrameRef} srcDoc={previewDocument} className="flex-1 w-full bg-white border-0" /></div>}
      {rangeOpen && <div className="screen-only fixed inset-0 bg-black/40 flex items-center justify-center p-3 z-50"><div className="bg-white rounded-2xl shadow-xl w-full max-w-lg"><div className="p-4 border-b flex justify-between"><b>เลือกช่วงวันที่จากทะเบียนทั้งหมด</b><button onClick={()=>setRangeOpen(false)}><X/></button></div><div className="p-4 grid sm:grid-cols-2 gap-3"><div className="sm:col-span-2"><div className="text-sm font-semibold text-slate-700">เลือกวันที่จากช่อง</div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setDateBasis('keyed')} className={`rounded-xl border px-3 py-3 text-left ${dateBasis==='keyed'?'border-blue-700 bg-blue-50 text-blue-800 ring-2 ring-blue-100':'border-slate-200'}`}><span className="block font-semibold">วันที่หน่วยงานคีย์</span><span className="block text-xs mt-1 opacity-75">เช่น วันที่ 8–9 ก.ย.</span></button><button type="button" onClick={()=>setDateBasis('received')} className={`rounded-xl border px-3 py-3 text-left ${dateBasis==='received'?'border-blue-700 bg-blue-50 text-blue-800 ring-2 ring-blue-100':'border-slate-200'}`}><span className="block font-semibold">รับวันที่</span><span className="block text-xs mt-1 opacity-75">วันที่ลงรับเอกสาร</span></button></div></div><label className="block"><span className="text-xs text-slate-500">วันที่เริ่มต้น</span><input type="date" value={fromDate} onChange={e=>setFromDate(e.currentTarget.value)} className="mt-1 w-full border rounded-xl px-3 py-2"/></label><label className="block"><span className="text-xs text-slate-500">วันที่สิ้นสุด</span><input type="date" value={toDate} onChange={e=>setToDate(e.currentTarget.value)} className="mt-1 w-full border rounded-xl px-3 py-2"/></label></div><div className="p-4 border-t flex justify-end gap-2"><button onClick={()=>setRangeOpen(false)} className="border rounded-xl px-4 py-2">ยกเลิก</button><button onClick={printDateRange} className="bg-blue-700 text-white rounded-xl px-5 py-2">พรีวิว / พิมพ์ช่วงวันที่</button></div></div></div>}
      {signEdit && <div className="screen-only fixed inset-0 bg-black/40 flex items-center justify-center p-3 z-50"><div className="bg-white rounded-2xl shadow-xl w-full max-w-lg"><div className="p-4 border-b flex justify-between"><b>เปลี่ยนชื่อผู้ส่ง / ผู้รับก่อนพิมพ์</b><button onClick={()=>setSignEdit(false)}><X/></button></div><div className="p-4 space-y-3"><label className="block"><span className="text-xs text-slate-500">ผู้ส่ง</span><input value={sender} onChange={e=>setSender(e.target.value)} className="mt-1 w-full border rounded-xl px-3 py-2"/></label><label className="block"><span className="text-xs text-slate-500">ผู้รับ</span><input value={receiver} onChange={e=>setReceiver(e.target.value)} className="mt-1 w-full border rounded-xl px-3 py-2"/></label><label className="block"><span className="text-xs text-slate-500">ตำแหน่งผู้รับ</span><input value={receiverRole} onChange={e=>setReceiverRole(e.target.value)} className="mt-1 w-full border rounded-xl px-3 py-2"/></label></div><div className="p-4 border-t flex justify-end"><button onClick={()=>setSignEdit(false)} className="bg-blue-700 text-white rounded-xl px-5 py-2">ใช้ชื่อนี้</button></div></div></div>}
      {deleteTarget && <div className="screen-only fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl"><h2 className="font-bold text-xl text-red-800">ยืนยันลบรายการ Inventory</h2><p className="mt-3 font-semibold">{deleteTarget.inventory} — {deleteTarget.item}</p><p className="mt-2 text-sm text-slate-600">รายการจะถูกนำออกจาก Master Inventory และเก็บข้อมูลสำรองไว้ การลบต้องใช้บัญชี manoosaki65@gmail.com</p><div className="mt-5 flex justify-end gap-2"><button disabled={deleting} onClick={()=>setDeleteTarget(null)} className="border rounded-xl px-4 py-2">ยกเลิก</button><button disabled={deleting} onClick={removeReceived} className="bg-red-700 text-white rounded-xl px-4 py-2 disabled:opacity-50">{deleting?'กำลังลบ...':'ยืนยันลบ'}</button></div></div></div>}
      {cancelTarget && <div role="dialog" aria-modal="true" aria-label="ยืนยันยกเลิกรายการ" className="screen-only fixed inset-0 bg-black/50 z-[65] flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-5 w-full max-w-md"><b>ยืนยันยกเลิกรายการ {cancelTarget.inventory}</b><p className="my-3">{cancelTarget.item} — รายการยังอยู่ในทะเบียนพร้อมหมายเหตุยกเลิก</p><div className="flex justify-end gap-2"><button onClick={()=>setCancelTarget(null)} className="border rounded-xl px-4 py-2">กลับไปแก้ไข</button><button onClick={()=>cancelReceived(cancelTarget)} className="bg-amber-600 text-white rounded-xl px-4 py-2">ยืนยันยกเลิก</button></div></div></div>}
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
            <div className="p-4 border-t flex flex-wrap justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setCancelTarget(edit)} className="border border-amber-300 bg-amber-50 text-amber-900 rounded-xl px-4 py-2">ยกเลิกรายการ</button>
                {ownerEmail===OWNER_EMAIL ? (
                  <button onClick={() => requestDelete(edit)} className="border border-red-300 bg-red-50 text-red-700 rounded-xl px-4 py-2 flex items-center gap-2"><Trash2 size={17}/>ลบรายการ</button>
                ) : (
                  <button disabled={authBusy} onClick={() => requestDelete(edit)} className="border rounded-xl px-4 py-2 text-slate-700 disabled:opacity-50">{authBusy?'กำลังเข้าสู่ระบบ...':'เข้าสู่ระบบ Gmail เพื่อใช้สิทธิ์ลบ'}</button>
                )}
              </div>
              <button onClick={save} className="bg-blue-700 text-white rounded-xl px-5 py-2 flex gap-2"><Save size={18} />บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;


