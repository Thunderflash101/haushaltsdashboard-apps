import fs from 'node:fs';
import {validateFinanceState} from '../public/finance.mjs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';

// A single Node process owns these files. Rename commits one complete generation.
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive:true, mode:0o700});
  const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
  const fd=fs.openSync(tmp,'wx',0o600);
  try {fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  fs.renameSync(tmp,file);
  const dir=fs.openSync(path.dirname(file),'r');
  try {fs.fsyncSync(dir);} finally {fs.closeSync(dir);}
}
export function readJson(file, initial) {
  try {return JSON.parse(fs.readFileSync(file,'utf8'));}
  catch(error) {if(error.code==='ENOENT')return structuredClone(initial);throw new Error('Lokale Datendatei ist nicht lesbar. Wiederherstellung aus Sicherung erforderlich.');}
}
export function validState(value) {
  return value && value.version===1 && Array.isArray(value.bookings) && Array.isArray(value.fixed)
    && value.bookings.length<=100000 && value.fixed.length<=10000
    && value.bookings.every(b=>b && typeof b.date==='string' && /^\d{2}\.\d{2}\.\d{4}$/.test(b.date) && typeof b.amount==='number' && Number.isFinite(b.amount) && Math.abs(b.amount)<1e12 && typeof b.payee==='string' && typeof b.purpose==='string')
    && value.fixed.every(f=>f && typeof f.name==='string' && Number.isFinite(Number(f.monthly)))
    && validateFinanceState(value) === null;
}

