/* disdroc cosmic landing — starfield + tape. External file (CSP: script-src 'self'). */
(function(){
  "use strict";
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* seamless telemetry tape: duplicate the list once */
  var tape = document.getElementById("tape");
  if (tape && tape.children.length === 1) tape.appendChild(tape.children[0].cloneNode(true));

  /* starfield */
  var cv = document.getElementById("stars");
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext("2d"), W, H, DPR, stars = [], mx = 0, my = 0, tx = 0, ty = 0;

  function size(){
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.width = innerWidth * DPR; H = cv.height = innerHeight * DPR;
    cv.style.width = innerWidth + "px"; cv.style.height = innerHeight + "px";
    stars = [];
    var n = Math.min(260, Math.floor(innerWidth * innerHeight / 6500));
    for (var i = 0; i < n; i++) stars.push({
      x: Math.random() * W, y: Math.random() * H,
      r: (Math.random() * 1.3 + 0.3) * DPR,
      tw: Math.random() * Math.PI * 2,
      ts: 0.4 + Math.random() * 1.4,
      d: 0.25 + Math.random() * 0.75            /* parallax depth */
    });
  }

  function frame(t){
    ctx.clearRect(0, 0, W, H);
    mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
    for (var i = 0; i < stars.length; i++){
      var s = stars[i];
      var a = reduced ? 0.55 : 0.32 + 0.45 * Math.abs(Math.sin(s.tw + t * 0.001 * s.ts));
      ctx.globalAlpha = a * s.d;
      ctx.fillStyle = "#dfe6ff";
      ctx.beginPath();
      ctx.arc(s.x + mx * s.d * DPR, s.y + my * s.d * DPR, s.r, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!reduced) requestAnimationFrame(frame);
  }

  addEventListener("resize", function(){ size(); if (reduced) frame(0); }, { passive: true });
  if (!reduced) addEventListener("mousemove", function(e){
    tx = (e.clientX / innerWidth - 0.5) * -22;
    ty = (e.clientY / innerHeight - 0.5) * -22;
  }, { passive: true });

  size();
  if (reduced) frame(0); else requestAnimationFrame(frame);
})();
