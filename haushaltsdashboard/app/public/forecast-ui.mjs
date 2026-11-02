import {defaults,forecast,validateForecast,incomeSuggestions} from './forecast.mjs';
import {berlinToday,shiftMonth} from './finance.mjs';
const $=id=>document.getElementById(id),eur=value=>value===null?'–':new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(value),date=value=>value?value.split('-').reverse().join('.'):'–';
function el(tag,attrs={},children=[]){const node=document.createElement(tag);for(const [key,value] of Object.entries(attrs)){if(key==='text')node.textContent=value;else if(key==='class')node.className=value;else node.setAttribute(key,value)}node.append(...children);return node;}
const text=(id,value)=>$(id).textContent=value;
export function createForecastUI({getState,getBank,getAccount,save,openView,editFixed,onIncomeChange=()=>{}}){
  let report=null,settingsDirty=false;
  function update(value,errorId='forecast-form-error'){
    const error=validateForecast(value);text(errorId,error||'');if(error)return false;
    getState().forecast=value;save();render();return true;
  }
  function removePlan(key,id){const f=defaults(getState().forecast);f[key]=f[key].filter(p=>p.id!==id);update(f);}
  function render(){
    const state=getState(),f=defaults(state.forecast),today=berlinToday();report=forecast(state,getBank(),{account:getAccount()});
    $('forecast-horizon').value=f.horizon;if(!settingsDirty){$('forecast-source').value=f.balanceSource;$('forecast-manual').value=f.manualBalance?.amount??'';$('forecast-asof').value=f.manualBalance?.date||today;$('forecast-asof').max=today;$('forecast-protected').value=f.protectedBalance;$('forecast-buffer').value=f.buffer;
    $('forecast-automatic').checked=f.automatic;$('forecast-budgets').checked=f.useBudgets;$('forecast-possible').checked=f.includePossible;$('forecast-estimates').checked=f.includeEstimates;
    $('forecast-manual').disabled=$('forecast-asof').disabled=f.balanceSource!=='manual';}
    for(const [id,value] of [['forecast-current',report.current],['forecast-free',report.available],['forecast-end',report.endBalance],['forecast-low',report.minimum]]){text(id,eur(value));$(id).classList.toggle('negative',value!==null&&value<0);}
    text('forecast-free-label',report.available!==null&&report.available<0?'Geplanter Fehlbetrag':report.warnings.length?'Vorläufig frei':'Rechnerisch frei');text('forecast-free-until','bis '+date(report.freeUntil));
    text('forecast-preview-value',eur(report.budget.available));$('forecast-preview-value').classList.toggle('negative',report.budget.available!==null&&report.budget.available<0);text('forecast-preview-note',report.budget.incomeKnown?`${report.budget.key} · ${eur(report.budget.income)} Netto − ${eur(report.budget.obligations)} Verträge & Fixkosten`:'Monatsnetto für beide Personen ergänzen · Planung öffnen');
    text('forecast-balance-note',report.balance?`${f.balanceSource==='manual'?'Manueller Kontostand':'Gebuchter Bankkontostand'}: ${eur(report.balance.amount)} einschließlich ${date(report.balance.date)}. Spätere importierte Buchungen bis heute sind fortgeschrieben. Geplant im Zeitraum: +${eur(report.plannedIncome)} / −${eur(report.plannedExpense)}. Geschützt: ${eur(report.protected)}.`:'Kein geeigneter gebuchter Bankkontostand vorhanden. Unter „Kontostand und Planung einstellen“ einen manuellen Kontostand hinterlegen oder die Bankdaten aktualisieren.');
    $('forecast-settings').open=!report.balance||$('forecast-settings').open;
    renderNotices();
    drawChart();renderDay();renderPlans();renderEvents();renderMonthlyIncome();renderLearning();renderMonthRoom();
    for(const [value,key] of [['joern','first'],['bettina','second']])$('forecast-income-source').querySelector(`option[value="${value}"]`).textContent='Monatsnetto '+(state.people?.[key]||(key==='first'?'Person 1':'Person 2'));
    const categories=[...new Set(['Sonstiges',...(state.categories||[])])],select=$('forecast-once-category'),prior=select.value;select.replaceChildren(...categories.map(name=>el('option',{value:name,text:name})));if(categories.includes(prior))select.value=prior;
    if(!$('forecast-income-start').value)$('forecast-income-start').value=today.slice(0,7);if(!$('forecast-once-date').value)$('forecast-once-date').value=today;
  }
  function reveal(id){const target=$(id);if(!target)return;let parent=target.closest('details');while(parent){parent.open=true;parent=parent.parentElement.closest('details');}target.scrollIntoView({behavior:'smooth',block:'center'});target.focus({preventScroll:true});}
  function renderNotices(){
    const box=$('forecast-warnings'),wasOpen=box.querySelector('details')?.open;box.replaceChildren();if(!report.warnings.length)return;
    const groups=new Map(),add=(key,title,message)=>{if(!groups.has(key))groups.set(key,{title,messages:[]});groups.get(key).messages.push(message);};
    for(const message of report.warnings){
      if(/Kontostand|Saldo-Stichtag|Abruftag/.test(message))add('balance','Kontostand abgleichen',message);
      else if(/Rhythmus oder Fälligkeitsmonat/.test(message))add('fixed','Fixkostentermine ergänzen',message);
      else if(/budget|flexible Kategorien/i.test(message))add('budget','Variable Ausgaben planen',message);
      else if(/Kontoeingang geplant|Geldeingang überfällig/.test(message))add('income','Erwartete Einnahmen prüfen',message);
      else add('other','Weitere Hinweise',message);
    }
    const actions=el('div',{class:'forecast-notice-actions'});
    for(const [key,label,action] of [
      ['balance','Kontostand prüfen',()=>reveal('forecast-source')],
      ['fixed','Fixkostentermine',()=>{openView('fixed');$('fixed-rows').scrollIntoView({behavior:'smooth',block:'start'});}],
      ['budget','Budgets einrichten',()=>{if(!report.settings.useBudgets)reveal('forecast-budgets');else{openView('monthly');reveal('budget-category');}}],
      ['income','Einkommen planen',()=>reveal('forecast-income-name')]
    ])if(groups.has(key)){const button=el('button',{type:'button',class:'btn small',text:label});button.addEventListener('click',action);actions.append(button);}
    const details=el('details',{class:'forecast-notice-details'},[el('summary',{text:`${report.warnings.length} Hinweise im Detail`})]);details.open=!!wasOpen;
    for(const [key,group] of groups){const section=el('section',{},[el('h3',{text:group.title})]);
      for(const message of group.messages){const row=el('div',{class:'forecast-notice-row'},[el('p',{text:message})]);
        if(key==='fixed'){const index=getState().fixed.findIndex(f=>message.startsWith(f.name+':'));if(index>=0&&editFixed){const button=el('button',{type:'button',class:'btn small',text:'Termin bearbeiten'});button.addEventListener('click',()=>{openView('fixed');editFixed(index);});row.append(button);}}
        section.append(row);
      }details.append(section);
    }
    box.append(el('div',{class:'forecast-notice-box'},[el('strong',{text:'Prognose noch vervollständigen'}),el('p',{text:'Die Berechnung ist vorläufig. Ergänze die offenen Angaben, damit Ausgaben und Einnahmen vollständig eingeplant sind.'}),actions,details]));
  }

  function renderMonthRoom(){
    const m=report.budget,state=getState(),names={shared:'Gemeinsam',joern:state.people?.first||'Person 1',bettina:state.people?.second||'Person 2'};
    for(const [id,value] of [['month-room-free',m.available],['month-room-income',m.income],['month-room-fixed',m.obligations],['month-room-flex',m.spentFlexible],['month-room-other',m.spentOther],['month-room-remaining',m.remaining]]){text(id,eur(value));$(id).classList.toggle('negative',value!==null&&value<0);}
    text('month-room-period',new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m.key+'-01T12:00:00Z'))+' · Monatsanteile der Verpflichtungen');
    text('month-room-income-detail','Monatsnetto beider Personen · unabhängig vom Kontoeingang');
    text('month-room-equation',`${eur(m.income)} Netto − ${eur(m.obligations)} Verpflichtungen = ${eur(m.available)} Monatsbudget`);
    text('month-room-note',m.warnings.join(' ')||`Gemeinsam: ${eur(m.shared)} · Persönlich: ${eur(m.personal)}. Flexible Durchschnittswerte und Kategoriebudgets verändern dieses Monatsbudget nicht.`);
    const people=$('month-room-people');people.replaceChildren();
    for(const person of ['joern','bettina']){
      const p=m.people[person],card=el('section',{class:'budget-person','data-person':person},[el('h3',{text:names[person]})]);
      for(const [label,value] of [['Monatsnetto',p.income],['Anteil gemeinsam',p.shared],['Eigene Verpflichtungen',p.personal]])card.append(el('div',{class:'list-row'},[el('span',{text:label}),el('strong',{text:eur(value)})]));
      card.append(el('strong',{class:p.available!==null&&p.available<0?'negative':'',text:eur(p.available)}),el('p',{class:'note',text:'Persönliches Monatsbudget · '+p.source}));
      const input=el('input',{type:'number',min:'0',step:'0.01',inputmode:'decimal',value:state.incomes?.[m.key]?.[person]??'',placeholder:p.income===null?'Netto eintragen':String(p.income),'aria-label':names[person]+' Netto im Budgetmonat',class:'edit-input'}),label=el('label',{class:'field'},[el('span',{text:'Monatsnetto eintragen / überschreiben'}),input]);
      input.addEventListener('change',()=>{if(!input.checkValidity())return;state.incomes||={};state.incomes[m.key]||={};state.incomes[m.key][person]=input.value===''?null:Number(input.value);save();render();onIncomeChange();});card.append(label);people.append(card);
    }
    const rows=$('month-room-rows');rows.replaceChildren();for(const row of m.rows)rows.append(el('tr',{},[el('td',{text:row.name}),el('td',{text:names[row.owner]}),el('td',{text:row.source}),el('td',{class:'right',text:eur(row.amount)})]));
    const chart=$('month-room-chart');chart.replaceChildren();const items=[['Verpflichtungen',m.obligations,'#142943'],['Bereits flexibel ausgegeben',Math.max(0,m.spentFlexible),'#58b5c2'],['Anlagen',Math.max(0,m.spentOther),'#b8a0d9'],['Davon noch übrig',Math.max(0,m.remaining||0),'#1aa889']],total=items.reduce((sum,[,value])=>sum+Math.max(0,value),0),bar=el('div',{class:'month-room-bar',role:'img','aria-label':'Aufteilung des Monatseinkommens in Verpflichtungen, bereits ausgegebene Beträge und verbleibendes Budget'}),legend=el('div',{class:'month-room-legend'});
    for(const [label,value,color] of items){if(value>0&&total)bar.append(el('span',{style:`width:${value/total*100}%;background:${color}`}));legend.append(el('span',{text:`${label}: ${eur(value)}`}));}chart.append(bar,legend);
  }
  function renderLearning(){
    const l=report.learning,box=$('forecast-learning'),f=defaults(getState().forecast);box.replaceChildren();$('forecast-learning-reset').hidden=!f.ignoredPatterns.length;
    text('forecast-learning-summary',!f.automatic?'Automatische Erkennung ausgeschaltet':`${l.fixed.length} Fixkostenmuster · ${l.incomes.length} regelmäßige Einnahmen · ${l.flexible.length} flexible Monatswerte`);
    const models=[...l.fixed.map(p=>({...p,type:'fixed'})),...l.incomes.map(p=>({...p,...p.learned,amount:p.amount,type:'income'})),...l.flexible.map(p=>({...p,type:'flex'}))];
    for(const model of models){
      const isFlex=model.type==='flex',info=isFlex?`Ø ${eur(model.amount)}/Monat · ${model.months.length} vergangene Monate${model.outlierAdjusted?' · Monatsausreißer begrenzt':''}`:`${eur(model.amount)} · ${model.cycle===1?'monatlich':`alle ${model.cycle} Monate`} · ${model.endOfMonth?'zum Monatsende':`um Tag ${model.day}`} · ${model.count} Zahlungstermine`;
      const details=el('details',{class:'details'},[el('summary',{text:`${model.name} · ${model.type==='income'?'Gehalt':isFlex?'Flexible Kosten':'Fixkosten'} · Erkennung ${model.confidence}`}),el('p',{text:info})]);
      details.append(el('p',{text:isFlex?'Wiederkehrende variable Ausgaben, ohne als einmalig markierte Buchungen. Erster Importmonat und laufender Monat werden nicht für den Durchschnitt verwendet.':model.type==='income'?'Typischer Zahlungstermin aus den Buchungen, Betrag als Median der letzten drei beobachteten Gehaltsmonate. Feiertage sind nicht vorhersehbar.':model.reason||'Wiederkehrende Abbuchungen mit ähnlichen Beträgen und regelmäßigen Monatsabständen.'}));
      if(isFlex){const table=el('table'),body=el('tbody');table.append(el('thead',{},[el('tr',{},['Monat','Beobachtet','Für Durchschnitt'].map(text=>el('th',{text})))]),body);for(const m of model.monthly)body.append(el('tr',{},[el('td',{text:m.month}),el('td',{class:'right',text:eur(m.amount)}),el('td',{class:'right',text:eur(m.used)})]));details.append(el('div',{class:'table-wrap'},[table]));}
      const sources=el('details',{class:'details'},[el('summary',{text:`Quellbuchungen (${model.sources.length})`})]);for(const source of model.sources.slice(0,60))sources.append(el('p',{text:`${source.date} · ${source.payee} · ${eur(source.amount)}`}));if(model.sources.length>60)sources.append(el('p',{text:'Die ersten 60 Buchungen werden hier angezeigt; alle stehen im Buchungsbereich.'}));details.append(sources);
      const ignore=el('button',{type:'button',class:'btn small',text:'Muster nicht berücksichtigen'});ignore.addEventListener('click',()=>update({...f,ignoredPatterns:[...new Set([...f.ignoredPatterns,model.id])]}));details.append(ignore);box.append(details);
    }
    if(!models.length)box.append(el('p',{class:'note',text:f.automatic?'Noch nicht genügend eindeutige Historie. Für neue Rhythmen und Gehalt sind in der Regel drei Zahlungstermine nötig; für vorhandene bekannte Rhythmen können zwei genügen. Flexible Durchschnitte benötigen mindestens zwei vergangene Vergleichsmonate.':'Manuelle Planwerte werden weiterhin berücksichtigt.'}));
  }
  function renderMonthlyIncome(){
    const state=getState(),table=el('table'),body=el('tbody');table.append(el('thead',{},[el('tr',{},[el('th',{text:'Monat'}),el('th',{text:state.people?.first||'Person 1'}),el('th',{text:state.people?.second||'Person 2'})])]),body);
    for(let key=report.today.slice(0,7);key<=report.end.slice(0,7);key=shiftMonth(key,1)){const row=el('tr',{},[el('td',{text:key})]);for(const person of ['joern','bettina']){const input=el('input',{type:'number',min:'0',step:'0.01',class:'edit-input',value:state.incomes?.[key]?.[person]??'',placeholder:'Unbekannt','aria-label':`${person==='joern'?'Person 1':'Person 2'} Monatsnetto ${key}`}),month=key;input.addEventListener('change',()=>{if(!input.checkValidity())return;state.incomes||={};state.incomes[month]||={};state.incomes[month][person]=input.value===''?null:Number(input.value);save();render();onIncomeChange();});row.append(el('td',{},[input]));}body.append(row);} $('forecast-monthly-income').replaceChildren(table);
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
    for(const e of report.events){const controls=el('div',{class:'status-line'},[el('span',{class:`pill ${e.status==='booked'?'yes':e.status==='planned'?'':'maybe'}`,text:labels[e.status]+(e.automatic?' · automatisch':'')}),el('b',{text:eur(e.amount)})]);
      if(e.status!=='booked'){const button=el('button',{type:'button',class:'btn small',text:e.status==='excluded'?'Wieder einplanen':'Nicht mehr erwarten'});button.addEventListener('click',()=>{const f=defaults(getState().forecast);f.excluded=e.status==='excluded'?f.excluded.filter(id=>id!==e.id):[...new Set([...f.excluded,e.id])];update(f);});controls.append(button);}
      box.append(el('div',{class:'list-row'},[el('div',{},[el('strong',{text:e.name}),el('small',{text:`${date(e.originalDate)} · ${e.detail}${e.originalDate<report.today&&e.status==='planned'?' · offen, ab heute eingeplant':''}${e.booking?' · '+e.booking.date+' '+e.booking.payee+' '+eur(e.booking.amount):''}`})]),controls]));
    }
    if(!report.events.length)box.append(el('p',{class:'note',text:'Keine Fixkosten oder Zahlungspläne im ausgewählten Zeitraum.'}));
  }
  $('forecast-learning-reset').addEventListener('click',()=>update({...defaults(getState().forecast),ignoredPatterns:[]}));
  $('forecast-preview-open').addEventListener('click',()=>openView('forecast'));
  $('forecast-horizon').addEventListener('change',()=>update({...defaults(getState().forecast),horizon:Number($('forecast-horizon').value)}));
  $('forecast-day').addEventListener('input',renderDay);
  $('forecast-source').addEventListener('change',()=>{$('forecast-manual').disabled=$('forecast-asof').disabled=$('forecast-source').value!=='manual';});
  $('forecast-settings-form').addEventListener('input',()=>{settingsDirty=true;});
  $('forecast-settings-form').addEventListener('change',()=>{settingsDirty=true;});
  $('forecast-settings-form').addEventListener('submit',event=>{event.preventDefault();const f=defaults(getState().forecast),source=$('forecast-source').value,manual=source==='manual'?{amount:$('forecast-manual').value===''?null:Number($('forecast-manual').value),date:$('forecast-asof').value}:f.manualBalance;
    if(source==='manual'&&manual.date>berlinToday()){text('forecast-form-error','Der Stichtag darf nicht in der Zukunft liegen.');return;}
    settingsDirty=false;const ok=update({...f,balanceSource:source,manualBalance:manual,protectedBalance:Number($('forecast-protected').value),buffer:Number($('forecast-buffer').value),automatic:$('forecast-automatic').checked,useBudgets:$('forecast-budgets').checked,includePossible:$('forecast-possible').checked,includeEstimates:$('forecast-estimates').checked});if(!ok)settingsDirty=true;});
  $('forecast-income-form').addEventListener('submit',event=>{event.preventDefault();const f=defaults(getState().forecast),p={id:crypto.randomUUID(),name:$('forecast-income-name').value.trim(),source:$('forecast-income-source').value,amount:Number($('forecast-income-amount').value),day:Number($('forecast-income-day').value),startMonth:$('forecast-income-start').value,matchKeyword:$('forecast-income-match').value.trim(),category:'Gehalt'};if(update({...f,incomePlans:[...f.incomePlans,p]},'forecast-income-error')){event.target.reset();$('forecast-income-start').value=berlinToday().slice(0,7);}});
  $('forecast-once-amount').addEventListener('input',()=>{const amount=Number($('forecast-once-amount').value),kind=$('forecast-once-kind');if(amount>0&&kind.value==='expense')kind.value='income';else if(amount<0&&kind.value==='income')kind.value='expense';});
  $('forecast-once-form').addEventListener('submit',event=>{event.preventDefault();const f=defaults(getState().forecast),p={id:crypto.randomUUID(),name:$('forecast-once-name').value.trim(),date:$('forecast-once-date').value,amount:Number($('forecast-once-amount').value),kind:$('forecast-once-kind').value,category:$('forecast-once-category').value,matchKeyword:$('forecast-once-match').value.trim()};if(update({...f,oneOffs:[...f.oneOffs,p]},'forecast-once-error')){event.target.reset();$('forecast-once-date').value=berlinToday();}});
  return {render};
}
