/* Форма & Луч — фон: лазер гравирует рисунок по акриловой панели.
   ─────────────────────────────────────────────────────────────────
   Смысл сцены. Название мастерской — «Форма & Луч», и лазер здесь
   главный инструмент. Поэтому в фоне не абстрактные фигуры, а сам
   процесс: панель висит в темноте, луч ходит по ней и оставляет за
   собой светящуюся гравировку. Прокрутка страницы ведёт луч: человек
   листает — рисунок вырисовывается.

   Почему 3D на canvas, а не three.js. Проекция считается вручную:
   единицы килобайт против ~150 КБ библиотеки. Для фона этого
   достаточно, и вес сайта не растёт.

   Общие правила производительности:
   1. Цикл полностью останавливается, когда сцена вне экрана или
      вкладка скрыта.
   2. Частота кадров ограничена 40: на глаз плавно, нагрузка ниже.
   3. Плотность пикселей не выше 2.
   4. prefers-reduced-motion — один статичный кадр.
   5. Частиц немного, число зависит от площади экрана.
*/
(function () {
  "use strict";

  /* ============================================================
     1. Блик, который следует за курсором
     Простая CSS-подсветка: позицию ведём через transform, поэтому
     перерисовки не происходит.
     ============================================================ */
  var spot = document.getElementById("fxSpotlight");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  if (spot && finePointer && !reduce.matches) {
    spot.style.opacity = "1";

    var sx = window.innerWidth * 0.7;
    var sy = window.innerHeight * 0.25;
    var tx = sx;
    var ty = sy;
    var spotRaf = 0;
    var halfW = 0;
    var halfH = 0;

    var measure = function () {
      var r = spot.getBoundingClientRect();
      halfW = r.width / 2;
      halfH = r.height / 2;
    };

    var spotStep = function () {
      sx += (tx - sx) * 0.09;
      sy += (ty - sy) * 0.09;
      spot.style.transform =
        "translate3d(" + (sx - halfW).toFixed(1) + "px," + (sy - halfH).toFixed(1) + "px,0)";
      if (Math.abs(tx - sx) > 0.5 || Math.abs(ty - sy) > 0.5) {
        spotRaf = requestAnimationFrame(spotStep);
      } else {
        spotRaf = 0;
      }
    };

    window.addEventListener("pointermove", function (e) {
      tx = e.clientX;
      ty = e.clientY;
      if (!spotRaf) spotRaf = requestAnimationFrame(spotStep);
    }, { passive: true });

    measure();
    var spotResize = 0;
    window.addEventListener("resize", function () {
      clearTimeout(spotResize);
      spotResize = setTimeout(measure, 180);
    }, { passive: true });
    spotStep();
  }

  /* ============================================================
     2. Сцена: лазер гравирует панель
     ============================================================ */
  var canvas = document.getElementById("fxParticles");
  if (!canvas) return;
  var host = canvas.parentElement || document.body;

  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  var still = reduce.matches;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0;
  var H = 0;

  /* ---------- Ядро: проекция 3D → 2D ---------- */
  var camera = { dist: 3.4, scale: 1, cx: 0, cy: 0 };

  function project(p, ax, ay) {
    var cosY = Math.cos(ay), sinY = Math.sin(ay);
    var cosX = Math.cos(ax), sinX = Math.sin(ax);
    // поворот вокруг вертикальной оси
    var x = p[0] * cosY - p[2] * sinY;
    var z = p[0] * sinY + p[2] * cosY;
    // наклон вокруг горизонтальной
    var y = p[1] * cosX - z * sinX;
    var zz = p[1] * sinX + z * cosX;

    var k = camera.dist / (camera.dist + zz);
    return [camera.cx + x * camera.scale * k, camera.cy + y * camera.scale * k, zz, k];
  }

  /* ---------- Пыль в воздухе ---------- */
  var particles = [];

  function buildParticles() {
    var count = Math.round(Math.min(84, Math.max(30, (W * H) / 17000)));
    particles = [];
    for (var i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -(0.05 + Math.random() * 0.15),
        r: 0.5 + Math.random() * 1.4,
        // Тёплых больше: у ночника тёплый свет, холодный — от лазера
        warm: Math.random() < 0.64,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  /* ---------- Рисунок гравировки ----------
     Важное про композицию. В hero ночников свободного места нет:
     заголовок занимает слева почти всю ширину, справа стоит
     фотография. Поэтому сцена не «висит» одним объектом, а
     распределена по фону страницы: узлы и линии расставлены по всей
     площади, и гравировка проявляется волной слева направо.
     Такой фон не спорит с содержимым и работает на любой ширине. */
  var PANEL_W = 1.0;
  var PANEL_H = 1.0;
  var stars = [];
  var links = [];

  /* Область в нормализованных координатах, где расставляем узлы.
     По вертикали берём шире: сцена закреплена на экране, поэтому
     важна форма окна, а не страницы. */
  function fieldBox() {
    // Отступы от краёв, чтобы линии не обрезались рамкой окна
    return { x0: -1.25, x1: 1.25, y0: -0.92, y1: 0.92 };
  }

  function buildEngraving() {
    var box = fieldBox();
    var N = W > 900 ? 26 : 15;
    var golden = Math.PI * (3 - Math.sqrt(5));

    stars = [];
    for (var i = 0; i < N; i++) {
      /* Раскладываем по спирали золотого угла: точки ложатся
         равномерно и не сбиваются в кучу, как при чистой случайности. */
      var t = (i + 0.5) / N;
      var a = golden * i;
      var rad = Math.sqrt(t);
      stars.push({
        x: (box.x0 + box.x1) / 2 + Math.cos(a) * rad * (box.x1 - box.x0) / 2,
        y: (box.y0 + box.y1) / 2 + Math.sin(a) * rad * (box.y1 - box.y0) / 2,
        r: 1.4 + Math.random() * 1.5
      });
    }

    /* Связи: каждую точку соединяем с двумя ближайшими, но только если
       расстояние не слишком большое. Иначе получаются длинные линии
       через весь экран, и рисунок читается как случайные штрихи. */
    links = [];
    var maxLink = 0.85;
    for (var k = 0; k < stars.length; k++) {
      var d = [];
      for (var j = 0; j < stars.length; j++) {
        if (k === j) continue;
        var dx = stars[k].x - stars[j].x;
        var dy = stars[k].y - stars[j].y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxLink) d.push({ j: j, v: dist });
      }
      d.sort(function (p1, p2) { return p1.v - p2.v; });
      // Соединяем только с самой близкой точкой: две связи дают паутину
      if (d.length) links.push([k, d[0].j]);
    }

    /* Порядок проявления: слева направо, чтобы волна гравировки шла
       по экрану, а не прыгала по случайным узлам. */
    links.sort(function (p1, p2) {
      return stars[p1[0]].x - stars[p2[0]].x;
    });
  }

  /* ---------- Состояние ---------- */
  var scrollRatio = 0;
  var engrave = 0;
  var spin = 0;
  var glow = 0;

  function resize() {
    /* Размер холста. Сцена закреплена на экране (position: fixed),
       поэтому брать размер у родителя нельзя: у body высота равна всей
       странице, и холст получался 1576×12146 при окне 1600×900 —
       картинка размывалась сжатием в 13 раз. Для fixed-слоя верный
       размер — это размер окна. */
    var rect = host.getBoundingClientRect();
    var fixed = window.getComputedStyle(canvas).position === "fixed";
    W = Math.max(320, Math.round(fixed ? window.innerWidth : rect.width));
    H = Math.max(320, Math.round(fixed ? window.innerHeight : rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    camera.scale = Math.min(W * 0.44, H * 0.52);
    // Узор распределён по всей площади экрана
    camera.cx = W * 0.5;
    camera.cy = H * 0.5;

    buildEngraving();
    buildParticles();
  }

  /* ---------- Отрисовка ---------- */
  function draw() {
    ctx.clearRect(0, 0, W, H);

    var ax = 0.12 + scrollRatio * 0.22;
    var ay = spin + scrollRatio * Math.PI * 0.5;
    var i;

    /* Пыль */
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!still) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -12) { p.y = H + 12; p.x = Math.random() * W; }
        if (p.x < -12) p.x = W + 12;
        if (p.x > W + 12) p.x = -12;
      }
      var tw = 0.55 + 0.45 * Math.sin(glow * 1.3 + p.phase);
      var a = (p.warm ? 0.38 : 0.30) * tw;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.warm
        ? "rgba(232, 184, 75, " + a.toFixed(3) + ")"
        : "rgba(126, 208, 255, " + a.toFixed(3) + ")";
      ctx.fill();
    }

    /* Гравировка: только то, что луч уже прошёл.
       Волна идёт по порядку связей, а он отсортирован слева направо. */
    var done = Math.floor(engrave * links.length);

    for (i = 0; i <= done && i < links.length; i++) {
      var a1 = stars[links[i][0]];
      var a2 = stars[links[i][1]];
      var q1 = project([a1.x, a1.y, 0], ax, ay);
      var q2 = project([a2.x, a2.y, 0], ax, ay);
      var fresh = i >= done - 2;   // последние штрихи светятся ярче
      ctx.lineWidth = fresh ? 2.0 : 1.1;
      ctx.strokeStyle = fresh
        ? "rgba(255, 246, 222, 0.95)"
        : "rgba(232, 184, 75, 0.42)";
      ctx.beginPath();
      ctx.moveTo(q1[0], q1[1]);
      ctx.lineTo(q2[0], q2[1]);
      ctx.stroke();
    }

    for (i = 0; i < stars.length; i++) {
      var touched = false;
      for (var l = 0; l <= done && l < links.length && !touched; l++) {
        if (links[l][0] === i || links[l][1] === i) touched = true;
      }
      if (!touched) continue;
      var q = project([stars[i].x, stars[i].y, 0], ax, ay);
      var rad = stars[i].r;
      var gr = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], rad * 9);
      gr.addColorStop(0, "rgba(232, 184, 75, 0.32)");
      gr.addColorStop(1, "rgba(232, 184, 75, 0)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(q[0], q[1], rad * 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(q[0], q[1], rad, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 242, 210, 0.92)";
      ctx.fill();
    }

    /* Луч лазера: от головки станка к текущей точке гравировки.
       Головка стоит за верхним левым углом поля, чтобы луч шёл
       по диагонали через экран — так он читается как рабочий ход. */
    var nextIndex = Math.min(done + 1, links.length - 1);
    var target = stars[links[nextIndex][0]];
    var bp = project([target.x, target.y, 0], ax, ay);
    var origin = project([-1.55, -1.35, 0.25], ax, ay);

    var beam = ctx.createLinearGradient(origin[0], origin[1], bp[0], bp[1]);
    beam.addColorStop(0, "rgba(126, 208, 255, 0.08)");
    beam.addColorStop(0.55, "rgba(168, 228, 255, 0.45)");
    beam.addColorStop(1, "rgba(255, 255, 255, 0.95)");
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = beam;
    ctx.beginPath();
    ctx.moveTo(origin[0], origin[1]);
    ctx.lineTo(bp[0], bp[1]);
    ctx.stroke();

    // Свечение в точке попадания
    var hit = ctx.createRadialGradient(bp[0], bp[1], 0, bp[0], bp[1], 32);
    hit.addColorStop(0, "rgba(255, 252, 240, 0.85)");
    hit.addColorStop(0.35, "rgba(232, 184, 75, 0.34)");
    hit.addColorStop(1, "rgba(232, 184, 75, 0)");
    ctx.fillStyle = hit;
    ctx.beginPath();
    ctx.arc(bp[0], bp[1], 32, 0, Math.PI * 2);
    ctx.fill();

    // Головка станка
    ctx.beginPath();
    ctx.arc(origin[0], origin[1], 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(190, 235, 255, 0.9)";
    ctx.fill();

    // Искры вдоль луча
    var ang = Math.atan2(bp[1] - origin[1], bp[0] - origin[0]) + Math.PI / 2;
    for (i = 0; i < 12; i++) {
      var t = Math.random();
      var off = (Math.random() - 0.5) * 20;
      var px = origin[0] + (bp[0] - origin[0]) * t + Math.cos(ang) * off;
      var py = origin[1] + (bp[1] - origin[1]) * t + Math.sin(ang) * off;
      ctx.beginPath();
      ctx.arc(px, py, Math.random() * 1.4 + 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 232, 175, " + Math.max(0, 0.5 - t * 0.35).toFixed(3) + ")";
      ctx.fill();
    }
  }

  /* ---------- Цикл ---------- */
  var raf = 0;
  var running = false;
  var visible = true;
  var lastTime = 0;
  var FRAME_MS = 1000 / 40;
  /* Когда страница стоит, луч всё равно работает — но медленно, чтобы
     сцена жила и не отвлекала. Прокрутка заметно ускоряет процесс. */
  var IDLE_SPEED = 0.05;

  function step(dt) {
    spin += dt * 0.20;
    glow += dt * 1.5;

    /* Прокрутка ведёт гравировку: цель — доля пройденной страницы.
       Плавно догоняем, чтобы не было рывков при резкой прокрутке. */
    var target = scrollRatio;
    if (engrave > target + 0.15) {
      // Прокрутили вверх — стираем быстрее, чем рисуем
      engrave += (target - engrave) * Math.min(1, dt * 3.4);
    } else {
      engrave += (target - engrave) * Math.min(1, dt * 1.6) + dt * IDLE_SPEED;
    }
    if (engrave > 1.06) engrave = 0;

    draw();
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (!lastTime) { lastTime = now; return; }
    var delta = now - lastTime;
    if (delta < FRAME_MS) return;
    var dt = Math.min(delta, 200) / 1000;
    lastTime = now;
    step(dt);
  }

  function start() {
    if (running || still) return;
    running = true;
    lastTime = 0;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /* ---------- Прокрутка ---------- */
  var scrollTick = false;
  function readScroll() {
    scrollTick = false;
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    scrollRatio = max > 0 ? Math.min(1, Math.max(0, window.pageYOffset / max)) : 0;
  }

  window.addEventListener("scroll", function () {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(readScroll);
  }, { passive: true });

  /* ---------- Пауза вне экрана и в скрытой вкладке ---------- */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && !document.hidden) start();
      else stop();
    }, { threshold: 0.01 });
    io.observe(host);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else if (visible) start();
  });

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      if (!running) draw();
    }, 180);
  }, { passive: true });

  /* ---------- Смена предпочтения по анимации ---------- */
  function applyPreference() {
    still = reduce.matches;
    if (still) {
      stop();
      engrave = 1;
      scrollRatio = 0.5;
      spin = 0.4;
      draw();
    } else {
      start();
    }
  }

  if (reduce.addEventListener) reduce.addEventListener("change", applyPreference);
  else if (reduce.addListener) reduce.addListener(applyPreference);

  readScroll();
  resize();

  if (still) {
    engrave = 1;
    scrollRatio = 0.5;
    spin = 0.4;
    draw();
  } else {
    draw();
    start();
  }
})();
