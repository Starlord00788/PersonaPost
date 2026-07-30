/**
 * PersonaPost AI — API client
 * Multi-user, notification-aware
 */

export const apiConfig = {
  baseUrl: (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/$/, ''),
}

// ── Auth token ────────────────────────────────────────────────────────────────
let _token = null
let _currentUser = null  // { user_id, username, display_name }

export function setAuthToken(token, userData = null) {
  _token = token
  if (userData) _currentUser = userData
  try { localStorage.setItem('pp_token', token) } catch {}
  if (userData) {
    try { localStorage.setItem('pp_user', JSON.stringify(userData)) } catch {}
  }
}

export function clearAuthToken() {
  _token = null
  _currentUser = null
  try {
    localStorage.removeItem('pp_token')
    localStorage.removeItem('pp_user')
  } catch {}
}

export function hasAuthToken() {
  if (_token) return true
  try {
    const stored = localStorage.getItem('pp_token')
    if (stored) {
      _token = stored
      const userStored = localStorage.getItem('pp_user')
      if (userStored) _currentUser = JSON.parse(userStored)
      return true
    }
  } catch {}
  return false
}

export function getCurrentUser() {
  if (_currentUser) return _currentUser
  try {
    const stored = localStorage.getItem('pp_user')
    if (stored) { _currentUser = JSON.parse(stored); return _currentUser }
  } catch {}
  return null
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
    throw Object.assign(new Error('Session expired — please log in again.'), { status: 401 })
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
  if (res.status === 204) return null
  return res.json()
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export async function login(username, password, rememberMe = false) {
  const form = new URLSearchParams()
  form.append('username', username)
  form.append('password', password)

  const res = await fetch(`${apiConfig.baseUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })

  if (res.status === 401) throw new Error('Incorrect username or password.')
  if (res.status === 422) throw new Error('Username and password are required.')
  if (!res.ok) throw new Error('Login failed. Please try again.')
  const data = await res.json()
  setAuthToken(data.access_token, data.user || null)
  if (rememberMe) {
    try { localStorage.setItem('pp_remember_user', username) } catch {}
  }
  return data
}

export async function register(displayName, email, username, password) {
  const res = await fetch(`${apiConfig.baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: displayName, email, username, password }),
  })
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || 'Username or email already taken.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || 'Registration failed. Please try again.')
  }
  const data = await res.json()
  setAuthToken(data.access_token, data.user || null)
  return data
}

export async function googleAuth(idToken) {
  const res = await fetch(`${apiConfig.baseUrl}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || 'Google sign-in failed.')
  }
  const data = await res.json()
  setAuthToken(data.access_token, data.user || null)
  return data
}

export function getSavedUsername() {
  try { return localStorage.getItem('pp_remember_user') || '' } catch { return '' }
}

export async function getMe() {
  return apiFetch('/auth/me')
}

export async function changePassword(currentPassword, newPassword) {
  return apiFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
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

export async function createMultiPlatformDraft(payload) {
  return apiFetch('/draft/multi-platform', { method: 'POST', body: JSON.stringify(payload) })
}

export async function refineDraft(payload) {
  return apiFetch('/draft/refine', { method: 'POST', body: JSON.stringify(payload) })
}

export async function updateDraft(draftId, payload) {
  return apiFetch(`/draft/${draftId}`, { method: 'PUT', body: JSON.stringify(payload) })
}

// ── Competitor ────────────────────────────────────────────────────────────────
export async function analyzeCompetitor(payload) {
  return apiFetch('/competitor/analyze', { method: 'POST', body: JSON.stringify(payload) })
}

// ── Calendar ──────────────────────────────────────────────────────────────────
export async function getCalendar(limit = 50) {
  return apiFetch(`/calendar?limit=${limit}`)
}

export async function updateCalendarEntry(entryId, payload) {
  return apiFetch(`/calendar/${entryId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

// ── Notifications ─────────────────────────────────────────────────────────────
export async function getNotifications(limit = 20) {
  return apiFetch(`/notifications?limit=${limit}`)
}

export async function getNotificationCount() {
  return apiFetch('/notifications/count')
}

export async function markAllNotificationsRead() {
  return apiFetch('/notifications/read-all', { method: 'POST' })
}

export async function markNotificationRead(id) {
  return apiFetch(`/notifications/${id}/read`, { method: 'POST' })
}

export async function checkUpcomingNotifications() {
  return apiFetch('/notifications/check', { method: 'POST' })
}

// ── localStorage state helpers ────────────────────────────────────────────────
export function saveState(key, value) {
  try { localStorage.setItem(`pp_state_${key}`, JSON.stringify(value)) } catch {}
}

export function loadState(key, fallback = null) {
  try {
    const raw = localStorage.getItem(`pp_state_${key}`)
    return raw !== null ? JSON.parse(raw) : fallback
  } catch { return fallback }
}
