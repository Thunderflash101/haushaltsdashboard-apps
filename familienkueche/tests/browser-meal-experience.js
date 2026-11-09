const path=require('path'),assert=require('assert'),{spawn}=require('child_process');
const {chromium}=require(process.env.FAMILY_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const server=spawn('python3',['-W','ignore',path.join(__dirname,'meal_experience_fixture.py')],{stdio:['ignore','pipe','pipe']});let browser,log='';server.stderr.on('data',x=>log+=x);
 try{
 const port=await new Promise((resolve,reject)=>{let output='';let timeout=setTimeout(()=>reject(Error('Fixture startup '+log)),12000);server.stdout.on('data',x=>{output+=x;try{const data=JSON.parse(output.trim().split('\n')[0]);clearTimeout(timeout);resolve(data.port);}catch(e){}});server.on('error',reject);});
 browser=await chromium.launch({executablePath:process.env.FAMILY_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base='http://127.0.0.1:'+port+'/';const counters=()=>page.request.get(base+'fixture/counters').then(r=>r.json());
 await page.goto(base);await page.locator('[data-screen="meals"]').click();await page.locator('[data-action="meal-ai-open"]').click();await page.locator('.ai-recipe').first().waitFor();
 const card=page.locator('.ai-recipe').filter({has:page.getByRole('heading',{name:'Hähnchen-Pasta',exact:true})}),img=card.locator('img');
 await img.evaluate(x=>x.complete&&x.naturalWidth?Promise.resolve():new Promise(resolve=>x.addEventListener('load',resolve,{once:true})));assert((await img.getAttribute('src')).startsWith('api/meal-ai/images/'));await img.evaluate(x=>x._identity='original');
 for(const size of [{width:1280,height:800},{width:960,height:600}]){await page.setViewportSize(size);await page.waitForTimeout(200);assert(await page.locator('.modal').evaluate(x=>x.scrollWidth<=x.clientWidth+1));}
 assert.equal(await page.locator('#meal-ai-dialog>details').first().getAttribute('open'),null);
 await page.screenshot({path:'/tmp/familienkueche-rezeptbilder.png'});
 await card.locator('[data-action="meal-feedback"][data-rating="like"]').click();await card.getByRole('button',{name:'♥ Gefällt uns',exact:true}).waitFor();assert.equal(await img.evaluate(x=>x._identity),'original');assert.equal((await counters()).ai,0);
 await card.locator('.recipe-feedback summary').click();await card.locator('[data-action="meal-cooked"]').click();await card.getByRole('button',{name:'✓ Heute gekocht · Rückgängig',exact:true}).waitFor();
 let learning=await page.request.get(base+'api/meal-experience').then(r=>r.json());assert(learning.learning.liked.includes('Hähnchen-Pasta'));assert(learning.learning.recentlyCooked.includes('Hähnchen-Pasta'));
 const skip=page.locator('.ai-recipe').filter({has:page.getByRole('heading',{name:'Gurkensalat',exact:true})});await skip.locator('.recipe-feedback summary').click();await skip.locator('[data-rating="skip"]').click();await skip.waitFor({state:'detached'});
 const dislike=page.locator('.ai-recipe').filter({has:page.getByRole('heading',{name:'Linsen-Eintopf',exact:true})});await dislike.locator('.recipe-feedback summary').click();await dislike.locator('[data-rating="dislike"]').click();await dislike.waitFor({state:'detached'});
 await page.locator('#overlay [data-action="close"]').first().click();await page.locator('[data-action="meal-taste-open"]').click();await page.locator('#meal-taste-form').waitFor();
 await page.locator('#taste-preferred').fill('Nudeln, Eintöpfe, Pizza, Hähnchen, Reis');await page.locator('#meal-taste-form [type="submit"]').click();await page.locator('#overlay').waitFor({state:'hidden'});
 await page.reload();await page.locator('[data-screen="meals"]').click();await page.locator('[data-action="meal-ai-open"]').click();await page.locator('.ai-recipe').first().waitFor();assert.equal(await page.locator('.ai-recipe').count(),2);await page.locator('.ai-search-panel>summary').click();assert((await page.locator('#meal-ai-dialog').innerText()).includes('Hähnchen, Reis'));await page.locator('.ai-search-panel>summary').click();assert.equal((await counters()).ai,0);
 await page.locator('#overlay [data-action="close"]').first().click();await page.locator('[data-action="meal-taste-open"]').click();await page.locator('#meal-taste-form').waitFor();
 for(const title of ['Linsen-Eintopf','Gurkensalat']){const item=page.locator('.taste-rating').filter({has:page.locator('strong').filter({hasText:title})});await item.locator('.recipe-feedback summary').click();var revision=Number(await item.locator('[data-feedback-key]').getAttribute('data-revision')),key=await item.locator('[data-feedback-key]').getAttribute('data-feedback-key');await item.getByRole('button',{name:'Bewertung zurücksetzen',exact:true}).click();await page.waitForFunction(({key,revision})=>Array.from(document.querySelectorAll('[data-feedback-key]')).some(x=>x.getAttribute('data-feedback-key')===key&&Number(x.getAttribute('data-revision'))>revision),{key,revision});}
 await page.locator('#overlay [data-action="close"]').first().click();await page.locator('[data-action="meal-draft-open"]').click();await page.locator('#meal-draft-form [type="submit"]').click();await page.locator('.meal-draft-day').first().waitFor();assert.equal(await page.locator('.meal-draft-day').count(),3);assert.equal((await counters()).writes,0);
 assert((await page.locator('#meal-draft-dialog').innerText()).includes('Voller Kalendertag'));
 const first=await page.locator('.meal-draft-day strong').first().innerText();await page.locator('[data-action="meal-draft-swap"]').first().click();assert.notEqual(await page.locator('.meal-draft-day strong').first().innerText(),first);assert.equal((await counters()).writes,0);
 await page.screenshot({path:'/tmp/familienkueche-drei-tage-entwurf.png'});
 await page.locator('[data-action="meal-draft-apply"]').click();await page.locator('#overlay').waitFor({state:'hidden'});assert.equal((await counters()).writes,3);assert.equal((await counters()).ai,0);assert.deepEqual(errors,[]);
 console.log('PASS: real local photo proxy/cache, stable photo while rating, like/skip/dislike and cooked history, edited profile after reload, no paid calls, three-day calendar draft/shared ingredients, swap without writes and confirmed plan only; 1280×800/960×600. All external services mocked.');
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
