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
    ['Zahnpasta', /\b(?:zahnpasta|zahncreme)\b/],
    ['Mango', /\b(?:mangos?)\b/],
    ['Ananas', /\b(?:ananas)\b/],
    ['Wassermelone', /\b(?:wassermelonen?)\b/],
    ['Pfirsiche', /\b(?:pfirsiche?)\b/],
    ['Kirschen', /\b(?:kirschen?)\b/],
    ['Himbeeren', /\b(?:himbeeren?)\b/],
    ['Pflaumen', /\b(?:pflaumen?)\b/],
    ['Aprikosen', /\b(?:aprikosen?)\b/],
    ['Avocado', /\b(?:avocados?)\b/],
    ['Limetten', /\b(?:limetten?)\b/],
    ['Süßkartoffeln', /\b(?:suesskartoffeln?)\b/],
    ['Auberginen', /\b(?:auberginen?)\b/],
    ['Spinat', /\b(?:spinat)\b/],
    ['Sellerie', /\b(?:(?:stangen|stauden)?sellerie)\b/],
    ['Rote Bete', /\b(?:rote beete|rote bete)\b/],
    ['Kürbis', /\b(?:kuerbis)\b/],
    ['Quark', /\b(?:quark)\b/],
    ['Sahne', /\b(?:sahne|schlagsahne)\b/],
    ['Frischkäse', /\b(?:frischkaese)\b/],
    ['Feta', /\b(?:feta|schafskaese)\b/],
    ['Parmesan', /\b(?:parmesan)\b/],
    ['Camembert', /\b(?:camembert)\b/],
    ['Hüttenkäse', /\b(?:huettenkaese|koerniger frischkaese)\b/],
    ['Pudding', /\b(?:pudding)\b/],
    ['Bagel', /\b(?:bagels?)\b/],
    ['Knäckebrot', /\b(?:knaeckebrot)\b/],
    ['Baguette', /\b(?:baguette)\b/],
    ['Rosinenbrötchen', /\b(?:rosinenbroetchen|rosinensemmeln)\b/],
    ['Müsli', /\b(?:muesli)\b/],
    ['Nusscreme', /\b(?:nusscreme|nuss-nougat-creme)\b/],
    ['Erdnussbutter', /\b(?:erdnussbutter)\b/],
    ['Ahornsirup', /\b(?:ahornsirup)\b/],
    ['Linsen', /\b(?:linsen?)\b/],
    ['Kichererbsen', /\b(?:kichererbsen?)\b/],
    ['Couscous', /\b(?:couscous)\b/],
    ['Lasagneplatten', /\b(?:lasagneplatten?)\b/],
    ['Backpulver', /\b(?:backpulver)\b/],
    ['Hefe', /\b(?:hefe|frischhefe)\b/],
    ['Paniermehl', /\b(?:paniermehl|semmelbroesel)\b/],
    ['Olivenöl', /\b(?:olivenoel)\b/],
    ['Essig', /\b(?:essig|apfelessig|weinessig)\b/],
    ['Ketchup', /\b(?:ketchup)\b/],
    ['Senf', /\b(?:senf)\b/],
    ['Mayonnaise', /\b(?:mayonnaise|mayo)\b/],
    ['Pesto', /\b(?:pesto)\b/],
    ['Gewürzgurken', /\b(?:gewuerzgurken?|essiggurken?)\b/],
    ['Apfelmus', /\b(?:apfelmus)\b/],
    ['Kokosmilch', /\b(?:kokosmilch)\b/],
    ['Kakao', /\b(?:kakao)\b/],
    ['Haferdrink', /\b(?:haferdrink|hafermilch)\b/],
    ['Traubensaft', /\b(?:traubensaft)\b/],
    ['Multivitaminsaft', /\b(?:multivitaminsaft)\b/],
    ['Apfelschorle', /\b(?:apfelschorle)\b/],
    ['Limonade', /\b(?:limonade)\b/],
    ['Kaffee', /\b(?:kaffee|kaffeebohnen)\b/],
    ['Tee', /\b(?:tee)\b/],
    ['Tiefkühlpizza', /\b(?:tiefkuehlpizza|tk[ -]pizza|tiefkuehl[ -]pizza)\b/],
    ['Pommes', /\b(?:pommes(?: frites)?)\b/],
    ['Fischstäbchen', /\b(?:fischstaebchen)\b/],
    ['Chicken-Nuggets', /\b(?:chicken[ -]?nuggets?|haehnchennuggets?)\b/],
    ['Rahmspinat', /\b(?:rahmspinat)\b/],
    ['Beerenmischung', /\b(?:(?:tk[ -])?beerenmischung)\b/],
    ['Vanilleeis', /\b(?:vanilleeis)\b/],
    ['Eis am Stiel', /\b(?:eis am stiel)\b/],
    ['Zahnbürste', /\b(?:zahnbuersten?)\b/],
    ['Shampoo', /\b(?:shampoo)\b/],
    ['Duschgel', /\b(?:duschgel)\b/],
    ['Seife', /\b(?:seife)\b/],
    ['Handcreme', /\b(?:handcreme)\b/],
    ['Sonnencreme', /\b(?:sonnencreme)\b/],
    ['Pflaster', /\b(?:pflaster|heftpflaster)\b/],
    ['Taschentücher', /\b(?:taschentuecher?)\b/],
    ['Windeln', /\b(?:windeln?)\b/],
    ['Feuchttücher', /\b(?:feuchttuecher?)\b/],
    ['Waschmittel', /\b(?:waschmittel)\b/],
    ['Spültabs', /\b(?:spueltabs|geschirrspueltabs)\b/],
    ['Müllbeutel', /\b(?:muellbeutel|muellsaecke)\b/],
    ['Schwämme', /\b(?:schwaemme|schwamm|spuelschwaemme)\b/],
    ['Backpapier', /\b(?:backpapier)\b/],
    ['Alufolie', /\b(?:alufolie|aluminiumfolie)\b/],
    ['Salzstangen', /\b(?:salzstangen?)\b/],
    ['Popcorn', /\b(?:popcorn)\b/],
    ['Kartoffelchips', /\b(?:kartoffelchips|chips)\b/],
    ['Reiswaffeln', /\b(?:reiswaffeln?)\b/],
    ['Butterkekse', /\b(?:butterkekse?)\b/],
    ['Gummibärchen', /\b(?:gummibaerchen|gummibaeren)\b/],
    ['Rosinen', /\b(?:rosinen?)\b/],
    ['Studentenfutter', /\b(?:studentenfutter)\b/],
    ['Hackfleisch', /\b(?:hackfleisch|rinderhack|hackfleisch gemischt)\b/],
    ['Bratwurst', /\b(?:bratwurst|bratwuerste)\b/],
    ['Speck', /\b(?:speck|bacon)\b/],
    ['Tofu', /\b(?:tofu)\b/],
    ['Tortillas', /\b(?:tortillas?|wraps?)\b/],
    ['Gnocchi', /\b(?:gnocchi)\b/],
    ['Tortellini', /\b(?:tortellini)\b/],
    ['Falafel', /\b(?:falafeln?)\b/]
];
function productWords(name){
    return name.toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
}
var photoByName=new Map();
function productFor(name){
    if(typeof name!=='string')return -1;
    if(photoByName.has(name))return photoByName.get(name);
    var words=productWords(name),best=-1,position=Infinity,length=0;
    products.forEach(function(product,index){
        var match=product[1].exec(words);
        if(match&&(match.index<position||(match.index===position&&match[0].length>length))){
            best=index;position=match.index;length=match[0].length;
        }
    });
    photoByName.set(name,best);
    return best;
}
function productPicture(index){
    if(index<0)return '<span class="shop-picture shop-picture-other" aria-hidden="true">'+h.icon('cart')+'</span>';
    var sheet=Math.floor(index/16)+1,cell=index%16;
    var left=cell%4*100/3,top=Math.floor(cell/4)*100/3;
    return '<span class="shop-picture shop-product-photo shop-sheet-'+sheet+'" aria-hidden="true" style="background-position:'+left+'% '+top+'%"></span>';
}
var groups=[
    ['Obst',[0,1,16,17,18,19,20,21,22,23,64,65,66,67,68,69,70,71,72,73]],
    ['Gemüse',[3,2,8,9,10,11,24,25,26,27,28,29,30,31,46,74,75,76,77,78,79]],
    ['Frühstück',[5,32,33,34,35,36,37,38,39,88,89,90,91,92,93,94,95]],
    ['Kühlregal',[7,4,6,15,12,40,41,42,43,44,45,80,81,82,83,84,85,86,87,152,153,154,155,157,158,159]],
    ['Vorräte',[13,14,47,48,49,50,51,52,53,54,55,59,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,156]],
    ['Getränke',[57,56,58,112,113,114,115,116,117,118,119]],
    ['Tiefkühlung',[120,121,122,123,124,125,126,127]],
    ['Snacks',[144,145,146,147,148,149,150,151]],
    ['Drogerie',[128,129,130,131,132,133,134,135,136,137]],
    ['Haushalt',[60,61,62,63,138,139,140,141,142,143]]
];
var openPictures={},frequent=[],pickerConfirmed={};
function updatePictureIndex(result){
    photoByName.clear();
    openPictures={};
    result.items.forEach(function(entry){
        if(!entry.done){
            var index=productFor(entry.name);
            if(index>=0){openPictures[index]=true;delete pickerConfirmed[index];}
        }
    });
    var scores={};
    (result.purchases||[]).forEach(function(entry){
        var index=productFor(entry.name);
        if(index>=0)scores[index]=(scores[index]||0)+entry.count;
    });
    frequent=Object.keys(scores).map(Number).sort(function(a,b){return scores[b]-scores[a]||a-b;}).slice(0,4);
}
function choiceGrid(indices){
    return '<div class="shop-choices">'+indices.map(function(index){
        var name=products[index][0];
        return h.btn('shopping-pick',productPicture(index)+'<span>'+name+'</span><span aria-hidden="true" class="shop-tick">✓</span>',
            'shop-choice','data-product="'+index+'"');
    }).join('')+'</div>';
}
function syncPicker(message){
    var picker=document.getElementById('shopping-picture-picker');
    if(!picker)return;
    picker.querySelectorAll('.shop-choice').forEach(function(button){
        var index=button.dataset.product,listed=!!(openPictures[index]||pickerConfirmed[index]);
        button.disabled=listed||blocked()||!state.canAdd;
        button.classList.toggle('on-list',listed);
        button.setAttribute('aria-label',products[index][0]+(listed?' – auf der Liste':' hinzufügen'));
    });
    if(picker.dataset.pending)picker.querySelector('.shop-picker-status').textContent=products[picker.dataset.pending][0]+' wird hinzugefügt …';
    picker.querySelector('.error').textContent=message||state.error||'';
    picker.querySelector('[data-action="shopping-refresh"]').hidden=!state.error;
}
function showPicturePage(group){
    var picker=document.getElementById('shopping-picture-picker');
    if(!picker||(group!==-1&&!groups[group]))return;
    var content=picker.querySelector('.shop-picker-body'),home=group===-1;
    var previous=picker.dataset.group;
    picker.dataset.group=String(group);
    var back=picker.querySelector('[data-action="shopping-groups"]');
    back.hidden=home;
    picker.querySelector('.shop-page-title').textContent=home?'':groups[group][0];
    if(home){
        var tiles=groups.map(function(entry,index){
            return h.btn('shopping-group',productPicture(entry[1][0])+'<span>'+entry[0]+'</span>','shop-group','data-group="'+index+'"');
        });
        content.innerHTML=(frequent.length?'<h3>Oft gekauft</h3>'+choiceGrid(frequent):'')+
            '<h3>Warengruppen</h3><div class="shop-groups">'+tiles.join('')+'</div>';
    }else{
        content.innerHTML=choiceGrid(groups[group][1]);
    }
    content.scrollTop=0;
    syncPicker();
    if(!home)back.focus();
    else if(previous&&previous!=='-1')content.querySelector('[data-group="'+previous+'"]').focus();
}
function picturePicker(){
    if(blocked()||!state.loaded||!state.canAdd)return;
    pickerConfirmed={};
    h.modal('Nach Bild hinzufügen','<div id="shopping-picture-picker">'+
        '<div class="shop-picker-nav">'+h.btn('shopping-groups','← Gruppen','','hidden')+'<h3 class="shop-page-title"></h3></div>'+
        '<div class="shop-picker-body"></div><div class="shop-picker-footer"><div><span class="shop-picker-status" role="status"></span>'+
        '<span class="error" role="alert"></span></div>'+h.btn('shopping-refresh','Aktualisieren','','hidden')+h.btn('close','Fertig ✓','sage')+'</div></div>',true);
    document.getElementById('shopping-picture-picker').parentNode.classList.add('shopping-picker-modal');
    showPicturePage(-1);
}
function blocked(){return state.loading||state.busy||!!state.error||state.uncertain;}
function item(id){return state.items.filter(function(x){return x.id===id;})[0];}
function capture(){var panel=document.querySelector('.shopping-main');if(panel)viewport.scroll=panel.scrollTop;var details=document.querySelector('.shop-completed');if(details)viewport.completed=details.open;var input=document.getElementById('shopping-add-input');viewport.focus=!!input&&document.activeElement===input;if(input){state.draft=input.value;viewport.start=input.selectionStart;viewport.end=input.selectionEnd;}}
function restore(){var panel=document.querySelector('.shopping-main');if(panel)panel.scrollTop=viewport.scroll;var details=document.querySelector('.shop-completed');if(details)details.open=viewport.completed;var input=document.getElementById('shopping-add-input');if(input&&viewport.focus&&!input.disabled){input.focus();input.setSelectionRange(viewport.start,viewport.end);}}
function loadCount(force){if(count.loading||state.loading||state.busy||(!force&&Date.now()-count.last<30000))return;count.loading=true;count.last=Date.now();var seq=++count.seq;h.api('GET','api/shopping/count',null,null,function(err,result){count.loading=false;if(seq!==count.seq||err||!result||typeof result.count!=='number'||result.count<0||result.count%1!==0)return;if(count.value!==result.count){count.value=result.count;h.repaint();}});}
function load(force,done){if(state.loading||state.busy||(!force&&Date.now()-state.lastAttempt<30000))return;state.loading=true;count.seq++;state.lastAttempt=Date.now();h.repaint();h.api('GET','api/shopping',null,null,function(err,result){state.loading=false;if(!err&&(!result||!Array.isArray(result.items)))err={error:'Ungültige Einkaufslisten-Antwort.'};if(err)state.error=err.error;else{state.loaded=true;state.error='';state.uncertain=false;state.items=result.items;updatePictureIndex(result);count.value=state.items.filter(function(x){return !x.done;}).length;state.label=result.label;state.canAdd=result.canAdd;state.canUpdate=result.canUpdate;state.canRemove=result.canRemove;state.fetchedAt=result.fetchedAt;}h.repaint();syncPicker();if(done)done(!err);});}
function badge(){return count.value===null?'—':String(count.value);}
function row(x,index){var disabled=blocked(),uid=h.esc(x.id);return '<div class="shop-item '+(x.done?'done':'')+'"><input type="checkbox" id="shopping-check-'+index+'" data-shopping-id="'+uid+'" aria-label="'+h.esc(x.name+(x.done?' wieder öffnen':' abhaken'))+'" '+(x.done?'checked ':'')+(disabled||!state.canUpdate?'disabled':'')+'><label for="shopping-check-'+index+'">'+productPicture(productFor(x.name))+'<span>'+h.esc(x.name)+(x.description?'<small class="shopping-description">'+h.esc(x.description)+'</small>':'')+'</span></label>'+h.btn('shopping-rename',h.icon('edit'),'shop-edit','data-id="'+uid+'" aria-label="'+h.esc(x.name)+' bearbeiten"'+(disabled||!state.canUpdate?' disabled':''))+h.btn('shopping-remove',h.icon('trash'),'shop-delete','data-id="'+uid+'" aria-label="'+h.esc(x.name)+' entfernen"'+(disabled||!state.canRemove?' disabled':''))+'</div>';}
function view(){var open=state.items.filter(function(x){return !x.done;}),done=state.items.filter(function(x){return x.done;}),off=blocked()||!state.loaded||!state.canAdd;var html='<div class="toolbar spread"><div><h2>'+h.esc(state.label)+'</h2><small>Gemeinsam in Home Assistant</small></div>'+'<div class="row wrap">'+h.btn('shopping-pictures',h.icon('cart')+' Nach Bild hinzufügen','sage',off?'disabled':'')+h.btn('shopping-refresh','Aktualisieren')+'</div></div><form id="shopping-add-form" class="input-bar"><input id="shopping-add-input" name="name" maxlength="200" required placeholder="Was fehlt noch? Zum Beispiel 2 Liter Milch" aria-label="Artikel hinzufügen" value="'+h.esc(state.draft)+'" '+(!state.loaded||!state.canAdd||state.busy?'disabled':'')+'><button type="submit" class="primary" '+(off?'disabled':'')+'>+ Hinzufügen</button></form>';
if(state.loading)html+='<p class="shopping-notice" role="status">Einkaufsliste wird geladen …</p>';if(state.busy)html+='<p class="shopping-notice" role="status">Änderung wird in Home Assistant gespeichert …</p>';if(state.error||state.uncertain)html+='<p class="shopping-notice error" role="alert">'+h.esc(state.error||'Ergebnis unklar. Bitte in Home Assistant prüfen und anschließend aktualisieren.')+(state.loaded?' · Letzter geladener Stand.':'')+'</p>';
html+='<div class="split"><section class="panel shopping-main"><div class="row spread"><h3>Noch einkaufen</h3><span>'+ (state.loaded?open.length+' offen':'…')+'</span></div>';
if(state.loaded&&!open.length)html+='<div class="empty"><h3>Alles im Wagen!</h3><p>Neue Artikel könnt ihr oben ergänzen.</p></div>';html+=open.map(row).join('');if(done.length)html+='<details class="shop-completed" '+(viewport.completed?'open':'')+'><summary>Erledigt ('+done.length+')</summary>'+done.map(function(x,i){return row(x,open.length+i);}).join('')+'</details>';html+='</section><aside class="panel shopping-side"><h2>Für euren Einkauf</h2><p>Artikel können hier und in Home Assistant ergänzt oder abgehakt werden.</p><p style="margin-top:15px">Abgehakte Artikel findet ihr unter „Erledigt“. Dort könnt ihr sie wieder auf die Liste setzen.</p><p class="source-label" style="margin-top:20px">'+(state.fetchedAt?'Letzter Abruf '+h.esc(new Date(state.fetchedAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})):'Noch nicht geladen')+'</p></aside></div>';return html;}
function write(data,f,done){if(blocked())return;var serialized=JSON.stringify(data),key;if(f){if(f.getAttribute('data-payload')!==serialized){f.setAttribute('data-payload',serialized);f.setAttribute('data-key','shopping-'+h.uid()+'-'+h.uid());}key=f.getAttribute('data-key');}else key='shopping-'+h.uid()+'-'+h.uid();state.busy=true;count.seq++;h.repaint();syncPicker();if(f&&document.contains(f)){var button=f.querySelector('[type="submit"]');if(button)button.disabled=true;var error=f.querySelector('.error');if(error&&f.id!=='shopping-picture-picker')error.textContent='Wird gespeichert …';}h.api('POST','api/shopping/actions',data,key,function(err,result){state.busy=false;if(!err&&(!result||result.success!==true))err={error:'Ergebnis unklar. Bitte die Liste in Home Assistant prüfen.',uncertain:true};if(err){if(err.uncertain)state.uncertain=true;if(err.conflict||err.uncertain)state.error=err.error;h.repaint();if(f&&document.contains(f)){var error=f.querySelector('.error');if(error)error.textContent=err.error;var button=f.querySelector('[type="submit"]');if(button)button.disabled=!!(err.uncertain||err.conflict);}if(f&&f.id==='shopping-picture-picker'){delete f.dataset.pending;f.querySelector('.shop-picker-status').textContent='';syncPicker(err.error);}h.toast(err.error);return;}if(f&&f.id==='shopping-add-form'){state.draft='';var input=document.getElementById('shopping-add-input');if(input)input.value='';viewport.start=viewport.end=0;}else if(f&&f.id==='shopping-picture-picker'){
    if(document.contains(f)){
        var index=f.dataset.pending;
        f.querySelector('.shop-picker-status').textContent=data.name+' hinzugefügt.';
        delete f.dataset.pending;
        f.removeAttribute('data-payload');
        pickerConfirmed[index]=true;
    }
}else if(f&&document.contains(f))h.close();state.error='';load(true,function(ok){if(done)done(ok);});if(!f||f.id!=='shopping-picture-picker'||!document.contains(f))h.toast('Einkaufsliste in Home Assistant aktualisiert.');});}
function rename(id){var x=item(id);if(!x||blocked())return;h.modal('Artikel bearbeiten','<form id="shopping-rename-form"><input type="hidden" name="id" value="'+h.esc(x.id)+'"><input type="hidden" name="revision" value="'+x.revision+'"><div class="form-field full"><label for="shopping-name">Artikel</label><input id="shopping-name" name="name" maxlength="200" required value="'+h.esc(x.name)+'"></div><div class="error" role="alert"></div><div class="modal-actions">'+h.btn('close','Abbrechen')+'<button class="primary" type="submit">Speichern</button></div></form>');}
function remove(id){var x=item(id);if(!x||blocked())return;h.modal('Artikel entfernen?','<p>'+h.esc(x.name)+'</p><form id="shopping-remove-form"><input type="hidden" name="id" value="'+h.esc(x.id)+'"><input type="hidden" name="revision" value="'+x.revision+'"><p class="notice">Der Artikel wird aus der gemeinsamen Home-Assistant-Liste entfernt.</p><div class="error" role="alert"></div><div class="modal-actions">'+h.btn('close','Abbrechen')+'<button type="submit" class="primary">Entfernen</button></div></form>');}
function submit(f){var el=f.elements;if(f.id==='shopping-add-form'){var name=el.name.value.trim();if(name)write({action:'add',name:name},f,function(ok){if(ok){var input=document.getElementById('shopping-add-input');if(input)input.focus();}});return true;}if(f.id==='shopping-rename-form'){write({action:'rename',id:el.id.value,revision:el.revision.value,name:el.name.value.trim()},f);return true;}if(f.id==='shopping-remove-form'){write({action:'remove',id:el.id.value,revision:el.revision.value},f);return true;}return false;}
function action(a,b){if(a==='shopping-pictures')picturePicker();
else if(a==='shopping-group')showPicturePage(Number(b.dataset.group));
else if(a==='shopping-groups')showPicturePage(-1);
else if(a==='shopping-pick'){
    var choice=products[Number(b.dataset.product)],picker=document.getElementById('shopping-picture-picker');
    if(choice&&picker&&picker.contains(b)&&!b.disabled&&state.canAdd&&!blocked()){
        picker.dataset.pending=b.dataset.product;
        write({action:'add',name:choice[0]},picker);
    }
}else if(a==='shopping-refresh'){
    var dialog=document.getElementById('shopping-picture-picker');
    load(true,function(ok){
        if(ok&&dialog&&document.contains(dialog))dialog.removeAttribute('data-payload');
    });
}else if(a==='shopping-rename')rename(b.getAttribute('data-id'));else if(a==='shopping-remove')remove(b.getAttribute('data-id'));else return false;return true;}
function change(target){var id=target.getAttribute('data-shopping-id');if(!id)return false;var x=item(id),desired=target.checked;if(x){target.checked=x.done;write({action:'status',id:x.id,revision:x.revision,done:desired});}return true;}
return {view:view,badge:badge,submit:submit,action:action,change:change,capture:capture,restore:restore,ensure:function(){if(h.screen&&h.screen()!=='shopping')loadCount(false);else load(false);},refresh:function(){if(h.screen&&h.screen()!=='shopping')loadCount(true);else load(true);}};
};
})();
