(function(){
'use strict';
window.createFamilyWeather=function(h){
var state={data:null,loading:false,error:'',lastAttempt:0},dialog=null;
// Keep the text and drawing together for every Home Assistant weather state.
var rainCloud='M6 14a4 4 0 0 1-.5-8A6 6 0 0 1 17 5a4.5 4.5 0 1 1 1 9H6';
var conditions={
'clear-night':['Klare Nacht','M21 14A9 9 0 0 1 10 3a9 9 0 1 0 11 11'],
cloudy:['Bewölkt','M6 18a4 4 0 0 1-1-8 7 7 0 0 1 13-1 4.5 4.5 0 1 1 0 9H6'],
exceptional:['Ungewöhnliche Wetterlage','M12 3 2 21h20L12 3M12 9v5m0 3h.01'],
fog:['Nebel',rainCloud+'M3 17h15M6 20h15M3 23h12'],
hail:['Hagel',rainCloud+'M7 19h.01M12 17h.01M17 20h.01M11 22h.01'],
lightning:['Gewitter',rainCloud+'M13 13l-4 6h4l-2 4 7-7h-5l3-3'],
'lightning-rainy':['Gewitter mit Regen',rainCloud+'M13 13l-4 6h4l-2 4 7-7h-5l3-3M5 17l-1 3m16-1-1 3'],
partlycloudy:['Leicht bewölkt','M4 9a4 4 0 1 1 7-5M6 1v1M1 6h1M2 2l1 1m8-1-1 1M7 20a4 4 0 0 1-1-8 6 6 0 0 1 11-1 4.5 4.5 0 1 1 1 9H7'],
pouring:['Starkregen',rainCloud+'M5 17l-1 5m5-5-1 6m5-6-1 5m5-5-1 6m5-6-1 5'],
rainy:['Regen',rainCloud+'M7 17l-1 3m7-3-1 3m7-3-1 3'],
snowy:['Schnee',rainCloud+'M7 16v6m-2-4 4 2m-4 0 4-2M17 16v6m-2-4 4 2m-4 0 4-2'],
'snowy-rainy':['Schneeregen',rainCloud+'M6 17l-1 4m6-4-1 3M18 16v6m-2-4 4 2m-4 0 4-2'],
sunny:['Sonnig','M12 3V1m0 22v-2M3 12H1m22 0h-2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0'],
windy:['Windig','M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M5 16h4a3 3 0 1 1-3 3'],
'windy-variant':['Windig und bewölkt',rainCloud+'M3 17h12a2 2 0 1 0-2-2M2 21h17a2 2 0 1 0-2-2']
};
var unknown=['Wetterlage nicht angegeben','M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 4h.01'];
function known(condition){return typeof condition==='string'&&Object.prototype.hasOwnProperty.call(conditions,condition);}
function label(condition){return (known(condition)?conditions[condition]:unknown)[0];}
function symbol(condition){var key=known(condition)?condition:'unknown',drawing=(key==='unknown'?unknown:conditions[key])[1];return '<svg class="weather-symbol" data-weather-condition="'+key+'" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="'+drawing+'"/></svg>';}

function value(n){return n===null||typeof n==='undefined'?'—':Number(n).toLocaleString('de-DE',{maximumFractionDigits:1});}
function compact(){var d=state.data;if(!d)return '<button class="weather-button row" type="button" data-action="weather">'+symbol('')+'<span>Wetter<br><small>'+(state.loading?'Wird geladen …':state.error?'Nicht verfügbar':'Wird geladen …')+'</small></span></button>';return '<button class="weather-button row" type="button" data-action="weather" aria-label="Wetter und Vorhersage öffnen">'+symbol(d.condition)+'<span><strong>'+h.esc(value(d.temperature)+' '+d.temperatureUnit)+'</strong><br><small>'+h.esc(state.error?'Letzter Stand':label(d.condition))+'</small></span></button>';}
function body(){var d=state.data,html='<div class="row spread"><p class="source-label">'+h.esc(d?d.source:'Home Assistant')+'</p><button type="button" data-action="weather-refresh">Aktualisieren</button></div>';if(state.loading)html+='<p role="status" class="notice">Wetter wird geladen …</p>';if(state.error)html+='<p role="alert" class="notice">'+h.esc(state.error)+(d?' · Letzter geladener Stand.':'')+'</p>';if(!d)return html;
html+='<div class="weather-current row">'+symbol(d.condition)+'<div><strong>'+h.esc(value(d.temperature)+' '+d.temperatureUnit)+'</strong><p>'+h.esc(label(d.condition))+'</p></div></div><div class="row wrap muted">'+(d.windSpeed!==null?'<span>Wind '+h.esc(value(d.windSpeed)+' '+d.windUnit)+'</span>':'')+(d.humidity!==null?'<span>Luftfeuchte '+h.esc(value(d.humidity))+' %</span>':'')+'</div><h3 style="margin-top:22px">Die nächsten Tage</h3>';
if(d.forecastError)html+='<p class="notice">'+h.esc(d.forecastError)+'</p>';if(!d.forecast.length&&!d.forecastError)html+='<p class="notice">Keine Tagesvorhersage vorhanden.</p>';
html+='<div class="weather-days">'+d.forecast.map(function(f){var date=new Date(f.date+'T12:00:00'),name=date.toLocaleDateString('de-DE',{weekday:'short',day:'numeric',month:'numeric'});return '<article class="weather-day"><strong>'+h.esc(name)+'</strong>'+symbol(f.condition)+'<p>'+h.esc(label(f.condition))+'</p><p><strong>'+h.esc(value(f.high))+'°</strong> / '+h.esc(value(f.low))+'°</p>'+(f.rainChance!==null?'<small>Regen '+h.esc(value(f.rainChance))+' %</small>':'')+'</article>';}).join('')+'</div><p class="source-label">'+h.esc('Temperaturen in '+d.temperatureUnit+' · Abgerufen '+new Date(d.fetchedAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}))+'</p>';return html;}
function redraw(){h.repaint();if(dialog&&document.contains(dialog))dialog.innerHTML=body();}
function load(force){if(state.loading||(!force&&Date.now()-state.lastAttempt<300000))return;state.loading=true;state.lastAttempt=Date.now();redraw();h.api('GET','api/weather',null,null,function(err,data){state.loading=false;if(!err&&(!data||!Array.isArray(data.forecast)))err={error:'Ungültige Wetterantwort.'};state.error=err?err.error:'';if(!err)state.data=data;redraw();});}
function open(){h.modal('Wetter bei euch','<div id="weather-detail">'+body()+'</div>',true);dialog=document.getElementById('weather-detail');load(false);}
return {compact:compact,open:open,ensure:function(){load(false);},refresh:function(){load(true);}};
};
})();
