const fs=require('fs'),path=require('path'),assert=require('assert'),{spawn}=require('child_process');
const {chromium}=require(process.env.FAMILY_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const server=spawn('python3',['-W','ignore',path.join(__dirname,'family_fixture.py')],{stdio:['ignore','pipe','pipe']});let browser,log='';server.stderr.on('data',x=>log+=x);
 try{
 const port=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('Fixture timeout '+log)),12000);server.stdout.on('data',x=>{out+=x;try{const v=JSON.parse(out.trim().split('\n')[0]);clearTimeout(timer);resolve(v.port);}catch(e){}});server.on('error',reject);server.on('exit',code=>{clearTimeout(timer);reject(Error('Fixture stopped '+code+' '+log));});});
 browser=await chromium.launch({executablePath:process.env.FAMILY_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],images={},requests={count:0,list:0};page.on('pageerror',e=>errors.push(e.message));
 const client=await page.context().newCDPSession(page);await client.send('Emulation.setCPUThrottlingRate',{rate:4});
 let photo='a'.repeat(64),fullListReady=false;
 const recipes=['Pasta','Hähnchen','Eintopf'].map((name,i)=>({id:'recipe-'+i,name,image:'api/recipes/recipe-'+i+'/image',time:'30 Minuten',minutes:30}));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),p=url.pathname;
  if(p.endsWith('/image')||p.includes('/photo/')){images[p]=(images[p]||0)+1;return route.fulfill({contentType:'image/png',headers:{'Cache-Control':'private, max-age=300'},body:png});}
  let data;
  if(p==='/api/profiles')data={profiles:['alle','tina','joern','felix'].map((person,i)=>({person,color:['#c58a53','#9b6cb1','#5082ba','#779447'][i],revision:person==='tina'&&photo[0]==='b'?2:1,photo:person==='alle'?null:'api/profiles/'+person+'/photo/'+photo+'.jpg'}))};
  else if(p==='/api/calendar')data={sources:[],fetchedAt:new Date().toISOString()};
  else if(p==='/api/shopping/count'){requests.count++;data={count:12};}
  else if(p==='/api/shopping'){requests.list++;while(!fullListReady)await new Promise(r=>setTimeout(r,20));data={items:[{id:'milk',name:'Milch',done:false,revision:'c'.repeat(64)}],label:'Test-Einkauf',canAdd:true,canUpdate:true,canRemove:true};}
  else if(p==='/api/weather')data={source:'Testwetter',condition:'cloudy',temperature:18,temperatureUnit:'°C',windSpeed:5,windUnit:'km/h',forecast:[],fetchedAt:new Date().toISOString()};
  else if(p==='/api/meals'){let entries=[],revisions={};for(let d=new Date(url.searchParams.get('start')+'T12:00:00Z');d.toISOString().slice(0,10)<url.searchParams.get('end');d.setUTCDate(d.getUTCDate()+1)){const day=d.toISOString().slice(0,10);entries.push({id:day,date:day,title:recipes[0].name,recipe:recipes[0]});revisions[day]='c'.repeat(64);}data={entries,revisions};}
  else if(p==='/api/recipes')data={recipes};
  else if(p==='/api/suggestions')data={recipes,matches:3,poolSize:3,warnings:[],today:new Date().toISOString().slice(0,10)};
  else return route.continue();
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.addInitScript(()=>localStorage.setItem('familienkueche-settings-v1',JSON.stringify({idle:0})));await page.clock.install();await page.goto('http://127.0.0.1:'+port+'/');await page.waitForFunction(()=>document.querySelector('.badge').textContent==='12'&&document.querySelector('.profile-filter.tina img')?.complete);assert.equal(requests.list,0,'Startup count never waits for the full Bring list');
 await page.evaluate(()=>{window.avatar=document.querySelector('.profile-filter.tina img');});
 await page.locator('[data-action="filter"][data-person="tina"]').click();assert(await page.evaluate(()=>window.avatar===document.querySelector('.profile-filter.tina img')));
 await page.clock.fastForward(65000);await page.clock.runFor(500);assert(await page.evaluate(()=>window.avatar===document.querySelector('.profile-filter.tina img')&&window.avatar.isConnected));
 await page.locator('[data-screen="meals"]').click();await page.waitForFunction(()=>document.querySelectorAll('.recipe-library img').length===6&&Array.from(document.querySelectorAll('.recipe-library img')).every(x=>x.complete));
 await page.locator('.recipe-library').last().scrollIntoViewIfNeeded();
 await page.evaluate(()=>{window.keep=Array.from(document.querySelectorAll('.recipe-library img, .meal-row img'));window.detached=[];window.obs=new MutationObserver(rows=>rows.forEach(r=>r.removedNodes.forEach(n=>window.keep.forEach(img=>{if(n===img||n.contains&&n.contains(img))window.detached.push(img.src);})))) ;window.obs.observe(document.getElementById('app'),{childList:true,subtree:true});});
 const baseline={...images};await page.locator('#recipe-search input').fill('Entwurf bleibt');await page.locator('[data-action="meal-refresh"]').click();await page.clock.runFor(500);await page.clock.fastForward(65000);await page.clock.runFor(500);
 assert(await page.evaluate(()=>window.keep.every(img=>img.isConnected)),'Recipe photo nodes survive explicit and timed refresh');assert.deepEqual(await page.evaluate(()=>window.detached),[],'Refresh never detaches a recipe image');assert.equal(await page.locator('#recipe-search input').inputValue(),'Entwurf bleibt');assert.deepEqual(images,baseline,'No duplicate image requests during refresh');
 // Changed profile URLs must still take effect; unchanged photos remain connected.
 const updatedProfiles=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/profiles');photo='b'.repeat(64);await page.clock.fastForward(65000);await updatedProfiles;await page.clock.runFor(500);
 assert(await page.evaluate(()=>window.keep.every(img=>img.isConnected)),'A changed portrait does not replace recipes');await page.evaluate(()=>window.obs.disconnect());await page.locator('[data-screen="calendar"]').click();await page.waitForFunction(()=>document.querySelector('.profile-filter.tina img')?.src.includes('/'+'b'.repeat(64)+'.jpg'));
 await page.locator('[data-screen="shopping"]').click();await page.waitForFunction(()=>document.body.textContent.includes('Einkaufsliste wird geladen'));assert.equal(requests.list,1);assert.equal(await page.locator('.badge').first().textContent(),'12');fullListReady=true;await page.locator('#shopping-add-input:not([disabled])').waitFor();assert.equal(await page.locator('.badge').first().textContent(),'1');
 assert.deepEqual(errors,[]);console.log('PASS: 4× CPU throttle, immediate count without full Bring read, persistent portraits through filtering/polling, zero detached recipe photos or repeated image requests through manual/timed refresh, search draft retained, changed portrait applied, full-list loading on entry.');
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
