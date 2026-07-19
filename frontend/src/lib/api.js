/**
 * PersonaPost AI — API client
 *
 * Manages the base URL, authentication token (in-memory only — never
 * localStorage for XSS safety), and all endpoint wrappers.
 */

export const apiConfig = {
  baseUrl: (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/$/, ''),
}

// ── Auth token (sessionStorage to survive page refreshes securely) ─────────────
let _token = typeof window !== 'undefined' ? sessionStorage.getItem('token') : null

export function setAuthToken(token) {
  _token = token
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem('token', token)
    } else {
      sessionStorage.removeItem('token')
    }
  }
}

export function clearAuthToken() {
  _token = null
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('token')
  }
}

export function hasAuthToken() {
  return !!_token
}

function _authHeaders() {
  return _token ? { Authorization: `Bearer ${_token}` } : {}
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(`${apiConfig.baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ..._authHeaders(), ...(options.headers || {}) },
  })

  if (res.status === 401) {
    clearAuthToken()
    // Propagate so the UI can show the login screen
    throw Object.assign(new Error('Unauthorized — please log in again.'), { status: 401 })
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After') || '60'
    throw Object.assign(
      new Error(`Rate limit reached. Please wait ${retryAfter}s before generating again.`),
      { status: 429 }
    )
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }

  // 204 No Content
  if (res.status === 204) return null
  return res.json()
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export async function login(username, password) {
  const form = new URLSearchParams()
  form.append('username', username)
  form.append('password', password)

  const res = await fetch(`${apiConfig.baseUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })

  if (!res.ok) throw new Error('Invalid username or password.')
  const data = await res.json()
  setAuthToken(data.access_token)
  return data
}

export async function getMe() {
  return apiFetch('/auth/me')
}

// ── Health ───────────────────────────────────────────────────────────────────
export async function getHealth() {
  return apiFetch('/health')
}

// ── Voice profile ─────────────────────────────────────────────────────────────
export async function createVoiceProfile(payload) {
  return apiFetch('/voice-profile', { method: 'POST', body: JSON.stringify(payload) })
}

// ── Trends ────────────────────────────────────────────────────────────────────
export async function getTrends(niche = 'ai') {
  return apiFetch(`/trends?niche=${encodeURIComponent(niche)}`)
}

// ── Knowledge ─────────────────────────────────────────────────────────────────
export async function ingestKnowledge(payload) {
  return apiFetch('/knowledge/ingest', { method: 'POST', body: JSON.stringify(payload) })
}

export async function retrieveKnowledge(payload) {
  return apiFetch('/knowledge/retrieve', { method: 'POST', body: JSON.stringify(payload) })
}

// ── Draft ─────────────────────────────────────────────────────────────────────
export async function createDraft(payload) {
  return apiFetch('/draft', { method: 'POST', body: JSON.stringify(payload) })
}

export async function refineDraft(payload) {
  return apiFetch('/draft/refine', { method: 'POST', body: JSON.stringify(payload) })
}

export async function updateDraft(draftId, payload) {
  return apiFetch(`/draft/${draftId}`, { method: 'PUT', body: JSON.stringify(payload) })
}

// ── Calendar ──────────────────────────────────────────────────────────────────
export async function getCalendar(limit = 50) {
  return apiFetch(`/calendar?limit=${limit}`)
}

export async function updateCalendarEntry(entryId, payload) {
  return apiFetch(`/calendar/${entryId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}
