const fs = require('fs');
const filePath = 'C:\\Users\\henri\\.gemini\\antigravity\\brain\\7fbb3869-91a8-4ac0-ac95-a5778055584d\\.system_generated\\steps\\76\\output.txt';
const oldLogStr = fs.readFileSync(filePath, 'utf8');
const oldLog = JSON.parse(oldLogStr);
const rawDataMatch = oldLog.result.match(/<untrusted-data-.*?>(.*?)<\/untrusted-data-.*?>/s);
const rows = JSON.parse(rawDataMatch[1]);
function escapeSql(val) {
    if (val === null) return 'NULL';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') return val;
    if (Array.isArray(val)) return `'${JSON.stringify(val).replace(/\[/g, '{').replace(/\]/g, '}').replace(/"/g, '')}'::text[]`;
    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
    if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
    return `'${val}'`;
}
const columns = Object.keys(rows[0]);
const values = rows.map(row => `(${columns.map(col => escapeSql(row[col])).join(',')})`).join(',\n');
console.log(`INSERT INTO public.monthly_clients (${columns.join(', ')}) VALUES ${values};`);
