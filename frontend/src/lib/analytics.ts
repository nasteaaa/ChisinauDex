import { api } from './api'
import { getPrefs } from './prefs'

// First-party page-view analytics, sent only after the user accepted analytics cookies.

function sessionId(): string {
  try {
    let id = sessionStorage.getItem('chisinaudex.sid')
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem('chisinaudex.sid', id)
    }
    return id
  } catch {
    return 'anon'
  }
}

export function trackPageView(path: string) {
  if (!getPrefs().consent?.analytics) return
  api('/api/events', { method: 'POST', body: JSON.stringify({ type: 'page_view', path, sessionId: sessionId() }) }).catch(() => {})
}
