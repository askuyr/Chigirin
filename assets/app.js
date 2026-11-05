/* Кирилл Чигирин, юрист. Меню, появление секций, смена кадра портрета. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* --- Плавная прокрутка (Lenis, локальная копия) ------------------- */
  const lenis = (window.Lenis && !reduceMotion.matches)
    ? new window.Lenis({
        autoRaf: true,
        anchors: { offset: -88 },
        duration: 1.15,
        smoothWheel: true,
        wheelMultiplier: .95,
        touchMultiplier: 1.4,
        respectReducedMotion: true
      })
    : null;

  /* Программный прыжок (якорь из другого места, восстановление позиции,
     отладка) важнее инерции: иначе Lenis возвращает старую позицию. */
  if (lenis) {
    window.addEventListener('scroll', () => {
      if (lenis.isScrolling !== 'smooth') return;
      if (Math.abs(window.scrollY - lenis.animatedScroll) < 120) return;
      lenis.scrollTo(window.scrollY, { immediate: true, force: true });
    }, { passive: true });
  }

  /* --- Мобильное меню ---------------------------------------------- */
  const nav = $('#navigation');
  const menuToggle = $('.menu-toggle');

  if (nav && menuToggle) {
    const setMenu = (open) => {
      menuToggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    };

    menuToggle.addEventListener('click', () => {
      setMenu(menuToggle.getAttribute('aria-expanded') !== 'true');
    });

    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) setMenu(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (menuToggle.getAttribute('aria-expanded') !== 'true') return;
      setMenu(false);
      menuToggle.focus();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 1024) setMenu(false);
    });
  }

  /* --- Появление секций -------------------------------------------- */
  const revealItems = $$('.reveal');

  if (reduceMotion.matches || !('IntersectionObserver' in window)) {
    revealItems.forEach((el) => el.classList.add('is-in'));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -8% 0px' });

    revealItems.forEach((el) => revealObserver.observe(el));
  }

  clearTimeout(window.__revealFailsafe);

  /* Страховка: если наблюдатель не сработал (быстрый скролл, вкладка в фоне),
     контент всё равно становится видимым. */
  setTimeout(() => revealItems.forEach((el) => el.classList.add('is-in')), 5000);

  /* --- Параллакс портрета и фотополосы ----------------------------- */
  const parallaxEls = $$('[data-parallax]');

  if (parallaxEls.length && !reduceMotion.matches) {
    let ticking = false;

    const updateParallax = () => {
      const vh = window.innerHeight;
      parallaxEls.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < -80 || rect.top > vh + 80) return;
        const max = parseFloat(el.dataset.parallax) || 42;
        const progress = (rect.top + rect.height / 2 - vh / 2) / vh;
        const shift = Math.max(-max, Math.min(max, progress * -max * 1.4));
        el.style.setProperty('--px', shift.toFixed(1) + 'px');
      });
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateParallax);
    }, { passive: true });

    updateParallax();
  }

  /* --- Подсветка активного пункта меню ----------------------------- */
  const navLinks = $$('#navigation a[href^="#"]');
  const navTargets = navLinks
    .map((link) => document.getElementById(link.getAttribute('href').slice(1)))
    .filter(Boolean);

  if (navTargets.length && 'IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => {
          if (link.getAttribute('href') === '#' + entry.target.id) {
            link.setAttribute('aria-current', 'true');
          } else {
            link.removeAttribute('aria-current');
          }
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    navTargets.forEach((section) => spy.observe(section));
  }

  /* --- «С чего начать»: подсказка без отправки данных -------------- */
  const chooserOut = $('[data-chooser-out]');

  if (chooserOut) {
    $$('[data-answer]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        chooserOut.hidden = false;
        chooserOut.textContent = link.dataset.answer;
      });
    });
  }

  /* --- Кнопка «наверх» --------------------------------------------- */
  const toTop = $('#to-top');

  if (toTop) {
    let ticking = false;

    const updateToTop = () => {
      toTop.hidden = window.scrollY < 700;
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateToTop);
    }, { passive: true });

    toTop.addEventListener('click', () => {
      if (lenis) {
        lenis.scrollTo(0);
      } else {
        window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      }
      const brand = $('.brand');
      if (brand) brand.focus({ preventScroll: true });
    });

    updateToTop();
  }
})();
