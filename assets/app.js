/* Кирилл Чигирин, юрист. Меню, появление секций, смена кадра портрета. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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

  /* --- Смена кадра портрета: общий, надпись, лицо ------------------- */
  const shots = $$('.shot');
  const stageSections = [$('#home'), $('#about'), $('#process')].filter(Boolean);

  if (shots.length > 1 && stageSections.length > 1 && !reduceMotion.matches && window.matchMedia('(min-width: 901px)').matches && 'IntersectionObserver' in window) {
    const setShot = (name) => {
      shots.forEach((img) => img.classList.toggle('is-active', img.dataset.shot === name));
    };

    const shotObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        setShot(entry.target.dataset.shotName);
      });
    }, { rootMargin: '-25% 0px -55% 0px' });

    stageSections.forEach((el) => {
      el.dataset.shotName = el.id;
      shotObserver.observe(el);
    });
  }

  /* --- Медленное движение фотополосы ------------------------------- */
  const parallax = $('[data-parallax]');

  if (parallax && !reduceMotion.matches) {
    let ticking = false;

    const updateParallax = () => {
      const rect = parallax.getBoundingClientRect();
      const vh = window.innerHeight;
      if (rect.bottom > 0 && rect.top < vh) {
        const progress = (rect.top + rect.height / 2 - vh / 2) / vh;
        const shift = Math.max(-42, Math.min(42, progress * -56));
        parallax.style.setProperty('--px', shift.toFixed(1) + 'px');
      }
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
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      const brand = $('.brand');
      if (brand) brand.focus({ preventScroll: true });
    });

    updateToTop();
  }
})();
