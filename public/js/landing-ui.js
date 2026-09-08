(function(){
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  var nav = document.getElementById('nav');
  if(nav){
    var onScroll = function(){ nav.classList.toggle('scrolled', window.scrollY > 8); };
    onScroll(); window.addEventListener('scroll', onScroll, {passive:true});
  }

  var navToggle = document.getElementById('navToggle');
  if(navToggle && nav){
    navToggle.addEventListener('click', function(){
      var open = nav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    var mm = document.getElementById('mobileMenu');
    if(mm) mm.addEventListener('click', function(e){
      if(e.target.closest('a')){ nav.classList.remove('open'); navToggle.setAttribute('aria-expanded','false'); }
    });
  }

  document.querySelectorAll('.wall-row').forEach(function(row){
    var span = row.querySelector('span');
    if(!span) return;
    row.appendChild(span.cloneNode(true));
  });

  var track = document.getElementById('tickerTrack');
  if(track) track.innerHTML += track.innerHTML;

  document.querySelectorAll('.flist .frow, .app-rows .app-row').forEach(function(el, i){
    // --rvd delays only the reveal transition; a plain transition-delay here
    // would also lag the hover background/padding by up to .35s.
    el.style.setProperty('--rvd', (i % 6) * 0.07 + 's');
  });

  var io = new IntersectionObserver(function(es){
    es.forEach(function(e){
      if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: .18, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.rv,.rv-scale').forEach(function(el){ io.observe(el); });

  var faq = document.getElementById('faqList');
  if(faq){
    faq.addEventListener('click', function(e){
      var btn = e.target.closest('.qa-q'); if(!btn) return;
      var qa = btn.parentElement;
      var isOpen = qa.classList.contains('open');
      faq.querySelectorAll('.qa').forEach(function(item){
        item.classList.remove('open');
        item.querySelector('.qa-q').setAttribute('aria-expanded','false');
      });
      if(!isOpen){ qa.classList.add('open'); btn.setAttribute('aria-expanded','true'); }
    });
  }

  (function(){
    var stmt = document.getElementById('stmtText');
    if(!stmt) return;
    var revealed = false;
    function wrap(){
      stmt.innerHTML = stmt.innerHTML.replace(/(<span class="h[lv]">)([\s\S]*?)(<\/span>)|([^\s<>]+)/g,
        function(m, o, inner, c, word){
          if(o) return o + inner.split(' ').map(function(w){ return '<span class="w">' + w + '</span>'; }).join(' ') + c;
          return '<span class="w">' + word + '</span>';
        });
      if(revealed || reduce){
        stmt.querySelectorAll('.w').forEach(function(w){ w.classList.add('on'); });
      }
    }
    wrap();
    // lang.js applies data-en/data-tr on DOMContentLoaded (and on later geo-detect /
    // toggle clicks), which fires after this deferred script already wrapped the
    // words below — that reset clobbers the .w wrapping. Re-wrap on every langchange.
    document.addEventListener('langchange', function(){ requestAnimationFrame(wrap); });
    if(reduce){ revealed = true; return; }
    var stIO = new IntersectionObserver(function(es){
      if(!es[0].isIntersecting) return;
      revealed = true;
      stmt.querySelectorAll('.w').forEach(function(w, i){
        setTimeout(function(){ w.classList.add('on'); }, i * 32);
      });
      stIO.disconnect();
    }, { threshold: .35 });
    stIO.observe(stmt);
  })();
})();
