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
  if(p.startsWith('/api/family')||p.startsWith('/api/saver')||p.startsWith('/api/reminders'))return route.continue();
  let data;
  if(p==='/api/calendar'){const day=new Date().toISOString().slice(0,10);data={fetchedAt:day+'T12:00:00+01:00',sources:[{key:'tina',ok:true,canCreate:false,events:[{id:'example',date:day,title:'Gemeinsamer Nachmittag',start:'20:00',end:'21:00',person:'tina',source:'tina',sourceLabel:'Tina'}]},{key:'joern',ok:true,canCreate:true,events:[]}]};}
  else if(p==='/api/weather')data={source:'Testwetter',condition:'partlycloudy',temperature:18,temperatureUnit:'°C',windSpeed:5,windUnit:'km/h',humidity:60,forecast:[],fetchedAt:new Date().toISOString()};
  else if(p==='/api/shopping')data={items:[],label:'Test-Einkauf',canAdd:true,canUpdate:true,canRemove:true};
  else if(p==='/api/meals')data={entries:[],revisions:{}};
  else if(p==='/api/recipes')data={recipes:[]};
  else if(p==='/api/suggestions')data={recipes:[],matches:0,poolSize:0,warnings:[],today:new Date().toISOString().slice(0,10)};
  else return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'Fixture endpoint not mocked'})});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 };

 const base='http://127.0.0.1:'+port+'/';
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',mockApi);
 const hostMarkup='<meta charset="utf-8"><style>html,body{margin:0;height:100%;font-family:serif}aside{position:absolute;width:170px;height:100%;background:#ddd}main{position:absolute;left:170px;right:0;top:0;bottom:0}header{height:40px;background:#222;color:white}iframe{display:block;width:100%;height:calc(100% - 40px);border:0}</style><aside>Home Assistant</aside><main><header>Familienküche</header><div id="panel"></div></main><script>var shadow=document.querySelector("#panel").attachShadow({mode:"open"});shadow.innerHTML=\'<style>:host{display:block;height:calc(100% - 40px)}iframe{width:100%;height:100%;border:0;display:block}</style><iframe src="/"></iframe>\';</script>';
 await page.route('**/fixture-host',r=>r.fulfill({contentType:'text/html',body:hostMarkup}));
 await page.goto(base+'fixture-host');
 const iframe=page.frameLocator('iframe');await iframe.locator('.calendar').waitFor();
 const source=page.frames().find(f=>f!==page.mainFrame());
 const jpg=await source.evaluate(()=>{var c=document.createElement('canvas');c.width=1200;c.height=800;var g=c.getContext('2d');g.fillStyle='#567766';g.fillRect(0,0,c.width,c.height);return c.toDataURL('image/jpeg').split(',')[1];});
 const upload=await page.request.post(base+'api/saver/photos',{headers:{'X-Family-Request':'1','Idempotency-Key':'fullscreen-photo'},data:{action:'add',name:'Vollbildtest',image:jpg}});assert.equal(upload.status(),200);
 async function enter(){await iframe.locator('[data-screen="saver"]').click();await page.locator('[data-family-saver-fullscreen] .family-saver').waitFor();}
 async function checkSize(){await page.waitForFunction(()=>{const host=document.querySelector('[data-family-saver-fullscreen]'),section=host&&host.shadowRoot.querySelector('.family-saver');if(!section||getComputedStyle(host).visibility==='hidden')return false;const r=section.getBoundingClientRect();return r.x===0&&r.y===0&&r.width===innerWidth&&r.height===innerHeight;});assert.equal(await source.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}

 await enter();
 for(const size of [{width:1280,height:800},{width:960,height:600},{width:412,height:915}]){await page.setViewportSize(size);await page.waitForTimeout(250);await checkSize();}
 await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(250);
 await page.waitForFunction(()=>{const img=document.querySelector('[data-family-saver-fullscreen]').shadowRoot.querySelector('.saver-photo');return img&&img.complete&&img.naturalWidth>0;});
 assert((await page.locator('[data-family-saver-fullscreen] .saver-photo').getAttribute('src')).startsWith(base+'api/saver/photos/'),'Mirrored photos retain correct ingress URL');
 await source.evaluate(()=>document.querySelector('[data-clock]').textContent='12:34');await page.waitForFunction(()=>document.querySelector('[data-family-saver-fullscreen]').shadowRoot.querySelector('[data-clock]').textContent==='12:34');
 await page.screenshot({path:'/tmp/familienkueche-ruhemodus-vollbild.png'});
 await page.locator('[data-family-saver-fullscreen] .family-saver').click({position:{x:30,y:30}});await iframe.locator('.calendar').waitFor();assert.equal(await page.locator('[data-family-saver-fullscreen]').count(),0,'Tap fully removes host layer');assert.equal(await page.locator('header').innerText(),'Familienküche');
 await enter();await page.locator('[data-family-saver-fullscreen] [data-action="weather"]').click();await iframe.locator('#overlay:not([hidden])').waitFor();assert.equal(await page.locator('[data-family-saver-fullscreen]').count(),0,'Weather opens in accessible original UI');await iframe.locator('#overlay [data-action="close"]').first().click();
 await enter();await page.keyboard.press('Escape');await iframe.locator('.calendar').waitFor();assert.equal(await page.locator('[data-family-saver-fullscreen]').count(),0,'Escape restores host');
 await enter();await page.evaluate(()=>{history.pushState({},'', '/fixture-host?elsewhere');window.dispatchEvent(new Event('location-changed'));});assert.equal(await page.locator('[data-family-saver-fullscreen]').count(),0,'HA navigation cleans overlay');await iframe.locator('.calendar').waitFor();
 await enter();await Promise.all([source.waitForNavigation(),source.evaluate(()=>location.reload())]);await iframe.locator('.calendar').waitFor();assert.equal(await page.locator('[data-family-saver-fullscreen]').count(),0,'Iframe reload cleans overlay');
 await iframe.locator('[data-action="settings"]').click();await iframe.locator('[name="idle"]').selectOption('60');await iframe.locator('#settings-form [type="submit"]').click();
 // Chromium clock runs the actual idle timer without a real minute-long pause.
 await page.clock.install();await source.evaluate(()=>document.dispatchEvent(new Event('touchstart',{bubbles:true})));await page.clock.fastForward(61000);await page.locator('[data-family-saver-fullscreen] .family-saver').waitFor();await checkSize();
 await source.evaluate(()=>{var dock=document.querySelector('.timer-dock');dock.hidden=false;dock.classList.add('has-alarm');dock.innerHTML='<button data-action="wake">Timer fertig</button>';});await page.locator('[data-family-saver-fullscreen] .timer-dock button').getByText('Timer fertig').waitFor();
 await page.locator('[data-family-saver-fullscreen] .timer-dock button').click();await iframe.locator('.calendar').waitFor();assert.equal(await page.locator('[data-family-saver-fullscreen]').count(),0);
 await enter();await page.evaluate(()=>document.querySelector('#panel').shadowRoot.querySelector('iframe').remove());await page.clock.fastForward(1200);assert.equal(await page.locator('[data-family-saver-fullscreen]').count(),0,'Removed iframe cannot leave an orphan overlay');
 await page.clock.resume();await page.goto(base);await page.locator('[data-screen="saver"]').click();await page.waitForFunction(()=>{const r=document.querySelector('.family-saver').getBoundingClientRect();return r.x===0&&r.y===0&&r.width===innerWidth&&r.height===innerHeight;});await page.keyboard.press('Escape');await page.locator('.calendar').waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: fullscreen over same-origin HA shadow/iframe, 1280×800/960×600/phone, photos, clock updates, tap/Escape/weather, route/reload/removal cleanup, automatic idle, timer dock and standalone. No HA writes.');
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
