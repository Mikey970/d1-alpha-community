'use strict';
const fs = require('node:fs');
const path = require('node:path');
const [entry, logPrefix] = process.argv.slice(2);
if (!entry || !logPrefix) throw new Error('Expected entry module and log prefix');
const stdout = fs.openSync(`${logPrefix}.stdout.log`, 'a');
const stderr = fs.openSync(`${logPrefix}.stderr.log`, 'a');
// Keep the backend in this process so the receipt owns the listening PID.
process.stdout.write = (chunk, encoding, callback) => {
  fs.writeSync(stdout, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8'));
  (typeof encoding === 'function' ? encoding : callback)?.(); return true;
};
process.stderr.write = (chunk, encoding, callback) => {
  fs.writeSync(stderr, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8'));
  (typeof encoding === 'function' ? encoding : callback)?.(); return true;
};
require(path.resolve(entry));
