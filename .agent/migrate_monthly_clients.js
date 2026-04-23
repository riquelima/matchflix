const fs = require('fs');
const path = require('path');

const filePath = 'C:\\Users\\henri\\.gemini\\antigravity\\brain\\7fbb3869-91a8-4ac0-ac95-a5778055584d\\.system_generated\\steps\\76\\output.txt';
const oldLogStr = fs.readFileSync(filePath, 'utf8');
const oldLog = JSON.parse(oldLogStr);

// Extract rows from the tool output format
const rawDataMatch = oldLog.result.match(/<untrusted-data-.*?>(.*?)<\/untrusted-data-.*?>/s);
if (!rawDataMatch) {
    console.error("Could not find data in log");
    process.exit(1);
}
const rows = JSON.parse(rawDataMatch[1]);

function escapeSql(val) {
    if (val === null) return 'NULL';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') return val;
    if (Array.isArray(val)) {
        if (val.length === 0) return "'{}'::text[]";
        return `ARRAY[${val.map(v => `'${String(v).replace(/'/g, "''")}'`).join(',')}]::text[]`;
    }
    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
    if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
    return `'${val}'`;
}

if (rows.length === 0) {
    console.log("-- No rows to insert");
    process.exit(0);
}

const columns = Object.keys(rows[0]);
const values = rows.map(row => `(${columns.map(col => escapeSql(row[col])).join(',')})`).join(',\n');

const sql = `INSERT INTO public.monthly_clients (${columns.join(', ')}) VALUES ${values};`;

console.log(sql);
