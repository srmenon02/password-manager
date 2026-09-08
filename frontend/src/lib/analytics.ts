const ANALYTICS_SRC = import.meta.env.VITE_ANALYTICS_SRC
const ANALYTICS_DOMAIN = import.meta.env.VITE_ANALYTICS_DOMAIN

// Cookieless, self-hosted analytics (Plausible/Umami). Serve the script from this
// app's own origin (a reverse-proxied path such as /js/script.js) so the page keeps
// its `script-src 'self'` CSP; a cross-origin host would require adding that host to
// both script-src and connect-src in index.html.
export function initAnalytics() {
  if (!ANALYTICS_SRC || !ANALYTICS_DOMAIN) {
    return
  }

  if (document.querySelector('script[data-cipher-analytics]')) {
    return
  }

  const script = document.createElement('script')
  script.defer = true
  script.src = ANALYTICS_SRC
  script.dataset.domain = ANALYTICS_DOMAIN
  script.dataset.cipherAnalytics = 'true'
  document.head.appendChild(script)
}
