/**
 * Consent-gated PostHog loader for babinom.com.
 *
 * The rule this file exists to enforce: **nothing loads, and no cookie is set,
 * until the visitor has actively consented to analytics.** Under the GDPR and
 * the ePrivacy Directive, loading an analytics script first and asking
 * afterwards is the violation — the script is what sets the cookie, so the
 * gate has to be on the load, not on some later flag.
 *
 * Contract with assets/cookie-banner.js:
 *   - window.babinomConsent.get('analytics') -> true | false | null (unasked)
 *   - document.body emits 'babinom:consent-updated' with the new consent object
 *
 * Three states, all handled:
 *   unasked  -> load nothing, wait for the banner
 *   granted  -> load PostHog once
 *   revoked  -> if already loaded, opt out and clear its cookies
 *
 * TO ACTIVATE: set POSTHOG_KEY below to the project's Public/Project API key
 * (PostHog -> Project settings -> Project API key; it starts `phc_`). Until
 * then this file is inert — it is safe to ship un-keyed, and the site behaves
 * exactly as it does today: no analytics at all.
 *
 * The key is public by design; it can only write events, never read them. Do
 * NOT put a personal API key here.
 */
(function () {
  'use strict';

  // ── Configuration ────────────────────────────────────────────────────────
  var POSTHOG_KEY = ''; // e.g. 'phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  // EU residency, matching the mobile app and what the privacy policy states.
  var POSTHOG_HOST = 'https://eu.i.posthog.com';

  var loaded = false;

  function cookieDomains() {
    // Clear on both the exact host and the registrable domain, since PostHog
    // sets on the latter.
    var host = location.hostname;
    var parts = host.split('.');
    var out = [host];
    if (parts.length > 2) out.push('.' + parts.slice(-2).join('.'));
    else out.push('.' + host);
    return out;
  }

  /** Remove ph_* cookies so revoking consent leaves nothing behind. */
  function clearPostHogCookies() {
    try {
      var names = document.cookie.split(';').map(function (c) {
        return c.split('=')[0].trim();
      });
      names.forEach(function (name) {
        if (name.indexOf('ph_') !== 0) return;
        cookieDomains().forEach(function (d) {
          document.cookie =
            name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + d;
        });
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      });
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf('ph_') === 0) localStorage.removeItem(k);
      });
    } catch (e) {
      /* best effort — never let cleanup break the page */
    }
  }

  function loadPostHog() {
    if (loaded || !POSTHOG_KEY) return;
    loaded = true;

    // Official PostHog snippet, trimmed. Loads the library, then initialises.
    !(function (t, e) {
      var o, n, p, r;
      e.__SV ||
        ((window.posthog = e),
        (e._i = []),
        (e.init = function (i, s, a) {
          function g(t, e) {
            var o = e.split('.');
            2 == o.length && ((t = t[o[0]]), (e = o[1]));
            t[e] = function () {
              t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
            };
          }
          ((p = t.createElement('script')).type = 'text/javascript'),
            (p.crossOrigin = 'anonymous'),
            (p.async = !0),
            (p.src = s.api_host + '/static/array.js'),
            (r = t.getElementsByTagName('script')[0]).parentNode.insertBefore(p, r);
          var u = e;
          for (
            void 0 !== a ? (u = e[a] = []) : (a = 'posthog'),
              u.people = u.people || [],
              u.toString = function (t) {
                var e = 'posthog';
                return 'posthog' !== a && (e += '.' + a), t || (e += ' (stub)'), e;
              },
              u.people.toString = function () {
                return u.toString(1) + '.people (stub)';
              },
              o =
                'init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug'.split(
                  ' ',
                ),
              n = 0;
            n < o.length;
            n++
          )
            g(u, o[n]);
          e._i.push([i, s, a]);
        }),
        (e.__SV = 1));
    })(document, window.posthog || []);

    window.posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // Consent is handled here, by not loading at all until granted. Telling
      // PostHog to also default to opted-out would double-gate it, but it is
      // cheap insurance if this file is ever wired up differently.
      opt_out_capturing_by_default: false,
      // No session recording on a marketing site: it would capture far more
      // than the cookie policy describes.
      disable_session_recording: true,
      persistence: 'localStorage+cookie',
    });
  }

  function applyConsent(granted) {
    if (granted) {
      loadPostHog();
      return;
    }
    // Revoked after having been granted: stop sending and clean up.
    if (window.posthog && typeof window.posthog.opt_out_capturing === 'function') {
      try {
        window.posthog.opt_out_capturing();
      } catch (e) {}
    }
    clearPostHogCookies();
  }

  // Initial state on page load. `null` means the visitor has not chosen yet —
  // load nothing.
  var initial = window.babinomConsent && window.babinomConsent.get('analytics');
  if (initial === true) loadPostHog();

  // React to a choice made (or changed) on this page.
  document.addEventListener('babinom:consent-updated', function (ev) {
    applyConsent(!!(ev.detail && ev.detail.analytics));
  });
})();
