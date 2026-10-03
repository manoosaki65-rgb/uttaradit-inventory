export type InventoryRow = {
  id: string; seq: number; item: string; unit: string; inventory: string;
  keyed: string; day: number; month: number; year: number; category: string;
  fund: string; fundYear?: string; amount: number; note: string; officer: string;
};

export function receivedDateFromData(value: unknown) {
  const text=String(value??'').trim();
  let match=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T :])/);
  let y:number,m:number,d:number;
  if(match){y=Number(match[1]);m=Number(match[2]);d=Number(match[3]);}
  else {match=text.match(/^(\d{1,2})[\/\s]+(\d{1,2})[\/\s]+(\d{2,4})$/);if(!match)throw new Error('ไม่มีวันที่รับเอกสารที่อ่านได้ในข้อมูล');d=Number(match[1]);m=Number(match[2]);y=Number(match[3]);}
  const be=y<100?2500+y:y<2400?y+543:y;
  const date=new Date(Date.UTC(be-543,m-1,d));
  if(date.getUTCFullYear()!==be-543||date.getUTCMonth()+1!==m||date.getUTCDate()!==d)throw new Error('วันที่รับเอกสารในข้อมูลไม่ถูกต้อง');
  return {day:d,month:m,year:be%100};
}

export function receivedDateFromFilename(name: string) {
  const match = name.match(/(?:^|\D)(\d{2})(\d{2})(\d{2})(?!\d)/);
  if (!match) throw new Error('อ่านวันที่จากชื่อไฟล์ไม่ได้ เช่น Report 690910.pdf');
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(2500 + year - 543, month - 1, day));
  if (date.getUTCFullYear() !== 2500 + year - 543 || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day)
    throw new Error('วันที่รับเอกสารในชื่อไฟล์ไม่ถูกต้อง');
  return { year, month, day };
}

export function validateIncoming(row: Omit<InventoryRow,'id'>) {
  if (!/^\d{2}-\d{5}$/.test(row.inventory) || !String(row.item || '').trim()) throw new Error('เลข Inventory หรือรายการไม่ถูกต้อง');
  receivedDateFromData(`${row.day}/${row.month}/${row.year}`);
  if (!Number.isFinite(row.amount) || row.amount < 0) throw new Error('วงเงินไม่ถูกต้อง');
}

// Recovered from the v77 backend print-range route; corrected double-escaped regex.
export const keyedDateKey = (r: { keyed: string }) => {
  const text = String(r.keyed || '').trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) { const raw = Number(match[1]); return (raw < 2400 ? raw + 543 : raw) * 10000 + Number(match[2]) * 100 + Number(match[3]); }
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (match) { const raw = Number(match[3]); const y = raw < 100 ? 2500 + raw : raw < 2400 ? raw + 543 : raw; return y * 10000 + Number(match[2]) * 100 + Number(match[1]); }
  return null;
};
export const receivedDateKey = (r: { day: number; month: number; year: number }) => {
  const y = r.year < 100 ? 2500 + r.year : r.year < 2400 ? r.year + 543 : r.year;
  return y * 10000 + r.month * 100 + r.day;
};
export function rangeRows(rows: InventoryRow[], query: Record<string,string>) {
  const isoKey = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
    const [y,m,d] = s.split('-').map(Number);
    const date = new Date(Date.UTC(y,m-1,d));
    if(date.getUTCFullYear()!==y||date.getUTCMonth()+1!==m||date.getUTCDate()!==d) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
    return (y+543)*10000+m*100+d;
  };
  const from = isoKey(query.from), to = isoKey(query.to);
  if (from > to) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
  const rowKey = query.basis === 'keyed' ? keyedDateKey : receivedDateKey;
  return rows.filter(r => {const k=rowKey(r);return k!==null&&k>=from&&k<=to;}).sort((a,b)=>(rowKey(a)??0)-(rowKey(b)??0)||a.seq-b.seq);
}
