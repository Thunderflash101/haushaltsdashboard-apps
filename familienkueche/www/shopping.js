(function(){
'use strict';
window.createFamilyShopping=function(h){
var count={value:null,loading:false,last:0,seq:0};
var state={loaded:false,loading:false,busy:false,error:'',uncertain:false,lastAttempt:0,items:[],label:'Einkaufsliste',canAdd:false,canUpdate:false,canRemove:false,draft:'',fetchedAt:null},viewport={scroll:0,completed:false,focus:false,start:0,end:0};
// Each consecutive set of 16 products matches one local 4 × 4 photo sheet.
var products=[
    ['Äpfel', /\b(?:apfel|aepfel|tafelaepfel|tafelapfel)\b/],
    ['Bananen', /\bbananen?\b/],
    ['Tomaten', /\b(?:tomaten?|cherrytomaten|rispentomaten|cocktailtomaten)\b/],
    ['Möhren', /\b(?:moehren?|karotten?)\b/],
    ['Milch', /\b(?:milch|vollmilch|frischmilch|kuhmilch)\b/],
    ['Brot', /\b(?:brot|vollkornbrot|mischbrot|bauernbrot|roggenbrot|weizenbrot)\b/],
    ['Eier', /\b(?:ei|eier|huehnereier)\b/],
    ['Käse', /\b(?:kaese|schnittkaese|gouda|emmentaler)\b/],
    ['Kartoffeln', /\b(?:kartoffeln?|speisekartoffeln?|drillinge)\b/],
    ['Gurke', /\b(?:gurken?|salatgurken?)\b/],
    ['Paprika', /\b(?:paprikas?|paprikaschoten?)\b/],
    ['Brokkoli', /\b(?:brokkoli|broccoli)\b/],
    ['Hähnchenbrust', /\b(?:haehnchenbrust(?:filets?)?|huehnerbrust(?:filets?)?)\b/],
    ['Nudeln', /\b(?:nudeln?|bandnudeln?|pasta|tagliatelle|spaghetti|penne|fusilli)\b/],
    ['Reis', /\b(?:reis|basmatireis|jasminreis|langkornreis|vollkornreis)\b/],
    ['Butter', /\b(?:butter|markenbutter|suessrahmbutter)\b/],
    ['Birnen', /\bbirnen?\b/],
    ['Erdbeeren', /\berdbeeren?\b/],
    ['Weintrauben', /\b(?:weintrauben?|trauben?)\b/],
    ['Heidelbeeren', /\b(?:heidelbeeren?|blaubeeren?)\b/],
    ['Orangen', /\b(?:orangen?|apfelsinen?)\b/],
    ['Zitronen', /\bzitronen?\b/],
    ['Mandarinen', /\b(?:mandarinen?|clementinen?)\b/],
    ['Kiwi', /\bkiwis?\b/],
    ['Zwiebeln', /\b(?:zwiebeln?|speisezwiebeln?|gemuesezwiebeln?)\b/],
    ['Knoblauch', /\b(?:knoblauch|knoblauchzehen?)\b/],
    ['Champignons', /\bchampignons?\b/],
    ['Zucchini', /\bzucchinis?\b/],
    ['Blumenkohl', /\bblumenkohl\b/],
    ['Kopfsalat', /\b(?:kopfsalat|blattsalat)\b/],
    ['Radieschen', /\bradieschen\b/],
    ['Lauch', /\b(?:lauch|porree|lauchstangen?)\b/],
    ['Brötchen', /\b(?:broetchen|semmeln?)\b/],
    ['Toastbrot', /\b(?:toastbrot|toast|buttertoast)\b/],
    ['Croissants', /\bcroissants?\b/],
    ['Brezeln', /\b(?:brezeln?|brezen)\b/],
    ['Haferflocken', /\bhaferflocken\b/],
    ['Cornflakes', /\b(?:cornflakes|maisflakes)\b/],
    ['Erdbeermarmelade', /\b(?:erdbeermarmelade|erdbeerkonfituere)\b/],
    ['Honig', /\b(?:honig|bluetenhonig|bienenhonig)\b/],
    ['Naturjoghurt', /\b(?:naturjogh?urt|jogh?urt)\b/],
    ['Mozzarella', /\bmozzarella\b/],
    ['Kochschinken', /\b(?:kochschinken|hinterschinken)\b/],
    ['Salami', /\bsalami\b/],
    ['Lachsfilet', /\b(?:lachsfilets?|lachs)\b/],
    ['Wiener Würstchen', /\b(?:wiener(?: wuerstchen)?|wienerli|frankfurter wuerstchen)\b/],
    ['Erbsen', /\b(?:erbsen?|tiefkuehlerbsen)\b/],
    ['Mehl', /\b(?:mehl|weizenmehl|dinkelmehl)\b/],
    ['Zucker', /\b(?:zucker|haushaltszucker|kristallzucker)\b/],
    ['Pfeffer', /\b(?:pfeffer|pfefferkoerner)\b/],
    ['Salz', /\b(?:salz|speisesalz|jodsalz|meersalz)\b/],
    ['Sonnenblumenöl', /\bsonnenblumenoel\b/],
    ['Dosentomaten', /\b(?:dosentomaten|gehackte tomaten|stueckige tomaten|tomaten aus der dose)\b/],
    ['Tomatenmark', /\btomatenmark\b/],
    ['Mais', /\b(?:mais|zuckermais|dosenmais)\b/],
    ['Kidneybohnen', /\b(?:kidneybohnen?|kidney-bohnen?)\b/],
    ['Mineralwasser', /\b(?:mineralwasser|wasser|sprudelwasser)\b/],
    ['Orangensaft', /\b(?:orangensaft|o-saft)\b/],
    ['Apfelsaft', /\bapfelsaft\b/],
    ['Schokolade', /\b(?:schokolade|vollmilchschokolade|bitterschokolade)\b/],
    ['Toilettenpapier', /\b(?:toilettenpapier|klopapier)\b/],
    ['Küchenrolle', /\b(?:kuechenrollen?|kuechenpapier)\b/],
    ['Spülmittel', /\b(?:spuelmittel|geschirrspuelmittel)\b/],
    ['Zahnpasta', /\b(?:zahnpasta|zahncreme)\b/]
];
function productWords(name){
    return name.toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
}
function productFor(name){
    var words=productWords(name),best=-1,position=Infinity,length=0;
    products.forEach(function(product,index){
        var match=product[1].exec(words);
        if(match&&(match.index<position||(match.index===position&&match[0].length>length))){
            best=index;position=match.index;length=match[0].length;
        }
    });
    return best;
}
function productPicture(index){
    if(index<0)return '<span class="shop-picture shop-picture-other" aria-hidden="true">'+h.icon('cart')+'</span>';
    var sheet=Math.floor(index/16)+1,cell=index%16;
    var left=cell%4*100/3,top=Math.floor(cell/4)*100/3;
    return '<span class="shop-picture shop-product-photo shop-sheet-'+sheet+'" aria-hidden="true" style="background-position:'+left+'% '+top+'%"></span>';
}
var groups=[
    ['Obst',[0,1,16,17,18,19,20,21,22,23]],
    ['Gemüse',[3,2,8,9,10,11,24,25,26,27,28,29,30,31,46]],
    ['Frühstück',[5,32,33,34,35,36,37,38,39]],
    ['Kühlregal',[7,4,6,15,12,40,41,42,43,44,45]],
    ['Vorräte',[13,14,47,48,49,50,51,52,53,54,55,59]],
    ['Getränke',[57,56,58]],
    ['Haushalt',[60,61,62,63]]
];
function groupChoices(group){
    return groups[group][1].map(function(index){
        var name=products[index][0];
        var listed=state.items.some(function(entry){return !entry.done&&entry.name.trim().toLowerCase()===name.toLowerCase();});
        return h.btn('shopping-pick',productPicture(index)+'<span>'+name+'</span>','shop-choice','data-product="'+index+'"'+(listed?' disabled aria-label="'+name+' bereits auf der Liste"':''));
    }).join('');
}
function picturePicker(){
    if(blocked()||!state.loaded||!state.canAdd)return;
    var tabs=groups.map(function(group,index){
        return h.btn('shopping-group',productPicture(group[1][0])+'<span>'+group[0]+'</span>','shop-group',
            'data-group="'+index+'" aria-pressed="'+(index===0)+'"');
    }).join('');
    h.modal('Nach Bild hinzufügen','<div id="shopping-picture-picker"><div class="shop-groups" role="group" aria-label="Warengruppen">'+tabs+'</div><div class="shop-choices">'+groupChoices(0)+'</div><p class="error" role="alert"></p></div>');
}
function selectGroup(button){
    var index=Number(button.dataset.group),picker=document.getElementById('shopping-picture-picker');
    if(!picker||!groups[index]||blocked())return;
    picker.querySelectorAll('.shop-group').forEach(function(tab){tab.setAttribute('aria-pressed',String(tab===button));});
    picker.querySelector('.shop-choices').innerHTML=groupChoices(index);
}
function blocked(){return state.loading||state.busy||!!state.error||state.uncertain;}
function item(id){return state.items.filter(function(x){return x.id===id;})[0];}
function capture(){var panel=document.querySelector('.shopping-main');if(panel)viewport.scroll=panel.scrollTop;var details=document.querySelector('.shop-completed');if(details)viewport.completed=details.open;var input=document.getElementById('shopping-add-input');viewport.focus=!!input&&document.activeElement===input;if(input){state.draft=input.value;viewport.start=input.selectionStart;viewport.end=input.selectionEnd;}}
function restore(){var panel=document.querySelector('.shopping-main');if(panel)panel.scrollTop=viewport.scroll;var details=document.querySelector('.shop-completed');if(details)details.open=viewport.completed;var input=document.getElementById('shopping-add-input');if(input&&viewport.focus&&!input.disabled){input.focus();input.setSelectionRange(viewport.start,viewport.end);}}
function loadCount(force){if(count.loading||state.loading||state.busy||(!force&&Date.now()-count.last<30000))return;count.loading=true;count.last=Date.now();var seq=++count.seq;h.api('GET','api/shopping/count',null,null,function(err,result){count.loading=false;if(seq!==count.seq||err||!result||typeof result.count!=='number'||result.count<0||result.count%1!==0)return;if(count.value!==result.count){count.value=result.count;h.repaint();}});}
function load(force,done){if(state.loading||state.busy||(!force&&Date.now()-state.lastAttempt<30000))return;state.loading=true;count.seq++;state.lastAttempt=Date.now();h.repaint();h.api('GET','api/shopping',null,null,function(err,result){state.loading=false;if(!err&&(!result||!Array.isArray(result.items)))err={error:'Ungültige Einkaufslisten-Antwort.'};if(err)state.error=err.error;else{state.loaded=true;state.error='';state.uncertain=false;state.items=result.items;count.value=state.items.filter(function(x){return !x.done;}).length;state.label=result.label;state.canAdd=result.canAdd;state.canUpdate=result.canUpdate;state.canRemove=result.canRemove;state.fetchedAt=result.fetchedAt;}h.repaint();if(done)done(!err);});}
function badge(){return count.value===null?'—':String(count.value);}
function row(x,index){var disabled=blocked(),uid=h.esc(x.id);return '<div class="shop-item '+(x.done?'done':'')+'"><input type="checkbox" id="shopping-check-'+index+'" data-shopping-id="'+uid+'" aria-label="'+h.esc(x.name+(x.done?' wieder öffnen':' abhaken'))+'" '+(x.done?'checked ':'')+(disabled||!state.canUpdate?'disabled':'')+'><label for="shopping-check-'+index+'">'+productPicture(productFor(x.name))+'<span>'+h.esc(x.name)+(x.description?'<small class="shopping-description">'+h.esc(x.description)+'</small>':'')+'</span></label>'+h.btn('shopping-rename',h.icon('edit'),'shop-edit','data-id="'+uid+'" aria-label="'+h.esc(x.name)+' bearbeiten"'+(disabled||!state.canUpdate?' disabled':''))+h.btn('shopping-remove',h.icon('trash'),'shop-delete','data-id="'+uid+'" aria-label="'+h.esc(x.name)+' entfernen"'+(disabled||!state.canRemove?' disabled':''))+'</div>';}
function view(){var open=state.items.filter(function(x){return !x.done;}),done=state.items.filter(function(x){return x.done;}),off=blocked()||!state.loaded||!state.canAdd;var html='<div class="toolbar spread"><div><h2>'+h.esc(state.label)+'</h2><small>Gemeinsam in Home Assistant</small></div>'+'<div class="row wrap">'+h.btn('shopping-pictures',h.icon('cart')+' Nach Bild hinzufügen','sage',off?'disabled':'')+h.btn('shopping-refresh','Aktualisieren')+'</div></div><form id="shopping-add-form" class="input-bar"><input id="shopping-add-input" name="name" maxlength="200" required placeholder="Was fehlt noch? Zum Beispiel 2 Liter Milch" aria-label="Artikel hinzufügen" value="'+h.esc(state.draft)+'" '+(!state.loaded||!state.canAdd||state.busy?'disabled':'')+'><button type="submit" class="primary" '+(off?'disabled':'')+'>+ Hinzufügen</button></form>';
if(state.loading)html+='<p class="shopping-notice" role="status">Einkaufsliste wird geladen …</p>';if(state.busy)html+='<p class="shopping-notice" role="status">Änderung wird in Home Assistant gespeichert …</p>';if(state.error||state.uncertain)html+='<p class="shopping-notice error" role="alert">'+h.esc(state.error||'Ergebnis unklar. Bitte in Home Assistant prüfen und anschließend aktualisieren.')+(state.loaded?' · Letzter geladener Stand.':'')+'</p>';
html+='<div class="split"><section class="panel shopping-main"><div class="row spread"><h3>Noch einkaufen</h3><span>'+ (state.loaded?open.length+' offen':'…')+'</span></div>';
if(state.loaded&&!open.length)html+='<div class="empty"><h3>Alles im Wagen!</h3><p>Neue Artikel könnt ihr oben ergänzen.</p></div>';html+=open.map(row).join('');if(done.length)html+='<details class="shop-completed" '+(viewport.completed?'open':'')+'><summary>Erledigt ('+done.length+')</summary>'+done.map(function(x,i){return row(x,open.length+i);}).join('')+'</details>';html+='</section><aside class="panel shopping-side"><h2>Für euren Einkauf</h2><p>Artikel können hier und in Home Assistant ergänzt oder abgehakt werden.</p><p style="margin-top:15px">Abgehakte Artikel findet ihr unter „Erledigt“. Dort könnt ihr sie wieder auf die Liste setzen.</p><p class="source-label" style="margin-top:20px">'+(state.fetchedAt?'Letzter Abruf '+h.esc(new Date(state.fetchedAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})):'Noch nicht geladen')+'</p></aside></div>';return html;}
function write(data,f,done){if(blocked())return;var serialized=JSON.stringify(data),key;if(f){if(f.getAttribute('data-payload')!==serialized){f.setAttribute('data-payload',serialized);f.setAttribute('data-key','shopping-'+h.uid()+'-'+h.uid());}key=f.getAttribute('data-key');}else key='shopping-'+h.uid()+'-'+h.uid();state.busy=true;count.seq++;h.repaint();if(f&&document.contains(f)){var button=f.querySelector('[type="submit"]');if(button)button.disabled=true;var error=f.querySelector('.error');if(error)error.textContent='Wird gespeichert …';}h.api('POST','api/shopping/actions',data,key,function(err,result){state.busy=false;if(!err&&(!result||result.success!==true))err={error:'Ergebnis unklar. Bitte die Liste in Home Assistant prüfen.',uncertain:true};if(err){if(err.uncertain)state.uncertain=true;if(err.conflict||err.uncertain)state.error=err.error;h.repaint();if(f&&document.contains(f)){var error=f.querySelector('.error');if(error)error.textContent=err.error;var button=f.querySelector('[type="submit"]');if(button)button.disabled=!!(err.uncertain||err.conflict);}h.toast(err.error);return;}if(f&&f.id==='shopping-add-form'){state.draft='';var input=document.getElementById('shopping-add-input');if(input)input.value='';viewport.start=viewport.end=0;}else if(f&&document.contains(f))h.close();state.error='';load(true,function(ok){if(done)done(ok);});h.toast('Einkaufsliste in Home Assistant aktualisiert.');});}
function rename(id){var x=item(id);if(!x||blocked())return;h.modal('Artikel bearbeiten','<form id="shopping-rename-form"><input type="hidden" name="id" value="'+h.esc(x.id)+'"><input type="hidden" name="revision" value="'+x.revision+'"><div class="form-field full"><label for="shopping-name">Artikel</label><input id="shopping-name" name="name" maxlength="200" required value="'+h.esc(x.name)+'"></div><div class="error" role="alert"></div><div class="modal-actions">'+h.btn('close','Abbrechen')+'<button class="primary" type="submit">Speichern</button></div></form>');}
function remove(id){var x=item(id);if(!x||blocked())return;h.modal('Artikel entfernen?','<p>'+h.esc(x.name)+'</p><form id="shopping-remove-form"><input type="hidden" name="id" value="'+h.esc(x.id)+'"><input type="hidden" name="revision" value="'+x.revision+'"><p class="notice">Der Artikel wird aus der gemeinsamen Home-Assistant-Liste entfernt.</p><div class="error" role="alert"></div><div class="modal-actions">'+h.btn('close','Abbrechen')+'<button type="submit" class="primary">Entfernen</button></div></form>');}
function submit(f){var el=f.elements;if(f.id==='shopping-add-form'){var name=el.name.value.trim();if(name)write({action:'add',name:name},f,function(ok){if(ok){var input=document.getElementById('shopping-add-input');if(input)input.focus();}});return true;}if(f.id==='shopping-rename-form'){write({action:'rename',id:el.id.value,revision:el.revision.value,name:el.name.value.trim()},f);return true;}if(f.id==='shopping-remove-form'){write({action:'remove',id:el.id.value,revision:el.revision.value},f);return true;}return false;}
function action(a,b){if(a==='shopping-pictures')picturePicker();
else if(a==='shopping-group')selectGroup(b);
else if(a==='shopping-pick'){
    var choice=products[Number(b.dataset.product)],picker=document.getElementById('shopping-picture-picker');
    if(choice&&picker&&picker.contains(b)&&!b.disabled&&state.canAdd)write({action:'add',name:choice[0]},picker);
}else if(a==='shopping-refresh')load(true);else if(a==='shopping-rename')rename(b.getAttribute('data-id'));else if(a==='shopping-remove')remove(b.getAttribute('data-id'));else return false;return true;}
function change(target){var id=target.getAttribute('data-shopping-id');if(!id)return false;var x=item(id),desired=target.checked;if(x){target.checked=x.done;write({action:'status',id:x.id,revision:x.revision,done:desired});}return true;}
return {view:view,badge:badge,submit:submit,action:action,change:change,capture:capture,restore:restore,ensure:function(){if(h.screen&&h.screen()!=='shopping')loadCount(false);else load(false);},refresh:function(){if(h.screen&&h.screen()!=='shopping')loadCount(true);else load(true);}};
};
})();
