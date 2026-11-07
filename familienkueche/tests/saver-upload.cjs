const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
function setup(){
 const dom=new JSDOM('<div id="overlay"></div>',{url:'https://ha.example/',runScripts:'outside-only'}),w=dom.window,d=w.document,reads=[],writes=[],notices=[];
 w.eval(fs.readFileSync(__dirname+'/../www/saver.js','utf8'));
 const esc=x=>String(x||'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
 const btn=(a,t,c,attrs)=>'<button data-action="'+a+'" '+(attrs||'')+'>'+t+'</button>';
 const saver=w.createFamilySaver({api:(m,p,data,key,done)=>{(m==='GET'?reads:writes).push({data,key,done});},esc,btn,uid:()=>Math.random().toString(36).slice(2),modal:(t,b)=>d.getElementById('overlay').innerHTML=b,toast:x=>notices.push(x),screen:()=> 'calendar',preferences:()=>({}),icon:()=>'',repaint:()=>{}});
 w.FileReader=class{readAsDataURL(){this.result='data:image/jpeg;base64,PHOTO';this.onload();}};
 w.Image=class{constructor(){this.naturalWidth=1200;this.naturalHeight=800;}set src(v){if(v&&this.onload)this.onload();}};
 w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){}});w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,UEhPVE8=';
 saver.action('saver-photos',{});
 return {dom,w,d,reads,writes,notices,saver,input:()=>d.getElementById('family-photo-input')};
}
{
 const t=setup();t.reads.shift().done(null,{photos:[]});
 assert(!t.input().multiple,'Companion-compatible picker must request a single photo, not multiple/ClipData mode');
 assert.equal(t.input().accept,'image/*','Use a native image filter rather than mixed extension/MIME filters');
 const file={name:'Mein Foto.jpg',type:'image/jpeg',size:900};let value='selected-photo';
 Object.defineProperty(t.input(),'files',{configurable:true,get:()=>value?[file]:[]});
 Object.defineProperty(t.input(),'value',{configurable:true,get:()=>value,set:x=>value=x});
 t.w.FileReader=class{readAsDataURL(f){assert.equal(value,'selected-photo','File selection must stay intact while the provider reads it');assert.strictEqual(f,file);this.result='data:image/jpeg;base64,PHOTO';this.onload();}};
 t.saver.change(t.input());assert.equal(t.writes.length,1);assert.equal(value,'selected-photo');
 t.writes.shift().done(null,{success:true});t.reads.shift().done(null,{photos:[]});
 assert.equal(value,'selected-photo','Native filename remains visible after success');
 assert(t.d.body.textContent.includes('Mein Foto.jpg'),'Selected filename is also visible in app feedback');t.dom.window.close();
}
{
 const t=setup(),original=t.input();t.reads.shift().done(null,{photos:[]});
 assert.strictEqual(t.input(),original,'Album refresh must preserve the native file input while the picker is open');
 Object.defineProperty(original,'files',{configurable:true,value:[{name:'Familie.JPG',type:'',size:800}]});
 original.dispatchEvent(new t.w.Event('change',{bubbles:false}));
 assert.equal(t.writes.length,1,'Legacy file input event and missing MIME type must upload JPEG');
 t.writes.shift().done(null,{success:true});t.reads.shift().done(null,{photos:[]});
 assert(t.d.body.textContent.includes('gespeichert'),'Persistent success confirmation');t.dom.window.close();
}
{
 const t=setup();t.reads.shift().done(null,{photos:[]});
 Object.defineProperty(t.input(),'files',{configurable:true,value:[{name:'Bild.heic',type:'image/heic',size:1000}]});t.saver.change(t.input());
 assert.equal(t.writes.length,0);t.reads.shift().done(null,{photos:[]});
 assert(t.d.querySelector('[role="alert"]').textContent.includes('JPEG'),'Upload error survives a successful album refresh');
 assert(!t.input().disabled,'Selection is usable again after error');t.dom.window.close();
}
{
 const t=setup();t.reads.shift().done(null,{photos:[]});t.w.FileReader=class{readAsDataURL(){throw Error('Provider refused reading');}};
 Object.defineProperty(t.input(),'files',{configurable:true,value:[{name:'Bild.jpg',type:'image/jpeg',size:1000}]});
 assert.doesNotThrow(()=>t.saver.change(t.input()),'Synchronous Android provider failures must become visible errors');
 assert(!t.input().disabled);assert(t.d.body.textContent.includes('gelesen'));t.dom.window.close();
}
{
 const t=setup();const original=t.input();Object.defineProperty(original,'files',{configurable:true,value:[{name:'Bild.jpg',type:'image/jpg',size:1000}]});t.saver.change(original);
 assert.equal(t.writes.length,1);t.writes.shift().done(null,{success:true});
 t.reads.shift().done(null,{photos:[]});assert.equal(t.reads.length,1,'Successful upload during pending read must reload the album afterward');t.dom.window.close();
}
{
 const t=setup();t.reads.shift().done(null,{photos:[]});let timeout,late;
 t.w.setTimeout=fn=>{timeout=fn;return 1;};t.w.clearTimeout=()=>{};
 t.w.FileReader=class{readAsDataURL(){late=this.onload;}};
 Object.defineProperty(t.input(),'files',{configurable:true,value:[{name:'Bild.jpg',type:'image/jpeg',size:1000}]});
 t.saver.change(t.input());assert(t.input().disabled);assert(t.d.body.textContent.includes('Datei wird gelesen'));
 timeout();assert(!t.input().disabled);assert(t.d.body.textContent.includes('rechtzeitig gelesen'));
 late();assert.equal(t.writes.length,0,'A late reader callback cannot send after timeout');t.dom.window.close();
}
{
 const t=setup();t.reads.shift().done(null,{photos:[]});t.input().dispatchEvent(new t.w.Event('cancel'));
 assert(t.d.body.textContent.includes('Keine Fotodatei übernommen'),'A cancelled or failed native handoff has visible feedback');
 assert.equal(t.writes.length,0);assert(!t.input().disabled);t.dom.window.close();
}
console.log('PASS: single-photo picker, retained filename, empty handoff feedback, stable file input, legacy event/MIME, persistent upload errors, synchronous provider failure, pending album read and read timeout.');
