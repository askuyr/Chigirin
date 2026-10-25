/* Кирилл Чигирин — юрист. Клиентские скрипты главной страницы. */
(() => {
  'use strict';

  /* ------------------------------------------------------------------
     Настройки. Единственное место, которое нужно править при запуске.
     ------------------------------------------------------------------ */

  // Ссылка на профиль в MAX. Замените на свой профиль, например:
  // 'https://max.ru/u/XXXXXXX'
  const MAX_PROFILE_URL = 'https://max.ru/';

  // Адрес Cloudflare Worker с обработчиком заявок. Пример:
  // 'https://chigirin-lead.example.workers.dev/api/lead'
  // Пока переменная пустая, форма показывает сообщение о недоступности
  // и предлагает телефон — заявки не теряются молча.
  const FORM_ENDPOINT = '';

  const PHONE = '+7 921 974-65-17';

  /* ------------------------------------------------------------------ */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* --- MAX: подставляем профиль во все ссылки ----------------------- */
  if (MAX_PROFILE_URL && MAX_PROFILE_URL !== 'https://max.ru/') {
    $$('.js-max-link').forEach((link) => { link.href = MAX_PROFILE_URL; });
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

  /* --- Кнопки «заявка»: скролл к форме и фокус на первом поле ------ */
  $$('a[href="#zayavka"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const panel = $('#zayavka');
      if (!panel) return;

      event.preventDefault();
      panel.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });

      const firstField = $('#lead-name');
      if (!firstField) return;
      // Небольшая задержка, чтобы фокус не сбил плавную прокрутку.
      window.setTimeout(() => firstField.focus({ preventScroll: true }), reduceMotion.matches ? 0 : 400);
    });
  });

  /* --- Cookie-уведомление ------------------------------------------ */
  const COOKIE_KEY = 'chigirin-cookie-consent';
  const cookieBanner = $('#cookie-banner');

  if (cookieBanner) {
    let stored = null;
    try { stored = window.localStorage.getItem(COOKIE_KEY); } catch (error) { stored = null; }

    if (!stored) {
      cookieBanner.hidden = false;
      cookieBanner.classList.add('is-open');
    }

    cookieBanner.addEventListener('click', (event) => {
      const button = event.target.closest('[data-cookie]');
      if (!button) return;
      try {
        window.localStorage.setItem(COOKIE_KEY, JSON.stringify({
          value: button.getAttribute('data-cookie'),
          date: new Date().toISOString()
        }));
      } catch (error) { /* приватный режим — просто закрываем */ }
      cookieBanner.classList.remove('is-open');
      cookieBanner.hidden = true;
    });
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

  /* --- Форма заявки ------------------------------------------------ */
  const form = $('#lead-form');
  if (!form) return;

  const statusEl = $('#lead-status');
  const submitBtn = $('#lead-submit');
  const submitLabel = submitBtn ? submitBtn.textContent : 'Отправить заявку';

  const fields = {
    name: { input: $('#lead-name'), error: $('#err-name') },
    phone: { input: $('#lead-phone'), error: $('#err-phone') },
    email: { input: $('#lead-email'), error: $('#err-email') },
    message: { input: $('#lead-message'), error: $('#err-message') }
  };
  const consent = $('#lead-consent');
  const consentError = $('#err-consent');

  const MESSAGES = {
    name: 'Укажите имя, чтобы понимать, как к вам обращаться.',
    phone: 'Укажите телефон для связи: не менее 10 цифр.',
    email: 'Проверьте адрес: например, name@example.ru',
    message: 'Слишком длинное описание — до 2000 символов.',
    consent: 'Без согласия на обработку данных отправить заявку нельзя.',
    network: 'Не удалось отправить заявку. Проверьте соединение или позвоните: ' + PHONE + '.',
    server: 'Сервис отправки временно недоступен. Позвоните: ' + PHONE + ' или напишите на c.chigirin@yandex.ru.',
    disabled: 'Форма ещё не подключена к серверу. Позвоните: ' + PHONE + ' или напишите на c.chigirin@yandex.ru.',
    success: 'Заявка отправлена. Свяжусь с вами в рабочее время по указанному телефону.'
  };

  const digits = (value) => (value || '').replace(/\D/g, '');

  const validators = {
    name(value) {
      if (!value.trim()) return MESSAGES.name;
      if (value.trim().length < 2) return MESSAGES.name;
      return '';
    },
    phone(value) {
      const count = digits(value).length;
      if (!count) return MESSAGES.phone;
      if (count < 10 || count > 11) return MESSAGES.phone;
      return '';
    },
    email(value) {
      if (!value.trim()) return '';
      const ok = /^[^\s@]+@[^\s@]+\.[a-zA-Zа-яА-Я]{2,}$/.test(value.trim());
      return ok ? '' : MESSAGES.email;
    },
    message(value) {
      return value.length > 2000 ? MESSAGES.message : '';
    }
  };

  const setFieldError = (key, message) => {
    const field = fields[key];
    if (!field || !field.input || !field.error) return;
    field.error.textContent = message;
    if (message) {
      field.input.setAttribute('aria-invalid', 'true');
    } else {
      field.input.removeAttribute('aria-invalid');
    }
  };

  const setConsentError = (message) => {
    if (!consent || !consentError) return;
    consentError.textContent = message;
    if (message) {
      consent.setAttribute('aria-invalid', 'true');
    } else {
      consent.removeAttribute('aria-invalid');
    }
  };

  const validate = () => {
    let firstInvalid = null;

    Object.keys(fields).forEach((key) => {
      const field = fields[key];
      if (!field.input) return;
      const message = validators[key](field.input.value);
      setFieldError(key, message);
      if (message && !firstInvalid) firstInvalid = field.input;
    });

    const consentMessage = consent && !consent.checked ? MESSAGES.consent : '';
    setConsentError(consentMessage);
    if (consentMessage && !firstInvalid) firstInvalid = consent;

    return firstInvalid;
  };

  Object.keys(fields).forEach((key) => {
    const field = fields[key];
    if (!field.input) return;
    field.input.addEventListener('blur', () => {
      if (!field.input.value.trim() && key !== 'message') return;
      setFieldError(key, validators[key](field.input.value));
    });
    field.input.addEventListener('input', () => {
      if (field.input.getAttribute('aria-invalid') !== 'true') return;
      setFieldError(key, validators[key](field.input.value));
    });
  });

  if (consent) {
    consent.addEventListener('change', () => {
      if (consent.checked) setConsentError('');
    });
  }

  const showStatus = (state, message) => {
    if (!statusEl) return;
    statusEl.dataset.state = state;
    statusEl.textContent = message;
  };

  const clearStatus = () => {
    if (!statusEl) return;
    delete statusEl.dataset.state;
    statusEl.textContent = '';
  };

  const normalizePhone = (value) => {
    const count = digits(value);
    if (count.length === 11 && count[0] === '8') return '+7' + count.slice(1);
    if (count.length === 11 && count[0] === '7') return '+' + count;
    if (count.length === 10) return '+7' + count;
    return value.trim();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus();

    const firstInvalid = validate();
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    if (!FORM_ENDPOINT) {
      showStatus('error', MESSAGES.disabled);
      return;
    }

    const payload = {
      name: fields.name.input.value.trim(),
      phone: normalizePhone(fields.phone.input.value),
      email: fields.email.input.value.trim(),
      message: fields.message.input.value.trim(),
      consent: true,
      company: ($('#lead-company') && $('#lead-company').value) || '',
      page: window.location.href,
      sentAt: new Date().toISOString()
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
      submitBtn.textContent = 'Отправляем…';
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) throw new Error('HTTP ' + response.status);

      form.reset();
      Object.keys(fields).forEach((key) => setFieldError(key, ''));
      setConsentError('');
      showStatus('success', MESSAGES.success);
    } catch (error) {
      const message = error && error.name === 'AbortError' ? MESSAGES.network : MESSAGES.server;
      showStatus('error', message);
    } finally {
      window.clearTimeout(timer);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
        submitBtn.textContent = submitLabel;
      }
    }
  });
})();
