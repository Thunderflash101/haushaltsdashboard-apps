const path=require('path'),assert=require('assert'),{spawn}=require('child_process');
const {chromium}=require(process.env.FAMILY_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const server=spawn('python3',['-W','ignore',path.join(__dirname,'family_fixture.py')],{stdio:['ignore','pipe','pipe']});let browser,log='';server.stderr.on('data',x=>log+=x);
 try{
  const port=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('Fixture startup '+log)),12000);server.stdout.on('data',x=>{out+=x;try{const data=JSON.parse(out.trim().split('\n')[0]);clearTimeout(timer);resolve(data.port);}catch(e){}});server.on('error',reject);server.on('exit',code=>{clearTimeout(timer);reject(Error('Fixture stopped '+code+' '+log));});});
  browser=await chromium.launch({executablePath:process.env.FAMILY_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1280,height:800},locale:'de-DE',timezoneId:'Europe/Berlin'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const mock=async route=>{const p=new URL(route.request().url()).pathname;if(p==='/api/profiles'&&route.request().method()==='GET'){const response=await route.fetch();const result=await response.json();result.profiles.forEach(x=>{x.name=({alle:'Familie',tina:'Alex & <A>',joern:'Sam',felix:'Kim'})[x.person];});return route.fulfill({response,json:result});}if(p.startsWith('/api/profiles')||p.startsWith('/api/family')||p.startsWith('/api/rewards'))return route.continue();let data,status=200;if(p==='/api/calendar')data={fetchedAt:new Date().toISOString(),sources:[{key:'tina',ok:true,events:[]},{key:'joern',ok:true,canCreate:true,events:[]}]};else if(p==='/api/meals')data={entries:[],revisions:{}};else if(p==='/api/shopping')data={items:[],label:'Testliste',canAdd:true,canUpdate:true,canRemove:true};else if(p==='/api/suggestions')data={recipes:[],matches:0,poolSize:0,warnings:[]};else{status=503;data={error:'Fixture not configured'};}return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});};
  await page.route('**/api/**',mock);const base='http://127.0.0.1:'+port+'/';await page.goto(base);await page.locator('.profile-filter').first().waitFor();
  assert.equal(await page.locator('.profile-filter.tina .profile-name').innerText(),'Alex & <A>');assert.equal(await page.locator('.profile-filter.tina .profile-name a').count(),0,'Configured profile names remain text');
  const snapshot=async()=>await(await page.request.get(base+'api/family')).json();
  const rewards=async()=>await(await page.request.get(base+'api/rewards')).json();
  await page.locator('[data-screen="family"]').click();await page.locator('[data-action="family-new"]:not([disabled])').waitFor();
  await page.locator('[data-action="family-new"]').click();await page.locator('#family-title').fill('Tisch decken');
  await page.locator('[data-action="family-assign-person"][data-person="felix"]').click();
  await page.locator('#family-points').fill('5');await page.locator('#family-repeat-kind').selectOption('monthly');
  await page.locator('#family-month-day').selectOption('0');assert(await page.locator('.family-repeat').isHidden());
  await page.locator('#family-repeat-kind').selectOption('weekly');await page.locator('#family-repeat-interval').fill('2');
  const weekday=await page.evaluate(()=> (new Date().getDay()+6)%7);await page.locator('[name="weekday"][value="'+weekday+'"]').check();
  await page.locator('[name="rotation"]').check();assert(await page.locator('[name="completionMode"][value="individual"]').isChecked());
  await page.locator('#family-edit-form [type="submit"]').click();await page.waitForFunction(()=>document.getElementById('overlay').hidden);
  await page.locator('[data-family-person="felix"]:not([disabled])').waitFor();
  let item=(await snapshot()).items.find(x=>x.title==='Tisch decken');assert.equal(item.repeat.interval,2);assert(item.rotation);
  await page.locator('[data-family-person="felix"]').click();await page.waitForFunction(()=>document.querySelector('[data-family-person="felix"]').checked&&!document.querySelector('[data-family-person="felix"]').disabled);
  assert.equal((await rewards()).balances.felix,5);
  await page.locator('[data-action="family-tab"][data-tab="rewards"]').click();await page.locator('[data-action="reward-new"]:not([disabled])').waitFor();
  assert((await page.locator('[data-action="reward-person"][data-person="felix"]').innerText()).includes('5 Punkte'));assert((await page.locator('[data-action="reward-person"][data-person="tina"]').innerText()).includes('Alex & <A>'));
  await page.locator('[data-action="reward-new"]').click();await page.locator('#reward-title').fill('Abendessen aussuchen');await page.locator('#reward-cost').fill('3');
  await page.locator('#reward-edit-form [type="submit"]').click();await page.waitForFunction(()=>document.getElementById('overlay').hidden);await page.locator('[data-action="reward-choose"]:not([disabled])').waitFor();
  await page.locator('[data-action="reward-choose"]').click();assert.equal((await rewards()).balances.felix,5,'Opening confirmation never spends points');
  await page.locator('#reward-confirm-form [type="submit"]').click();await page.waitForFunction(()=>document.getElementById('overlay').hidden);
  await page.waitForFunction(()=>document.querySelector('[data-action="reward-person"][data-person="felix"]').textContent.includes('2 Punkte'));
  await page.locator('.reward-history summary').click();await page.locator('[data-action="reward-reverse"]').click();
  await page.locator('#reward-confirm-form [type="submit"]').click();await page.waitForFunction(()=>document.getElementById('overlay').hidden);
  await page.waitForFunction(()=>document.querySelector('[data-action="reward-person"][data-person="felix"]').textContent.includes('5 Punkte'));
  for(const size of [{width:1280,height:800},{width:960,height:600}]){await page.setViewportSize(size);assert(await page.locator('.reward-panel').evaluate(x=>x.scrollWidth<=x.clientWidth+1));}
  await page.screenshot({path:'/tmp/familienkueche-belohnungen.png'});
  await page.locator('[data-action="family-tab"][data-tab="task"]').click();await page.locator('.family-completed summary').click();await page.locator('[data-family-person="felix"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-family-person="felix"]')&&!document.querySelector('[data-family-person="felix"]').checked&&!document.querySelector('[data-family-person="felix"]').disabled);assert.equal((await rewards()).balances.felix,0);
  await page.locator('[data-action="family-edit"]').click();assert.equal(await page.locator('#family-points').inputValue(),'5');assert.equal(await page.locator('#family-repeat-interval').inputValue(),'2');assert(await page.locator('[name="rotation"]').isChecked());
  await page.locator('[data-action="family-assign-person"][data-person="tina"]').click();
  for(const size of [{width:1280,height:800},{width:960,height:600}]){await page.setViewportSize(size);assert(await page.locator('.modal').evaluate(x=>x.scrollWidth<=x.clientWidth+1));}
  await page.screenshot({path:'/tmp/familienkueche-wiederholungen.png'});
  await page.locator('#family-edit-form [type="submit"]').click();await page.waitForFunction(()=>document.getElementById('overlay').hidden);
  item=(await snapshot()).items.find(x=>x.title==='Tisch decken');assert.deepEqual(item.configuredAssignees,['tina','felix']);
  await page.locator('[data-action="family-edit"]').click();assert.equal(await page.locator('[data-action="family-assign-person"][aria-pressed="true"]').count(),2);
  assert.deepEqual(errors,[]);assert.equal((await(await page.request.get(base+'fixture/notify-count')).json()).count,0);
  console.log('PASS: real local API points credit/undo, reward editor, confirmed redemption/return, weekly/monthly controls, rotation editor retains assignments, tablet layouts; no external services.');
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
