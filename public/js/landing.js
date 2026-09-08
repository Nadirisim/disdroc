(function(){
  'use strict';
  // Preloaded (not render-blocking) in <head>; activate it as a stylesheet now
  // that the critical first paint no longer has to wait on the Google Fonts CSS.
  var fp=document.getElementById('fontsPreload');
  if(fp)fp.rel='stylesheet';

  var KEY='disdroc_lang',SET='disdroc_lang_userset';
  function ls(get,k,v){try{return get?localStorage.getItem(k):localStorage.setItem(k,v);}catch(e){return null;}}
  function apply(lang){
    if(lang!=='tr')lang='en';
    document.documentElement.lang=lang;
    var nodes=document.querySelectorAll('[data-en]');
    for(var i=0;i<nodes.length;i++){var v=nodes[i].getAttribute('data-'+lang);if(v!=null)nodes[i].innerHTML=v;}
    var title=document.querySelector('title');
    if(title&&title.getAttribute('data-'+lang))document.title=title.getAttribute('data-'+lang);
    var segs=document.querySelectorAll('#langToggle [data-lang]');
    for(var j=0;j<segs.length;j++){segs[j].classList.toggle('on',segs[j].getAttribute('data-lang')===lang);}
  }
  function choose(lang){ls(false,KEY,lang);ls(false,SET,'1');apply(lang);}
  var stored=ls(true,KEY);
  if(stored==='tr'||stored==='en'){apply(stored);}
  else{
    apply((navigator.language||'').toLowerCase().indexOf('tr')===0?'tr':'en');
    fetch('/api/geo').then(function(r){return r.json();}).then(function(d){var c=(d&&d.country)||'';if((c==='TR'||c==='CY')&&!(ls(true,KEY)))apply('tr');}).catch(function(){});
  }
  var btn=document.getElementById('langToggle');
  if(btn)btn.addEventListener('click',function(e){
    var seg=e.target.closest('[data-lang]');
    var lang=seg?seg.getAttribute('data-lang'):(document.documentElement.lang==='tr'?'en':'tr');
    choose(lang);
  });
})();
