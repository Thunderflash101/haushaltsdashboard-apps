import {defaults,forecast,validateForecast,incomeSuggestions} from './forecast.mjs';
import {berlinToday,shiftMonth} from './finance.mjs';
const $=id=>document.getElementById(id),eur=value=>value===null?'–':new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(value),date=value=>value?value.split('-').reverse().join('.'):'–';
function el(tag,attrs={},children=[]){const node=document.createElement(tag);for(const [key,value] of Object.entries(attrs)){if(key==='text')node.textContent=value;else if(key==='class')node.className=value;else node.setAttribute(key,value)}node.append(...children);return node;}
const text=(id,value)=>$(id).textContent=value;
export function createForecastUI({getState,getBank,getAccount,save,openView}){
  let report=null,settingsDirty=false;
  function update(value,errorId='forecast-form-error'){
    const error=validateForecast(value);text(errorId,error||'');if(error)return false;
    getState().forecast=value;save();render();return true;
  }
  function removePlan(key,id){const f=defaults(getState().forecast);f[key]=f[key].filter(p=>p.id!==id);update(f);}
  function render(){
    const state=getState(),f=defaults(state.forecast),today=berlinToday();report=forecast(state,getBank(),{account:getAccount()});
    $('forecast-horizon').value=f.horizon;if(!settingsDirty){$('forecast-source').value=f.balanceSource;$('forecast-manual').value=f.manualBalance?.amount??'';$('forecast-asof').value=f.manualBalance?.date||today;$('forecast-asof').max=today;$('forecast-protected').value=f.protectedBalance;$('forecast-buffer').value=f.buffer;
    $('forecast-budgets').checked=f.useBudgets;$('forecast-possible').checked=f.includePossible;$('forecast-estimates').checked=f.includeEstimates;
    $('forecast-manual').disabled=$('forecast-asof').disabled=f.balanceSource!=='manual';}
    for(const [id,value] of [['forecast-current',report.current],['forecast-free',report.available],['forecast-end',report.endBalance],['forecast-low',report.minimum]]){text(id,eur(value));$(id).classList.toggle('negative',value!==null&&value<0);}
    text('forecast-free-label',report.available!==null&&report.available<0?'Geplanter Fehlbetrag':'Rechnerisch frei');text('forecast-free-until','bis '+date(report.freeUntil));
    text('forecast-preview-value',eur(report.available));text('forecast-preview-note',report.current===null?'Kontostand und Zahlungspläne ergänzen':`bis ${date(report.freeUntil)} · nach geschütztem Guthaben und Puffer`);
    text('forecast-balance-note',report.balance?`${f.balanceSource==='manual'?'Manueller Kontostand':'Gebuchter Bankkontostand'}: ${eur(report.balance.amount)} einschließlich ${date(report.balance.date)}. Spätere importierte Buchungen bis heute sind fortgeschrieben. Geplant im Zeitraum: +${eur(report.plannedIncome)} / −${eur(report.plannedExpense)}. Geschützt: ${eur(report.protected)}.`:'Kein geeigneter gebuchter Bankkontostand vorhanden. Unter „Kontostand und Planung einstellen“ einen manuellen Kontostand hinterlegen oder die Bankdaten aktualisieren.');
    $('forecast-settings').open=!report.balance||$('forecast-settings').open;
    $('forecast-warnings').replaceChildren(...report.warnings.map(message=>el('p',{class:'notice',text:message})));
    drawChart();renderDay();renderPlans();renderEvents();renderMonthlyIncome();
    for(const [value,key] of [['joern','first'],['bettina','second']])$('forecast-income-source').querySelector(`option[value="${value}"]`).textContent='Monatsnetto '+(state.people?.[key]||(key==='first'?'Person 1':'Person 2'));
    const categories=[...new Set(['Sonstiges',...(state.categories||[])])],select=$('forecast-once-category'),prior=select.value;select.replaceChildren(...categories.map(name=>el('option',{value:name,text:name})));if(categories.includes(prior))select.value=prior;
    if(!$('forecast-income-start').value)$('forecast-income-start').value=today.slice(0,7);if(!$('forecast-once-date').value)$('forecast-once-date').value=today;
  }
  function renderMonthlyIncome(){
    const state=getState(),table=el('table'),body=el('tbody');table.append(el('thead',{},[el('tr',{},[el('th',{text:'Monat'}),el('th',{text:state.people?.first||'Person 1'}),el('th',{text:state.people?.second||'Person 2'})])]),body);
    for(let key=report.today.slice(0,7);key<=report.end.slice(0,7);key=shiftMonth(key,1)){const row=el('tr',{},[el('td',{text:key})]);for(const person of ['joern','bettina']){const input=el('input',{type:'number',min:'0',step:'0.01',class:'edit-input',value:state.incomes?.[key]?.[person]??'',placeholder:'Unbekannt','aria-label':`${person==='joern'?'Person 1':'Person 2'} Monatsnetto ${key}`}),month=key;input.addEventListener('change',()=>{if(!input.checkValidity())return;state.incomes||={};state.incomes[month]||={};state.incomes[month][person]=input.value===''?null:Number(input.value);save();render();});row.append(el('td',{},[input]));}body.append(row);} $('forecast-monthly-income').replaceChildren(table);
  }
  function drawChart(){
    const box=$('forecast-chart');box.replaceChildren();const points=report.points;$('forecast-day').disabled=!points.length;$('forecast-day').max=Math.max(0,points.length-1);
    if(!points.length){box.append(el('p',{class:'empty',text:'Nach dem Eintragen eines Kontostands erscheint hier die Prognose.'}));return;}
    const width=850,height=300,left=65,right=16,top=20,bottom=40,values=[0,report.current,report.protected,...points.map(p=>p.balance)],low=Math.min(...values),high=Math.max(...values),span=Math.max(100,high-low),min=low-span*.08,max=high+span*.08;
    const x=i=>left+i/(points.length-1||1)*(width-left-right),y=n=>top+(max-n)/(max-min)*(height-top-bottom),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('class','chart');svg.setAttribute('role','img');svg.setAttribute('aria-label','Prognose der täglichen Kontostände');
    function add(tag,attrs,label){const n=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(label!==undefined)n.textContent=label;svg.append(n);return n;}
    for(let i=0;i<=4;i++){const value=min+(max-min)*i/4;add('line',{x1:left,x2:width-right,y1:y(value),y2:y(value),stroke:'#e5edf2'});add('text',{x:left-8,y:y(value)+4,'text-anchor':'end',fill:'#64778b','font-size':12},Math.round(value).toLocaleString('de-DE'));}
    add('line',{x1:left,x2:width-right,y1:y(0),y2:y(0),stroke:'#e98274','stroke-dasharray':'3 4'});add('line',{x1:left,x2:width-right,y1:y(report.protected),y2:y(report.protected),stroke:'#b8a0d9','stroke-dasharray':'6 4','stroke-width':2});
    add('path',{d:points.map((p,i)=>(i?'L':'M')+x(i)+' '+y(p.balance)).join(' '),stroke:'#1aa889','stroke-width':3,fill:'none','stroke-linejoin':'round'});
    for(const i of [...new Set([0,Math.floor((points.length-1)/2),points.length-1])])add('text',{x:x(i),y:height-9,'text-anchor':i===0?'start':i===points.length-1?'end':'middle',fill:'#64778b','font-size':12},date(points[i].date));
    for(let i=0;i<points.length;i++){const point=add('circle',{cx:x(i),cy:y(points[i].balance),r:5,fill:'#1aa889',class:'forecast-point',tabindex:0,role:'button','aria-label':date(points[i].date)+': '+eur(points[i].balance)});point.append(document.createElementNS(svg.namespaceURI,'title'));point.firstChild.textContent=date(points[i].date)+' · '+eur(points[i].balance);const select=()=>{$('forecast-day').value=i;renderDay();};point.addEventListener('click',select);point.addEventListener('focus',select);point.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});}
    box.append(svg);
  }
  function renderDay(){
    const box=$('forecast-day-detail');box.replaceChildren();if(!report?.points.length)return;const p=report.points[Math.min(Number($('forecast-day').value),report.points.length-1)];
    box.append(el('div',{class:'forecast-day-heading'},[el('strong',{text:date(p.date)}),el('strong',{class:p.balance<0?'negative':'',text:eur(p.balance)})]));
    if(!p.events.length)box.append(el('p',{class:'note',text:'An diesem Tag sind keine Zahlungen geplant.'}));
    for(const e of p.events)box.append(el('div',{class:'list-row'},[el('div',{},[el('strong',{text:e.name}),el('small',{text:e.detail})]),el('b',{class:e.amount<0?'negative':'positive',text:eur(e.amount)})]));
  }
  function renderPlans(){
    const state=getState(),f=defaults(state.forecast);
    for(const [key,id] of [['incomePlans','forecast-income-plans'],['oneOffs','forecast-once-plans']]){
      const box=$(id);box.replaceChildren();for(const p of f[key]){const remove=el('button',{type:'button',class:'btn small',text:'Entfernen'});remove.addEventListener('click',()=>removePlan(key,p.id));box.append(el('div',{class:'list-row'},[el('div',{},[el('strong',{text:p.name}),el('small',{text:key==='incomePlans'?`${p.source==='fixed'?eur(p.amount):'Monatsnetto; Standard '+eur(p.amount)} · am ${p.day}. · ab ${p.startMonth}`:`${date(p.date)} · ${eur(p.amount)}`})]),remove]));}if(!box.children.length)box.append(el('p',{class:'note',text:'Noch keine Zahlungspläne vorhanden.'}));
    }
    const suggestions=$('forecast-suggestions');suggestions.replaceChildren();for(const p of incomeSuggestions(state.bookings).slice(0,4)){
      const button=el('button',{type:'button',class:'btn small',text:`Gehalt vorschlagen: ${p.name}`});button.addEventListener('click',()=>{$('forecast-income-form').closest('details').open=true;$('forecast-income-name').value='Gehalt';$('forecast-income-amount').value=p.amount;$('forecast-income-day').value=p.day;$('forecast-income-match').value=p.name;$('forecast-income-source').value='fixed';$('forecast-income-name').focus();});suggestions.append(button);
    }
  }
  function renderEvents(){
    const box=$('forecast-events');box.replaceChildren();const labels={planned:'Geplant',booked:'Bereits gebucht',excluded:'Nicht eingeplant','overdue-income':'Überfällig · nicht eingerechnet','estimate-excluded':'Schätzung ausgeschaltet'};
    for(const e of report.events){const controls=el('div',{class:'status-line'},[el('span',{class:`pill ${e.status==='booked'?'yes':e.status==='planned'?'':'maybe'}`,text:labels[e.status]}),el('b',{text:eur(e.amount)})]);
      if(e.status!=='booked'){const button=el('button',{type:'button',class:'btn small',text:e.status==='excluded'?'Wieder einplanen':'Nicht mehr erwarten'});button.addEventListener('click',()=>{const f=defaults(getState().forecast);f.excluded=e.status==='excluded'?f.excluded.filter(id=>id!==e.id):[...new Set([...f.excluded,e.id])];update(f);});controls.append(button);}
      box.append(el('div',{class:'list-row'},[el('div',{},[el('strong',{text:e.name}),el('small',{text:`${date(e.originalDate)} · ${e.detail}${e.originalDate<report.today&&e.status==='planned'?' · offen, ab heute eingeplant':''}${e.booking?' · '+e.booking.date+' '+e.booking.payee+' '+eur(e.booking.amount):''}`})]),controls]));
    }
    if(!report.events.length)box.append(el('p',{class:'note',text:'Keine Fixkosten oder Zahlungspläne im ausgewählten Zeitraum.'}));
  }
  $('forecast-preview-open').addEventListener('click',()=>openView('forecast'));
  $('forecast-horizon').addEventListener('change',()=>update({...defaults(getState().forecast),horizon:Number($('forecast-horizon').value)}));
  $('forecast-day').addEventListener('input',renderDay);
  $('forecast-source').addEventListener('change',()=>{$('forecast-manual').disabled=$('forecast-asof').disabled=$('forecast-source').value!=='manual';});
  $('forecast-settings-form').addEventListener('input',()=>{settingsDirty=true;});
  $('forecast-settings-form').addEventListener('change',()=>{settingsDirty=true;});
  $('forecast-settings-form').addEventListener('submit',event=>{event.preventDefault();const f=defaults(getState().forecast),source=$('forecast-source').value,manual=source==='manual'?{amount:$('forecast-manual').value===''?null:Number($('forecast-manual').value),date:$('forecast-asof').value}:f.manualBalance;
    if(source==='manual'&&manual.date>berlinToday()){text('forecast-form-error','Der Stichtag darf nicht in der Zukunft liegen.');return;}
    settingsDirty=false;const ok=update({...f,balanceSource:source,manualBalance:manual,protectedBalance:Number($('forecast-protected').value),buffer:Number($('forecast-buffer').value),useBudgets:$('forecast-budgets').checked,includePossible:$('forecast-possible').checked,includeEstimates:$('forecast-estimates').checked});if(!ok)settingsDirty=true;});
  $('forecast-income-form').addEventListener('submit',event=>{event.preventDefault();const f=defaults(getState().forecast),p={id:crypto.randomUUID(),name:$('forecast-income-name').value.trim(),source:$('forecast-income-source').value,amount:Number($('forecast-income-amount').value),day:Number($('forecast-income-day').value),startMonth:$('forecast-income-start').value,matchKeyword:$('forecast-income-match').value.trim(),category:'Gehalt'};if(update({...f,incomePlans:[...f.incomePlans,p]},'forecast-income-error')){event.target.reset();$('forecast-income-start').value=berlinToday().slice(0,7);}});
  $('forecast-once-amount').addEventListener('input',()=>{const amount=Number($('forecast-once-amount').value),kind=$('forecast-once-kind');if(amount>0&&kind.value==='expense')kind.value='income';else if(amount<0&&kind.value==='income')kind.value='expense';});
  $('forecast-once-form').addEventListener('submit',event=>{event.preventDefault();const f=defaults(getState().forecast),p={id:crypto.randomUUID(),name:$('forecast-once-name').value.trim(),date:$('forecast-once-date').value,amount:Number($('forecast-once-amount').value),kind:$('forecast-once-kind').value,category:$('forecast-once-category').value,matchKeyword:$('forecast-once-match').value.trim()};if(update({...f,oneOffs:[...f.oneOffs,p]},'forecast-once-error')){event.target.reset();$('forecast-once-date').value=berlinToday();}});
  return {render};
}
