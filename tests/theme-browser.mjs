// Synthetic household only. Theme changes must never change financial state.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../haushaltsdashboard/app/server.mjs';
const dir=mkdtempSync(path.join(tmpdir(),'theme-browser-'));
const app=createApp({dataDir:dir,allowedIngress:['127.0.0.1']});
await new Promise(resolve=>app.ingress.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${app.ingress.address().port}`,headers={'X-Remote-User-Id':'browser-test'};
async function request(data){const r=await fetch(origin+'/api/dashboard',{method:data?'POST':'GET',headers:{...headers,...(data?{'Content-Type':'application/json','X-Haushalt-Request':'1'}:{})},...(data?{body:JSON.stringify(data)}:{})});assert.equal(r.status,200);return r.json();}
let browser,page;
try{
  const db=await request();Object.assign(db.state,{people:{first:'Person 1',second:'Person 2'},incomes:{'2026-11':{joern:3000,bettina:2000}},categories:['Wohnen','Lebensmittel','Gehalt','Haushaltsgeld'],contracts:[],fixed:[{name:'Wohnen',category:'Wohnen',monthly:1000,rhythm:'monatlich',status:'Ja',dueDay:15,matchKeyword:'Vermieter'}],forecast:{automatic:false,balanceSource:'manual',manualBalance:{amount:2400,date:'2026-11-05'}},bookings:[{date:'30.10.2026',amount:3000,payee:'Testarbeitgeber',purpose:'Gehalt Oktober',category:'Gehalt',fixed:'Nein'},{date:'02.11.2026',amount:-100,payee:'Testmarkt',purpose:'Wocheneinkauf',category:'Lebensmittel',fixed:'Nein'},{date:'03.11.2026',amount:400,payee:'Test Partner',purpose:'Kostenbeteiligung',category:'Haushaltsgeld',fixed:'Nein',householdContribution:true}]});await request(db);
  for(const [route,type] of [['theme.js','text/javascript'],['theme.css','text/css']]){const r=await fetch(origin+'/'+route,{headers});assert.equal(r.status,200);assert.ok(r.headers.get('content-type').startsWith(type));}
  browser=await chromium.launch({headless:true});const context=await browser.newContext({extraHTTPHeaders:headers,colorScheme:'dark',timezoneId:'Europe/Berlin'});page=await context.newPage();page.setDefaultTimeout(15000);await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const theme=async value=>{await page.waitForFunction(v=>document.documentElement.dataset.theme===v,value);};
  await page.goto(origin+'/dashboard.html');await page.locator('#kpi-income').filter({hasText:'3.400'}).waitFor();await theme('dark');assert.equal(await page.locator('#theme-mode').inputValue(),'auto');const before=await request();
  const contrast=async selector=>{
    const ratio=await page.locator(selector).first().evaluate(el=>{
      const rgb=color=>(color.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
      const luminance=values=>values.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      let parent=el,bg;while(parent){const s=getComputedStyle(parent);if(s.backgroundColor!=='rgba(0, 0, 0, 0)'){bg=rgb(s.backgroundColor);break;}parent=parent.parentElement;}
      const a=luminance(rgb(getComputedStyle(el).color)),b=luminance(bg||[16,27,40]);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });assert.ok(ratio>=4.5,selector+' contrast '+ratio);
  };
  for(const selector of ['body','.metric .label','.btn.primary','.nav button.active'])await contrast(selector);
  mkdirSync('test-results',{recursive:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/dark-overview-desktop.png'});
  await page.locator('[data-view="forecast"]').click();const money=await page.locator('#month-room-free').innerText();await page.screenshot({path:'test-results/dark-planning-desktop.png'});await contrast('.budget-person .note');
  await page.locator('#theme-mode').selectOption('light');await theme('light');assert.equal(await page.locator('#month-room-free').innerText(),money);await page.reload();await theme('light');await page.emulateMedia({colorScheme:'dark'});await theme('light');
  await page.locator('#theme-mode').selectOption('auto');await theme('dark');await page.emulateMedia({colorScheme:'light'});await theme('light');await page.emulateMedia({colorScheme:'dark'});await theme('dark');
  await page.locator('#theme-mode').selectOption('dark');await page.emulateMedia({colorScheme:'light'});await theme('dark');
  await page.locator('[data-view="monthly"]').click();await page.locator('#explore-month').selectOption('2026-11');await page.locator('#expense-pie svg').waitFor();assert.equal(await page.locator('#expense-pie .pie-slice').first().evaluate(el=>getComputedStyle(el).stroke),'rgb(148, 185, 239)');
  for(const view of ['overview','forecast','monthly','fixed','contracts','bookings']){
    await page.locator(`[data-view="${view}"]`).click();for(const width of [390,360]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,view+' overflow '+width);}
  }
  await page.locator('#booking-rows tr').filter({hasText:'Testmarkt'}).getByRole('button',{name:'Zweck ansehen',exact:true}).click();await page.locator('#booking-contract-dialog').waitFor({state:'visible'});await contrast('.booking-purpose-full');await page.screenshot({path:'test-results/dark-booking-mobile.png'});await page.locator('#booking-contract-dialog [data-close]').count().then(async n=>{if(n)await page.locator('#booking-contract-dialog [data-close]').first().click();else await page.keyboard.press('Escape');});
  await page.locator('[data-view="forecast"]').click();await page.screenshot({path:'test-results/dark-planning-mobile.png'});
  const tab=await context.newPage();await tab.goto(origin+'/');await tab.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await tab.locator('#theme-mode').selectOption('light');await theme('light');await tab.locator('#theme-mode').selectOption('dark');await theme('dark');await tab.setViewportSize({width:390,height:844});assert.equal(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await tab.screenshot({path:'test-results/dark-bank-mobile.png'});await tab.close();
  assert.deepEqual((await request()).state,before.state,'Appearance never changes household data');
  // Same-origin Home Assistant-style embedding takes precedence in automatic mode.
  await page.locator('#theme-mode').selectOption('auto');await page.route('**/theme-host',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html style="color-scheme:light"><body><iframe src="dashboard.html" style="width:100%;height:90vh;border:0"></iframe></body></html>'}));await page.emulateMedia({colorScheme:'dark'});await page.goto(origin+'/theme-host');const frame=page.frameLocator('iframe');await frame.locator('html[data-theme="light"]').waitFor();await page.evaluate(()=>document.documentElement.style.colorScheme='dark');await frame.locator('html[data-theme="dark"]').waitFor();await frame.locator('#theme-mode').selectOption('light');await page.evaluate(()=>document.documentElement.style.colorScheme='light');await page.evaluate(()=>document.documentElement.style.colorScheme='dark');await frame.locator('html[data-theme="light"]').waitFor();
  // Restricted browser storage must not prevent loading or switching appearance.
  const restricted=await browser.newContext({extraHTTPHeaders:headers,colorScheme:'dark'});await restricted.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}}));const rp=await restricted.newPage();const restrictedErrors=[];rp.on('pageerror',e=>restrictedErrors.push(e.message));await rp.goto(origin+'/dashboard.html');await rp.locator('#theme-mode').selectOption('light');await rp.waitForFunction(()=>document.documentElement.dataset.theme==='light');assert.deepEqual(restrictedErrors,[]);await restricted.close();
  assert.deepEqual(errors,[]);console.log('Theme browser passed: automatic/explicit modes, HA embedding, live system changes, persistence, cross-tab sync, blocked storage, dark contrast, diagrams, dialogs, bank setup, all mobile views and unchanged finance data.');
}catch(e){mkdirSync('test-results',{recursive:true});await page?.screenshot({path:'test-results/theme-failure.png',fullPage:true}).catch(()=>{});throw e;}finally{await browser?.close();app.stop();rmSync(dir,{recursive:true,force:true});}
