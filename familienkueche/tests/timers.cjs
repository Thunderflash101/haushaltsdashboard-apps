const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const dom=new JSDOM('',{url:'https://test.example',runScripts:'outside-only'}),w=dom.window;w.eval(fs.readFileSync(__dirname+'/../www/timer-core.js','utf8'));
let now=1000000,finished=[];const options={now:()=>now,storage:w.localStorage,onFinish:t=>finished.push(t.id)};
let store=w.createFamilyTimers(options);const id=store.add('Nudeln',10);now+=120000;assert.equal(store.list()[0].remaining,480000);store.pause(id);now+=300000;assert.equal(store.list()[0].remaining,480000);store.resume(id);now+=60000;assert.equal(store.list()[0].remaining,420000);
store=w.createFamilyTimers(options);assert.equal(store.list()[0].remaining,420000,'Restore running deadline');now+=500000;store.tick();assert.equal(store.list()[0].status,'done');assert.equal(finished.length,1);store.tick();assert.equal(finished.length,1);store=w.createFamilyTimers(options);store.tick();assert.equal(finished.length,1,'No repeated finished alarm after reload');
store.reset(id);assert.equal(store.list()[0].status,'paused');assert.equal(store.list()[0].remaining,600000);store.remove(id);assert.equal(store.list().length,0);
for(let i=0;i<6;i++)store.add('Timer',1);assert.throws(()=>store.add('Zu viele',1));assert.throws(()=>store.add('Ungültig',0));assert.equal(w.formatFamilyTimer(3599999),'01:00:00');assert.equal(w.formatFamilyTimer(30000),'00:30');
w.close();console.log('PASS: timer pause/resume, deadline after suspension, reload, finish once, reset/remove, bounds and formatting.');
