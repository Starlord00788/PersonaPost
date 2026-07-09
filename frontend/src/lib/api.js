const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  'http://localhost:8000/api'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const data = await response.json()
      message = data.detail || data.message || message
    } catch {
      const text = await response.text()
      if (text) {
        message = text
      }
    }
    throw new Error(message)
  }

  return response.json()
}

export function getHealth() {
  return request('/health')
}

export function createVoiceProfile(payload) {
  return request('/voice-profile', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getTrends(niche) {
  const query = new URLSearchParams({ niche }).toString()
  return request(`/trends?${query}`)
}

export function createDraft(payload) {
  return request('/draft', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function ingestKnowledge(payload) {
  return request('/knowledge/ingest', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function retrieveKnowledge(payload) {
  return request('/knowledge/retrieve', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getCalendar(limit = 50) {
  const query = new URLSearchParams({ limit: String(limit) }).toString()
  return request(`/calendar?${query}`)
}

export const apiConfig = {
  baseUrl: API_BASE_URL,
}
