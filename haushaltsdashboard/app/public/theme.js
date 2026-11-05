/* Device-local appearance. Financial data and shared household state are untouched. */
(() => {
  'use strict';
  const key = 'haushalt-appearance';
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const valid = value => ['auto', 'light', 'dark'].includes(value) ? value : 'auto';
  let mode = 'auto';
  try { mode = valid(localStorage.getItem(key)); } catch { /* Private storage may be unavailable. */ }

  function hostTheme() {
    // Home Assistant ingress is normally same-origin. Cross-origin hosts use device preference.
    try {
      let host = window.parent;
      for (let depth = 0; host !== window && depth < 3; depth++) {
        for (const element of [host.document.body, host.document.documentElement]) {
          if (!element) continue;
          const scheme = host.getComputedStyle(element).colorScheme;
          if (scheme === 'dark' || scheme === 'light') return scheme;
        }
        if (host.parent === host) break;
        host = host.parent;
      }
    } catch { /* A different origin cannot be inspected. */ }
    return media.matches ? 'dark' : 'light';
  }

  function apply() {
    const theme = mode === 'auto' ? hostTheme() : mode;
    root.dataset.theme = theme;
    root.dataset.themeMode = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#101b28' : '#142943';
    document.querySelectorAll('[data-theme-select]').forEach(select => { select.value = mode; });
  }

  apply(); // Blocking head script prevents a flash of the wrong theme.
  document.addEventListener('DOMContentLoaded', apply, { once: true });
  document.addEventListener('change', event => {
    if (!event.target.matches('[data-theme-select]')) return;
    mode = valid(event.target.value);
    try { localStorage.setItem(key, mode); } catch { /* Apply for this session anyway. */ }
    apply();
  });
  media.addEventListener('change', apply);
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      mode = valid(event.newValue);
      apply();
    }
  });
  // Observe only appearance attributes, never the parent app's content or credentials.
  try {
    let host = window.parent;
    const observer = new MutationObserver(apply);
    for (let depth = 0; host !== window && depth < 3; depth++) {
      for (const element of [host.document.documentElement, host.document.body]) {
        if (element) observer.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
      }
      if (host.parent === host) break;
      host = host.parent;
    }
    // The observer shares this document's lifetime, including back/forward cache restores.
  } catch { /* Cross-origin embedding follows device preference. */ }
})();
