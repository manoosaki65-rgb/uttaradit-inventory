import fs from 'node:fs';
const s=fs.readFileSync('original/v77/backend/index.ts','utf8');
let q=s.slice(s.indexOf('    const q=',s.indexOf('GET /api/current')),s.indexOf("  'GET /api/print-range'"));
q=q.slice(0,q.lastIndexOf('  }],'));
q=q.replace('return json({','return ({');
fs.writeFileSync('src/inventory-query.ts',"// Recovered from original/v77/backend/index.ts GET /api/current.\nimport type { InventoryRow } from './inventory-rules';\nexport function queryRows(allRows: InventoryRow[], query: Record<string,string>) {\n"+q+'\n}\n');
