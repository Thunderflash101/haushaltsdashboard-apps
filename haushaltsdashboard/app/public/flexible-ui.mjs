import {purposePreview} from './booking-text.mjs';
const $=id=>document.getElementById(id);
const eur=n=>n===null?'–':new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n);
const monthLabel=key=>new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(key+'-01T12:00:00Z'));
function el(tag,attrs={},children=[]){const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='text')e.textContent=v;else if(k==='class')e.className=v;else e.setAttribute(k,v);}e.append(...children);return e;}
const sourceLabel=r=>r.source==='budget'?'Dein Budget':r.source==='average'?'Automatischer Ø':'Ohne Planwert';
export function createFlexibleUI({getReport,getState,save,refresh,openBooking}){
  let selectedMonth=null,detailCategory=null,transactionMonth=null,mode='cards';
  const period=()=>getReport()?.flexibleMonths.find(m=>m.key===selectedMonth);
  const selectedRow=()=>period()?.rows.find(r=>r.category===detailCategory)||{category:detailCategory,source:'unknown',target:null,average:null,spent:0,scheduled:0,remaining:null,over:0,history:[],transactions:[],configuredBudget:null,model:null};
  function transactionList(box,entries){
    box.replaceChildren();if(!entries.length){box.append(el('p',{class:'empty',text:'Keine zugehörigen Buchungen in diesem Monat.'}));return;}
    for(const entry of [...entries].sort((a,b)=>b.booking.date.slice(6).localeCompare(a.booking.date.slice(6))||b.booking.date.slice(3,5).localeCompare(a.booking.date.slice(3,5))||b.booking.date.slice(0,2).localeCompare(a.booking.date.slice(0,2)))){
      const b=entry.booking,button=el('button',{type:'button',class:'flex-transaction','aria-label':`${b.date} · ${b.payee} · ${entry.category} · Buchung öffnen`},[el('span',{},[el('strong',{text:b.payee||'Buchung'}),el('small',{text:`${b.date} · ${entry.category}${entry.isRefund?' · Erstattung':''}${b.forecastOneOff?' · Einmalig':''}`}),el('small',{text:purposePreview(b)})]),el('b',{class:entry.value<0?'positive':'',text:(entry.value<0?'+':'−')+eur(Math.abs(entry.value))})]);
      button.addEventListener('click',()=>{$('flex-dialog').close();openBooking?.(b);});box.append(button);
    }
  }
  function render(){
    const report=getReport();if(!report)return;
    const keys=report.flexibleMonths.map(m=>m.key);if(!keys.includes(selectedMonth))selectedMonth=keys[0];
    $('flex-month').replaceChildren(...keys.map(key=>el('option',{value:key,text:monthLabel(key)})));$('flex-month').value=selectedMonth;
    renderCards();
  }
  function renderCards(){
    const m=period();if(!m)return;
    for(const [id,value] of [['flex-total',m.target],['flex-spent',m.spent],['flex-remaining',m.remaining]])$(id).textContent=eur(value);
    $('flex-note').textContent=(m.target===null?'Noch kein verlässlicher Monatswert vorhanden. Lege ein Budget an oder importiere weitere Vergleichsmonate.':`${m.rows.filter(r=>r.target!==null).length} Kategorien mit Monatswert · ${m.over>0?eur(m.over)+' über Plan / Ø · ':''}${m.scheduled>0?eur(m.scheduled)+' offene Terminzahlungen bereits berücksichtigt. ':''}Diese Monatswerte verändern den Kontostandsverlauf nicht.`)+(m.unknown?` Für ${m.unknown} weitere Kategorie(n) fehlt ein Planwert; deren zukünftige Ausgaben sind in „Noch vorgesehen“ nicht enthalten.`:'');
    const query=$('flex-search').value.trim().toLocaleLowerCase('de'),shown=m.rows.filter(r=>r.category.toLocaleLowerCase('de').includes(query)),box=$('flex-cards');box.replaceChildren();
    for(const row of shown){
      const ratio=row.target>0?Math.min(100,Math.max(0,(row.spent+row.scheduled)/row.target*100)):0,unknown=row.target===null;
      const head=el('div',{class:'flex-card-head'},[el('h3',{text:row.category}),el('span',{class:'pill '+(row.source==='budget'?'yes':''),text:sourceLabel(row)})]);
      const card=el('button',{type:'button',class:'flex-card'+(row.over>0?' over':''),'data-category':row.category},[head,el('div',{},[el('div',{class:'flex-card-value'+(row.over>0?' negative':''),text:unknown?'–':eur(row.over>0?-row.over:row.remaining)}),el('p',{class:'quiet',text:unknown?'Noch keine verlässliche Schätzung':row.over>0?(row.source==='budget'?'Über deinem Budget':'Über dem üblichen Monatswert'):row.source==='budget'?'Restbudget für diesen Monat':'Voraussichtlich noch im Monat'})]),el('div',{class:'flex-card-stats'},[el('span',{},[el('span',{text:row.source==='budget'?'Monatslimit':'Ø pro Monat'}),el('b',{text:eur(row.target)})]),el('span',{},[el('span',{text:'Bereits gebucht'}),el('b',{text:eur(row.spent)})])]),el('div',{class:'flex-progress',...(unknown?{}:{role:'progressbar','aria-label':row.category+' Verbrauch','aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':Math.round(ratio),'aria-valuetext':eur(row.spent)+' gebucht, '+eur(row.scheduled)+' noch terminiert, von '+eur(row.target)})},[el('span',{style:`width:${ratio}%`})]),el('div',{class:'flex-card-footer'},[el('span',{text:row.source==='budget'?(row.scheduled>0?eur(row.scheduled)+' noch terminiert':'Gesamte Kategorie'):row.model?row.model.months.length+' Vergleichsmonate'+(row.model.outlierAdjusted?' · Ausreißer begrenzt':''):'Budget festlegen'}),el('b',{text:'Details →'})])]);
      card.addEventListener('click',()=>openDetails(row.category));box.append(card);
    }
    if(!shown.length)box.append(el('p',{class:'empty',text:m.rows.length?'Keine Kategorie für diese Suche.':'Noch keine flexiblen Buchungen oder Budgets vorhanden.'}));
    $('flex-cards').hidden=mode!=='cards';$('flex-transactions').hidden=mode!=='transactions';
    for(const [id,active] of [['flex-tab-cards',mode==='cards'],['flex-tab-transactions',mode==='transactions']]){$(id).classList.toggle('active',active);$(id).setAttribute('aria-pressed',String(active));}
    if(mode==='transactions')transactionList($('flex-transactions'),shown.flatMap(r=>r.transactions));
  }
  function openDetails(category,edit=false){
    detailCategory=category;transactionMonth=selectedMonth;const row=selectedRow(),state=getState();
    $('flex-dialog-title').textContent=category;$('flex-budget-error').textContent='';
    $('flex-detail-source').textContent=sourceLabel(row)+(row.source==='budget'?' · Limit für die gesamte Kategorie':' · Flexible Ausgaben ohne Verträge und Fixkosten');
    $('flex-detail-metrics').replaceChildren(...[[row.source==='budget'?'Monatslimit':'Ø pro Monat',row.target],['Bereits gebucht',row.spent],[row.over>0?'Über Plan / Ø':row.source==='budget'?'Restbudget':'Noch erwartet',row.over>0?-row.over:row.remaining]].map(([label,value])=>el('div',{},[el('span',{text:label}),el('strong',{class:value!==null&&value<0?'negative':'',text:eur(value)})])));
    const model=row.model;
    $('flex-detail-method').textContent=row.source==='budget'?`Dein gespeichertes Monatslimit gilt für jeden Monat und umfasst die gesamte Kategorie. ${eur(row.scheduled)} offene Terminzahlungen sind vom Restbudget bereits abgezogen.${model?' Zum Vergleich: automatischer flexibler Ø '+eur(model.amount)+'.':''}`:model?`Ø aus ${model.months.length} abgeschlossenen Vergleichsmonaten. Erster Importmonat und laufender Monat werden nicht verwendet. Markierte Einmalposten, Verträge und Fixkosten sind im Ø ausgenommen; zugeordnete Erstattungen werden verrechnet.${model.outlierAdjusted?' Große Monatsausreißer wurden begrenzt.':''}`:'Noch keine verlässliche Schätzung: Es fehlen genügend abgeschlossene Vergleichsmonate oder regelmäßig wiederkehrende flexible Ausgaben. Ein eigenes Budget kannst du jederzeit festlegen.';
    const months=[...row.history.map(h=>h.month),selectedMonth];$('flex-detail-month').replaceChildren(...months.map(key=>el('option',{value:key,text:monthLabel(key)})));$('flex-detail-month').value=transactionMonth;
    const body=$('flex-history-rows');body.replaceChildren();for(const h of row.history)body.append(el('tr',{},[el('td',{text:monthLabel(h.month)}),el('td',{class:'right',text:eur(h.spent)}),el('td',{class:'right',text:eur(h.used)})]));
    drawHistory(row);renderDetailTransactions();
    const categories=[...new Set([...state.categories,...(getReport()?.flexibleMonths.flatMap(m=>m.rows.map(r=>r.category))||[]),category])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'de'));
    $('flex-edit-category').replaceChildren(...categories.map(name=>el('option',{value:name,text:name})));$('flex-edit-category').value=category;
    $('flex-edit-amount').value=state.budgets?.[category]??row.average??'';$('flex-budget-delete').hidden=!Object.hasOwn(state.budgets||{},category);$('flex-edit').open=edit||row.target===null;
    if(!$('flex-dialog').open)$('flex-dialog').showModal();
  }
  function renderDetailTransactions(){const row=selectedRow(),entries=transactionMonth===selectedMonth?row.transactions:row.history.find(h=>h.month===transactionMonth)?.transactions||[];transactionList($('flex-detail-transactions'),entries);}
  function drawHistory(row){
    const box=$('flex-detail-chart');box.replaceChildren();const values=[...row.history,{month:selectedMonth,spent:row.spent}],w=720,h=230,left=55,right=12,top=24,bottom=40,maximum=Math.max(1,row.target||0,...values.map(v=>v.spent))*1.15;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','Monatliche Ausgaben und aktueller Vergleichswert');
    function add(tag,attrs,text){const n=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);return n;}
    const y=n=>top+(1-n/maximum)*(h-top-bottom),base=y(0),cell=(w-left-right)/values.length,bw=Math.min(48,cell*.65);
    for(let i=0;i<=3;i++){const value=maximum*i/3;add('line',{x1:left,x2:w-right,y1:y(value),y2:y(value),stroke:'#e5edf2'});add('text',{x:left-7,y:y(value)+4,'text-anchor':'end','font-size':11,fill:'#64778b'},Math.round(value).toLocaleString('de-DE'));}
    if(row.target!==null){add('line',{x1:left,x2:w-right,y1:y(row.target),y2:y(row.target),stroke:'#142943','stroke-dasharray':'5 4'});add('text',{x:w-right,y:y(row.target)-6,'text-anchor':'end','font-size':11,fill:'#142943'},(row.source==='budget'?'Monatslimit: ':'Aktueller Ø: ')+eur(row.target));}
    values.forEach((v,i)=>{
      const value=Math.max(0,v.spent),x=left+cell*(i+.5)-bw/2,bounded=row.target===null?value:Math.min(value,row.target),rect=add('rect',{x,y:y(bounded),width:bw,height:Math.max(2,base-y(bounded)),fill:v.month===selectedMonth?'#142943':'#1aa889',rx:4,tabindex:0,role:'button','aria-label':monthLabel(v.month)+' · '+eur(v.spent)+' · Buchungen anzeigen'});
      if(row.target!==null&&value>row.target)add('rect',{x,y:y(value),width:bw,height:y(row.target)-y(value),fill:'#df766b',rx:3,'pointer-events':'none'});
      const select=()=>{transactionMonth=v.month;$('flex-detail-month').value=v.month;renderDetailTransactions();};rect.addEventListener('click',select);rect.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}});
      add('text',{x:x+bw/2,y:h-17,'text-anchor':'middle','font-size':11,fill:'#64778b'},v.month.slice(5)+'.'+v.month.slice(2,4));
    });box.append(svg);
  }
  $('flex-month').addEventListener('change',()=>{selectedMonth=$('flex-month').value;renderCards();});$('flex-search').addEventListener('input',renderCards);
  for(const [id,value] of [['flex-tab-cards','cards'],['flex-tab-transactions','transactions']])$(id).addEventListener('click',()=>{mode=value;renderCards();});
  for(const id of ['flex-dialog-close','flex-dialog-done'])$(id).addEventListener('click',()=>$('flex-dialog').close());
  $('flex-add').addEventListener('click',()=>openDetails(period()?.rows[0]?.category||getState().categories.find(c=>c!=='Gehalt')||'Sonstiges',true));
  $('flex-detail-month').addEventListener('change',()=>{transactionMonth=$('flex-detail-month').value;renderDetailTransactions();});
  $('flex-edit-category').addEventListener('change',()=>openDetails($('flex-edit-category').value,true));
  $('flex-budget-form').addEventListener('submit',event=>{
    event.preventDefault();const category=$('flex-edit-category').value,amount=Number($('flex-edit-amount').value);
    if(!category||!Number.isFinite(amount)||amount<=0||amount>=1e10||Math.abs(amount*100-Math.round(amount*100))>.001){$('flex-budget-error').textContent='Bitte einen gültigen Betrag mit höchstens zwei Nachkommastellen eintragen.';return;}
    const state=getState();state.budgets={...state.budgets,[category]:amount};state.forecast={...state.forecast,useBudgets:true};save();$('flex-dialog').close();refresh();
  });
  $('flex-budget-delete').addEventListener('click',()=>{const state=getState();state.budgets={...state.budgets};delete state.budgets[detailCategory];save();$('flex-dialog').close();refresh();});
  return {render};
}
