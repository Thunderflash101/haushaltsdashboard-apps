(function(){
'use strict';
window.createFamilyRewards=function(h){
var data=null,loading=false,busy=false,error='',last=0,person='felix',pending=false;
function render(){h.repaint();}
function load(force){if(loading){pending=pending||force;return;}if(!force&&Date.now()-last<30000&&data)return;loading=true;last=Date.now();h.api('GET','api/rewards',null,null,function(err,result){loading=false;if(!err&&(!result||!Array.isArray(result.rewards)||!result.balances||!Array.isArray(result.history)))err={error:'Ungültige Punkteantwort.'};error=err?err.error:'';if(!err)data=result;render();if(pending){pending=false;load(true);}});}
function chestArt(cost,opened){
    return '<span aria-hidden="true" class="chest-art tier-'+cost+(opened?' chest-open':'')+'">'+
        '<span class="chest-well"></span><span class="chest-coins"></span>'+
        '<span class="chest-front chest-bands"></span>'+
        '<span class="chest-lid"><span class="chest-outside chest-bands"></span><span class="chest-lining"></span></span>'+
        '<span class="chest-clasp">✦</span></span>';
}
function confetti(){
    var colors=['#c36954','#519589','#e4ae41','#9981af','#6794b1'];
    var pieces='';
    for(var i=0;i<24;i++){
        var side=i%2===0?-1:1;
        var x=side*(22+(i*37)%119);
        var y=-24-(i*23)%60;
        pieces+='<i style="--x:'+x+'px;--y:'+y+'px;--end-x:'+(x+side*12)+'px;--spin:'+(side*(90+i*17))+'deg;--lag:'+(i%6)*50+'ms;background:'+colors[i%colors.length]+'"></i>';
    }
    return '<span aria-hidden="true" class="chest-confetti">'+pieces+'</span>';
}
function treasureView(){
    var funds=data.balances[person];
    var cards=[10,30,100].map(function(cost,index){
        var stocked=data.rewards.some(function(r){return r.tier===cost;});
        var label=!stocked?'Noch leer':funds<cost?'Noch '+(cost-funds)+' Münzen':'Öffnen';
        return h.btn('treasure-choose',chestArt(cost,false)+'<strong>'+['Kleine Truhe','Silbertruhe','Goldtruhe'][index]+'</strong><span><i class="coin-symbol" aria-hidden="true">★</i> '+cost+'</span><small>'+label+'</small>',
            'treasure-card','data-cost="'+cost+'"'+(!stocked||funds<cost||busy||loading||error?' disabled':''));
    });
    var prizes=(data.prizes||[]).filter(function(x){return x.person===person;});
    return '<h3>Schatztruhen</h3><div class="treasure-grid">'+cards.join('')+'</div>'+
        (prizes.length?'<h3>Meine Schätze</h3>'+prizes.map(function(x){
            return '<div class="reward-history-row"><strong>'+h.esc(x.title)+'</strong>'+h.btn('treasure-fulfill','Als erfüllt markieren','','data-id="'+x.id+'"')+'</div>';
        }).join(''):'');
}
function treasureDialog(button,fulfill){
    if(busy||loading||error)return;
    var cost=Number(button.dataset.cost);
    var prize=fulfill&&(data.prizes||[]).filter(function(x){return x.id===button.dataset.id;})[0];
    if(fulfill&&!prize)return;
    h.modal(fulfill?'Schatz erfüllt?':'Truhe öffnen?','<form id="treasure-form" data-person="'+person+'" data-cost="'+(cost||0)+'" data-id="'+(prize?prize.id:'')+'">'+
        h.profiles().badge(person,false)+(prize?'<h3>'+h.esc(prize.title)+'</h3>'+h.parentPinField():chestArt(cost,false)+'<p>Eine Überraschung für '+cost+' Münzen ziehen?</p>')+
        '<p class="error" role="alert"></p><div class="modal-actions">'+h.btn('close','Abbrechen')+
        '<button type="submit" class="primary">'+(prize?'Erfüllt':'Für '+cost+' Münzen öffnen')+'</button></div></form>');
}

function view(){var html='<section class="panel reward-panel"><div class="row spread"><h2>Punkte & Belohnungen</h2>'+h.btn('reward-new','+ Belohnung','primary',(busy||loading||error?'disabled':''))+'</div><p class="source-label">Person auswählen, Belohnung ansehen und Einlösen bestätigen. Punkte entstehen erst nach vollständig erledigten Aufgaben oder Routinen.</p>';
if(error)html+='<p class="notice error">'+h.esc(error)+' '+h.btn('reward-refresh','Aktualisieren')+'</p>';if(!data)return html+'<p role="status">Punkte werden geladen …</p></section>';
html+='<div class="reward-people">'+['tina','joern','felix'].map(function(p){return h.btn('reward-person',h.profiles().badge(p,false)+'<strong>'+data.balances[p]+' Punkte</strong>','reward-person '+(p===person?'selected':''),'data-person="'+p+'" aria-pressed="'+(p===person)+'"');}).join('')+'</div>';
html+=treasureView();
if(data.balances[person]<0)html+='<p class="notice">Ein Häkchen wurde nach einer Einlösung zurückgenommen. Der Fehlbetrag wird mit neuen Punkten ausgeglichen; vorher ist keine weitere Einlösung möglich.</p>';
html+='<div class="reward-grid">'+data.rewards.map(function(r){return '<article class="reward-card"><span aria-hidden="true" class="reward-star">★</span><h3>'+h.esc(r.title)+'</h3><strong>'+r.cost+' Punkte</strong><div class="row wrap">'+h.btn('reward-choose','Einlösen','sage','data-id="'+r.id+'"'+(busy||loading||!!error||data.balances[person]<r.cost?' disabled':''))+h.btn('reward-edit','Bearbeiten','text-button','data-id="'+r.id+'"'+(busy||loading||error?' disabled':''))+'</div></article>';}).join('')+'</div>';
if(!data.rewards.length)html+='<div class="empty"><h3>Wofür möchtet ihr Punkte sammeln?</h3><p>Legt zum Beispiel einen gemeinsamen Spieleabend oder die Wahl des nächsten Abendessens an.</p></div>';
html+='<details class="reward-history"><summary>Letzte Einlösungen</summary>'+data.history.map(function(x){return '<article class="reward-history-row">'+h.profiles().badge(x.person,true)+'<span><strong>'+h.esc(x.title)+'</strong><small>'+h.esc(new Date(x.created).toLocaleString('de-DE'))+' · '+x.cost+' Punkte'+(x.reversed?' · Zurückgenommen':'')+'</small></span>'+(!x.reversed?h.btn('reward-reverse','Rückgängig','text-button','data-id="'+x.id+'"'+(busy||loading||error?' disabled':'')):'')+'</article>';}).join('')+'</details><p class="source-label">Beim Wiederöffnen einer erledigten Aufgabe werden ihre Punkte zurückgenommen. Gemeinsame Häkchen vergeben die Punkte an alle zugewiesenen Personen. Eine vollständig erledigte Routine zählt einmal, nicht pro Schritt.</p></section>';return html;}
function find(id){return data&&data.rewards.filter(function(x){return x.id===id;})[0];}
function edit(id){if(busy||loading||error)return;var r=id?find(id):null;if(id&&!r)return;h.modal(r?'Belohnung bearbeiten':'Neue Belohnung','<form id="reward-edit-form" data-id="'+(r?r.id:'')+'" data-revision="'+(r?r.revision:0)+'"><div class="form-field full"><label for="reward-title">Belohnung</label><input id="reward-title" name="title" maxlength="100" required value="'+h.esc(r?r.title:'')+'"></div><div class="form-field full"><label for="reward-cost">Punktepreis</label><input id="reward-cost" name="cost" type="number" min="1" max="10000" required value="'+(r?r.cost:10)+'"></div><label class="form-field">Auch als Überraschung in<select name="tier">'+[0,10,30,100].map(function(n){return '<option value="'+n+'"'+((r&&r.tier||0)===n?' selected':'')+'>'+(n?n+' Münzen':'Keiner Truhe')+'</option>';}).join('')+'</select></label><p class="source-label">Änderungen gelten für künftige Einlösungen. Vergangene Einlösungen behalten ihren ursprünglichen Preis.</p><p class="error" role="alert"></p>'+h.parentPinField()+'<div class="modal-actions">'+(r?h.btn('reward-remove','Entfernen','danger','data-id="'+r.id+'"'):'')+h.btn('close','Abbrechen')+'<button type="submit" class="primary">Speichern</button></div></form>');}
function confirm(action,id){if(busy||loading||error)return;var r=action==='redeem'?find(id):data.history.filter(function(x){return x.id===id;})[0];if(!r)return;h.modal(action==='redeem'?'Belohnung einlösen?':'Einlösung zurücknehmen?','<form id="reward-confirm-form" data-action="'+action+'" data-id="'+r.id+'" data-revision="'+(r.revision||0)+'" data-person="'+person+'">'+h.profiles().badge(action==='redeem'?person:r.person,false)+'<h3>'+h.esc(r.title)+'</h3><p class="notice">'+r.cost+' Punkte '+(action==='redeem'?'werden abgezogen.':'werden der Person zurückgegeben.')+'</p><p class="error" role="alert"></p>'+(action==='reverse'?h.parentPinField():'')+'<div class="modal-actions">'+h.btn('close','Abbrechen')+'<button type="submit" class="primary">'+(action==='redeem'?'Für '+r.cost+' Punkte einlösen':'Einlösung zurücknehmen')+'</button></div></form>');}
function post(payload,form){if(busy)return;var value=JSON.stringify(payload);if(form.dataset.payload!==value){form.dataset.payload=value;form.dataset.key='reward-'+h.uid()+'-'+h.uid();}busy=true;form.querySelectorAll('button,input').forEach(function(x){x.disabled=true;});h.submitAction('api/rewards/actions',payload,form.dataset.key,form,function(err,result){busy=false;if(!err&&(!result||result.success!==true))err={error:'Keine sichere Bestätigung.',uncertain:true};if(err){if(err.conflict||err.uncertain)error=err.error;if(document.contains(form)){form.querySelector('.error').textContent=err.error;form.querySelectorAll('button,input').forEach(function(x){x.disabled=!!(err.conflict||err.uncertain);});}render();return;}if(document.contains(form)){
    if(payload.action==='open-chest'){
        h.modal('Dein Schatz!','<div class="treasure-stage" aria-hidden="true">'+chestArt(result.cost,true)+confetti()+'</div><div class="prize-reveal"><h3>'+h.esc(result.title)+'</h3>'+h.btn('close','Freuen & schließen','sage')+'</div>');
    }else h.close();
}load(true);});}
function action(a,b){if(a==='treasure-choose'||a==='treasure-fulfill'){treasureDialog(b,a==='treasure-fulfill');return true;}if(a==='reward-person'){person=b.dataset.person;render();}else if(a==='reward-new')edit();else if(a==='reward-edit')edit(b.dataset.id);else if(a==='reward-choose')confirm('redeem',b.dataset.id);else if(a==='reward-reverse')confirm('reverse',b.dataset.id);else if(a==='reward-refresh')load(true);else if(a==='reward-remove'){if(busy||loading||error)return true;var r=find(b.dataset.id);if(r)h.modal('Belohnung entfernen?','<form id="reward-remove-form" data-id="'+r.id+'" data-revision="'+r.revision+'"><p>'+h.esc(r.title)+'</p><p class="notice">Vergangene Einlösungen und Punktestände bleiben erhalten.</p><p class="error" role="alert"></p>'+h.parentPinField()+'<div class="modal-actions">'+h.btn('close','Abbrechen')+'<button type="submit" class="primary">Entfernen</button></div></form>');}else return false;return true;}
function submit(f){if(f.id==='treasure-form'){
    var action=f.dataset.id?{action:'fulfill',id:f.dataset.id}:{action:'open-chest',cost:Number(f.dataset.cost),person:f.dataset.person};
    post(action,f);return true;
}if(f.id==='reward-edit-form'){post({action:f.dataset.id?'edit':'create',id:f.dataset.id,revision:Number(f.dataset.revision),title:f.elements.title.value.trim(),tier:Number(f.elements.tier.value),cost:Number(f.elements.cost.value)},f);return true;}if(f.id==='reward-confirm-form'){post({action:f.dataset.action,id:f.dataset.id,revision:Number(f.dataset.revision),person:f.dataset.person},f);return true;}if(f.id==='reward-remove-form'){post({action:'remove',id:f.dataset.id,revision:Number(f.dataset.revision)},f);return true;}return false;}
return {view:view,action:action,submit:submit,ensure:function(){load(false);},refresh:function(){load(true);}};
};
})();
