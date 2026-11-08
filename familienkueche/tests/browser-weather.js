const fs=require('fs'),path=require('path'),assert=require('assert'),{spawn}=require('child_process');
const {chromium}=require(process.env.FAMILY_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const server=spawn('python3',['-W','ignore',path.join(__dirname,'family_fixture.py')],{stdio:['ignore','pipe','pipe']});
 let browser,log='';server.stderr.on('data',x=>log+=x);
 try{
 const port=await new Promise((resolve,reject)=>{let output='';let timeout=setTimeout(()=>reject(Error('Fixture startup timeout '+log)),12000);server.stdout.on('data',x=>{output+=x;try{const result=JSON.parse(output.trim().split('\n')[0]);clearTimeout(timeout);resolve(result.port);}catch(e){}});server.on('error',reject);server.on('exit',code=>{clearTimeout(timeout);reject(Error('Fixture stopped '+code+' '+log));});});
 browser=await chromium.launch({executablePath:process.env.FAMILY_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],timeout:12000});
 let weatherCondition='cloudy';
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const mockApi=async route=>{
  const url=new URL(route.request().url()),p=url.pathname;
  if(p.startsWith('/api/profiles')||p.startsWith('/api/family')||p.startsWith('/api/saver')||p.startsWith('/api/reminders'))return route.continue();
  let data;
  if(p==='/api/calendar'){const day=new Date().toISOString().slice(0,10);data={fetchedAt:day+'T12:00:00+01:00',sources:[{key:'tina',ok:true,canCreate:false,events:[{id:'example',date:day,title:'Gemeinsamer Nachmittag',start:'20:00',end:'21:00',person:'tina',source:'tina',sourceLabel:'Tina'}]},{key:'joern',ok:true,canCreate:true,events:[]}]};}
  else if(p==='/api/weather')data={source:'Testwetter',condition:weatherCondition,temperature:5.8,temperatureUnit:'°C',windSpeed:1.5,windUnit:'km/h',humidity:null,forecast:['cloudy','rainy','fog','fog','rainy'].map((condition,i)=>({date:'2026-11-'+String(i+8).padStart(2,'0'),condition,high:[5.8,9.4,10.2,3.8,5.1][i],low:[1.5,4.9,2,0,3][i],rainChance:null})),fetchedAt:new Date().toISOString()};
  else if(p==='/api/shopping')data={items:[],label:'Test-Einkauf',canAdd:true,canUpdate:true,canRemove:true};
  else if(p==='/api/meals')data={entries:[],revisions:{}};
  else if(p==='/api/recipes')data={recipes:[]};
  else if(p==='/api/suggestions')data={recipes:[],matches:0,poolSize:0,warnings:[],today:new Date().toISOString().slice(0,10)};
  else return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'Fixture endpoint not mocked'})});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 };
 await page.route('**/api/**',mockApi);

 const base='http://127.0.0.1:'+port+'/';await page.goto(base);await page.locator('.header-weather [data-weather-condition="cloudy"]').waitFor();await page.locator('.header-weather [data-action="weather"]').click();await page.locator('.weather-day').first().waitFor();
 const labels=await page.locator('.weather-day>p:first-of-type').allTextContents();assert.deepEqual(labels,['Bewölkt','Regen','Nebel','Nebel','Regen']);const paths=await page.locator('.weather-day svg path').evaluateAll(nodes=>nodes.map(x=>x.getAttribute('d')));assert.equal(new Set(paths.slice(0,3)).size,3);assert.equal(paths[1],paths[4]);assert.equal(paths[2],paths[3]);
 for(const size of [{width:1280,height:800},{width:960,height:600}]){await page.setViewportSize(size);await page.waitForTimeout(200);assert(await page.locator('.modal').evaluate(x=>x.scrollWidth<=x.clientWidth+1));assert.equal(await page.locator('.weather-day svg').count(),5);}await page.screenshot({path:'/tmp/familienkueche-wettersymbole.png'});
 weatherCondition='fog';await page.locator('[data-action="weather-refresh"]').click();await page.locator('.weather-current [data-weather-condition="fog"]').waitFor();await page.locator('#overlay [data-action="close"]').first().click();assert.equal(await page.locator('.header-weather [data-weather-condition="fog"]').count(),1);
 await page.locator('[data-screen="saver"]').click();await page.locator('.saver-weather [data-weather-condition="fog"]').waitFor();assert((await page.locator('.saver-weather').innerText()).includes('Nebel'));await page.locator('.saver-weather [data-action="weather"]').click();await page.locator('.weather-current [data-weather-condition="fog"]').waitFor();
 weatherCondition='lightning-rainy';await page.locator('[data-action="weather-refresh"]').click();await page.locator('.weather-current [data-weather-condition="lightning-rainy"]').waitFor();assert((await page.locator('.weather-current').innerText()).includes('Gewitter mit Regen'));
 assert.deepEqual(errors,[]);console.log('PASS: reported forecast with matching cloud/rain/fog drawings, tablet layout at 1280×800/960×600, current weather refresh, header/saver fog consistency and storm icon. No HA writes.');
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
