import { router, json, error, db } from '@appdeploy/sdk';
import { brotliDecompressSync } from 'node:zlib';
import { MASTER_BROTLI_B64 } from './master-data';

type Row = {
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
const inferFundYear = (fund: unknown, explicit: unknown) => {
  const saved = String(explicit ?? '').trim();
  if (['68','69','70'].includes(saved)) return saved;
  const match = repairLegacyThai(fund).match(/(?:25)?(\d{2})\s*$/);
  return match ? match[1] : '';
};
const normalizeCurrentRow = (row: Row & { officer?: string; source?: string; id?: string }) => {
  const normalized = {
    ...row,
    item: repairLegacyThai(row.item),
    unit: repairLegacyThai(row.unit),
    category: repairLegacyThai(row.category),
    fund: repairLegacyThai(row.fund),
    fundYear: inferFundYear(row.fund, row.fundYear),
    note: repairLegacyThai(row.note),
    officer: repairLegacyThai(row.officer),
  };
  if (String(normalized.inventory || '').trim() === '69-05132') {
    return { ...normalized, fund: 'งบประมาณ 70', fundYear: '70', amount: 3484800 };
  }
  return normalized;
};
type CurrentRow = Row & { officer?: string; source?: string; id?: string };

const toCurrentRecord = (row: CurrentRow): Record<string, unknown> => ({
  seq: row.seq,
  item: row.item,
  unit: row.unit,
  inventory: row.inventory,
  keyed: row.keyed,
  day: row.day,
  month: row.month,
  year: row.year,
  category: row.category,
  fund: row.fund,
  fundYear: ['68','69','70'].includes(String(row.fundYear ?? '')) ? String(row.fundYear) : '',
  amount: row.amount,
  note: row.note,
  officer: row.officer ?? '',
  source: row.source ?? '',
});

const CURRENT_SEED_BROTLI_B64 = 'G+2iUQQbBwLQ7yoAWg/whpj6MxrGR6s3/NBd21rDRIwjo6FUd2H9iSdihf6drTA24K+GEHmEJLMU6kREX0G15KYawwOcnN+WXx3O5wqCIdn966TV/qmIGUXo2GbmlZsu5AreTfDE4P32q1TnnHUG+/yo9oDTtpZ2zzy0gmXr+yk7WQXJzb6q6v47JAkOZy5YUqerz5+a9VWLproU1X9t9WMqWfudDi2GOYwn/DS1N/r2K8k46bAREha6ZVLXqR2GJdT7RprJ90jzi53mn9KLZI135ZZeGiEhpDVKRotsJVe8V3Uo3qs2+gUdZ0fggdxMTY+uwt0yllXo6q6d51VQMCEJiMH27sX+/+cdbxN+Hvtmn70nqus5EeQZICDCNxY0kCCggYc7DMgYoKFBxNmzzU9iIxfNj+2qHB+Frm3MX3rcAKYGpD+Em4vP86OKz2nJ8RBcDCTw3Mn2moyS7k2sTaFjZ0yq7PTB4EtOHn8ECRA5y0OXJkKwHSBwzZLl9YQBTijT9SOUz0P285i6/8w89smj5sKD9jwH7KiTh0F50Re55BpWep4d7xPy8+Dx8Ml8Hgtrc2THdzGLLmR5bPiWKcBOLJ0nr2BoXCilxxUNWHhDPAAgEwcRJNytAPbEHdJ5Ls7tRTQCeOnnIbExGxs7fNqeYRPGGLZ2+uWoEEO+P9pp1vyTvNSXaXohKpmo674aBcxHSVMjfpmA3+kinh+zbm7e8UBIBn1fVaTPPCbIzEazgm1MgUH49RlgIzENhHUO5piNceHQl7ly2DnFPEf8BOL7WwDJk/FD0c79IScE8PV7r7DEH2zySNcqGghiPY+MrQ40YMDAtqfeCK2omIKD+RqDjgASeafkHlyk0JUF5yHjHnw/ABOfs5DXBqCvKo0TKNbbOpz8pJfPLoD7vjzgdeIVjlpyeShaR6dD79Swlit4lM0zTHmfDgo46C6wchx0qzhE/6epShjOxcxnj4WjeAKv99ElGIhpDCuH30MLVje4VpyxoYOUWzy9R9rK4KOIc86KL2gA5VL++f/j4AcGFl3WdXidEOzR9I4vV7ZGKaJW3VOMSYQKvmZPPX64SaIZpGcYiFL6hjtkJVMLaW7/lnC+J5hhpZoIpgziwQOq3hHChcIQOporQ+TJHn+PYpyIKCFTWaWJxQBCByO7sjMXzICDE2zZSO559lMnjwUMDFAJ8NDQE4ZQZbyDdf0KV4gBiKaN6IQd2DPyp4w4CtU4Ny4xSxNDZvW6EsiRz8jBf/lXDMr8R21YsvYDC2jVU/AuLUGqRQ9S3i2nXuRl/ZfdqZkWo8ErzPI9q+pk5puxjxf8xDZP2EfKVRPhaPvTKkvq1DcImpDlF/nzm51W6ynvgaEByfV3FWkgjz/vzgMGFAyYYaj9VYke/dJebFVsAygfYTzNmnDuDCM50ruyiznnWVDwrCjlvdZJOqEUvLEfutzzLYUypp9F43pPXoGR2Dz5wuRf8LqfzkTvI0eAnm+sJ/Wx+lWR6vKn9/76YJ5kDiO/JPrcWSEWx8MtbxZcxHlsNz/EcHn8epL5yax6PfIZkk/wqRlsuuVN6lWjz+onaszz0ENwO29/lcXbgCU9wqSXYXDOviSJvK10PE7QRrku5gKo6aD1aJUK6opQqb3WV8XOUUfggA1gfQ127QgZI3B7bdwqqbERV7PUyk/BQ4IBj+trHCwKtGEylbirwt5UT7j8ngXG/RMmFJGbhJicZaL1XeXalD9ZWpxLiy5NQXavBWEzJEJANsSigVjkukOvjecE7EY47+L6mZwHLVZEmNG6zMQUDpFsuNQaTiXPVVhoq0P1BTGMbFCPJdvw1XBuAxQQE24dmFAzSDmPNmouh53nB9V/hfbqzIUuWj6Qv4PoYLi+V2wCnJMT3rS3d5+ApBaatDvFnfLeK4f2Ki7Wqzh6MebFB8hzOnqCYcbKIm03um97hrnR7EwYr9d0MJNOez36+g9bLjiTg/mIih9Otsj2dv0ep4HKq3w8RQhPCvLHi/bGXXvL16297YZMYQ3+jWndbhbWq8EstN7J59CBNrmN9LeWQUoZ6mVPHP7iJcrGxK4TPEufB3MaUGOlDVCVPo0tGuDCF858F1wasV9B41NxqdxcGcKrjK56Sefyl2HVsjPhUD5/g5GX/RaKaDoHH0U2OVZOppCAchV/3FIGZFIXdJ2XYkwAAmXOnDRpu/aLTEt0+kail1dDnGNxAnxx2VsbZj//LYZVTSFWaQoMLOngUsgCwyUWvPy+gnob9V/fE4via/SSUwM11cFcWwqIf6RUerKS4SqjE3v93HjZz0ahgdgbKXM2sFOgMqel0LuBBDsl+STJiAWU4dj5ZUc6uZkfL+UXGohUuup3PmsJKWQDSLJ0yDRdr+AELSIfQC/bEsZ/YJNXUUSlvki7zf/LK+wt+gXtOxOB1pzuG8nSIZ/s+Xd/7qupEgi3Pd8F5yElBqvGBAv2DCEvXlivP+yYLfne5uCxm21DnCJk58gbOcJ6rPI6Publ0mwapVneJzuXRisbSRWSQ+d8rN+UXFPoFD9ksqyLpU+CwHnUq0o0Tt92FevaJf09uS4fKYKOEH8IoNwCbCz4Ns2QLsU6CIQbEKkm1+iMD+7xeNUkCVDLg8i8i/2nmiixJJwE5yOFYevVvwe0MtdzEif5DJm50dNpeAdLYVXE2WXDv2R7GGEM36SxXtJtrlzByXFP4m/rEBGKNSBBnY8vZj1R/hXut5QxFL4isT7VMaHrvDqG5YUgkpm1bzFuEvkCFxev8mIgfikCD0AAkw6u+yQCCOdkDxwfMxHie7akc0VoyZA8vuFE9B8CGtd9ZBUxnIfK6IKVMwtjsI8fN6CsaW/WGtI3dCDGumDxNtSdkb11fkhcPthyHh+LcGGwaB9filjiWvjzPfBP896zm8i4Ek/QfXJgHNYt66AOzQQffp08z9g/JMANiUSPhQiiMYHNGPhJ0ytqlclX0IGR0GyUFJCi2DLBDc4tUUKIK3HQTb+zWg70nssgIKknC3Ket8E4/G0yAf0ssEgQx07j55qtjB2vQ3WIWEpOg7F0F0d33rTKFzttbpMIvqItPOkAKcyygQxH1v65HEcODR6BtfvufvLiQfzKU0prXMNJfyiMi6QGbpC6oaNcNvCTLvodZ70hfSXB8gaWDmVOs1Et6JsslNpvBWAcj/mtd8/dQVzS5WUok8yYvsELQN0bM0dlpQ5Ulc7vUemU35YxtzY0XBMu0O92haEmD7FO1xnnz4J2qSsKBhmqYWVLS8ySo0+PYxKea2+HlaMhlHUT6l0//1AoJlApcH/4uXnDaImlEKCpTgEplAjEHELfFT2mEYmw8qf3yH8fqlvFiB4JBJIxmQApvjWQMEc3O5Dn0kw/lTJHDPMn8Y3mb8ibkaz1jqiKejLfsLjFDDvm+roZhjfSXfwCaSSdu+4TSSBx/NF1HwEjrDNxC9y640NUesQuPrMT24Lnf+kIMeVBkL6JBpKefQrM3qYSAv9gReA/bK8J/JgEyXOyp3kf2TTAE3COfHSfW5cj5Sg/TnmZP34jZM3RuWbklJw974LM3elU8oNbswATV/L217FoV5/rsn2M8LgU2SsWH5H54hohfHanUaQR8zMGdoV1l2s7KfxhNIKvBmYQGskwtZV0cL3HomMkLSxNHd74K07P60eDZQZijc6S0IsJ3VfWBmScqy9Aq/LCJKyBOKNx22h50qVrRzvcsrxjXo4mUuauQ0KMhXgybw8Yyigr/C+YHboBME4eN3gcMfI8aSYTnnhy7SggPGF0VOn00UUC6yH5hnMnZa5jTovHKwY/esG7bI2XE4K2ym3uwb2mDj+8NpAkKHO6mw2DFIYJiMapxi2eBXnEN00tKp1lreDQDTHeqMHRgd2LWwPxRtcZQ9INtKWfbzzIXcetC49i5eylvlgXEIvLrQgnSTqjwS6sZ3cSfsps2VvNu/D3MA+yKWe6i42ENNIA50lwY/1zW8x8yW7Q76zXC9qyBC/JUsL2//uELUO9eZ+9JfGi7HqQjKvqNoKtYXJfZsR8FJguT0TTsd95rRJ6LsUOIHU2Zqe4+dt2iraB6KJQHyQWaAP6X6zLRq/ilbSblGVLifq4MNEStGhdfiJ873HFAS6/X5Ypj+gUvOhy93jouJjOQGzTWb+TVoIUuoL7NjWW9KUR9B0yzNYjKltlQEOVyals0ACMN63C6c/LrQb0DaQAOu9fjjWZsxeGuKy5SlSKtGHA8gEtA2Jh3SqE9pTwuLnBgaInrAq2MVpmsp+GlEAzrNHpVI28pdES1FCurxYYsMrh+GCCglhVTVTUfpdbl57BsCIITu7JNFaIA6xNn26wlMKBk31+rdEr3wExedI1yzd/rDjkGs/Xe0HXcBnsZbG+2jholXoj8dzvuGcl+fce/Nfu8+QsPDAnYF+XWMVsBgrQU7n1iP4Qzx8LyMKoM09A9hQJqBuTV7boHSJphLFFy8j3AgkfebOeaOHBBy84a2ZSogjz+/Uff7p0/yQr/MSadVgrkIpmdvLSm6oRUD0dN6AQ+v26YGTdWgHXcDaUa33WVT5/ogQNVG2WQni74O44fVAvxEDcFlHUcVqRtZFkHG/SvkcpuwxQe94BHhzO2aty7YnhHk3CElnmhSSqxWv91LFXvJph9YUhHXmOcH0qWJL9hOPe9u6JU/SLAl+5cH+D7g2KogcMW+Am5qa31mBk4mna++oZJBEzMeeROb57vAeFCuUnqCa1DERgCsMLhohnoGrDhUNI2McG5faL2nJtwMaXIl3nEId/nvYFt8IF5V0ADc7Ivdcqxn4D3jBFSglRa+LRAsiffryZnrimzXN4UHg+a+FhQFrB+iUotcSpCBYnfFcu4W5lDRwqUOAQAsheVZF3V5dB+ICAeiMA4xVX4vRGGF1OrlB60z5RNY5hVVNGyztYrQGifrYmbMXxlKNSwHdBTWVjr/JNiEhNqPOvajekxAdEX3ErSIrVq3feYqWirOjpPLYrWHipVEZVeRYcSvWb5mSZMqv+T0TAlVY/sQ5Ui7+nGoruHT3LQRdjirwnvVIp8AVWMrphGdhEAco5a4fNLbOdIax8RrWMfnI1Q4ZooWH+lT2nyM0SyCn26ybBv2cmfJ36rEbeFnlLUnwncwENXNg38J7KOXAHRGhD78YDlFwxP8fDb1hSMPWhWIh9Vmfd2CF5RK38DDUQYJ1Eu+Y5nq228qztL92pRSGIvhYJAeiQJdc2LpjcMyKIs2EkRr/AFSlSG51cUD6bYclpbFYGBWhpu9KiZsFTjQWueJS90oGk6E+yDCPQ9yyyoc05bX1wXELdUg/HJPaPUM4qDcjZe7PNPy9UuF1vxCDQoq/6QlBTC6HdvUNIER5QQyVGTTQWUqYJ4X6ipOFooCLGNU5El2f/lYccyvN3hJZllqJdWUMmYaUVIleB2pSKD9kQ53G0TwCyFDwJVZQj/LwUXKt0t4CrkKzbgJggXgd7vDDvXO3XDWPfqOda9OXbQ5wArVS2EraqyjIfBR0wjOmCl6mv8juSk1PO4DWYGrRAQ8iZnSa8al3/0hri0Als52WUL4n3qrv+5j3Pj+hSh0pJT469gHWhk4NVEidKoF3ymcvB1QQFnH1l8HHFO130U2mjoPvCowaSc8e4qqW0pjswS5f91HqV0HMcLwdSorKOVwdXfRZcEH9MzUPnr+qPKxXQtGVr1vgvlUGUTvwLlFBeWibn7fR1AEizQrIFvYqX9Of3oe4fiYBuMsEkDUhhJaDxYQORDw3zQhiHw2vFQuTL8/wQxtm2G9AYLGpTTyjZCHm/aA3wScsiRDtSaV8+wduC1P66sBfPzmIksmCt/AY6/uB6xJjhQApNLtdE1H0yFdIJQ2q7Qq88RNJcOU8HK8w+9dtVUgFd9lOzdRcJnRc+XPoppXAW6t/jSgR0A56ouKWvIx0xloxIMVYX2kgleLiftdDimJXnplBH2C1SJejoEegBFkKH+iGaLA1/W2ONa3TeOAx25ZrPRf2hKaiqNZ50p8pe8yw3IlophT2cTnxlrqgjAADJz1urxKn7COvx9yGjPNCp0VPWpqKwqT1Zqf0DFkP818nKAB22j7kztI1Yz3N8n1FDgJRAY9NsrEojaCeN+QA=';
const CURRENT_SEED_MIGRATION_KEY = 'current-11-14-sep-2569-v1';

const decodeCurrentSeed = (): CurrentRow[] => {
  const raw = brotliDecompressSync(Buffer.from(CURRENT_SEED_BROTLI_B64, 'base64')).toString('utf8');
  return JSON.parse(raw) as CurrentRow[];
};

const ensureCanonical14Sep = async () => {
  const migrations = await db.list<{ key: string }>('inventory_migrations_v1', { limit: 100 });
  if (migrations.items.some(item => item.key === CURRENT_SEED_MIGRATION_KEY)) return;

  const seed = decodeCurrentSeed();
  const sep11 = seed.filter(row => row.day === 11 && row.month === 9 && Number(row.year) === 69);
  const sep14 = seed.filter(row => row.day === 14 && row.month === 9 && Number(row.year) === 69);
  if (seed.length !== 74 || sep11.length !== 8 || sep14.length !== 66) throw new Error('ชุดข้อมูลเริ่มต้นไม่ครบ 8 + 66 รายการ');

  const existing = await db.list<CurrentRow>('inventory_current_v2', { limit: 500 });
  const backup = existing.items.map(toCurrentRecord);
  if (existing.items.length) {
    const deleted = await db.delete('inventory_current_v2', existing.items.map(row => row.id));
    if (deleted.some(ok => !ok)) throw new Error('ล้างงานปัจจุบันเดิมไม่สำเร็จครบทุกแถว');
  }

  const added = await db.add('inventory_current_v2', seed.map(toCurrentRecord));
  if (added.some(id => !id)) {
    const successfulIds = added.filter((id): id is string => Boolean(id));
    if (successfulIds.length) await db.delete('inventory_current_v2', successfulIds);
    if (backup.length) await db.add('inventory_current_v2', backup);
    throw new Error('บันทึกชุดวันที่ 11 และ 14 กันยายนไม่สำเร็จครบ 74 รายการ จึงคืนข้อมูลเดิมแล้ว');
  }

  const [markerId] = await db.add('inventory_migrations_v1', [{ key: CURRENT_SEED_MIGRATION_KEY, total: 74, sep11: 8, sep14: 66, appliedAt: '2026-09-15' }]);
  if (!markerId) {
    const successfulIds = added.filter((id): id is string => Boolean(id));
    if (successfulIds.length) await db.delete('inventory_current_v2', successfulIds);
    if (backup.length) await db.add('inventory_current_v2', backup);
    throw new Error('บันทึกสถานะการเปลี่ยนชุดข้อมูลไม่สำเร็จ จึงคืนข้อมูลเดิมแล้ว');
  }
};

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],
  'GET /api/current': [async ({ query }) => {
    await ensureCanonical14Sep();
    const withdrawalKey = 'remove-current-69-05475-69-05484-v1';
    const migration = await db.list<{key:string}>('inventory_migrations_v1',{limit:100});
    if (!migration.items.some(item=>item.key===withdrawalKey)) {
      const targets = new Set(['69-05475','69-05484']);
      const snapshot = await db.list<CurrentRow>('inventory_current_v2',{limit:500});
      const found = snapshot.items.filter(row=>targets.has(String(row.inventory||'').trim()));
      if (found.length) {
        const archived = await db.add('inventory_deleted_archive_v1',found.map(row=>({...row,originalId:row.id,deletedAt:new Date().toISOString(),deleteReason:'ผู้ใช้ขอนำรายการ 69-05475 และ 69-05484 ออกจากงานปัจจุบัน'})));
        if (archived.some(id=>!id)) return error('สำรองรายการก่อนนำออกไม่สำเร็จ',500);
        const deleted = await db.delete('inventory_current_v2',found.map(row=>row.id!));
        if (deleted.some(ok=>!ok)) return error('นำรายการเป้าหมายออกไม่สำเร็จครบทุกแถว',500);
      }
      await db.add('inventory_migrations_v1',[{key:withdrawalKey,removed:found.map(row=>row.inventory),appliedAt:new Date().toISOString()}]);
    }
    const listed=await db.list<Row & {officer?:string;source?:string}>('inventory_current_v2',{limit:500});
    const q=(query.q||'').trim().toLowerCase();
    const dateKey=(r:{day:number;month:number;year:number})=>{const y=r.year<100?2500+r.year:r.year;return y*10000+r.month*100+r.day;};
    const keyedDateKey=(r:{keyed:string})=>{const text=String(r.keyed||'').trim();let match=text.match(/^(\d{4})-(\d{2})-(\d{2})/);if(match){const y=Number(match[1]);return (y<2400?y+543:y)*10000+Number(match[2])*100+Number(match[3]);}match=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(match){const y=Number(match[3]);return (y<2400?y+543:y)*10000+Number(match[2])*100+Number(match[1]);}return null;};
    const isoKey=(v:string|undefined)=>{if(!v)return null;const [y,m,d]=v.split('-').map(Number);return (y+543)*10000+m*100+d;};
    const from=isoKey(query.from),to=isoKey(query.to); const basis=query.basis==='keyed'?'keyed':'received';
    const rowKey=(r:Row)=>basis==='keyed'?keyedDateKey(r):dateKey(r);
    const uniqueCurrent=new Map<string,ReturnType<typeof normalizeCurrentRow>>();
    listed.items.map(normalizeCurrentRow).forEach(rawRow=>{const row=rawRow.inventory==='69-04744'?{...rawRow,day:14,month:9,year:69}:rawRow;const inventory=String(row.inventory||'').trim();const key=inventory||['blank',row.item,row.unit,row.keyed,row.day,row.month,row.year,row.amount].join('|');uniqueCurrent.set(key,row);});
    const all=[...uniqueCurrent.values()].sort((a,b)=>(rowKey(a)??dateKey(a))-(rowKey(b)??dateKey(b))||a.seq-b.seq);
    const dated=all.filter(r=>{const key=rowKey(r);return key!==null&&(from===null||key>=from)&&(to===null||key<=to);});
    const found=q?dated.filter(r=>Object.values(r).join(' ').toLowerCase().includes(q)):dated;
    const pageSize=Math.min(500,Math.max(1,Number(query.pageSize||100))); const pages=Math.max(1,Math.ceil(found.length/pageSize)); const requested=query.page?Number(query.page):pages; const page=Math.min(Math.max(1,requested),pages);
    return json({items:found.slice((page-1)*pageSize,page*pageSize),total:found.length,page,pages});
  }],
  'GET /api/print-range': [async ({ query }) => {
    await ensureCanonical14Sep();
    const isoKey=(value:string|undefined)=>{if(!value)return null;const [y,m,d]=value.split('-').map(Number);if(!y||!m||!d)return null;return (y+543)*10000+m*100+d;};
    const receivedDateKey=(r:{day:number;month:number;year:number})=>{const rawYear=Number(r.year);const y=rawYear<100?2500+rawYear:rawYear<2400?rawYear+543:rawYear;return y*10000+Number(r.month)*100+Number(r.day);};
    const keyedDateKey=(r:{keyed:string})=>{const text=String(r.keyed||'').trim();let match=text.match(/^(\d{4})-(\d{2})-(\d{2})/);if(match){const rawYear=Number(match[1]);const y=rawYear<2400?rawYear+543:rawYear;return y*10000+Number(match[2])*100+Number(match[3]);}match=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(match){const rawYear=Number(match[3]);const y=rawYear<100?2500+rawYear:rawYear<2400?rawYear+543:rawYear;return y*10000+Number(match[2])*100+Number(match[1]);}return null;};
    const from=isoKey(query.from); const to=isoKey(query.to); const basis=query.basis==='keyed'?'keyed':'received';
    if(from===null||to===null||from>to)return error('ช่วงวันที่ไม่ถูกต้อง',400);
    const rowKey=(r:Row)=>basis==='keyed'?keyedDateKey(r):receivedDateKey(r);
    const raw=brotliDecompressSync(Buffer.from(MASTER_BROTLI_B64,'base64')).toString('utf8');
    const master=JSON.parse(raw) as Array<Row & {officer?:string}>;
    const overlays=new Map<number,Record<string,Partial<Row & {officer:string}>>>();
    try{const editChunks=await db.list<{chunk:number;edits:Record<string,Partial<Row & {officer:string}>>}>('inventory_edit_chunks_v1',{limit:50});editChunks.items.forEach(chunk=>overlays.set(chunk.chunk,chunk.edits||{}));}catch(cause){console.warn('Edit overlays unavailable for print range.',cause);}
    const combined=new Map<string,ReturnType<typeof normalizeCurrentRow>>();
    master.forEach((r,i)=>{const edit=overlays.get(Math.floor(i/100))?.[String(i%100)]||{};const row=normalizeCurrentRow({...r,...edit,officer:edit.officer??r.officer??'',id:'master:'+i});const key=[row.inventory,row.day,row.month,row.year,row.seq].join('|');combined.set(key,row);});
    const current=await db.list<Row & {officer?:string;source?:string}>('inventory_current_v2',{limit:500});
    current.items.map(normalizeCurrentRow).forEach(row=>{const key=[row.inventory,row.day,row.month,row.year,row.seq].join('|');combined.set(key,row);});
    const combinedRows=[...combined.values()];
    const correctionCandidates=combinedRows.filter(row=>row.inventory==='69-04744');
    const correctionSource=correctionCandidates.find(row=>!String(row.id||'').startsWith('master:'))??correctionCandidates[0];
    const correctedRows=combinedRows.filter(row=>row.inventory!=='69-04744');
    if(correctionSource) correctedRows.push({...correctionSource,day:14,month:9,year:69});
    const datedRows=correctedRows.filter(row=>{const key=rowKey(row);return key!==null&&key>=from&&key<=to;});
    const uniqueByInventory=new Map<string,ReturnType<typeof normalizeCurrentRow>>();
    datedRows.forEach(row=>{const inventory=String(row.inventory||'').trim();const key=inventory||['blank',row.seq,row.item,row.unit,row.day,row.month,row.year].join('|');const existing=uniqueByInventory.get(key);const rowIsCurrent=!String(row.id||'').startsWith('master:');const existingIsCurrent=existing&&!String(existing.id||'').startsWith('master:');if(!existing||rowIsCurrent&&!existingIsCurrent)uniqueByInventory.set(key,row);});
    const items=[...uniqueByInventory.values()].sort((a,b)=>(rowKey(a)??0)-(rowKey(b)??0)||a.seq-b.seq);
    return json({items,total:items.length,basis,from:query.from,to:query.to});
  }],
  'POST /api/current/import': [async ({ body }) => {
    await ensureCanonical14Sep();
    const b=body as {rows?:Array<Row & {officer?:string}>;source?:string};
    if(!Array.isArray(b.rows)||!b.rows.length) return error('ไม่มีข้อมูลสำหรับนำเข้า',400);
    if(b.rows.length>200) return error('นำเข้าได้ไม่เกิน 200 รายการต่อครั้ง',400);
    const existing=await db.list<Row & {officer?:string;source?:string}>('inventory_current_v2',{limit:500});
    const dedupeKey=(r:Row)=>String(r.inventory||'').trim()||[r.item,r.unit,r.keyed,r.day,r.month,r.year,r.amount].join('|');
    const byKey=new Map(existing.items.map(r=>[dedupeKey(r),r]));
    const incomingMap=new Map<string,ReturnType<typeof normalizeCurrentRow>>();
    b.rows.map(normalizeCurrentRow).forEach(row=>incomingMap.set(dedupeKey(row),row));
    const incoming=[...incomingMap.values()];
    const fresh:Array<Row & {officer?:string}>=[]; const repairs:Array<{id:string;record:Record<string,unknown>}>=[];
    for(const row of incoming){const key=dedupeKey(row);const old=byKey.get(key);if(old){repairs.push({id:old.id,record:{...old,...row,fundYear:old.fundYear??row.fundYear??'',source:b.source||old.source||''}});}else{fresh.push(row);byKey.set(key,{...row,id:'pending'} as Row & {officer?:string;source?:string;id:string});}}
    const ids=fresh.length?await db.add('inventory_current_v2',fresh.map(r=>({...r,source:b.source||''}))):[];
    if(ids.some(id=>!id)) return error('บันทึกข้อมูลบางรายการไม่สำเร็จ',500);
    const updated=repairs.length?await db.update('inventory_current_v2',repairs):[];
    if(updated.some(ok=>!ok)) return error('แก้ข้อมูลเดิมบางรายการไม่สำเร็จ',500);
    const listed=await db.list<Row & {officer?:string}>('inventory_current_v2',{limit:500});
    const day=incoming[0].day,month=incoming[0].month,year=incoming[0].year;
    const items=listed.items.filter(r=>r.day===day&&r.month===month&&r.year===year).map(normalizeCurrentRow).sort((a,b)=>a.seq-b.seq);
    return json({ok:true,added:fresh.length,updated:repairs.length,total:items.length,currentTotal:listed.items.length,items});
  }],
  'DELETE /api/current/:id': [async ({ params }) => {
    await ensureCanonical14Sep();
    const [old] = await db.get<Row & {officer?:string;source?:string}>('inventory_current_v2', [params.id]);
    if (!old) return error('ไม่พบรายการ',404);
    const [backupId] = await db.add('inventory_deleted_archive_v1', [{...old,originalId:params.id,deletedAt:new Date().toISOString()}]);
    if (!backupId) return error('สำรองข้อมูลก่อนลบไม่สำเร็จ',500);
    const [deleted] = await db.delete('inventory_current_v2',[params.id]);
    return deleted ? json({ok:true,archived:true}) : error('ลบไม่สำเร็จ แต่มีข้อมูลสำรอง',500);
  }],
  'PUT /api/current/:id': [async ({ params, body }) => {
    const [old]=await db.get<Row & {officer?:string;source?:string}>('inventory_current_v2',[params.id]);
    if(!old) return error('ไม่พบรายการ',404);
    const patch=body as Record<string,unknown>;
    if('fundYear' in patch&&!['','68','69','70'].includes(String(patch.fundYear??''))) return error('ปีแหล่งเงินต้องเป็น 68, 69 หรือ 70',400);
    const [ok]=await db.update('inventory_current_v2',[{id:params.id,record:{...old,...patch}}]);
    return ok?json({ok:true}):error('บันทึกไม่สำเร็จ',500);
  }],
  'GET /api/inventory/by-date': [async ({ query }) => {
    const day=Number(query.day); const month=Number(query.month); const year=Number(query.year);
    if(!day || !month || !year) return error('วันที่ไม่ถูกต้อง',400);
    const raw = brotliDecompressSync(Buffer.from(MASTER_BROTLI_B64, 'base64')).toString('utf8');
    const master = JSON.parse(raw) as Array<Row & { officer?:string }>;
    const items = master.map((r,i)=>({...r,officer:r.officer ?? '',id:'master:'+i})).filter(r=>Number(r.day)===day && Number(r.month)===month && [year,2500+year,2000+year-43].includes(Number(r.year)));
    return json({items,total:items.length,day,month,year});
  }],
  'GET /api/inventory': [async ({ query }) => {
    const raw = brotliDecompressSync(Buffer.from(MASTER_BROTLI_B64, 'base64')).toString('utf8');
    const master = JSON.parse(raw) as Array<Row & { officer?:string }>;
    if (master.length !== 3857) return error('Master ไม่ครบ 3,857 รายการ', 500);
    const overlays = new Map<number, Record<string, Partial<Row & { officer: string }>>>();
    try {
      const editChunks = await db.list<{ chunk: number; edits: Record<string, Partial<Row & { officer: string }>> }>('inventory_edit_chunks_v1', { limit: 50 });
      editChunks.items.forEach(chunk => overlays.set(chunk.chunk, chunk.edits || {}));
    } catch (cause) {
      console.warn('Edit overlays unavailable; serving embedded Master without overlays.', cause);
    }
    const all = master.map((r, i) => {
      const edit = overlays.get(Math.floor(i / 100))?.[String(i % 100)] || {};
      const combined = { ...r, ...edit, officer: edit.officer ?? r.officer ?? '', id: 'master:' + i };
      return normalizeCurrentRow(combined);
    });
    const q=(query.q || '').trim().toLowerCase();
    const found=q ? all.filter(r=>Object.values(r).join(' ').toLowerCase().includes(q)) : all;
    const pageSize=Number(query.pageSize || 100);
    const pages=Math.max(1,Math.ceil(found.length/pageSize));
    const requested=query.page ? Number(query.page) : pages;
    const page=Math.min(Math.max(1,requested),pages);
    return json({items:found.slice((page-1)*pageSize,page*pageSize),total:found.length,page,pages,masterTotal:master.length,source:'MASTER_ทะเบียนรับ_Inventory_ถึง_10กย2569_FINAL_(เพิ่มช่องเจ้าหน้าที่จัดซื้อ).xlsx'});
  }],
  'PUT /api/inventory/:id': [async ({ params, body }) => {
    if (!params.id.startsWith('master:')) return error('รหัสรายการไม่ถูกต้อง',400);
    const globalIndex=Number(params.id.slice(7));
    if (!Number.isInteger(globalIndex) || globalIndex < 0 || globalIndex >= 3857) return error('ไม่พบรายการ',404);
    const chunkNo=Math.floor(globalIndex/100); const offset=String(globalIndex%100);
    const b=body as Partial<Row & {officer:string}>;
    const listed=await db.list<{chunk:number;edits:Record<string,Partial<Row & {officer:string}>>}>('inventory_edit_chunks_v1',{limit:50});
    const existing=listed.items.find(x=>x.chunk===chunkNo);
    if(existing){const edits={...(existing.edits||{}),[offset]:b}; const [ok]=await db.update('inventory_edit_chunks_v1',[{id:existing.id,record:{chunk:chunkNo,edits}}]); if(!ok)return error('บันทึกไม่สำเร็จ',500);}
    else {const [id]=await db.add('inventory_edit_chunks_v1',[{chunk:chunkNo,edits:{[offset]:b}}]); if(!id)return error('บันทึกไม่สำเร็จ',500);}
    return json({ok:true});
  }],
});
