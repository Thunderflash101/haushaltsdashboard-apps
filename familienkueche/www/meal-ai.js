(function(){
'use strict';
window.createFamilyMealAI=function(h){
var state=null,busy=false,serial=0,feedbackSeq=0,chosenMode='mixed',modeLabels={mixed:'Gemischt',quick:'Schnell',weekend:'Wochenende'},modeHints={mixed:'Kurze und längere Gerichte gemischt · bis 3 Stunden Gesamtzeit',quick:'Höchstens 30 Minuten Gesamtzeit',weekend:'Zeit zum Kochen · bis 3 Stunden Gesamtzeit'};
try{var savedMode=localStorage.getItem('familienkueche-meal-ai-mode-v1');if(Object.prototype.hasOwnProperty.call(modeLabels,savedMode))chosenMode=savedMode;}catch(e){}
function modePicker(){return '<input type="hidden" name="mode" value="'+chosenMode+'"><div class="segmented ai-mode-picker" role="group" aria-label="Kochzeit auswählen">'+['mixed','quick','weekend'].map(function(m){return h.btn('meal-ai-mode',modeLabels[m],m===chosenMode?'selected':'','data-mode="'+m+'" aria-pressed="'+(m===chosenMode)+'"');}).join('')+'</div><p class="source-label" data-ai-mode-hint>'+modeHints[chosenMode]+'</p>';}
function changeMode(b){var f=document.getElementById('meal-ai-form'),m=b.getAttribute('data-mode');if(!f||busy||!Object.prototype.hasOwnProperty.call(modeLabels,m))return;chosenMode=m;f.elements.mode.value=m;Array.prototype.forEach.call(f.querySelectorAll('[data-action="meal-ai-mode"]'),function(x){var active=x.getAttribute('data-mode')===m;x.classList.toggle('selected',active);x.setAttribute('aria-pressed',String(active));});f.querySelector('[data-ai-mode-hint]').textContent=modeHints[m];try{localStorage.setItem('familienkueche-meal-ai-mode-v1',m);}catch(e){}}

function money(cents){return (cents/100).toFixed(2).replace('.',',')+' US-$';}
function results(data){
var r=data.result;if(!r)return '';
var withOffers=r.useOffers!==false,html='<section class="ai-results"><h3>Zuletzt gefunden</h3><p class="source-label">'+
    (withOffers?h.esc(r.shop)+' · Angebote '+h.esc(h.fmt(r.start))+' – '+h.esc(h.fmt(r.end)):'Nach eurem Geschmack · Ohne Angebote')+'</p>';
if(withOffers&&r.end<h.today())html+='<p class="notice">Dieser Angebotszeitraum ist vorbei. Die Rezepte bleiben verwendbar.</p>';
html+='<p class="source-label">'+'<span data-ai-visible-count>'+r.recipes.length+'</span> unterschiedliche Vorschläge · Ziel: '+(r.targetCount||8)+'</p>'+((r.searchVersion||0)<5?'<p class="notice">Dieser Stand stammt aus der bisherigen Suche. Für die größere, abwechslungsreiche Auswahl bitte einen neuen Suchlauf starten.</p>':'');
html+='<p class="source-label">Kochzeit: '+h.esc(modeLabels[r.mode]||'Bisherige Suche')+'</p>';
if(withOffers)html+='<details><summary>Erkannte Angebote prüfen</summary><ul>'+r.offers.map(function(x){return '<li>'+h.esc(x)+'</li>';}).join('')+'</ul></details>';
if((r.warnings||[]).length){html+='<details><summary>Hinweise zur Suche ('+r.warnings.length+')</summary>';r.warnings.forEach(function(x){html+='<p class="notice">'+h.esc(x)+'</p>';});html+='</details>';}
if(!r.recipes.length&&!withOffers)html+='<p class="notice">Keine passenden Rezeptseiten gefunden. Probiert eine andere Kochzeit.</p>';
if(!r.recipes.length&&withOffers)html+='<p class="notice">Keine direkt importierbaren Rezepte gefunden. Ihr könnt zu den aktuellen Aldi-Lebensmitteln passende Chefkoch-Suchlisten öffnen. Dort die Gesamtzeit prüfen und einen Rezeptlink zum Import auswählen.</p><div data-ai-searches>'+h.btn('meal-ai-searches','Chefkoch-Suchen zu aktuellen Aldi-Zutaten anzeigen','sage')+'</div>';
html+='<div class="ai-recipe-grid">';r.recipes.forEach(function(x){html+='<article class="ai-recipe">'+(h.tools?h.tools.photo(x):'')+'<span class="recipe-mark">'+(x.discovery?'Mal was Neues':'Passt zu euch')+'</span><h3>'+h.esc(x.title)+'</h3><span class="recipe-mark">'+h.esc(x.minutes)+' Min. gesamt</span><span class="recipe-mark neutral">'+(typeof x.activeMinutes==='number'?h.esc(x.activeMinutes)+' Min. aktiv':'Arbeitszeit offen')+'</span><p>'+h.esc(x.reason)+'</p>'+(withOffers&&x.matches&&x.matches.length?'<p class="source-label">Passend: '+h.esc(x.matches.join(', '))+'</p>':'')+'<div class="row wrap"><a class="link" href="'+h.esc(x.url)+'" target="_blank" rel="noopener noreferrer">Originalrezept ↗</a>'+h.btn('meal-ai-import','In Mealie übernehmen','sage','data-url="'+h.esc(x.url)+'"')+(h.tools?h.tools.controls(x):'')+'</div></article>';});
html+='</div><p class="source-label">Originalfoto, soweit verfügbar · Nach dem Import könnt ihr einplanen und Zutaten nach Bring übernehmen.</p>';
if(data.usage)html+='<details><summary>Verbrauchsdetails</summary><p class="source-label">Letzter Lauf: '+h.esc(data.usage.input_tokens||0)+' Eingabetokens · '+h.esc(data.usage.output_tokens||0)+' Ausgabetokens · '+h.esc(data.usage.search_calls||0)+' Suchaufrufe. Verbindliche Kosten stehen im OpenAI-Projekt.</p></details>';
return html+'</section>';
}
if(h.tools)h.tools.setDiscoveryRefresh(function(){var root=document.getElementById('meal-ai-dialog');if(!root)return;var seq=++feedbackSeq;h.api('GET','api/meal-ai',null,null,function(err,data){if(err||seq!==feedbackSeq||!document.contains(root))return;var old=root.querySelector('.ai-results');if(!old)return;var next=document.createElement('div');next.innerHTML=results(data);if(next.firstChild)old.parentNode.replaceChild(next.firstChild,old);});});
function offerFields(){
    return '<label class="row"><input type="checkbox" name="useOffers" aria-controls="ai-offer-fields"> Aldi-Angebote berücksichtigen</label>'+
        '<fieldset id="ai-offer-fields" hidden disabled><legend>Wochenangebote</legend><div class="row wrap">'+
        h.btn('meal-ai-offers','Aktuelle laden','sage','data-window="current"')+h.btn('meal-ai-offers','Kommende laden','','data-window="next"')+'</div>'+
        '<p data-ai-offers-status role="status">Angebote aus Home Assistant laden oder Zutaten eintragen.</p>'+
        '<label for="ai-offers">Angebotszutaten</label><textarea id="ai-offers" name="offers" maxlength="12000" rows="2" placeholder="z. B. Brokkoli und Hähnchen"></textarea>'+
        '<details><summary>Anbieter und Zeitraum</summary><div class="form-grid">'+
        '<div class="form-field"><label for="ai-shop">Anbieter</label><select id="ai-shop" name="shop"><option>Aldi Nord</option><option>Aldi Süd</option></select></div>'+
        '<div class="form-field"><label for="ai-start">Gültig ab</label><input id="ai-start" name="start" type="date" value="'+h.today()+'" required></div>'+
        '<div class="form-field"><label for="ai-end">Gültig bis</label><input id="ai-end" name="end" type="date" min="'+h.today()+'" value="'+h.plus(h.today(),6)+'" required></div></div></details></fieldset>';
}
function body(data){
    var html='',profile=data.profile||{preferred:[],avoid:[]},canSearch=false;
    if(!data.enabled)html='<p class="notice">Zuerst in der Familienküche-App-Konfiguration „meal_ai_enabled“ aktivieren und die App neu starten.</p>';
    else if(!data.configured)html='<p class="notice">Der Schlüssel wurde noch nicht erkannt. Bitte den Eintrag „familienkueche_openai_api_key“ in secrets.yaml prüfen und die App neu starten.</p>';
    else if(data.running||busy)html='<p class="notice" role="status">Die KI sucht gerade. Über „Ergebnisse laden“ könnt ihr den Stand abrufen.</p>';
    else if(data.reservedCents+data.perRunCents>data.budgetCents)html='<p class="notice">Monatliches Kontingent aufgebraucht. Gespeicherte Ergebnisse bleiben verfügbar.</p>';
    else{
        canSearch=true;
        html='<form id="meal-ai-form"><p>Was passt zu euch? Die KI sucht auf Chefkoch nach Rezepten für euren Familiengeschmack.</p>'+
            modePicker()+offerFields()+'<label class="row"><input name="confirm" type="checkbox" required> Kostenpflichtige KI-Suche bestätigen</label>'+
            '<p class="source-label">Reservierung pro Suche im Monatsbudget: '+money(data.perRunCents)+'</p><p class="error" role="alert"></p>'+
            '<div class="modal-actions"><button class="primary" type="submit">Rezepte mit KI suchen</button></div></form>';
    }
    var details='<details><summary>Geschmack und KI-Kosten</summary><p>Gerne: '+h.esc(profile.preferred.join(', ')||'Keine Vorgabe')+
        '<br>Meiden: '+h.esc(profile.avoid.join(', ')||'Keine Vorgabe')+'</p>'+
        (h.tools?h.btn('meal-taste-open','Geschmack bearbeiten','text-button'):'')+
        '<p class="source-label">'+h.esc(data.model)+' · '+money(data.reservedCents)+' von '+money(data.budgetCents)+' reserviert. Die Abrechnung erfolgt über OpenAI.</p>'+
        '<p class="source-label">Gesendet werden Kochzeit, Geschmack, Favoriten und Rückmeldungen. Angebotsdaten werden nur bei aktivierter Option gesendet.</p></details>';
    return (canSearch&&data.result?'<details class="ai-search-panel"><summary>Neue Vorschläge suchen</summary>'+html+'</details>':html)+details+
        (!canSearch?h.btn('meal-ai-open','Ergebnisse laden'):'')+results(data);
}
function toggleOffers(f){
    var fieldset=f.querySelector('#ai-offer-fields'),enabled=f.elements.useOffers.checked;
    fieldset.hidden=!enabled;
    fieldset.disabled=!enabled;
    f.querySelector('[type="submit"]').disabled=enabled&&!!f._aiOffersLoading;
    f.querySelector('.error').textContent='';
}
function open(expand){var seq=++serial;h.modal('Rezeptideen mit KI','<div id="meal-ai-dialog"><p role="status">Einrichtung und gespeicherte Ergebnisse werden geladen …</p></div>',true);var root=document.getElementById('meal-ai-dialog');h.api('GET','api/meal-ai',null,null,function(err,data){if(seq!==serial||!document.contains(root))return;if(err){root.innerHTML='<p class="notice error">'+h.esc(err.error)+'</p>'+h.btn('meal-ai-open','Erneut laden');return;}state=data;root.innerHTML=body(data);var form=root.querySelector('#meal-ai-form');if(form)form.elements.useOffers.onchange=function(){toggleOffers(form);};if(expand){var panel=root.querySelector('.ai-search-panel');if(panel)panel.open=true;}});}
function loadOffers(b){
var f=document.getElementById('meal-ai-form');if(!f||busy||!f.elements.useOffers.checked||f._aiOffersLoading)return;
if(f.elements.offers.value.trim()){if(!window.confirm('Vorhandene Angebotsauswahl durch Aldi-Lebensmittel ersetzen?'))return;}
var note=f.querySelector('[data-ai-offers-status]'),submit=f.querySelector('[type="submit"]');f._aiOffersLoading=true;submit.disabled=true;
note.textContent='Aldi-Angebote werden kostenlos geladen …';
h.api('GET','api/meal-ai/offers?window='+encodeURIComponent(b.getAttribute('data-window')),null,null,function(err,data){
 f._aiOffersLoading=false;if(!document.contains(f)||busy)return;submit.disabled=false;
 if(err){note.textContent=err.error+' Ihr könnt Zutaten eintragen oder die Angebotsoption ausschalten.';return;}
 if(!data.products||!data.products.length){note.textContent='Keine passenden Lebensmittel gefunden. Die bisherige Auswahl bleibt erhalten.';return;}
 f.elements.offers.value='Lebensmittel aus '+data.shop+' (nur Namen; Preis und Gültigkeit je Artikel nicht verifiziert):\n'+data.products.join('\n');f.elements.shop.value=data.shop;
 note.textContent=data.count+' Lebensmittel aus '+data.total+' Einträgen geladen. '+(data.reportedValidity?'Prospektangabe: '+data.reportedValidity+'. ':'')+data.warning;

});
}
function searches(b){
var slot=b.parentNode;if(slot.getAttribute('data-loading'))return;slot.setAttribute('data-loading','true');b.disabled=true;
h.api('GET','api/meal-ai/offers?window=current',null,null,function(err,data){
 if(!document.contains(slot))return;slot.removeAttribute('data-loading');b.disabled=false;
 if(err){slot.innerHTML='<p class="notice">'+h.esc(err.error)+'</p>'+h.btn('meal-ai-searches','Erneut laden');return;}
 var names=(data.products||[]).slice(0,5);if(!names.length){slot.innerHTML='<p class="notice">Keine aktuellen Aldi-Lebensmittel verfügbar. Ihr könnt im Formular eigene Zutaten eintragen.</p>';return;}
 slot.innerHTML='<p class="source-label">Chefkoch-Suchlisten · keine KI-Anfrage · noch keine geprüften Einzelrezepte</p><div class="stack">'+names.map(function(name){return '<a class="link" href="https://www.chefkoch.de/rs/s0/'+encodeURIComponent(name.toLowerCase().replace(/\s+/g,'+'))+'/Rezepte.html" target="_blank" rel="noopener noreferrer">Rezepte mit '+h.esc(name)+' suchen ↗</a>';}).join('')+'</div>';
});
}
function submit(f){if(f.id!=='meal-ai-form')return false;var el=f.elements,useOffers=el.useOffers.checked;
if(busy||(useOffers&&f._aiOffersLoading))return true;
var payload={useOffers:useOffers,mode:el.mode.value,vegetarian:false,confirm:el.confirm.checked};
if(useOffers){
    payload.shop=el.shop.value;payload.start=el.start.value;payload.end=el.end.value;payload.offers=el.offers.value.trim();
    if(!payload.offers){f.querySelector('.error').textContent='Bitte Angebote laden, Zutaten eingeben oder die Angebotsoption ausschalten.';return true;}
}
busy=true;var key='ai-'+h.uid()+'-'+h.uid();Array.prototype.forEach.call(f.querySelectorAll('input,textarea,select,button'),function(x){x.disabled=true;});f.querySelector('.error').textContent='Neue Rezeptideen werden gesucht …';h.api('POST','api/meal-ai/trial',payload,key,function(err,data){busy=false;if(err){if(document.contains(f)){var error=f.querySelector('.error');error.textContent=err.error+' ';error.insertAdjacentHTML('beforeend',h.btn('meal-ai-open','Ergebnisse laden'));}else h.toast(err.error);return;}state=data;if(document.contains(f)){var root=document.getElementById('meal-ai-dialog');root.innerHTML='<p class="notice">'+(data.cached?'Gespeicherte Ergebnisse geladen – keine neue KI-Anfrage.':'Probelauf abgeschlossen.')+'</p>'+results(data)+h.btn('meal-ai-new','Weitere Vorschläge suchen');root.parentNode.scrollTop=0;}else h.toast('Die neuen Rezeptideen sind gespeichert.');});return true;}
return {open:open,submit:submit,action:function(a,b){if(a==='meal-ai-open')open(false);else if(a==='meal-ai-new')open(true);else if(a==='meal-ai-mode')changeMode(b);else if(a==='meal-ai-offers')loadOffers(b);else if(a==='meal-ai-searches')searches(b);else if(a==='meal-ai-import')h.importRecipe(b.getAttribute('data-url'));else return false;return true;}};
};
})();
