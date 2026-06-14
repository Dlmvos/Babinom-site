/**
 * Babinom cookie banner.
 *
 * Vanilla JS, no dependencies. Drop <script defer src="/assets/cookie-banner.js">
 * on every page. Provides:
 *
 *   - First-visit banner offering Accept All / Necessary only / Settings.
 *   - Per-category toggles in the Settings expansion. Currently one
 *     non-essential category: analytics (PostHog).
 *   - Persistent storage in localStorage under key BABINOM_COOKIE_CONSENT.
 *   - Re-open at any time via window.babinomConsent.show()
 *     OR by clicking any element with href="#cookie-preferences" /
 *     [data-babinom-cookie-prefs].
 *   - window.babinomConsent.get('analytics') returns true/false.
 *   - Dispatches CustomEvent('babinom:consent-updated', {detail}) on body
 *     so other scripts (e.g. PostHog init) can react.
 *
 * Versioning: bump CONSENT_VERSION when you add a category or materially
 * change uses; banner re-shows so users can confirm afresh.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'babinom_cookie_consent';
  var CONSENT_VERSION = 1;

  var DEFAULT_CONSENT = {
    necessary: true, // always on, not user-toggleable
    analytics: false,
    version: CONSENT_VERSION,
    ts: 0,
  };

  // ── Storage helpers ──────────────────────────────────────────────────────

  function readConsent() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      // Re-prompt on version bump
      if (parsed.version !== CONSENT_VERSION) return null;
      return Object.assign({}, DEFAULT_CONSENT, parsed);
    } catch (e) {
      return null;
    }
  }

  function writeConsent(consent) {
    try {
      var stored = Object.assign({}, DEFAULT_CONSENT, consent, {
        version: CONSENT_VERSION,
        ts: Date.now(),
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      document.body.dispatchEvent(
        new CustomEvent('babinom:consent-updated', { detail: stored, bubbles: true }),
      );
      return stored;
    } catch (e) {
      return Object.assign({}, DEFAULT_CONSENT, consent);
    }
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      children.forEach(function (c) {
        if (c) node.appendChild(c);
      });
    }
    return node;
  }

  // ── Styles (injected once) ───────────────────────────────────────────────

  function ensureStyles() {
    if (document.getElementById('babinom-cookie-style')) return;
    var css =
      '#babinom-cookie-banner{position:fixed;left:16px;right:16px;bottom:16px;max-width:540px;margin:0 auto;' +
      'background:#fff;color:#25313b;border:1px solid rgba(37,49,59,0.12);border-radius:20px;' +
      'box-shadow:0 18px 48px rgba(87,62,42,0.18);padding:20px 22px;z-index:9999;' +
      'font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
      'line-height:1.55;font-size:0.95rem;}' +
      '#babinom-cookie-banner h2{margin:0 0 6px;font-size:1.05rem;letter-spacing:-0.02em;}' +
      '#babinom-cookie-banner p{margin:0 0 14px;color:#6f7b84;}' +
      '#babinom-cookie-banner a{color:#d96f61;font-weight:700;text-underline-offset:3px;}' +
      '#babinom-cookie-banner .babinom-cookie-actions{display:flex;flex-wrap:wrap;gap:8px;}' +
      '#babinom-cookie-banner button{border:0;border-radius:999px;padding:10px 16px;font-weight:800;' +
      'font-family:inherit;font-size:0.92rem;cursor:pointer;min-height:40px;}' +
      '#babinom-cookie-banner button.primary{background:#25313b;color:#fff;}' +
      '#babinom-cookie-banner button.secondary{background:#fff;border:1px solid rgba(37,49,59,0.18);color:#25313b;}' +
      '#babinom-cookie-banner button.link{background:transparent;color:#6f7b84;padding:10px 4px;text-decoration:underline;}' +
      '#babinom-cookie-banner .babinom-cookie-categories{display:none;margin:14px 0 12px;border-top:1px solid rgba(37,49,59,0.08);padding-top:14px;}' +
      '#babinom-cookie-banner.expanded .babinom-cookie-categories{display:block;}' +
      '#babinom-cookie-banner .babinom-cookie-cat{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;}' +
      '#babinom-cookie-banner .babinom-cookie-cat label{display:block;font-weight:700;}' +
      '#babinom-cookie-banner .babinom-cookie-cat .desc{color:#6f7b84;font-size:0.88rem;margin-top:2px;}' +
      '#babinom-cookie-banner input[type=checkbox]{width:18px;height:18px;margin-top:3px;accent-color:#d96f61;}' +
      '#babinom-cookie-banner input[type=checkbox]:disabled{opacity:0.45;}' +
      '@media (max-width:520px){#babinom-cookie-banner{left:8px;right:8px;bottom:8px;padding:18px;}}';
    var style = document.createElement('style');
    style.id = 'babinom-cookie-style';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ── Banner ───────────────────────────────────────────────────────────────

  function buildBanner(initial) {
    ensureStyles();
    var current = initial || readConsent() || DEFAULT_CONSENT;
    var existing = document.getElementById('babinom-cookie-banner');
    if (existing) existing.parentNode.removeChild(existing);

    var analyticsCheckbox = el('input', {
      type: 'checkbox',
      id: 'babinom-cookie-analytics',
    });
    analyticsCheckbox.checked = !!current.analytics;

    var necessaryCheckbox = el('input', {
      type: 'checkbox',
      id: 'babinom-cookie-necessary',
      checked: 'checked',
      disabled: 'disabled',
    });

    var categories = el(
      'div',
      { className: 'babinom-cookie-categories', id: 'babinom-cookie-categories' },
      [
        el('div', { className: 'babinom-cookie-cat' }, [
          necessaryCheckbox,
          el('div', {}, [
            el('label', { for: 'babinom-cookie-necessary', text: 'Strictly necessary' }),
            el('div', {
              className: 'desc',
              text:
                'Required for the site to function (session, security, your cookie preference). Always on.',
            }),
          ]),
        ]),
        el('div', { className: 'babinom-cookie-cat' }, [
          analyticsCheckbox,
          el('div', {}, [
            el('label', { for: 'babinom-cookie-analytics', text: 'Analytics' }),
            el('div', {
              className: 'desc',
              text:
                'PostHog product analytics so we can understand how visitors find and use the site. Off by default.',
            }),
          ]),
        ]),
      ],
    );

    var acceptAllBtn = el('button', { className: 'primary', type: 'button', text: 'Accept all' });
    var necessaryBtn = el('button', { className: 'secondary', type: 'button', text: 'Necessary only' });
    var settingsBtn = el('button', { className: 'link', type: 'button', text: 'Settings' });
    var saveBtn = el('button', { className: 'primary', type: 'button', text: 'Save preferences' });
    saveBtn.style.display = 'none';

    var actions = el('div', { className: 'babinom-cookie-actions' }, [
      acceptAllBtn,
      necessaryBtn,
      settingsBtn,
      saveBtn,
    ]);

    var banner = el(
      'div',
      {
        id: 'babinom-cookie-banner',
        role: 'dialog',
        'aria-modal': 'false',
        'aria-label': 'Cookie preferences',
      },
      [
        el('h2', { text: 'We use cookies' }),
        el('p', {
          html:
            'Babinom uses strictly necessary cookies to run the site, and (with your consent) PostHog analytics so we can improve it. Read our <a href="/cookies/">Cookie Policy</a> and <a href="/privacy/">Privacy Policy</a>.',
        }),
        categories,
        actions,
      ],
    );

    document.body.appendChild(banner);

    function close() {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }

    acceptAllBtn.addEventListener('click', function () {
      writeConsent({ analytics: true });
      close();
    });
    necessaryBtn.addEventListener('click', function () {
      writeConsent({ analytics: false });
      close();
    });
    settingsBtn.addEventListener('click', function () {
      banner.classList.add('expanded');
      acceptAllBtn.style.display = 'none';
      necessaryBtn.style.display = 'none';
      settingsBtn.style.display = 'none';
      saveBtn.style.display = '';
    });
    saveBtn.addEventListener('click', function () {
      writeConsent({ analytics: analyticsCheckbox.checked });
      close();
    });
  }

  function showBanner() {
    buildBanner(readConsent());
  }

  // ── Public API ───────────────────────────────────────────────────────────

  window.babinomConsent = {
    show: showBanner,
    get: function (category) {
      var c = readConsent();
      if (!c) return null;
      return !!c[category];
    },
    revoke: function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      showBanner();
    },
    has: function () {
      return readConsent() !== null;
    },
  };

  // ── First-visit auto-show ────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    // Wire any "Cookie Preferences" link in the footer
    var prefSelectors = ['a[href="#cookie-preferences"]', '[data-babinom-cookie-prefs]'];
    prefSelectors.forEach(function (sel) {
      var nodes = document.querySelectorAll(sel);
      Array.prototype.forEach.call(nodes, function (node) {
        node.addEventListener('click', function (ev) {
          ev.preventDefault();
          showBanner();
        });
      });
    });

    if (!window.babinomConsent.has()) {
      // Slight delay so first paint isn't hijacked
      setTimeout(showBanner, 250);
    }
  });
})();
