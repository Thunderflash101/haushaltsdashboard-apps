const path=require('path'),assert=require('assert'),{spawn}=require('child_process');
const {chromium}=require(process.env.FAMILY_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const server=spawn('python3',['-W','ignore',path.join(__dirname,'family_fixture.py')],{stdio:['ignore','pipe','pipe']});
 let browser,log='';server.stderr.on('data',x=>log+=x);
 try{
 const port=await new Promise((resolve,reject)=>{let output='';let timeout=setTimeout(()=>reject(Error('Fixture startup timeout '+log)),12000);server.stdout.on('data',x=>{output+=x;try{const result=JSON.parse(output.trim().split('\n')[0]);clearTimeout(timeout);resolve(result.port);}catch(e){}});server.on('error',reject);server.on('exit',code=>{clearTimeout(timeout);reject(Error('Fixture stopped '+code+' '+log));});});
 browser=await chromium.launch({executablePath:process.env.FAMILY_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],timeout:12000});
 const mockApi=async route=>{
  const url=new URL(route.request().url()),p=url.pathname;
  if(p.startsWith('/api/profiles')||p.startsWith('/api/family')||p.startsWith('/api/saver')||p.startsWith('/api/reminders'))return route.continue();
  let data;
  if(p==='/api/calendar'){const day='2026-11-10';const ev=(id,title,person,start,end)=>({id,title,date:day,person,source:person,sourceLabel:person,kind:person,start,end});data={fetchedAt:day+'T10:00:00+01:00',sources:[{key:'tina',ok:true,canCreate:false,events:[ev('tina','Tinas Arzttermin','tina','11:00','12:00')]},{key:'joern',ok:true,canCreate:true,events:[ev('joern','Jörns Fußball','joern','16:00','17:30')]},{key:'waste',ok:true,events:[{id:'waste',title:'Restmüll',date:day,person:'alle',kind:'waste',isWaste:true,allDay:true}]}]};}
  else if(p==='/api/weather')data={source:'Testwetter',condition:'partlycloudy',temperature:18,temperatureUnit:'°C',windSpeed:5,windUnit:'km/h',humidity:60,forecast:[],fetchedAt:new Date().toISOString()};
  else if(p==='/api/shopping')data={items:[],label:'Test-Einkauf',canAdd:true,canUpdate:true,canRemove:true};
  else if(p==='/api/meals')data={entries:[],revisions:{}};
  else if(p==='/api/recipes')data={recipes:[]};
  else if(p==='/api/suggestions')data={recipes:[],matches:0,poolSize:0,warnings:[],today:new Date().toISOString().slice(0,10)};
  else return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'Fixture endpoint not mocked'})});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 };


 const base='http://127.0.0.1:'+port+'/';
 const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-11-10T10:00:00+01:00')});await page.route('**/api/**',mockApi);await page.goto(base);await page.locator('.event').first().waitFor();
 async function select(person){await page.locator('[data-action="filter"][data-person="'+person+'"]').click();assert.equal(await page.locator('.profile-filter[aria-pressed="true"]').count(),1);}
 for(const mode of ['week','month','list']){
  await page.locator('[data-mode="'+mode+'"]').click();await select('tina');
  const region=mode==='week'?'.calendar':mode==='month'?'.month-calendar':'.scroll-panel';
  await page.locator(region).waitFor();assert((await page.locator(region).innerText()).includes('Tinas Arzttermin'));assert(!(await page.locator(region).innerText()).includes('Jörns Fußball'));assert(!(await page.locator(region).innerText()).includes('Restmüll'));
  await select('joern');assert((await page.locator(region).innerText()).includes('Jörns Fußball'));assert(!(await page.locator(region).innerText()).includes('Tinas Arzttermin'));
  await select('felix');assert(!(await page.locator(region).innerText()).includes('Tinas Arzttermin'));assert(!(await page.locator(region).innerText()).includes('Jörns Fußball'));
  await select('alle');if(mode==='month'){await page.locator('.month-day[data-date="2026-11-10"]').click();await page.locator('#overlay [data-id="tina"]').waitFor();assert((await page.locator('#overlay').innerText()).includes('Jörns Fußball'));assert((await page.locator('#overlay').innerText()).includes('Restmüll'));await page.locator('#overlay [data-action="close"]').first().click();}else{assert((await page.locator(region).innerText()).includes('Tinas Arzttermin'));assert((await page.locator(region).innerText()).includes('Jörns Fußball'));assert((await page.locator(region).innerText()).includes('Restmüll'));}
 }
 await page.locator('[data-mode="week"]').click();await page.locator('[data-action="settings"]').click();await page.locator('[data-action="profiles-open"]').click();await page.locator('#profile-color:not([disabled])').waitFor();
 await page.locator('#profile-color').fill('#1188aa');await page.locator('#profile-color-form [type="submit"]').click();await page.getByText('Farbe gespeichert.',{exact:true}).waitFor();
 let profiles=await (await page.request.get(base+'api/profiles')).json();assert.equal(profiles.profiles.find(p=>p.person==='tina').color,'#1188aa');
 const jpg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=700;c.height=900;const g=c.getContext('2d');g.fillStyle='#dcc7ac';g.fillRect(0,0,700,900);g.fillStyle='#ad8978';g.beginPath();g.arc(350,330,150,0,Math.PI*2);g.fill();g.fillStyle='#6f8c84';g.beginPath();g.ellipse(350,800,240,300,0,0,Math.PI*2);g.fill();return c.toDataURL('image/jpeg').split(',')[1];});
 const picker=page.locator('#profile-photo-input'),pickerHandle=await picker.elementHandle(),chooserReady=page.waitForEvent('filechooser');await picker.click();const chooser=await chooserReady;assert(!chooser.isMultiple());await page.setViewportSize({width:960,height:600});await page.clock.runFor(300);assert(await pickerHandle.evaluate(x=>x.isConnected),'Resize keeps native picker mounted');await chooser.setFiles({name:'Portrait.JPG',mimeType:'application/octet-stream',buffer:Buffer.from(jpg,'base64')});await page.getByText('Foto gespeichert.',{exact:true}).waitFor();await page.waitForFunction(()=>{const img=document.querySelector('[data-profile-preview] img');return img&&img.complete&&img.naturalWidth===320;});assert((await picker.inputValue()).includes('Portrait.JPG'));
 const album=await (await page.request.get(base+'api/saver/photos')).json();assert.equal(album.photos.length,0,'Person photos are separate from saver album');
 await page.screenshot({path:'/tmp/familienkueche-personen-einstellungen.png'});await page.locator('#overlay [data-action="close"]').first().click();
 for(const size of [{width:1280,height:800},{width:960,height:600}]){await page.setViewportSize(size);await page.clock.runFor(250);assert(await page.locator('.app-main').evaluate(x=>x.scrollWidth<=x.clientWidth+1),'Calendar fits '+JSON.stringify(size));assert(await page.locator('.calendar-scroll').evaluate(x=>x.clientHeight>=150),'Calendar remains usable '+JSON.stringify(size));const bounds=await page.locator('.profile-filters').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=size.width,'All profiles fit tablet');}
 await page.setViewportSize({width:1280,height:800});await page.clock.runFor(250);await page.waitForFunction(()=>{const img=document.querySelector('.profile-filter.tina img');return img&&img.complete&&img.naturalWidth===320;});assert.equal(await page.locator('.profile-filter.tina .profile-avatar').evaluate(x=>getComputedStyle(x).borderTopColor),'rgb(17, 136, 170)');await page.screenshot({path:'/tmp/familienkueche-personen-kalender.png'});
 // A second device reads the same picture/colour; edits use revisions.
 const phoneContext=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true}),phone=await phoneContext.newPage();phone.on('pageerror',e=>errors.push(e.message));await phone.route('**/api/**',mockApi);await phone.goto(base);await phone.waitForFunction(()=>document.querySelector('.profile-filter.tina img'));
 await phone.locator('[data-action="settings"]').click();await phone.locator('[data-action="profiles-open"]').click();await phone.locator('[data-action="profile-edit"][data-person="felix"]').click();await phone.locator('#profile-photo-input:not([disabled])').waitFor();const phoneChooserReady=phone.waitForEvent('filechooser');await phone.locator('#profile-photo-input').click();const phoneChooser=await phoneChooserReady;assert(!phoneChooser.isMultiple());await phoneChooser.setFiles({name:'Felix.jpg',mimeType:'image/jpeg',buffer:Buffer.from(jpg,'base64')});await phone.getByText('Foto gespeichert.',{exact:true}).waitFor();assert((await phone.locator('#profile-photo-input').inputValue()).includes('Felix.jpg'));
 await phone.screenshot({path:'/tmp/familienkueche-personen-smartphone.png'});
 await page.locator('[data-action="settings"]').click();await page.locator('[data-action="profiles-open"]').click();await page.locator('[data-action="profile-refresh"]').click();await page.locator('[data-action="profile-edit"][data-person="felix"]').click();await page.locator('[data-profile-preview] img').waitFor();
 await phone.locator('[data-action="profile-remove-photo"]').click();await phone.getByText('Foto entfernt.',{exact:true}).waitFor();profiles=await (await page.request.get(base+'api/profiles')).json();assert.equal(profiles.profiles.find(p=>p.person==='felix').photo,null);
 assert.deepEqual(errors,[]);console.log('PASS: exclusive week/month/list filters and Family reset, shared avatar upload/colour/remove, Android-style missing MIME/single-file picker, stable picker on resize, two devices, separate album and tablet calendar space. No HA writes.');await phoneContext.close();await context.close();
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
