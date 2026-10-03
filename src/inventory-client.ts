import type { InventoryRow } from './inventory-rules';
import { rangeRows, validateIncoming } from './inventory-rules';
import { queryRows } from './inventory-query';

// Local only: no AppDeploy requests and no embedded Master.
export const LOCAL_STORAGE_KEY = 'uttaradit-inventory.local.v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export function createLocalClient(storage: StoragePort, storageKey = LOCAL_STORAGE_KEY) {
  const read = (): InventoryRow[] => {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const state = JSON.parse(raw);
    if (state.version !== 1 || !Array.isArray(state.rows)) throw new Error('ข้อมูล Local ไม่ถูกต้อง');
    return state.rows;
  };
  const write = (rows: InventoryRow[]) => storage.setItem(storageKey, JSON.stringify({ version: 1, rows }));
  return {
    async get(path: string) {
      const url = new URL(path, 'http://local');
      const query = Object.fromEntries(url.searchParams);
      if (url.pathname === '/api/current') return { data: queryRows(read(), query) };
      if (url.pathname === '/api/print-range') {
        const items = rangeRows(read(), query);
        return { data: { ...queryRows(items, {}), items, total: items.length, page: 1, pages: 1 } };
      }
      throw new Error('ไม่พบคำขอ Local');
    },
    async post(path: string, body: { rows: Array<Omit<InventoryRow,'id'>&{id?:string}>; source?: string }) {
      if (path !== '/api/current/import' || !Array.isArray(body.rows) || !body.rows.length) throw new Error('ไม่มีข้อมูลสำหรับนำเข้า');
      if (body.rows.length > 1000) throw new Error('นำเข้าได้ไม่เกิน 1,000 รายการต่อครั้ง');
      body.rows.forEach(validateIncoming);
      const byInventory = new Map(read().map(r => [r.inventory, r]));
      const incoming = new Map(body.rows.map(r => [r.inventory, r]));
      let added=0,updated=0;
      for (const row of incoming.values()) {
        const previous = byInventory.get(row.inventory);
        byInventory.set(row.inventory, { ...row, id: previous?.id || crypto.randomUUID(),
          fundYear: previous?.fundYear || row.fundYear || '', officer: previous?.officer || row.officer || '',
          note: [previous?.note, row.note].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' — ') });
        if(previous) updated++; else added++;
      }
      const all = [...byInventory.values()];
      write(all);
      const items = [...incoming.keys()].map(k => byInventory.get(k)!);
      return { data: { items, total: items.length, currentTotal: all.length, filterOptions: queryRows(all, {}).filterOptions, added, updated } };
    },
    async put(path: string, patch: Partial<InventoryRow>) {
      const id = decodeURIComponent(path.slice('/api/current/'.length));
      if ('fundYear' in patch && !['','68','69','70'].includes(String(patch.fundYear ?? ''))) throw new Error('ปีแหล่งเงินต้องเป็น 68, 69 หรือ 70');
      const saved = read(); const index = saved.findIndex(r=>r.id===id);
      if(index<0) throw new Error('ไม่พบรายการ');
      const next = { ...saved[index], ...patch, id };
      validateIncoming(next);
      if(saved.some((r,i)=>i!==index&&r.inventory===next.inventory)) throw new Error('เลข Inventory ซ้ำกับรายการอื่น');
      saved[index]=next; write(saved); return {data:{ok:true}};
    },
    async delete(_path: string): Promise<never> { throw new Error('สิทธิ์ลบยังไม่เปิดบน Local'); },
  };
}
export const api = createLocalClient(typeof window === 'undefined' ? {getItem:()=>null,setItem:()=>{throw new Error('Local browser only');}} : window.localStorage,
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('local-test') ? LOCAL_STORAGE_KEY+'.test'+(new URLSearchParams(window.location.search).get('local-test')?'.'+encodeURIComponent(new URLSearchParams(window.location.search).get('local-test')!):'') : LOCAL_STORAGE_KEY);
export const auth = { getUser: async () => null as { email?: string } | null,
  signIn: async (_options: unknown): Promise<{ user: { email?: string } }> => { throw new Error('สิทธิ์ผู้ดูแลยังไม่เปิดบน Local'); } };
