(function(){
'use strict';
window.createFamilyTimers=function(options){
var now=options.now||Date.now,storage=options.storage,key='familienkueche-timers-v1',timers=[];
function finite(x){return typeof x==='number'&&isFinite(x);}
function save(){try{storage.setItem(key,JSON.stringify(timers));return true;}catch(e){return false;}}
try{var raw=JSON.parse(storage.getItem(key)||'[]');if(Array.isArray(raw))timers=raw.slice(0,6).filter(function(t){return t&&typeof t.id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(t.id)&&typeof t.label==='string'&&t.label.length<=60&&finite(t.duration)&&t.duration>0&&t.duration<=86400000&&finite(t.remaining)&&t.remaining>=0&&t.remaining<=86400000&&['running','paused','done'].indexOf(t.status)>=0&&(t.status!=='running'||finite(t.deadline));});}catch(e){}
function find(id){return timers.filter(function(t){return t.id===id;})[0];}
function tick(){var finished=[];timers.forEach(function(t){if(t.status==='running'){t.remaining=Math.max(0,t.deadline-now());if(t.remaining===0){t.status='done';if(!t.notified){t.notified=true;finished.push(t);}}}});if(finished.length){save();finished.forEach(function(t){if(options.onFinish)options.onFinish(t);});}return finished;}
function list(){return timers.map(function(t){return {id:t.id,label:t.label,status:t.status,duration:t.duration,remaining:t.status==='running'?Math.max(0,t.deadline-now()):t.remaining};});}
function add(label,minutes){if(timers.length>=6)throw Error('Es sind bereits sechs Timer vorhanden. Bitte einen entfernen.');if(!finite(minutes)||minutes<.5||minutes>1440)throw Error('Bitte zwischen 0,5 und 1440 Minuten wählen.');var duration=Math.round(minutes*60000),id='timer-'+now().toString(36)+'-'+Math.random().toString(36).slice(2,8);timers.push({id:id,label:String(label||'Timer '+(timers.length+1)).slice(0,60),duration:duration,remaining:duration,deadline:now()+duration,status:'running',notified:false});save();return id;}
function pause(id){tick();var t=find(id);if(t&&t.status==='running'){t.remaining=Math.max(0,t.deadline-now());t.deadline=null;t.status='paused';save();}}
function resume(id){var t=find(id);if(t&&t.status==='paused'&&t.remaining>0){t.deadline=now()+t.remaining;t.status='running';save();}}
function reset(id){var t=find(id);if(t){t.remaining=t.duration;t.deadline=null;t.status='paused';t.notified=false;save();}}
function remove(id){timers=timers.filter(function(t){return t.id!==id;});save();}
return {list:list,tick:tick,add:add,pause:pause,resume:resume,reset:reset,remove:remove};
};
window.formatFamilyTimer=function(ms){var seconds=Math.max(0,Math.ceil(ms/1000)),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60,pad=function(n){return (n<10?'0':'')+n;};return (hours?pad(hours)+':':'')+pad(minutes)+':'+pad(rest);};
})();
