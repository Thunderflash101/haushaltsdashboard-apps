(function(){
'use strict';
window.createFamilyMealAI=function(h){
var state=null,busy=false,serial=0,chosenMode='mixed',modeLabels={mixed:'Gemischt',quick:'Schnell',weekend:'Wochenende'},modeHints={mixed:'Kurze und längere Gerichte gemischt · bis 3 Stunden Gesamtzeit',quick:'Höchstens 30 Minuten Gesamtzeit',weekend:'Zeit zum Kochen · bis 3 Stunden Gesamtzeit'};
try{var savedMode=localStorage.getItem('familienkueche-meal-ai-mode-v1');if(Object.prototype.hasOwnProperty.call(modeLabels,savedMode))chosenMode=savedMode;}catch(e){}
function modePicker(){return '<input type="hidden" name="mode" value="'+chosenMode+'"><div class="segmented ai-mode-picker" role="group" aria-label="Kochzeit auswählen">'+['mixed','quick','weekend'].map(function(m){return h.btn('meal-ai-mode',modeLabels[m],m===chosenMode?'selected':'','data-mode="'+m+'" aria-pressed="'+(m===chosenMode)+'"');}).join('')+'</div><p class="source-label" data-ai-mode-hint>'+modeHints[chosenMode]+'</p>';}
function changeMode(b){var f=document.getElementById('meal-ai-form'),m=b.getAttribute('data-mode');if(!f||busy||!Object.prototype.hasOwnProperty.call(modeLabels,m))return;chosenMode=m;f.elements.mode.value=m;Array.prototype.forEach.call(f.querySelectorAll('[data-action="meal-ai-mode"]'),function(x){var active=x.getAttribute('data-mode')===m;x.classList.toggle('selected',active);x.setAttribute('aria-pressed',String(active));});f.querySelector('[data-ai-mode-hint]').textContent=modeHints[m];try{localStorage.setItem('familienkueche-meal-ai-mode-v1',m);}catch(e){}}

function money(cents){return (cents/100).toFixed(2).replace('.',',')+' US-$';}
function results(data){
var r=data.result;if(!r)return '<p class="muted">Noch kein Probelauf gespeichert.</p>';
var expired=r.end<h.today(),html='<section class="ai-results"><h3>Zuletzt gefunden</h3><p class="source-label">'+h.esc(r.shop)+' · Angebote '+h.esc(h.fmt(r.start))+' – '+h.esc(h.fmt(r.end))+'</p>';
if(expired)html+='<p class="notice">Dieser Angebotszeitraum ist vorbei. Die Rezepte bleiben verwendbar.</p>';
html+='<p class="source-label">'+r.recipes.length+' unterschiedliche Vorschläge · Ziel: '+(r.targetCount||8)+'</p>'+((r.searchVersion||0)<4?'<p class="notice">Dieser Stand stammt aus der bisherigen Suche. Für die größere, abwechslungsreiche Auswahl bitte einen neuen Suchlauf starten.</p>':'');
html+='<p class="source-label">Kochzeit: '+h.esc(modeLabels[r.mode]||'Bisherige Suche')+'</p>';
html+='<details><summary>Erkannte Angebote prüfen</summary><ul>'+r.offers.map(function(x){return '<li>'+h.esc(x)+'</li>';}).join('')+'</ul></details><p class="source-label">KI-Auswertung: Preise, Mengen, Kochzeiten und Zutaten bitte am Original prüfen.</p>';
if((r.warnings||[]).length){html+='<details><summary>Hinweise zur Suche ('+r.warnings.length+')</summary>';r.warnings.forEach(function(x){html+='<p class="notice">'+h.esc(x)+'</p>';});html+='</details>';}
if(!r.recipes.length)html+='<p class="notice">Keine direkt importierbaren Rezepte gefunden. Ihr könnt zu den aktuellen Aldi-Lebensmitteln passende Chefkoch-Suchlisten öffnen. Dort die Gesamtzeit prüfen und einen Rezeptlink zum Import auswählen.</p><div data-ai-searches>'+h.btn('meal-ai-searches','Chefkoch-Suchen zu aktuellen Aldi-Zutaten anzeigen','sage')+'</div>';
html+='<div class="ai-recipe-grid">';r.recipes.forEach(function(x){html+='<article class="ai-recipe"><h3>'+h.esc(x.title)+'</h3><span class="recipe-mark">'+h.esc(x.minutes)+' Min. gesamt</span><span class="recipe-mark neutral">'+(typeof x.activeMinutes==='number'?h.esc(x.activeMinutes)+' Min. aktiv':'Arbeitszeit offen')+'</span><p>'+h.esc(x.reason)+'</p><p class="source-label">Passend: '+h.esc(x.matches.join(', '))+'</p><div class="row wrap"><a class="link" href="'+h.esc(x.url)+'" target="_blank" rel="noopener noreferrer">Originalrezept ↗</a>'+h.btn('meal-ai-import','In Mealie übernehmen','sage','data-url="'+h.esc(x.url)+'"')+'</div></article>';});
html+='</div><p class="source-label">Das verfügbare Rezeptfoto erscheint nach dem Import in eurer Sammlung. Von dort könnt ihr einplanen und Zutaten nach Bring übernehmen.</p>';
if(data.usage)html+='<p class="source-label">Letzter Lauf: '+h.esc(data.usage.input_tokens||0)+' Eingabetokens · '+h.esc(data.usage.output_tokens||0)+' Ausgabetokens · '+h.esc(data.usage.search_calls||0)+' Suchaufrufe. Verbindliche Kosten stehen im OpenAI-Projekt.</p>';
return html+'</section>';
}
function body(data){
var html='<p>Neue Gerichte für euren Geschmack finden. Ziel sind acht abwechslungsreiche Vorschläge; passende Aldi-Zutaten werden berücksichtigt.</p>';
var profile=data.profile||{preferred:['Nudeln','Eintöpfe','Pizza','Hähnchen'],avoid:['Nüsse','Erdnüsse']};html+='<p class="notice"><strong>Gerne:</strong> '+h.esc(profile.preferred.join(', ')||'Keine Vorgabe')+'<br><strong>Meiden:</strong> '+h.esc(profile.avoid.join(', ')||'Keine Vorgabe')+'</p>';
html+='<p class="source-label">Modell: '+h.esc(data.model)+' · Monatliches Kontingent: '+money(data.reservedCents)+' / '+money(data.budgetCents)+' reserviert.</p>';
if(!data.enabled)html+='<div class="notice">Zuerst in der Familienküche-App-Konfiguration „meal_ai_enabled“ aktivieren und die App neu starten.</div>';
else if(!data.configured)html+='<div class="notice">Der Schlüssel wurde noch nicht erkannt. In Home Assistants secrets.yaml muss „familienkueche_openai_api_key“ stehen. Danach die Familienküche-App neu starten.</div>';
else if(data.running||busy)html+='<p class="notice" role="status">Ein Probelauf läuft. Bitte später „Ergebnisse laden“ tippen.</p>';
else if(data.reservedCents+data.perRunCents>data.budgetCents)html+='<p class="notice">Monatliches Kontingent aufgebraucht. Vorhandene Ergebnisse bleiben verfügbar.</p>';
else{
 html+='<p class="source-label">Schlüssel lokal erkannt. Der OpenAI-Zugang wird erst beim Probelauf geprüft.</p><form id="meal-ai-form">'+modePicker()+'<div class="form-grid"><div class="form-field"><label for="ai-shop">Anbieter</label><select id="ai-shop" name="shop"><option>Aldi Nord</option><option>Aldi Süd</option></select></div><div class="form-field"><label for="ai-start">Angebote gültig ab</label><input id="ai-start" name="start" type="date" value="'+h.today()+'" required></div><div class="form-field"><label for="ai-end">Gültig bis</label><input id="ai-end" name="end" type="date" min="'+h.today()+'" value="'+h.plus(h.today(),6)+'" required></div><div class="form-field full"><div class="row wrap">'+h.btn('meal-ai-offers','Aldi-Angebote laden','sage','data-window="current"')+h.btn('meal-ai-offers','Kommende Angebote','','data-window="next"')+'</div><p data-ai-offers-status role="status">Aldi-Angebote kostenlos aus Home Assistant laden oder eigene Angebote einfügen.</p><label for="ai-offers">Ausgewählte Lebensmittel / eigener Angebotstext</label><textarea id="ai-offers" name="offers" maxlength="12000" rows="4" placeholder="Zum Beispiel Brokkoli, 500 g, 0,99 € …"></textarea></div></div>';
 html+='<p class="source-label">Alle Gerichte · Fleisch und Fisch sind erlaubt.</p><p class="notice">Beim Start werden die ausgewählten Zutaten, das Geschmacksprofil, die Kochzeit-Auswahl und der Zeitraum an OpenAI gesendet. Der Aufruf ist kostenpflichtig. Je Versuch reservieren wir vorsichtig '+money(data.perRunCents)+' im Kontingent, auch bei unklarer Antwort. Das ist keine Abrechnung; Preise und tatsächlicher Verbrauch können abweichen.</p><label class="row"><input name="confirm" type="checkbox" required> Diesen kostenpflichtigen Probelauf starten</label><p class="error" role="alert"></p><div class="modal-actions"><button class="primary" type="submit">Vorschläge finden</button></div></form>';
}
return html+'<div class="row wrap">'+h.btn('meal-ai-open','Ergebnisse laden')+'</div>'+results(data);
}
function open(){var seq=++serial;h.modal('Neue Ideen mit Wochenangeboten','<div id="meal-ai-dialog"><p role="status">Einrichtung und gespeicherte Ergebnisse werden geladen …</p></div>',true);var root=document.getElementById('meal-ai-dialog');h.api('GET','api/meal-ai',null,null,function(err,data){if(seq!==serial||!document.contains(root))return;if(err){root.innerHTML='<p class="notice error">'+h.esc(err.error)+'</p>'+h.btn('meal-ai-open','Erneut laden');return;}state=data;root.innerHTML=body(data);});}
function loadOffers(b){
var f=document.getElementById('meal-ai-form');if(!f||busy||f._aiOffersLoading)return;
if(f.elements.offers.value.trim()){if(!window.confirm('Vorhandene Angebotsauswahl durch Aldi-Lebensmittel ersetzen?'))return;}
var note=f.querySelector('[data-ai-offers-status]'),submit=f.querySelector('[type="submit"]');f._aiOffersLoading=true;submit.disabled=true;
note.textContent='Aldi-Angebote werden kostenlos geladen …';
h.api('GET','api/meal-ai/offers?window='+encodeURIComponent(b.getAttribute('data-window')),null,null,function(err,data){
 f._aiOffersLoading=false;if(!document.contains(f))return;submit.disabled=false;
 if(err){note.textContent=err.error;return;}
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
function submit(f){if(f.id!=='meal-ai-form')return false;if(busy||f._aiOffersLoading)return true;var el=f.elements,payload={shop:el.shop.value,start:el.start.value,end:el.end.value,offers:el.offers.value.trim(),mode:el.mode.value,vegetarian:false,confirm:el.confirm.checked};if(payload.offers.length<10){f.querySelector('.error').textContent='Bitte Aldi-Angebote laden oder mindestens 10 Zeichen Zutaten eingeben.';return true;}busy=true;var key='ai-'+h.uid()+'-'+h.uid();Array.prototype.forEach.call(f.querySelectorAll('input,textarea,select,button'),function(x){x.disabled=true;});f.querySelector('.error').textContent='Neue Rezeptideen werden gesucht …';h.api('POST','api/meal-ai/trial',payload,key,function(err,data){busy=false;if(err){if(document.contains(f))f.querySelector('.error').textContent=err.error+' Bitte „Ergebnisse laden“ verwenden.';else h.toast(err.error);return;}state=data;if(document.contains(f)){var root=document.getElementById('meal-ai-dialog');root.innerHTML='<p class="notice">'+(data.cached?'Gespeicherte Ergebnisse geladen – keine neue KI-Anfrage.':'Probelauf abgeschlossen.')+'</p>'+results(data)+h.btn('meal-ai-open','Zurück zum Probelauf');root.parentNode.scrollTop=0;}else h.toast('Die neuen Rezeptideen sind gespeichert.');});return true;}
return {open:open,submit:submit,action:function(a,b){if(a==='meal-ai-open')open();else if(a==='meal-ai-mode')changeMode(b);else if(a==='meal-ai-offers')loadOffers(b);else if(a==='meal-ai-searches')searches(b);else if(a==='meal-ai-import')h.importRecipe(b.getAttribute('data-url'));else return false;return true;}};
};
})();
