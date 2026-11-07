const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="app"></div>',{url:'https://ha.example/ingress/session/',runScripts:'outside-only'}),w=dom.window,d=w.document;
let clock='12:00',photos=[],now=Date.now(),tick;
w.setInterval=fn=>tick=fn;w.Date.now=()=>now;w.eval(fs.readFileSync(__dirname+'/../www/saver.js','utf8'));
const photo=id=>({id:id.repeat(32),url:'api/saver/photos/'+id.repeat(32)+'.jpg',name:id});
let saver;const app=d.getElementById('app');
saver=w.createFamilySaver({api:(m,p,v,k,done)=>done(null,{photos}),esc:String,icon:()=>'',preferences:()=>({photoInterval:30,photoFit:'cover',nightDim:false,nightStart:'22:00',nightEnd:'07:00'}),screen:()=>'saver',timeNow:()=>clock,context:()=>({date:'Samstag',weather:'18 °C',nextTitle:'Familienzeit',nextDetail:'16:00 - 17:00',mealTitle:'Pasta',mealDetail:''}),repaint:()=>saver.paint(app)});
photos=[photo('a'),photo('b'),photo('c')];saver.ensure();app.querySelector('.saver-art')._familyPhotoPending.onload();
const image=app.querySelector('[data-saver-photo]');assert(image);
for(let i=0;i<6;i++){clock='12:0'+i;saver.paint(app);assert.strictEqual(app.querySelector('[data-saver-photo]'),image);}
assert.equal(app.querySelector('[data-clock]').textContent,'12:05');
now+=31000;tick();const pending=image._familyPhotoPending;assert(pending&&pending.src.includes('b'.repeat(32)));assert.strictEqual(app.querySelector('[data-saver-photo]'),image,'Slow next photo leaves current photo mounted');saver.paint(app);assert.strictEqual(image._familyPhotoPending,pending,'Refresh keeps the in-flight image');
now+=31000;tick();const latest=image._familyPhotoPending;assert(latest.src.includes('c'.repeat(32)));pending.onload();assert.strictEqual(app.querySelector('[data-saver-photo]'),image,'Late obsolete response cannot replace current photo');latest.onerror();assert.strictEqual(app.querySelector('[data-saver-photo]'),image,'Failed photo keeps current background');
now+=31000;tick();assert.strictEqual(app.querySelector('[data-saver-photo]'),image,'Returning to current photo needs no reload');
now+=31000;tick();const ready=image._familyPhotoPending;assert(ready.src.includes('b'.repeat(32)));ready.onload();assert.strictEqual(app.querySelector('[data-saver-photo]'),ready,'Loaded replacement is inserted atomically');saver.paint(app);assert.strictEqual(app.querySelector('[data-saver-photo]'),ready);
// Leaving the saver while a request is pending must never resurrect it.
now+=31000;tick();const stale=ready._familyPhotoPending;app.innerHTML='<p>Kalender</p>';stale.onload();assert.equal(app.textContent,'Kalender');
w.close();console.log('PASS: stable background through clock refreshes, slow/failed photo retention, pending request reuse, stale response rejection, loaded swap and exit during load.');
