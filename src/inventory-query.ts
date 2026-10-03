// Recovered from original/v77/backend/index.ts GET /api/current.
import type { InventoryRow } from './inventory-rules';
export function queryRows(allRows: InventoryRow[], query: Record<string,string>) {
    const q=(query.q||'').trim().toLowerCase();
    const seqFilter=String(query.seq||'').trim();
    const itemFilter=String(query.item||'').trim().toLowerCase();
    const unitFilter=String(query.unit||'').trim();
    const inventoryFilter=String(query.inventory||'').trim().toLowerCase();
    const keyedFilter=String(query.keyed||'').trim().toLowerCase();
    const dayFilter=String(query.day||'').trim();
    const monthFilter=String(query.month||'').trim();
    const yearFilter=String(query.year||'').trim();
    const categoryFilter=String(query.category||'').trim();
    const fundFilter=String(query.fund||'').trim();
    const fundYearFilter=String(query.fundYear||'').trim();
    const amountFilter=String(query.amount||'').trim().replace(/,/g,'');
    const noteFilter=String(query.note||'').trim().toLowerCase();
    const officerFilter=String(query.officer||'').trim();
    const normalizedYear=(value:number)=>String(value<100?value:value%100);
    const found=allRows.filter(r=>{
      if(q&&!Object.values(r).join(' ').toLowerCase().includes(q))return false;
      if(seqFilter&&!String(r.seq??'').includes(seqFilter))return false;
      if(itemFilter&&!String(r.item||'').toLowerCase().includes(itemFilter))return false;
      if(unitFilter&&String(r.unit||'').trim()!==unitFilter)return false;
      if(inventoryFilter&&!String(r.inventory||'').toLowerCase().includes(inventoryFilter))return false;
      if(keyedFilter&&!String(r.keyed||'').toLowerCase().includes(keyedFilter))return false;
      if(dayFilter&&String(Number(r.day))!==dayFilter)return false;
      if(monthFilter&&String(Number(r.month))!==monthFilter)return false;
      if(yearFilter&&normalizedYear(Number(r.year))!==yearFilter)return false;
      if(categoryFilter&&String(r.category||'').trim()!==categoryFilter)return false;
      if(fundFilter&&String(r.fund||'').trim()!==fundFilter)return false;
      if(fundYearFilter&&String(r.fundYear||'').trim()!==fundYearFilter)return false;
      if(amountFilter&&!String(Number(r.amount)||0).includes(amountFilter))return false;
      if(noteFilter&&!String(r.note||'').toLowerCase().includes(noteFilter))return false;
      if(officerFilter&&String(r.officer||'').trim()!==officerFilter)return false;
      return true;
    });
    const dateKey=(r:{day:number;month:number;year:number})=>{const y=r.year<100?2500+r.year:r.year;return y*10000+r.month*100+r.day;};
    found.sort((x,y)=>dateKey(x)-dateKey(y)||x.seq-y.seq);
    const pageSize=Math.min(5000,Math.max(1,Number(query.pageSize||5000)));
    const pages=Math.max(1,Math.ceil(found.length/pageSize));
    const requested=query.page?Number(query.page):pages;
    const page=Math.min(Math.max(1,requested),pages);
    const filterOptions={
      years:[...new Set(allRows.map(r=>normalizedYear(Number(r.year))).filter(Boolean))].sort(),
      months:[...new Set(allRows.map(r=>Number(r.month)).filter(v=>v>=1&&v<=12))].sort((a,b)=>a-b),
      units:[...new Set(allRows.map(r=>String(r.unit||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th')),
      categories:[...new Set(allRows.map(r=>String(r.category||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th')),
      funds:[...new Set(allRows.map(r=>String(r.fund||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th')),
      fundYears:[...new Set(allRows.map(r=>String(r.fundYear||'').trim()).filter(Boolean))].sort(),
      officers:[...new Set(allRows.map(r=>String(r.officer||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th')),
    };
    return ({items:found.slice((page-1)*pageSize,page*pageSize),total:found.length,page,pages,masterTotal:allRows.length,filterOptions,source:'Master Inventory เดียว'});

}
