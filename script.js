/* Форма & Луч — поведение страницы.
   Ничего критичного для показа контента здесь нет: если скрипт не загрузится,
   класс .no-js оставит все секции видимыми. */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.remove("no-js"); // на случай, если inline-скрипт в head не сработал

  /* ---------- Меню сайта: fixed-оверлей на нативном dialog ----------
     dialog попадает в top layer, поэтому меню гарантированно рисуется поверх
     страницы на любой ширине окна — за наложение не отвечает ни один z-index. */
  var menuDialog = document.getElementById("siteMenu");
  var menuToggle = document.querySelector(".nav__toggle");
  var menuLinksBox = document.getElementById("siteMenuLinks");

  function openMenu() {
    if (!menuDialog) return;
    // Если браузер не умеет showModal, меню-диалог бесполезен: уводим к каталогу,
    // чтобы кнопка не оказалась «мёртвой».
    if (typeof menuDialog.showModal !== "function") {
      var fallback = document.getElementById("catalog");
      if (fallback) fallback.scrollIntoView();
      return;
    }
    if (menuDialog.open) return;
    menuDialog.showModal();
    document.documentElement.classList.add("menu-open");
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    if (!menuDialog || !menuDialog.open) return;
    if (typeof menuDialog.close === "function") menuDialog.close();
    document.documentElement.classList.remove("menu-open");
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
  }

  if (menuDialog) {
    if (menuToggle) menuToggle.addEventListener("click", openMenu);

    // Клик по кнопке закрытия или по любому пункту меню
    menuDialog.addEventListener("click", function (e) {
      if (e.target.closest("[data-menu-close]")) { closeMenu(); return; }
      if (e.target.closest(".mmenu__panel a")) closeMenu();
    });

    // Клик по затемнению: координаты ниже панели
    menuDialog.addEventListener("click", function (e) {
      if (e.target !== menuDialog) return;
      var panel = menuDialog.querySelector(".mmenu__panel");
      if (!panel) { closeMenu(); return; }
      var r = panel.getBoundingClientRect();
      if (e.clientY > r.bottom) closeMenu();
    });

    // Esc закрывает диалог сам — синхронизируем состояние кнопки и прокрутку
    menuDialog.addEventListener("close", function () {
      document.documentElement.classList.remove("menu-open");
      if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
    });

    // Защита от рассинхрона: если список пунктов почему-то пуст, наполняем его
    if (menuLinksBox && !menuLinksBox.childElementCount) {
      ["#catalog:Каталог", "#peripherals:Периферия", "#engraving:Гравировка",
       "#printing:3D-печать", "#how:Как заказать", "#delivery:Доставка",
       "#reviews:Отзывы", "#faq:Вопросы"].forEach(function (pair) {
        var parts = pair.split(":");
        var a = document.createElement("a");
        a.href = parts[0];
        a.textContent = parts[1];
        menuLinksBox.appendChild(a);
      });
    }
  }

  /* ---------- Кнопка «наверх» и поведение шапки при прокрутке ---------- */
  var toTop = document.getElementById("toTop");
  var nav = document.querySelector(".nav");
  var lastY = window.pageYOffset || 0;
  var ticking = false;
  var navHidden = false;
  /* Порог в пикселях. Он убирает дрожание от мелких сдвигов, но не мешает
     обычной прокрутке: человек за один жест проходит сотни пикселей. */
  var NAV_THRESHOLD = 10;

  function setNavHidden(hidden) {
    if (!nav || hidden === navHidden) return;
    navHidden = hidden;
    nav.classList.toggle("is-hidden", hidden);
  }

  function onScrollFrame() {
    ticking = false;
    var y = window.pageYOffset || 0;
    var delta = y - lastY;

    if (toTop) toTop.classList.toggle("is-visible", y > 600);

    /* Шапка: уезжает при прокрутке вниз, опускается при прокрутке вверх.
       У самого верха показываем её всегда, иначе после возврата наверх
       навигация осталась бы спрятанной.
       Пока открыто меню, шапку не трогаем: меню перекрывает её, и любые
       движения под ним выглядят как дёрганье. */
    if (nav && !(menuDialog && menuDialog.open)) {
      if (y <= 90) {
        setNavHidden(false);
      } else if (delta > NAV_THRESHOLD) {
        setNavHidden(true);
      } else if (delta < -NAV_THRESHOLD) {
        setNavHidden(false);
      }
    }

    // Меню закрываем, когда страница уходит вниз
    if (menuDialog && menuDialog.open && delta > 12) closeMenu();

    lastY = y;
  }

  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onScrollFrame);
  }, { passive: true });

  onScrollFrame();

  if (toTop) {
    toTop.addEventListener("click", function () {
      var smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
      var brand = document.querySelector(".nav__brand");
      if (brand && typeof brand.focus === "function") {
        brand.setAttribute("tabindex", "-1");
        brand.focus({ preventScroll: true });
      }
    });
  }

  /* ---------- Слайдер примеров гравировки ----------
     Прокрутка нативная, поэтому слайдер листается и без скрипта. Здесь только
     стрелки, точки и подсветка текущего слайда. */
  var slider = document.getElementById("engraveSlider");

  if (slider) {
    var track = slider.querySelector(".slider__track");
    var slides = Array.prototype.slice.call(slider.querySelectorAll(".slider__slide"));
    var dots = Array.prototype.slice.call(slider.querySelectorAll(".slider__dot"));
    var prevBtn = slider.querySelector("[data-slider-prev]");
    var nextBtn = slider.querySelector("[data-slider-next]");
    var titleEl = slider.querySelector(".slider__title");
    var textEl = slider.querySelector(".slider__text");
    var current = 0;

    // Название и описание берём из самого слайда: текст живёт рядом с кадром,
    // поэтому не может с ним разъехаться.
    function describe(index) {
      var slide = slides[index];
      if (!slide) return;
      if (titleEl) titleEl.textContent = slide.dataset.title || "";
      if (textEl) textEl.textContent = slide.dataset.text || "";
    }

    function goTo(index) {
      if (!track || !slides.length) return;
      var clamped = Math.max(0, Math.min(slides.length - 1, index));
      current = clamped;
      track.scrollTo({ left: slides[clamped].offsetLeft - track.offsetLeft, behavior: "smooth" });
      paint(clamped);
    }

    function paint(index) {
      dots.forEach(function (dot, i) {
        dot.setAttribute("aria-selected", i === index ? "true" : "false");
      });
      if (prevBtn) prevBtn.disabled = index === 0;
      if (nextBtn) nextBtn.disabled = index === slides.length - 1;
      describe(index);
    }

    // Текущий слайд определяем по фактической прокрутке: так состояние
    // остаётся верным и при свайпе, и при прокрутке колесом.
    var sliderTick = false;
    function syncFromScroll() {
      sliderTick = false;
      if (!track || !track.clientWidth) return;
      var index = Math.round(track.scrollLeft / track.clientWidth);
      if (index !== current) {
        current = Math.max(0, Math.min(slides.length - 1, index));
        paint(current);
      }
    }

    if (track) {
      track.addEventListener("scroll", function () {
        if (sliderTick) return;
        sliderTick = true;
        requestAnimationFrame(syncFromScroll);
      }, { passive: true });
    }

    if (prevBtn) prevBtn.addEventListener("click", function () { goTo(current - 1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { goTo(current + 1); });

    dots.forEach(function (dot, i) {
      // role="tab" требует обработки стрелок клавиатуры: оставляем базовую
      dot.addEventListener("click", function () { goTo(i); });
    });

    slider.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(current - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(current + 1); }
    });

    paint(0);
  }

  /* ---------- Появление при скролле ---------- */
  var items = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Заголовки с эффектом «загорания» и «дыхания»: анимация запускается
  // по классу .is-visible. Тем, что видны сразу, ставим его без ожидания.
  var fxHeads = Array.prototype.slice.call(document.querySelectorAll(".h2--shine, .h2--glow, .hero__title"));

  var showFxHeadsNow = function () {
    fxHeads.forEach(function (el) { el.classList.add("is-visible"); });
  };

  if (reduce) showFxHeadsNow();
  else if (document.readyState === "complete") requestAnimationFrame(showFxHeadsNow);
  else window.addEventListener("load", function () { requestAnimationFrame(showFxHeadsNow); }, { once: true });

  if (!items.length) return;

  if (reduce || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("is-visible"); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });

  items.forEach(function (el, i) {
    // Небольшая задержка по порядку — появление выглядит спокойнее
    el.style.transitionDelay = Math.min(i % 5, 4) * 70 + "ms";
    observer.observe(el);
  });

  /* ---------- Слайдеры кадров внутри карточек ----------
     Прокрутка нативная, поэтому листать можно и без скрипта. Здесь только
     точки-индикаторы: они создаются по числу кадров и подсвечивают текущий.
     Один и тот же код обслуживает все слайдеры на странице, поэтому
     разметку можно дополнять без правок в скрипте. */
  var cardSliders = Array.prototype.slice.call(document.querySelectorAll("[data-slider]"));

  cardSliders.forEach(function (box) {
    var trackEl = box.querySelector(".cslider__track");
    var dotsBox = box.querySelector(".cslider__dots");
    var slideList = Array.prototype.slice.call(box.querySelectorAll(".cslider__slide"));
    if (!trackEl || !dotsBox || slideList.length < 2) return;

    var dots = slideList.map(function (_, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cslider__dot";
      b.setAttribute("aria-label", "Кадр " + (i + 1) + " из " + slideList.length);
      b.addEventListener("click", function () {
        // Подсвечиваем точку сразу, не дожидаясь события прокрутки:
        // иначе отклик на клик запаздывает и выглядит как «не сработало».
        setActive(i);
        trackEl.scrollTo({ left: slideList[i].offsetLeft - trackEl.offsetLeft, behavior: "smooth" });
      });
      dotsBox.appendChild(b);
      return b;
    });

    var currentSlide = -1;

    function setActive(index) {
      if (index === currentSlide) return;
      currentSlide = index;
      dots.forEach(function (d, i) {
        if (i === index) d.setAttribute("aria-current", "true");
        else d.removeAttribute("aria-current");
      });
    }

    var tick = false;

    function sync() {
      tick = false;
      if (!trackEl.clientWidth) return;
      var index = Math.max(0, Math.min(slideList.length - 1, Math.round(trackEl.scrollLeft / trackEl.clientWidth)));
      setActive(index);
    }

    trackEl.addEventListener("scroll", function () {
      if (tick) return;
      tick = true;
      requestAnimationFrame(sync);
    }, { passive: true });

    setActive(0);
  });

  /* ---------- Год в подвале ---------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
