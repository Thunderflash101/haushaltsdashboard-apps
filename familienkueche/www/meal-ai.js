(function(){
'use strict';
window.createFamilyMealAI=function(h){
var state=null,busy=false,serial=0;
function money(cents){return (cents/100).toFixed(2).replace('.',',')+' US-$';}
function results(data){
var r=data.result;if(!r)return '<p class="muted">Noch kein Probelauf gespeichert.</p>';
var expired=r.end<h.today(),html='<section class="ai-results"><h3>Zuletzt gefunden</h3><p class="source-label">'+h.esc(r.shop)+' · Angebote '+h.esc(h.fmt(r.start))+' – '+h.esc(h.fmt(r.end))+'</p>';
if(expired)html+='<p class="notice">Dieser Angebotszeitraum ist vorbei. Die Rezepte bleiben verwendbar.</p>';
html+='<details><summary>Erkannte Angebote prüfen</summary><ul>'+r.offers.map(function(x){return '<li>'+h.esc(x)+'</li>';}).join('')+'</ul></details><p class="source-label">KI-Auswertung: Preise, Mengen, Kochzeiten und vegetarische Zutaten bitte am Original prüfen.</p>';
(r.warnings||[]).forEach(function(x){html+='<p class="notice">'+h.esc(x)+'</p>';});
html+='<div class="ai-recipe-grid">';r.recipes.forEach(function(x){html+='<article class="ai-recipe"><h3>'+h.esc(x.title)+'</h3><span class="recipe-mark">'+h.esc(x.minutes)+' Min.</span><p>'+h.esc(x.reason)+'</p><p class="source-label">Passend: '+h.esc(x.matches.join(', '))+'</p><div class="row wrap"><a class="link" href="'+h.esc(x.url)+'" target="_blank" rel="noopener noreferrer">Originalrezept ↗</a>'+h.btn('meal-ai-import','In Mealie übernehmen','sage','data-url="'+h.esc(x.url)+'"')+'</div></article>';});
html+='</div><p class="source-label">Das verfügbare Rezeptfoto erscheint nach dem Import in eurer Sammlung. Von dort könnt ihr einplanen und Zutaten nach Bring übernehmen.</p>';
if(data.usage)html+='<p class="source-label">Letzter Lauf: '+h.esc(data.usage.input_tokens||0)+' Eingabetokens · '+h.esc(data.usage.output_tokens||0)+' Ausgabetokens · '+h.esc(data.usage.search_calls||0)+' Suchaufrufe. Verbindliche Kosten stehen im OpenAI-Projekt.</p>';
return html+'</section>';
}
function body(data){
var html='<p>Neue schnelle Gerichte passend zu euren Angeboten finden. Ein Probelauf sucht bis zu fünf Chefkoch-Rezepte mit höchstens 30 Minuten Gesamtzeit.</p>';
html+='<p class="source-label">Modell: '+h.esc(data.model)+' · Monatliches Kontingent: '+money(data.reservedCents)+' / '+money(data.budgetCents)+' reserviert.</p>';
if(!data.enabled)html+='<div class="notice">Zuerst in der Familienküche-App-Konfiguration „meal_ai_enabled“ aktivieren und die App neu starten.</div>';
else if(!data.configured)html+='<div class="notice">Der Schlüssel wurde noch nicht erkannt. In Home Assistants secrets.yaml muss „familienkueche_openai_api_key“ stehen. Danach die Familienküche-App neu starten.</div>';
else if(data.running||busy)html+='<p class="notice" role="status">Ein Probelauf läuft. Bitte später „Ergebnisse laden“ tippen.</p>';
else if(data.reservedCents+data.perRunCents>data.budgetCents)html+='<p class="notice">Monatliches Kontingent aufgebraucht. Vorhandene Ergebnisse bleiben verfügbar.</p>';
else{
 html+='<p class="source-label">Schlüssel lokal erkannt. Der OpenAI-Zugang wird erst beim Probelauf geprüft.</p><form id="meal-ai-form"><div class="form-grid"><div class="form-field"><label for="ai-shop">Prospekt</label><select id="ai-shop" name="shop"><option>Aldi Nord</option><option>Aldi Süd</option></select></div><div class="form-field"><label for="ai-start">Angebote gültig ab</label><input id="ai-start" name="start" type="date" value="'+h.today()+'" required></div><div class="form-field"><label for="ai-end">Gültig bis</label><input id="ai-end" name="end" type="date" min="'+h.today()+'" value="'+h.plus(h.today(),6)+'" required></div><div class="form-field full"><label for="ai-offers">Angebote als Text (oder ein Bild auswählen)</label><textarea id="ai-offers" name="offers" maxlength="12000" rows="4" placeholder="Zum Beispiel Brokkoli, 500 g, 0,99 € …"></textarea></div></div>';
 html+='<div class="photo-file-picker"><label for="ai-image">Prospektseite auswählen</label><input id="ai-image" type="file" accept="image/*"></div><p class="source-label">Eine gut lesbare Seite oder ein Ausschnitt · JPEG, PNG oder WebP. PDFs und automatischer Prospektabruf folgen später.</p><p data-ai-image-status role="status">Kein Bild ausgewählt.</p><label class="row"><input name="vegetarian" type="checkbox"> Nur vegetarische Vorschläge</label><p class="notice">Beim Start werden Angebotstext/Bild, Zeitraum und Filter an OpenAI gesendet. Der Aufruf ist kostenpflichtig. Je Versuch reservieren wir vorsichtig '+money(data.perRunCents)+' im Kontingent, auch bei unklarer Antwort. Das ist keine Abrechnung; Preise und tatsächlicher Verbrauch können abweichen.</p><label class="row"><input name="confirm" type="checkbox" required> Diesen kostenpflichtigen Probelauf starten</label><p class="error" role="alert"></p><div class="modal-actions"><button class="primary" type="submit">Vorschläge finden</button></div></form>';
}
return html+'<div class="row wrap">'+h.btn('meal-ai-open','Ergebnisse laden')+'</div>'+results(data);
}
function attachImage(root){
var f=root.querySelector('#meal-ai-form');if(!f)return;
var input=f.querySelector('#ai-image'),label=f.querySelector('[data-ai-image-status]'),button=f.querySelector('[type="submit"]');
f._aiImage='';input.onchange=function(ev){if(ev)ev.stopPropagation();var file=input.files&&input.files[0];if(!file)return;f._aiImage='';f._aiPreparing=true;button.disabled=true;input.disabled=true;label.textContent=file.name+' · Wird vorbereitet …';
 h.upload(file,function(message){label.textContent=file.name+' · '+(message.indexOf('gespeichert')>=0?'Wird vorbereitet …':message);},function(error){f._aiPreparing=false;button.disabled=false;input.disabled=false;label.textContent=error||file.name+' · Bereit. Erst beim Start an OpenAI senden.';},function(encoded,name,done){f._aiImage=encoded;done(null);});
};
}
function open(){var seq=++serial;h.modal('Neue Ideen mit Wochenangeboten','<div id="meal-ai-dialog"><p role="status">Einrichtung und gespeicherte Ergebnisse werden geladen …</p></div>',true);var root=document.getElementById('meal-ai-dialog');h.api('GET','api/meal-ai',null,null,function(err,data){if(seq!==serial||!document.contains(root))return;if(err){root.innerHTML='<p class="notice error">'+h.esc(err.error)+'</p>'+h.btn('meal-ai-open','Erneut laden');return;}state=data;root.innerHTML=body(data);attachImage(root);});}
function submit(f){if(f.id!=='meal-ai-form')return false;if(busy||f._aiPreparing)return true;var el=f.elements,payload={shop:el.shop.value,start:el.start.value,end:el.end.value,offers:el.offers.value.trim(),image:f._aiImage||'',vegetarian:el.vegetarian.checked,confirm:el.confirm.checked};if(!payload.image&&payload.offers.length<10){f.querySelector('.error').textContent='Bitte eine Prospektseite oder mindestens 10 Zeichen Angebotstext hinzufügen.';return true;}busy=true;var key='ai-'+h.uid()+'-'+h.uid();Array.prototype.forEach.call(f.querySelectorAll('input,textarea,select,button'),function(x){x.disabled=true;});f.querySelector('.error').textContent='Neue Rezeptideen werden gesucht …';h.api('POST','api/meal-ai/trial',payload,key,function(err,data){busy=false;if(err){if(document.contains(f))f.querySelector('.error').textContent=err.error+' Bitte „Ergebnisse laden“ verwenden.';else h.toast(err.error);return;}state=data;if(document.contains(f)){var root=document.getElementById('meal-ai-dialog');root.innerHTML='<p class="notice">'+(data.cached?'Gespeicherte Ergebnisse geladen – keine neue KI-Anfrage.':'Probelauf abgeschlossen.')+'</p>'+results(data)+h.btn('meal-ai-open','Zurück zum Probelauf');root.parentNode.scrollTop=0;}else h.toast('Die neuen Rezeptideen sind gespeichert.');});return true;}
return {open:open,submit:submit,action:function(a,b){if(a==='meal-ai-open')open();else if(a==='meal-ai-import')h.importRecipe(b.getAttribute('data-url'));else return false;return true;}};
};
})();
