#!/usr/bin/env node
const fs = require('fs');
const port = process.argv[2];
if (!port) {
  console.error('Usage: extract-pids.js PORT');
  process.exit(2);
}
const input = fs.readFileSync(0, 'utf8');
const re = new RegExp(':' + port + '[\\s\\S]*?pid=(\\d+)', 'g');
const found = new Set();
let m;
while ((m = re.exec(input)) !== null) found.add(m[1]);
for (const pid of found) console.log(pid);
