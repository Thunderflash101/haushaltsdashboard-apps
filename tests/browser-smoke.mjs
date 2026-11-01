// Synthetic data only. Run with the pinned Playwright version from CI.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../haushaltsdashboard/app/server.mjs';
const dir=mkdtempSync(path.join(tmpdir(),'household-browser-'));
const app=createApp({dataDir:dir,allowedIngress:['127.0.0.1']});
await new Promise(resolve=>app.ingress.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${app.ingress.address().port}`,headers={'X-Remote-User-Id':'browser-test'};
const request=async(data)=>{const r=await fetch(origin+'/api/dashboard',{method:data?'POST':'GET',headers:{...headers,...(data?{'Content-Type':'application/json','X-Haushalt-Request':'1'}:{})},...(data?{body:JSON.stringify(data)}:{})});assert.equal(r.status,200);return r.json();};
const booking=(date,amount,payee,category='Lebensmittel',extra={})=>({date,amount,payee,purpose:'Synthetische Testbuchung',category,fixed:'Nein',...extra});
let browser,page;
try{
  const initial=await request();
  const state={...initial.state,categories:['Lebensmittel','Abos','ETFs','Gehalt','Sonstiges'],fixed:[{name:'Abo',category:'Abos',monthly:40,rhythm:'monatlich',status:'Ja',matchKeyword:'Online-Shop'}],bookings:[
    booking('30.09.2026',80,'Testarbeitgeber','Gehalt'),booking('10.09.2026',-40,'Lebensmittelgeschäft'),
    booking('31.10.2026',1000,'Testarbeitgeber','Gehalt'),booking('10.10.2026',-100,'Online-Shop'),booking('15.10.2026',30,'Online-Shop','Erstattungen/Gutschriften'),
    booking('20.10.2026',-50,'Depot','ETFs'),booking('25.10.2026',-200,'Eigener Übertrag','Haushaltsgeld',{account:'konto-a'}),booking('25.10.2026',200,'Eigener Eingang','Sonstige Einnahmen',{account:'konto-b'})
  ]};
  await request({revision:initial.revision,state});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({extraHTTPHeaders:headers,timezoneId:'Europe/Berlin'}),errors=[];page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  const saved=async()=>{await page.waitForFunction(()=>document.querySelector('#server-state')?.textContent==='Auf dem NUC gespeichert');};
  await page.goto(origin+'/dashboard.html');
  await page.locator('#kpi-income').filter({hasText:'1.310'}).waitFor();
  await page.locator('[data-view="bookings"]').click();
  let row=page.locator('#booking-rows tr').filter({hasText:'Online-Shop'}).filter({hasText:'-100,00'});
  await row.getByRole('button',{name:'Aufteilen',exact:true}).click();
  let line=page.locator('#split-editor .split-line').first();await line.locator('input').fill('60');
  await page.locator('#split-add').click();line=page.locator('#split-editor .split-line').nth(1);
  await line.locator('select').nth(0).selectOption('Abos');await line.locator('input').fill('40');await line.locator('select').nth(2).selectOption('Ja');
  await page.locator('#split-save').click();await saved();
  row=page.locator('#booking-rows tr').filter({hasText:'Online-Shop'}).filter({hasText:'30,00'});
  await row.getByRole('button',{name:'Zuordnen',exact:true}).click();
  await page.locator('#relation-target').selectOption('3');
  assert.equal(await page.locator('#relation-save').isEnabled(),true);await page.locator('#relation-save').click();await saved();
  let db=await request();assert.equal(db.state.bookings[4].refund.allocations[0].amount,30);
  assert.equal(db.state.bookings[3].splits[1].fixed,'Ja');
  await page.locator('[data-view="monthly"]').click();await page.locator('#explore-month').selectOption('2026-10');
  assert.match(await page.locator('#explore-expense').innerText(),/70,00/);assert.match(await page.locator('#explore-fixed').innerText(),/40,00/);assert.match(await page.locator('#explore-variable').innerText(),/30,00/);
  await page.locator('#compare-mode').selectOption('average');assert.match(await page.locator('#month-comparison').innerText(),/1 von 12/);
  await page.locator('.insight-driver').first().click();assert.equal(await page.locator('#insight-dialog').isVisible(),true);assert.match(await page.locator('#insight-detail').innerText(),/Online-Shop/);await page.locator('#insight-close').click();
  await page.locator('#compare-mode').selectOption('year');assert.match(await page.locator('#month-comparison').innerText(),/fehlen Buchungen/);await page.locator('#compare-mode').selectOption('previous');
  await page.locator('[data-view="fixed"]').click();assert.match(await page.locator('#fixed-reconcile').innerText(),/gebucht 40,00/);
  await page.locator('[data-view="bookings"]').click();
  row=page.locator('#booking-rows tr').filter({hasText:'Eigener Übertrag'});await row.getByRole('button',{name:'Zuordnen',exact:true}).click();await page.locator('#relation-target').selectOption('7');await page.locator('#relation-save').click();await saved();
  db=await request();assert.equal(db.state.bookings[6].transferPeerId,db.state.bookings[7].financeId);
  await page.reload();await page.locator('[data-view="monthly"]').click();await page.locator('#explore-month').selectOption('2026-10');assert.match(await page.locator('#explore-income').innerText(),/1.000,00/);
  mkdirSync('test-results',{recursive:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/monthly-desktop.png',fullPage:true});
  for(const width of [390,360]){
    await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`Page overflows at ${width}px`);
    await page.locator('.insight-driver').first().click();assert.equal(await page.locator('#insight-dialog').isVisible(),true);await page.locator('#insight-close').click();
  }
  await page.screenshot({path:'test-results/monthly-mobile.png',fullPage:true});
  await page.locator('[data-view="bookings"]').click();row=page.locator('#booking-rows tr').filter({hasText:'Online-Shop'}).filter({hasText:'30,00'});await row.getByRole('button',{name:'Zuordnung',exact:true}).click();await page.getByRole('button',{name:'Zuordnung lösen',exact:true}).click();await saved();await page.locator('#relation-close').click();
  row=page.locator('#booking-rows tr').filter({hasText:'Online-Shop'}).filter({hasText:'-100,00'});await row.getByRole('button',{name:'2 Teile',exact:true}).click();
  const bounds=await page.locator('#split-editor').evaluate(el=>({width:el.scrollWidth,visible:el.clientWidth}));assert.ok(bounds.width<=bounds.visible+1,'Split editor overflows on mobile');await page.screenshot({path:'test-results/split-mobile.png'});await page.locator('#split-cancel').click();
  db=await request();assert.equal(db.state.bookings[4].refund,undefined);assert.equal(db.state.bookings[3].splits.length,2);
  assert.deepEqual(errors,[]);console.log('Browser checks passed: splits, refunds, fixed plan, comparisons, transfer pairing, reload and 360/390px layouts.');
}catch(error){mkdirSync('test-results',{recursive:true});await page?.screenshot({path:'test-results/failure.png',fullPage:true}).catch(()=>{});throw error;}finally{await browser?.close();app.stop();rmSync(dir,{recursive:true,force:true});}
