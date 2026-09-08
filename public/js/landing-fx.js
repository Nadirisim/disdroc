(function(){
  'use strict';
  document.documentElement.classList.add('js');
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.remove('js');
    return;
  }
  if (!('IntersectionObserver' in window)) { document.documentElement.classList.remove('js'); return; }
  var io = new IntersectionObserver(function(entries){
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) { entries[i].target.classList.add('in'); io.unobserve(entries[i].target); }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  var els = document.querySelectorAll('.rv');
  for (var j = 0; j < els.length; j++) io.observe(els[j]);
})();
