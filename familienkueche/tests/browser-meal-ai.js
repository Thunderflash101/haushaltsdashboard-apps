const path=require('path'),assert=require('assert'),{spawn}=require('child_process');
const {chromium}=require(process.env.FAMILY_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const server=spawn('python3',['-W','ignore',path.join(__dirname,'family_fixture.py')],{stdio:['ignore','pipe','pipe']});
 let browser,log='';server.stderr.on('data',x=>log+=x);
 try{
 const port=await new Promise((resolve,reject)=>{let output='';let timeout=setTimeout(()=>reject(Error('Fixture timeout '+log)),12000);server.stdout.on('data',x=>{output+=x;try{const result=JSON.parse(output.trim().split('\n')[0]);clearTimeout(timeout);resolve(result.port);}catch(e){}});server.on('error',reject);});
 browser=await chromium.launch({executablePath:process.env.FAMILY_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const day=new Date().toISOString().slice(0,10),url='https://www.chefkoch.de/rezepte/123456789/Brokkoli-Pasta.html';
 let paid=0,imports=0,fail=false,offersFail=false,status={enabled:false,configured:false,model:'gpt-6-luna',budgetCents:500,reservedCents:0,perRunCents:25,running:false,result:null};
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname;let data;
  if(p==='/api/meal-ai')data=status;
  else if(p==='/api/meal-ai/offers'){
   if(offersFail)return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'Aldi-Angebote konnten nicht geladen werden.'})});
   data={products:['Brokkoli','Rinderhackfleisch XXL'],count:2,total:294,shop:'Aldi Nord',reportedValidity:'14.11.',warning:'Nur Namen; keine geprüften Preise.'};
  }
  else if(p==='/api/meal-ai/trial'){
   paid++;const input=route.request().postDataJSON();assert(input.confirm);assert.equal(input.vegetarian,false);assert(!('image' in input));assert.equal(input.shop,'Aldi Nord');assert.equal(input.mode,paid===1?'weekend':'quick');
   assert(!JSON.stringify(input).includes('sk-'));assert(route.request().headers()['idempotency-key'].startsWith('ai-'));
   await new Promise(r=>setTimeout(r,350));
   if(fail)return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'Keine vollständige KI-Antwort.',uncertain:true})});
   status={...status,reservedCents:25,result:{shop:'Aldi Nord',start:day,end:day,created:day,offers:['Brokkoli 500 g 0,99 €'],warnings:[],recipes:[{title:'Brokkoli-Pasta <img src=x onerror=alert(1)>',url,minutes:25,reason:'Passend zum Angebot',matches:['Brokkoli']}]},usage:{input_tokens:1200,output_tokens:500,search_calls:1}};
   status.result={...status.result,targetCount:8,searchVersion:4,mode:input.mode,recipes:status.result.recipes.concat(['Kartoffelpfanne','Hähnchen-Curry','Lachssalat','Möhrensuppe','Linsen-Eintopf','Zucchini-Gratin','Paprika-Reis'].map((title,i)=>({title,url:'https://www.chefkoch.de/rezepte/'+(10000+i)+'/Rezept.html',minutes:25,reason:'Anderes Gericht',matches:[title]})))};
   status.result.recipes[0].minutes=90;status.result.recipes[0].activeMinutes=20;
   data={success:true,cached:false,...status};
  }
  else if(p==='/api/meals/actions'){imports++;data={success:true};}
  else if(p.startsWith('/api/profiles')||p.startsWith('/api/family')||p.startsWith('/api/saver')||p.startsWith('/api/reminders'))return route.continue();
  else if(p==='/api/calendar')data={fetchedAt:day+'T12:00:00+01:00',sources:[]};
  else if(p==='/api/weather')data={condition:'cloudy',temperature:10,temperatureUnit:'°C',forecast:[],fetchedAt:new Date().toISOString()};
  else if(p==='/api/shopping')data={items:[],label:'Test',canAdd:true,canUpdate:true,canRemove:true};
  else if(p==='/api/meals')data={entries:[],revisions:{}};
  else if(p==='/api/recipes')data={recipes:[]};
  else if(p==='/api/suggestions')data={recipes:[],matches:0,poolSize:0,warnings:[],today:day};
  else return route.fulfill({status:404,contentType:'application/json',body:'{}'});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const base='http://127.0.0.1:'+port+'/';await page.goto(base);await page.locator('[data-screen="meals"]').click();await page.locator('[data-action="meal-ai-open"]').click();
 await page.getByText('Zuerst in der Familienküche-App-Konfiguration',{exact:false}).waitFor();assert.equal(paid,0);
 status.enabled=true;await page.locator('#overlay [data-action="meal-ai-open"]').click();await page.getByText('Der Schlüssel wurde noch nicht erkannt.',{exact:false}).waitFor();assert.equal(paid,0);
 status.configured=true;await page.locator('#overlay [data-action="meal-ai-open"]').click();await page.locator('#meal-ai-form').waitFor();assert.equal(await page.locator('[data-action="meal-ai-mode"][data-mode="mixed"]').getAttribute('aria-pressed'),'true');assert((await page.locator('#meal-ai-dialog').innerText()).includes('Nüsse, Erdnüsse'));assert.equal(paid,0);
 await page.locator('[data-action="meal-ai-offers"][data-window="current"]').click();
 await page.getByText('2 Lebensmittel aus 294 Einträgen geladen.',{exact:false}).waitFor();
 assert((await page.locator('#ai-offers').inputValue()).includes('Rinderhackfleisch XXL'));assert.equal(paid,0);
 offersFail=true;page.once('dialog',dialog=>dialog.accept());await page.locator('[data-action="meal-ai-offers"][data-window="next"]').click();await page.getByText('Aldi-Angebote konnten nicht geladen werden.',{exact:false}).waitFor();assert((await page.locator('#ai-offers').inputValue()).includes('Rinderhackfleisch XXL'));assert.equal(paid,0);offersFail=false;
 await page.locator('#ai-offers').fill('Brokkoli 500 g 0,99 Euro');
 for(const size of [{width:1280,height:800},{width:960,height:600}]){await page.setViewportSize(size);await page.waitForTimeout(200);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));assert(await page.locator('.modal').evaluate(x=>x.scrollWidth<=x.clientWidth+1));assert.equal(await page.locator('#ai-offers').inputValue(),'Brokkoli 500 g 0,99 Euro');}
 await page.locator('[data-action="meal-ai-mode"][data-mode="quick"]').click();assert.equal(await page.locator('#ai-offers').inputValue(),'Brokkoli 500 g 0,99 Euro');assert.equal(paid,0);
 await page.locator('[data-action="meal-ai-mode"][data-mode="weekend"]').click();assert.equal(await page.locator('[data-action="meal-ai-mode"][data-mode="weekend"]').getAttribute('aria-pressed'),'true');assert.equal(paid,0);
 assert.equal(await page.locator('#meal-ai-dialog input[type="file"]').count(),0);
 assert(!(await page.locator('#meal-ai-dialog').innerText()).includes('PDF'));
 assert.equal(paid,0);
 await page.locator('#meal-ai-form [type="submit"]').click();assert.equal(paid,0);await page.locator('[name="confirm"]').check();await page.locator('#meal-ai-form [type="submit"]').click();
 await page.getByText('Probelauf abgeschlossen.',{exact:false}).waitFor();assert.equal(paid,1);assert.equal(imports,0);assert.equal(await page.locator('.ai-results img').count(),0);assert.equal(await page.locator('.ai-recipe a').first().getAttribute('href'),url);
 assert.equal(await page.locator('.ai-recipe').count(),8);await page.getByText('8 unterschiedliche Vorschläge · Ziel: 8').waitFor();assert((await page.locator('.ai-recipe').first().innerText()).includes('90 Min. gesamt'));assert((await page.locator('.ai-recipe').first().innerText()).includes('20 Min. aktiv'));assert.equal(await page.getByText('Arbeitszeit offen',{exact:true}).count(),7);await page.screenshot({path:'/tmp/familienkueche-ki-probelauf.png'});
 await page.locator('[data-action="meal-ai-import"]').first().click();assert.equal(await page.locator('#recipe-url').inputValue(),url);assert.equal(imports,0);
 await page.locator('#overlay [data-action="close"]').first().click();await page.locator('[data-action="meal-ai-open"]').click();await page.locator('.ai-results').waitFor();assert.equal(paid,1);
 await page.locator('#overlay [data-action="close"]').first().click();await page.reload();await page.locator('[data-screen="meals"]').click();await page.locator('[data-action="meal-ai-open"]').click();await page.locator('.ai-recipe').first().waitFor();assert.equal(paid,1);
 assert.equal(await page.locator('[data-action="meal-ai-mode"][data-mode="weekend"]').getAttribute('aria-pressed'),'true');await page.locator('.ai-search-panel>summary').click();await page.locator('[data-action="meal-ai-mode"][data-mode="quick"]').click();assert.equal(paid,1);
 fail=true;await page.locator('#ai-offers').fill('Andere Angebote Tomaten');await page.locator('[name="confirm"]').check();await page.locator('#meal-ai-form [type="submit"]').click();await page.getByText('Keine vollständige KI-Antwort.',{exact:false}).waitFor();assert.equal(paid,2);assert(await page.locator('#meal-ai-form [type="submit"]').isDisabled());
 await page.locator('#overlay [data-action="meal-ai-open"]').click();await page.locator('.ai-recipe').first().waitFor();assert.equal(paid,2);assert.equal(imports,0);
 status.result={...status.result,recipes:[],offers:['Brokkoli'],warnings:['Nur Produktnamen vorhanden; keine verifizierten Preise.','Keine Originalrezepte gefunden.']};
 await page.locator('#overlay [data-action="close"]').first().click();await page.locator('[data-action="meal-ai-open"]').click();await page.locator('[data-action="meal-ai-searches"]').waitFor();
 assert(await page.locator('.ai-results details').nth(1).evaluate(x=>!x.open));
 await page.locator('[data-action="meal-ai-searches"]').click();await page.locator('[data-ai-searches] a').first().waitFor();
 assert.equal(await page.locator('[data-ai-searches] a').count(),2);
 assert.equal(await page.locator('[data-ai-searches] a').first().getAttribute('href'),'https://www.chefkoch.de/rs/s0/brokkoli/Rezepte.html');
 assert.equal(await page.locator('[data-ai-searches] [data-action="meal-ai-import"]').count(),0);assert.equal(paid,2);assert.equal(imports,0);assert.deepEqual(errors,[]);
 console.log('PASS: disabled/missing-key states; free HA offers import including meat, failure preserves draft; no vegetarian restriction or automatic paid calls; no prospect image/PDF upload; mixed/quick/weekend mode selection without paid calls or draft loss, persisted mode; taste profile; total and active time with unknown fallback; eight result cards and target counter; explicit consent; saved results; escaped model text; import preview; no uncertain retry; empty-result warnings collapsed and free Chefkoch ingredient searches; tablet layouts 1280×800 and 960×600. Only local mocked services.');
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
