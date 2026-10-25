/* Кирилл Чигирин — юрист. Клиентские скрипты: меню, появление секций, навигация. */
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
      if (window.innerWidth > 1100) setMenu(false);
    });
  }

  /* --- Появление секций при скролле -------------------------------- */
  const revealItems = $$('.reveal');

  if (reduceMotion.matches || !('IntersectionObserver' in window)) {
    revealItems.forEach((el) => el.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealItems.forEach((el) => revealObserver.observe(el));
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

  /* --- FAQ: эксклюзивное раскрытие для старых браузеров ----------- */
  const faqItems = $$('details[name="faq"]');
  const supportsExclusive = (() => {
    const el = document.createElement('details');
    return 'name' in el;
  })();

  if (faqItems.length && !supportsExclusive) {
    faqItems.forEach((item) => {
      item.addEventListener('toggle', () => {
        if (!item.open) return;
        faqItems.forEach((other) => { if (other !== item) other.open = false; });
      });
    });
  }
})();
