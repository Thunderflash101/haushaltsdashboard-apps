const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="app"></div><div id="overlay" hidden></div><div id="toast"></div>',{url:'https://ha.example/api/hassio_ingress/session/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document,posts=[];let failReads=false,reads=0;
let purchases=[];let items=[{id:'milk',name:'Milch <b>Hafer</b>',done:false,description:'2 Liter',revision:'a'.repeat(64)},{id:'old',name:'Brot',done:true,description:'',revision:'b'.repeat(64)}];
w.remindersFixture={"config":{"enabled":false,"waste":true,"events":true,"tina":true,"joern":true,"wasteTime":"18:00","leadMinutes":30,"quiet":true,"quietStart":"22:00","quietEnd":"07:00","targets":[],"activatedAt":null},"revision":1,"items":[],"targets":[],"sources":[],"history":[],"total":0,"error":"","loading":false,"fetchedAt":null};
class XHR{open(method,url){this.method=method;this.url=url;this.headers={};}setRequestHeader(k,v){this.headers[k]=v;}send(body){if(this.url==='api/profiles'){this.status=200;this.responseText="{\"profiles\": [{\"person\": \"alle\", \"color\": \"#c58a53\", \"revision\": 1, \"photo\": null}, {\"person\": \"tina\", \"color\": \"#9b6cb1\", \"revision\": 1, \"photo\": null}, {\"person\": \"joern\", \"color\": \"#5082ba\", \"revision\": 1, \"photo\": null}, {\"person\": \"felix\", \"color\": \"#779447\", \"revision\": 1, \"photo\": null}]}";this.onload();return;}if(this.url.indexOf('api/reminders')===0){this.status=200;this.responseText=JSON.stringify(w.remindersFixture);this.onload();return;}this.body=body;if(this.url.indexOf('api/suggestions?')===0){this.answer(200,{recipes:[],matches:0,poolSize:0,warnings:[],today:'2026-11-07'});return;}if(this.method==='POST'){posts.push(this);return;}if(this.url==='api/shopping'){reads++;this.answer(failReads?502:200,failReads?{error:'Offline'}:{items:JSON.parse(JSON.stringify(items)),purchases,label:'Einkaufsliste',canAdd:true,canUpdate:true,canRemove:true,fetchedAt:'2026-11-07T10:00:00+01:00'});return;}if(this.url.indexOf('api/calendar')===0)this.answer(200,{sources:[],fetchedAt:'2026-11-07T10:00:00+01:00'});else if(this.url.indexOf('api/meals?')===0)this.answer(200,{entries:[],revisions:{}});else if(this.url.indexOf('api/recipes?')===0)this.answer(200,{recipes:[]});else this.answer(502,{error:'Wetter offline'});}answer(status,value){this.status=status;this.responseText=JSON.stringify(value);this.onload();}}
w.XMLHttpRequest=XHR;for(const file of ['family.js','saver.js','profiles.js','reminders.js','timer-core.js','cooking.js','ingredients.js','shopping.js','weather.js','suggestions.js','meals.js','app.js'])w.eval(fs.readFileSync(__dirname+'/../www/'+file,'utf8'));
function click(sel){const el=d.querySelector(sel);assert(el,sel);el.click();}
function submit(id){d.getElementById(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
click('[data-screen="shopping"]');assert(d.body.textContent.includes('Milch <b>Hafer</b>'));assert(!d.querySelector('.shopping-main b'));assert(d.querySelector('.badge').textContent==='1');
let input=d.getElementById('shopping-add-input');input.value='Äpfel';input.focus();submit('shopping-add-form');submit('shopping-add-form');assert.equal(posts.length,1);assert.equal(JSON.parse(posts[0].body).name,'Äpfel');assert(posts[0].headers['Idempotency-Key']);items.push({id:'apple',name:'Äpfel',done:false,description:'',revision:'c'.repeat(64)});posts.shift().answer(200,{success:true});assert.equal(d.getElementById('shopping-add-input').value,'');assert.equal(d.querySelector('.badge').textContent,'2');
click('label[for="shopping-check-0"] .shop-product-photo');let post=posts.shift();assert.equal(JSON.parse(post.body).done,true);assert.equal(d.querySelector('[data-shopping-id="milk"]').checked,false,'No optimistic check');items[0].done=true;items[0].revision='d'.repeat(64);post.answer(200,{success:true});assert(d.querySelector('[data-shopping-id="milk"]').checked);assert.equal(d.querySelector('.badge').textContent,'1');
d.querySelector('.shop-completed').open=true;click('[data-shopping-id="milk"]');post=posts.shift();assert.equal(JSON.parse(post.body).done,false);items[0].done=false;items[0].revision='e'.repeat(64);post.answer(200,{success:true});assert(d.querySelector('.shop-completed').open);assert.equal(d.querySelector('.badge').textContent,'2');
click('[data-action="shopping-rename"][data-id="milk"]');d.getElementById('shopping-name').value='Hafermilch';submit('shopping-rename-form');post=posts.shift();assert.equal(JSON.parse(post.body).id,'milk');assert.equal(JSON.parse(post.body).action,'rename');items[0].name='Hafermilch';items[0].revision='f'.repeat(64);post.answer(200,{success:true});assert(d.body.textContent.includes('Hafermilch'));
click('[data-action="shopping-remove"][data-id="milk"]');assert.equal(posts.length,0,'Delete requires form confirmation');submit('shopping-remove-form');post=posts.shift();assert.equal(JSON.parse(post.body).action,'remove');post.answer(409,{error:'Inzwischen geändert',conflict:true});assert(d.querySelector('#shopping-remove-form [type="submit"]').disabled);click('[data-action="close"]');click('[data-action="shopping-refresh"]');
input=d.getElementById('shopping-add-input');input.value='Neuer Entwurf';input.focus();input.setSelectionRange(4,4);failReads=true;click('[data-action="shopping-refresh"]');assert.equal(d.getElementById('shopping-add-input').value,'Neuer Entwurf');assert(d.body.textContent.includes('Letzter geladener Stand'));assert(d.querySelector('#shopping-add-form button').disabled);assert(d.body.textContent.includes('Hafermilch'));
failReads=false;click('[data-action="shopping-refresh"]');
assert(d.querySelector('label[for="shopping-check-0"] .shop-sheet-8'),'Hafermilch uses its own photo');
click('[data-action="shopping-pictures"]');
assert.equal(d.querySelectorAll('.shop-group').length,10);
assert.equal(d.querySelectorAll('.shop-choice').length,0,'No invented shopping history');
click('#overlay .modal-head [data-action=close]');
purchases=[{name:'1 kg Bio-Karotten',count:4},{name:'Möhren',count:3},{name:'Brot',count:6}];
click('[data-action="shopping-refresh"]');click('[data-action="shopping-pictures"]');
assert.deepEqual(Array.from(d.querySelectorAll('.shop-choice'),x=>x.dataset.product),['3','5'],'Frequency merges aliases');
const catalogue=new Map();
for(let i=0;i<10;i++){
    click('.shop-group[data-group="'+i+'"]');
    for(const choice of d.querySelectorAll('.shop-choice')){
        const photo=choice.querySelector('.shop-product-photo');
        catalogue.set(choice.querySelector('.shop-picture+span').textContent,photo.className+'|'+photo.style.backgroundPosition);
    }
    click('[data-action="shopping-groups"]');
}
assert.equal(catalogue.size,160);
assert.equal(new Set(catalogue.values()).size,160);
click('.shop-group[data-group="1"]');
const carrot='.shop-choice[data-product="3"]',cucumber='[data-product="9"]',finish='[data-action="shopping-finish"]';
const editingReads=reads;
click(carrot);assert(d.querySelector(carrot).classList.contains('shop-selected'));assert(!d.querySelector(carrot).disabled);
click(carrot);assert.equal(d.querySelector(carrot).getAttribute('aria-pressed'),'false');
click(carrot);click(cucumber);
click('[data-action="shopping-groups"]');
assert(d.querySelector(carrot).classList.contains('shop-selected'),'Same draft in frequently bought and group');
click('.shop-group[data-group="0"]');assert(d.querySelector('[data-product="0"]').disabled);
click('[data-product="16"]');assert.equal(posts.length,0);assert.equal(reads,editingReads);
// The close icon discards even a non-empty draft.
click('#overlay .modal-head [data-action=close]');click('[data-action="shopping-pictures"]');
assert.equal(d.querySelector(carrot).getAttribute('aria-pressed'),'false');
click(finish);assert(!d.querySelector('#shopping-picture-picker'));assert.equal(posts.length,0);
click('[data-action="shopping-pictures"]');click(carrot);
click('.shop-group[data-group="1"]');click(cucumber);
click('[data-action="shopping-groups"]');click('.shop-group[data-group="0"]');click('[data-product="16"]');
// Simulate a remote addition after local selection and a failed preflight.
items.push({id:'cuke',name:'Bio-Gurke',done:false,revision:'1'.repeat(64)});
failReads=true;click(finish);assert.equal(posts.length,0);assert(!d.querySelector(finish).disabled);
failReads=false;click(finish);click(finish);assert.equal(posts.length,1);
d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
assert(d.querySelector('#shopping-picture-picker'));
post=posts.shift();assert.deepEqual(JSON.parse(post.body),{action:'add',name:'Möhren'});
items.push({id:'carrot',name:'500 g Bio-Karotten',done:false,description:'',revision:'1'.repeat(64)});
post.answer(200,{success:true});assert.equal(posts.length,1);post=posts.shift();
assert.equal(JSON.parse(post.body).name,'Birnen');post.answer(502,{uncertain:true,error:'Bestätigung fehlt.'});
assert.equal(posts.length,0,'Never automatically repeat an uncertain write');
assert(d.querySelector('[data-product="16"]').classList.contains('shop-selected'));
assert(d.querySelector('#shopping-picture-picker .error').textContent.includes('Birnen'));
click(finish);assert.equal(posts.length,1);post=posts.shift();assert.equal(JSON.parse(post.body).name,'Birnen');
items.push({id:'pear',name:'Birnen',done:false,revision:'2'.repeat(64)});post.answer(200,{success:true});
assert(!d.querySelector('#shopping-picture-picker'));
assert(d.querySelector('[data-shopping-id="carrot"] + label .shop-product-photo'));
assert(d.querySelector('details [data-shopping-id="old"] + label .shop-product-photo'));
assert.equal(d.getElementById('shopping-add-input').value,'Neuer Entwurf');
items=Array.from(catalogue.keys(),(name,i)=>({id:String(i),name:'2 × '+name,done:false,revision:'1'.repeat(64)}));
items.push({id:'canned',name:'Tomaten aus der Dose',done:true,revision:'2'.repeat(64)});
click('[data-action="shopping-refresh"]');
for(const row of d.querySelectorAll('.shopping-main .shop-item')){
    const entry=items.find(x=>x.id===row.querySelector('input').dataset.shoppingId);
    const photo=row.querySelector('.shop-product-photo');assert(photo,entry.name);
    assert.equal(photo.className+'|'+photo.style.backgroundPosition,catalogue.get(entry.id==='canned'?'Dosentomaten':entry.name.slice(4)),entry.name);
}
w.close();console.log('PASS: live list, safe text, add/clear input, duplicate click guard, confirmed check/restore, rename, delete confirmation, conflict, draft preservation and stale errors.');
