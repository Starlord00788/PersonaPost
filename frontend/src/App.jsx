import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion'
import {
  Mic2, TrendingUp, Database, FileText, Calendar,
  ArrowRight, RefreshCw, CheckCircle2, AlertCircle, Info,
  Loader2, ChevronRight, Sparkles, Zap, Search,
  Upload, Eye, BookOpen, Activity, LogOut, Edit3, Save,
  Share2, Camera, X, Lock, User, Volume2, VolumeX,
  Brain, Lightbulb, MessageSquare, Tag, ListChecks, Flame,
  Copy, Check, Clock, Target, BarChart2, Swords, ChevronLeft,
  ChevronDown, Plus, Layers, Bell, UserCircle2, KeyRound,
  AtSign, EyeOff, CalendarClock, ShieldCheck,
} from 'lucide-react'
import './styles.css'
import {
  apiConfig, createDraft, createVoiceProfile, getCalendar,
  getHealth, getTrends, ingestKnowledge, retrieveKnowledge,
  login as apiLogin, googleAuth, getSavedUsername, register as apiRegister,
  clearAuthToken, hasAuthToken, refineDraft, updateDraft,
  createMultiPlatformDraft, analyzeCompetitor,
  saveState, loadState, getCurrentUser,
  getNotifications, getNotificationCount, markAllNotificationsRead,
  markNotificationRead, checkUpcomingNotifications, updateCalendarEntry,
  changePassword,
} from './lib/api'

// New endpoints added for stats, export, streaming
async function getStats() {
  const token = localStorage.getItem('pp_token')
  const res = await fetch(`${apiConfig.baseUrl}/stats`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Failed to load stats')
  return res.json()
}
async function exportDrafts(format = 'csv') {
  const token = localStorage.getItem('pp_token')
  const res = await fetch(`${apiConfig.baseUrl}/drafts/export?format=${format}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Export failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `personapost_drafts.${format}`
  a.click(); URL.revokeObjectURL(url)
}
async function streamDraft(payload, onToken, onDone, signal) {
  const token = localStorage.getItem('pp_token')
  const res = await fetch(`${apiConfig.baseUrl}/draft/stream`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Stream failed')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') { onDone(); return }
      try { const parsed = JSON.parse(data); if (parsed.token) onToken(parsed.token) } catch {}
    }
  }
  onDone()
}

/* ── Utils ───────────────────────────────────────────────────────────────── */
function toLines(t) { return t.split('\n').map(l => l.trim()).filter(Boolean) }
function cls(...c) { return c.filter(Boolean).join(' ') }

/* ── Custom Cursor — expands on hover over interactive elements ──────────── */
function Cursor() {
  const mx = useMotionValue(0), my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 120, damping: 18 })
  const sy = useSpring(my, { stiffness: 120, damping: 18 })
  useEffect(() => {
    const move = e => { mx.set(e.clientX); my.set(e.clientY) }
    const over = e => {
      const t = e.target
      const interactive = t.closest('button,a,[role="button"],[role="switch"],label,.nav-item,.mag-btn')
      const ring = document.getElementById('cursor-ring')
      if (ring) ring.classList.toggle('hovered', !!interactive)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseover', over)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseover', over)
    }
  }, [mx, my])
  return (
    <>
      <motion.div id="cursor-dot"  style={{ x: mx, y: my }} />
      <motion.div id="cursor-ring" style={{ x: sx, y: sy }} />
    </>
  )
}

/* ── Ticker ──────────────────────────────────────────────────────────────── */
const TICKER_ITEMS = [
  'Voice Profiling', 'Trend Intelligence', 'RAG Pipeline',
  'Multi-Platform Generation', 'Quality Reviewer', 'Content Calendar',
  'Groq LLM', 'Competitor Analysis', 'FastAPI', 'React + Vite', 'JWT Auth', 'Google OAuth',
]
function Ticker() {
  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS]
  return (
    <div className="ticker-wrap">
      <div className="ticker-track">
        {doubled.map((item, i) => (
          <span key={i} className="ticker-item">{item}<span className="ticker-sep" /></span>
        ))}
      </div>
    </div>
  )
}

/* ── Spinner ─────────────────────────────────────────────────────────────── */
function Spin({ size = 14 }) { return <Loader2 size={size} className="animate-spin" /> }

/* ── Copy Button ─────────────────────────────────────────────────────────── */
function CopyBtn({ text, className = '' }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }
  return (
    <motion.button onClick={handle} title="Copy to clipboard"
      className={cls('ghost-btn mag-btn flex items-center gap-1.5', className)}
      style={{ padding: '4px 10px', fontSize: 11 }}
      animate={{ scale: copied ? 1.05 : 1 }}>
      {copied ? <><Check size={11} style={{ color: '#4ade80' }} /> Copied!</> : <><Copy size={11} /> Copy</>}
    </motion.button>
  )
}

/* ── Score Ring ──────────────────────────────────────────────────────────── */
function ScoreRing({ score }) {
  const r = 36, circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 80 ? '#4ade80' : score >= 60 ? '#fbbf24' : '#f87171'
  return (
    <div className="score-wrap">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
        <motion.circle cx="44" cy="44" r={r} fill="none"
          stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      </svg>
      <div className="score-label">
        <span className="font-display text-lg" style={{ color }}>{score}</span>
        <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(232,234,242,0.3)', textTransform: 'uppercase' }}>
          {score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : 'Revise'}
        </span>
      </div>
    </div>
  )
}

/* ── Analytics Strip ─────────────────────────────────────────────────────── */
function AnalyticsStrip({ draft }) {
  if (!draft?.hook_strength && !draft?.best_time_to_post) return null
  const hookColor = draft.hook_strength >= 7 ? '#4ade80' : draft.hook_strength >= 4 ? '#fbbf24' : '#f87171'
  const reachColor = draft.reach_tier === 'Viral' ? '#a78bfa' : draft.reach_tier === 'Broad' ? '#60a5fa' : '#4ade80'
  const items = [
    { icon: Zap,    label: 'Hook', value: `${draft.hook_strength || 0}/10`, color: hookColor },
    { icon: Clock,  label: 'Best Time', value: draft.best_time_to_post || '—', color: '#60a5fa' },
    { icon: Target, label: 'Reach', value: draft.reach_tier || '—', color: reachColor },
    { icon: BarChart2, label: 'Readability', value: draft.readability_grade || '—', color: '#fbbf24' },
  ]
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-4 gap-2 mt-4">
      {items.map(({ icon: Icon, label, value, color }) => (
        <div key={label} className="rounded-xl p-3 text-center"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--c-border)' }}>
          <Icon size={12} style={{ color, margin: '0 auto 4px' }} />
          <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.3)', marginBottom: 2, fontFamily: '"Inter Tight", sans-serif' }}>{label}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color, fontFamily: '"Inter Tight", sans-serif' }}>{value}</div>
        </div>
      ))}
    </motion.div>
  )
}

/* ── Aurora + Stars background ──────────────────────────────────────────── */
function AmbientBg() {
  const stars = Array.from({ length: 32 }, (_, i) => ({
    id: i,
    x: Math.random() * 100, y: Math.random() * 100,
    size: Math.random() * 2 + 0.5,
    dur: (Math.random() * 3 + 2).toFixed(1),
    delay: (Math.random() * 4).toFixed(1),
  }))
  return (
    <div className="aurora-bg">
      <div className="aurora-mid" />
      {stars.map(s => (
        <div key={s.id} className="star-dot"
          style={{
            left: `${s.x}%`, top: `${s.y}%`,
            width: s.size, height: s.size,
            '--dur': `${s.dur}s`, '--delay': `${s.delay}s`,
          }} />
      ))}
    </div>
  )
}

/* ── Spotlight card ──────────────────────────────────────────────────────── */
function SpotCard({ children, className, style }) {
  const ref = useRef(null)
  const handleMove = e => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    ref.current.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%')
    ref.current.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%')
  }
  return (
    <div ref={ref} onMouseMove={handleMove}
      className={cls('card-glow glass rounded-2xl', className)} style={style}>
      {children}
    </div>
  )
}

/* ── Field label ─────────────────────────────────────────────────────────── */
function FieldLabel({ children }) {
  return (
    <span className="block mb-2 font-display text-[10px] font-semibold tracking-[0.12em] uppercase"
      style={{ color: 'rgba(232,234,242,0.35)' }}>
      {children}
    </span>
  )
}

/* ── Skeleton loader ─────────────────────────────────────────────────────── */
function Skeleton({ className }) {
  return <div className={cls('skeleton-shimmer rounded-xl', className)} />
}

function SkeletonCard({ lines = 3 }) {
  return (
    <SpotCard className="p-6 space-y-4">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cls('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </SpotCard>
  )
}

/* ── Toast system ────────────────────────────────────────────────────────── */
let _toastId = 0

function Toast({ toasts, dismiss }) {
  return (
    <div className="fixed top-20 right-4 z-[999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 340 }}>
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div key={t.id}
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className={cls(
              'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl text-sm glass',
              t.type === 'error' ? 'alert-err' : t.type === 'warning' ? 'alert-warn' : 'alert-ok'
            )}
          >
            {t.type === 'error'   ? <AlertCircle size={14} className="mt-0.5 shrink-0" /> :
             t.type === 'warning' ? <Info size={14} className="mt-0.5 shrink-0" /> :
                                    <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
            <span className="flex-1 leading-snug">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function useToasts() {
  const [toasts, setToasts] = useState([])
  const push = useCallback((message, type = 'success', duration = 4000) => {
    const id = ++_toastId
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration)
    return id
  }, [])
  const dismiss = useCallback(id => setToasts(t => t.filter(x => x.id !== id)), [])
  return { toasts, push: push, dismiss }
}

/* ── Platform config ─────────────────────────────────────────────────────── */
const PLATFORMS = [
  { id: 'linkedin',  label: 'LinkedIn',  Icon: Share2,  color: '#60a5fa' },
  { id: 'x',         label: 'X',         Icon: X,       color: '#a78bfa' },
  { id: 'instagram', label: 'Instagram', Icon: Camera,  color: '#f87171' },
]

/* ── Nav ─────────────────────────────────────────────────────────────────── */
const NAV = [
  { id: 'voice',     label: 'Voice',     icon: Mic2,       dot: '#a78bfa' },
  { id: 'trends',    label: 'Trends',    icon: TrendingUp, dot: '#60a5fa' },
  { id: 'knowledge', label: 'Knowledge', icon: Database,   dot: '#4ade80' },
  { id: 'draft',     label: 'Draft',     icon: FileText,   dot: '#fbbf24' },
  { id: 'calendar',  label: 'Calendar',  icon: Calendar,   dot: '#f87171' },
  { id: 'stats',     label: 'Stats',     icon: BarChart2,  dot: '#34d399' },
]

const VOICE_DEFAULT = [
  'I write practical posts about AI implementation for startup teams.',
  'My style is concise, direct, and focused on useful examples.',
  'I prefer call-to-actions that invite discussion and concrete follow-up.',
].join('\n')

const FV = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] } },
  exit:    { opacity: 0, y: -12, transition: { duration: 0.22 } },
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOGIN PAGE
═══════════════════════════════════════════════════════════════════════════ */
function PasswordStrengthBar({ password }) {
  const strength = !password ? 0 :
    (password.length >= 12 ? 1 : 0) +
    (/[A-Z]/.test(password) ? 1 : 0) +
    (/[0-9]/.test(password) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(password) ? 1 : 0) +
    (password.length >= 8 ? 1 : 0)
  const label = strength <= 1 ? 'Weak' : strength <= 3 ? 'Fair' : 'Strong'
  const color = strength <= 1 ? '#f87171' : strength <= 3 ? '#fbbf24' : '#4ade80'
  const pct = Math.min(100, strength * 20)
  if (!password) return null
  return (
    <div className="space-y-1 mt-1">
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div className="h-full rounded-full" style={{ background: color }}
          animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} />
      </div>
      <p style={{ fontSize: 10, color, fontFamily: '"Inter Tight", sans-serif', letterSpacing: '0.06em' }}>{label}</p>
    </div>
  )
}

function LoginPage({ onLogin }) {
  const [mode, setMode]           = useState('login')
  const [username, setUsername]   = useState(getSavedUsername)
  const [email, setEmail]         = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword]   = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [rememberMe, setRememberMe] = useState(!!getSavedUsername())
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (mode === 'login') {
      if (!username.trim()) { setError('Please enter your username.'); return }
      if (!password.trim()) { setError('Please enter your password.'); return }
      setLoading(true)
      try { await apiLogin(username, password, rememberMe); onLogin() }
      catch (err) { setError(err.message || 'Login failed. Please try again.') }
      finally { setLoading(false) }
    } else {
      if (!displayName.trim()) { setError('Please enter your name.'); return }
      if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email.'); return }
      if (!username.trim() || username.length < 3) { setError('Username must be at least 3 characters.'); return }
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
      if (password !== confirmPass) { setError('Passwords do not match.'); return }
      setLoading(true)
      try { await apiRegister(displayName, email, username, password); onLogin() }
      catch (err) { setError(err.message || 'Registration failed. Please try again.') }
      finally { setLoading(false) }
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true); setError('')
    try {
      if (!window.google) { setError('Google Sign-In not available.'); return }
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          setError('Google Sign-In was dismissed. Please try again.')
          setGoogleLoading(false)
        }
      })
    } catch { setError('Google Sign-In failed.'); setGoogleLoading(false) }
  }

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId || clientId === 'YOUR_GOOGLE_CLIENT_ID') return
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      if (!window.google) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          setGoogleLoading(true)
          try { await googleAuth(response.credential); onLogin() }
          catch (err) { setError(err.message || 'Google authentication failed.') }
          finally { setGoogleLoading(false) }
        },
      })
    }
    document.head.appendChild(script)
  }, [onLogin])

  const pwStrength = password.length === 0 ? 0 : password.length < 8 ? 1 : password.length < 12 ? 2 : /[^a-zA-Z0-9]/.test(password) ? 4 : 3
  const pwColors = ['transparent','#f43f5e','#f59e0b','#3b82f6','#34d399']
  const pwLabels = ['','Weak','Fair','Good','Strong']

  return (
    <div className="login-bg">
      <motion.div initial={{ opacity: 0, y: 32, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="login-card">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 300 }}
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)', boxShadow: '0 0 48px rgba(139,92,246,0.45)' }}>
            <Sparkles size={26} className="text-white" />
          </motion.div>
          <p className="font-display text-2xl font-bold text-ink tracking-tight">PersonaPost</p>
          <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(236,238,246,0.28)', fontFamily: '"Inter Tight", sans-serif', marginTop: 4 }}>AI Content Studio</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl overflow-hidden mb-5" style={{ border: '1px solid var(--c-border)', background: 'rgba(255,255,255,0.02)' }}>
          {[['login','Sign In'],['register','Create Account']].map(([m, label]) => (
            <button key={m} type="button" onClick={() => { setMode(m); setError('') }}
              className="flex-1 py-2.5 transition-all duration-200"
              style={{ background: mode === m ? 'rgba(139,92,246,0.18)' : 'transparent',
                color: mode === m ? '#a78bfa' : 'rgba(236,238,246,0.3)',
                fontSize: 11, fontFamily: '"Inter Tight", sans-serif', fontWeight: 700, letterSpacing: '0.06em' }}>
              {label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.form key={mode} onSubmit={handleSubmit} className="space-y-4"
            initial={{ opacity: 0, x: mode === 'register' ? 12 : -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: mode === 'register' ? -12 : 12 }}
            transition={{ duration: 0.22 }}>

            {mode === 'register' && (
              <div>
                <FieldLabel>Display Name</FieldLabel>
                <div className="relative">
                  <UserCircle2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(236,238,246,0.3)' }} />
                  <input id="reg-name" className="field-input pl-8" value={displayName}
                    onChange={e => setDisplayName(e.target.value)} placeholder="Your full name" autoComplete="name" />
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div>
                <FieldLabel>Email</FieldLabel>
                <div className="relative">
                  <AtSign size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(236,238,246,0.3)' }} />
                  <input id="reg-email" className="field-input pl-8" type="email" value={email}
                    onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                </div>
              </div>
            )}

            <div>
              <FieldLabel>Username</FieldLabel>
              <div className="relative">
                <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(236,238,246,0.3)' }} />
                <input id="login-username" className="field-input pl-8" value={username}
                  onChange={e => setUsername(e.target.value)} placeholder={mode === 'login' ? 'admin' : 'username'} autoComplete="username" />
              </div>
            </div>

            <div>
              <FieldLabel>Password</FieldLabel>
              <div className="relative">
                <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(236,238,246,0.3)' }} />
                <input id="login-password" className="field-input pl-8 pr-10" type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80 transition-opacity">
                  {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {mode === 'register' && password.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 flex-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className="flex-1 h-[3px] rounded-full transition-all duration-300"
                          style={{ background: i <= pwStrength ? pwColors[pwStrength] : 'rgba(255,255,255,0.06)' }} />
                      ))}
                    </div>
                    <span style={{ fontSize: 10, fontFamily: '"Inter Tight", sans-serif', color: pwColors[pwStrength], letterSpacing: '0.08em' }}>
                      {pwLabels[pwStrength]}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {mode === 'register' && (
              <div>
                <FieldLabel>Confirm Password</FieldLabel>
                <div className="relative">
                  <ShieldCheck size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: confirmPass === password && confirmPass ? '#34d399' : 'rgba(236,238,246,0.3)' }} />
                  <input id="reg-confirm" className="field-input pl-8" type={showPass ? 'text' : 'password'} value={confirmPass}
                    onChange={e => setConfirmPass(e.target.value)} placeholder="••••••••" autoComplete="new-password"
                    style={{ borderColor: confirmPass && confirmPass !== password ? 'rgba(244,63,94,0.4)' : undefined }} />
                </div>
              </div>
            )}

            {mode === 'login' && (
              <label className="flex items-center gap-3 cursor-pointer">
                <button type="button" role="switch" aria-checked={rememberMe}
                  onClick={() => setRememberMe(r => !r)}
                  className="relative shrink-0 rounded-full transition-all duration-300"
                  style={{ width: 36, height: 20, background: rememberMe ? '#8b5cf6' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="absolute top-[3px] rounded-full transition-transform duration-300 bg-white"
                    style={{ width: 12, height: 12, left: 3, transform: rememberMe ? 'translateX(16px)' : 'translateX(0)' }} />
                </button>
                <span style={{ fontSize: 11, fontFamily: '"Inter Tight", sans-serif', color: 'rgba(236,238,246,0.4)', letterSpacing: '0.04em' }}>Remember me</span>
              </label>
            )}

            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-xs alert-err">
                  <AlertCircle size={13} /> {error}
                </motion.div>
              )}
            </AnimatePresence>

            <button id="login-submit" type="submit" className="cta-btn w-full mag-btn" disabled={loading} style={{ justifyContent: 'center' }}>
              {loading
                ? <><Spin /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
                : mode === 'login'
                  ? <><Lock size={13} /> Sign In <ArrowRight size={13} /></>
                  : <><UserCircle2 size={13} /> Create Account <ArrowRight size={13} /></>}
            </button>

            {import.meta.env.VITE_GOOGLE_CLIENT_ID && import.meta.env.VITE_GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID' && (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: 'var(--c-border)' }} />
                  <span style={{ fontSize: 10, color: 'rgba(236,238,246,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif' }}>or</span>
                  <div className="flex-1 h-px" style={{ background: 'var(--c-border)' }} />
                </div>
                <button type="button" onClick={handleGoogleSignIn} disabled={googleLoading}
                  className="w-full flex items-center justify-center gap-3 py-2.5 rounded-xl transition-all duration-200"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--c-border)' }}>
                  {googleLoading ? <Spin size={13} /> : (
                    <svg width="16" height="16" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )}
                  <span style={{ fontSize: 12, fontFamily: '"Inter Tight", sans-serif', fontWeight: 600, color: 'rgba(236,238,246,0.7)' }}>
                    {googleLoading ? 'Signing in…' : 'Continue with Google'}
                  </span>
                </button>
              </>
            )}
          </motion.form>
        </AnimatePresence>

        <p className="text-center mt-6" style={{ fontSize: 10, color: 'rgba(236,238,246,0.18)', letterSpacing: '0.08em', fontFamily: '"Inter Tight", sans-serif' }}>
          PersonaPost AI — Voice-First Content Studio
        </p>
      </motion.div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE COMPONENTS — defined OUTSIDE App() to prevent remounting
═══════════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════════
   PAGE COMPONENTS — defined OUTSIDE App() to prevent remounting
═══════════════════════════════════════════════════════════════════════════ */

const VOICE_ANALYSIS_STEPS = [
  { icon: Brain,        label: 'Reading writing samples…' },
  { icon: MessageSquare, label: 'Analysing tone & vocabulary…' },
  { icon: ListChecks,  label: 'Extracting structural patterns…' },
  { icon: Tag,         label: 'Identifying key phrases…' },
  { icon: Sparkles,    label: 'Finalising voice profile…' },
]

function VoiceAnalysisLoader() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % VOICE_ANALYSIS_STEPS.length), 900)
    return () => clearInterval(t)
  }, [])
  const { icon: Icon, label } = VOICE_ANALYSIS_STEPS[step]
  return (
    <div className="flex flex-col items-center justify-center h-56 gap-4">
      <motion.div key={step} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)' }}>
        <Icon size={22} style={{ color: '#a78bfa' }} />
      </motion.div>
      <motion.p key={label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        style={{ fontSize: 12, fontFamily: '"Inter Tight", sans-serif', letterSpacing: '0.06em', color: 'rgba(232,234,242,0.5)' }}>
        {label}
      </motion.p>
      <div className="flex gap-1.5 mt-1">
        {VOICE_ANALYSIS_STEPS.map((_, i) => (
          <div key={i} className="h-1 rounded-full transition-all duration-300"
            style={{ width: i === step ? 20 : 6, background: i === step ? '#a78bfa' : 'rgba(167,139,250,0.2)' }} />
        ))}
      </div>
    </div>
  )
}

function PageVoice({
  niche, setNiche, voiceText, setVoiceText, voiceMerge, setVoiceMerge,
  voiceProfile, voiceSummary, health, busy, buildVoice, checkHealth,
}) {
  return (
    <motion.div {...FV} className="space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="tag tag-violet mb-4">Step 01 — Voice</p>
          <h1 className="font-display text-5xl md:text-6xl text-ink mb-3">
            Voice<br /><span className="font-editorial grad-text">Profile.</span>
          </h1>
          <p className="text-ink-2 text-sm leading-relaxed max-w-md">
            Groq AI reads your writing samples and extracts your tone, vocabulary level, key phrases, and structural patterns — building a precise voice fingerprint.
          </p>
        </div>
        <button className="ghost-btn mag-btn" onClick={checkHealth} disabled={busy('health')}>
          {busy('health') ? <Spin /> : <Activity size={12} />} Status
        </button>
      </div>

      <AnimatePresence>
        {health && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl alert-ok text-sm">
            <CheckCircle2 size={14} /> {health.service} — {health.status}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <SpotCard className="lg:col-span-3 p-6 space-y-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)' }}>
              <Mic2 size={14} style={{ color: '#a78bfa' }} />
            </div>
            <span className="font-display text-sm font-bold tracking-tight text-ink">Writing Samples</span>
          </div>
          <div>
            <FieldLabel>Niche</FieldLabel>
            <input id="input-niche" className="field-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="gaming, fitness, ai, fintech…" />
          </div>
          <div>
            <FieldLabel>Samples — one per line, 3–10 recommended</FieldLabel>
            <textarea id="textarea-voice-samples" className="field-input" value={voiceText} onChange={e => setVoiceText(e.target.value)} rows={7}
              placeholder="Paste real LinkedIn posts, tweets, or writing you've done. The more specific and real, the better the AI fingerprint." />
          </div>
          <label className="flex items-center gap-3">
            <button id="toggle-voice-merge" role="switch" aria-checked={voiceMerge}
              onClick={() => setVoiceMerge(v => !v)}
              className="relative shrink-0 rounded-full transition-colors duration-300"
              style={{ width: 40, height: 22, background: voiceMerge ? '#a78bfa' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="absolute top-[3px] rounded-full transition-transform duration-300 bg-white"
                style={{ width: 14, height: 14, left: 3, transform: voiceMerge ? 'translateX(18px)' : 'translateX(0)' }} />
            </button>
            <span style={{ fontSize: 11, fontFamily: '"Inter Tight", sans-serif', color: 'rgba(232,234,242,0.45)', letterSpacing: '0.04em' }}>
              Merge with existing profile
            </span>
          </label>
          <button id="btn-build-voice" className="cta-btn mag-btn" onClick={buildVoice} disabled={busy('voice')}>
            {busy('voice') ? <Spin /> : <Brain size={13} />}
            {busy('voice') ? 'Analysing with AI…' : 'Build Voice Profile'}
            {!busy('voice') && <ArrowRight size={13} />}
          </button>
        </SpotCard>

        <SpotCard className={cls('lg:col-span-2 p-6', !voiceProfile && !busy('voice') && 'opacity-40')}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>
              <Zap size={14} style={{ color: '#4ade80' }} />
            </div>
            <span className="font-display text-sm font-bold tracking-tight text-ink">Voice Fingerprint</span>
          </div>

          {busy('voice') ? (
            <VoiceAnalysisLoader />
          ) : voiceProfile ? (
            <motion.div initial="initial" animate="animate" variants={{ animate: { transition: { staggerChildren: 0.05 } } }} className="space-y-5">
              {voiceSummary && (
                <motion.p variants={{ initial: { opacity: 0 }, animate: { opacity: 1 } }}
                  className="text-xs leading-relaxed pb-3" style={{ color: 'rgba(232,234,242,0.45)', borderBottom: '1px solid var(--c-border)' }}>
                  {voiceSummary}
                </motion.p>
              )}
              <motion.div variants={{ initial: { opacity: 0 }, animate: { opacity: 1 } }} className="grid grid-cols-2 gap-2">
                {[
                  { k: 'Tone',      v: voiceProfile.tone,                          color: '#a78bfa' },
                  { k: 'Vocab',     v: voiceProfile.vocabulary_level || 'intermediate', color: '#60a5fa' },
                  { k: 'Formality', v: `${voiceProfile.formality}/10`,             color: '#4ade80' },
                  { k: 'Sentences', v: voiceProfile.sentence_length,               color: '#fbbf24' },
                  { k: 'CTA',       v: voiceProfile.cta_style,                    color: '#f87171' },
                  { k: 'Confidence',v: `${(voiceProfile.confidence * 100).toFixed(0)}%`, color: '#a78bfa' },
                ].map(({ k, v, color }) => (
                  <div key={k} className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--c-border)' }}>
                    <div style={{ fontSize: 9, fontFamily: '"Inter Tight", sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.3)', marginBottom: 4 }}>{k}</div>
                    <div style={{ fontSize: 12, fontFamily: '"Inter Tight", sans-serif', fontWeight: 600, color }}>{v}</div>
                  </div>
                ))}
              </motion.div>

              {voiceProfile.key_phrases?.length > 0 && (
                <motion.div variants={{ initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Tag size={11} style={{ color: '#a78bfa' }} />
                    <span style={{ fontSize: 9, fontFamily: '"Inter Tight", sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.3)' }}>Key Phrases</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {voiceProfile.key_phrases.map((phrase, i) => (
                      <span key={i} className="tag tag-violet" style={{ fontSize: 9 }}>{phrase}</span>
                    ))}
                  </div>
                </motion.div>
              )}

              {voiceProfile.writing_patterns?.length > 0 && (
                <motion.div variants={{ initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } }}>
                  <div className="flex items-center gap-2 mb-2">
                    <ListChecks size={11} style={{ color: '#4ade80' }} />
                    <span style={{ fontSize: 9, fontFamily: '"Inter Tight", sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.3)' }}>Writing Patterns</span>
                  </div>
                  <div className="space-y-1.5">
                    {voiceProfile.writing_patterns.map((pattern, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <ChevronRight size={11} style={{ color: '#4ade80', marginTop: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'rgba(232,234,242,0.55)', lineHeight: 1.5 }}>{pattern}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48" style={{ color: 'rgba(232,234,242,0.15)' }}>
              <Mic2 size={40} className="mb-3 animate-float" />
              <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif' }}>Awaiting samples</p>
              <p className="mt-2 text-center" style={{ fontSize: 10, color: 'rgba(232,234,242,0.2)', maxWidth: 160, lineHeight: 1.5 }}>Paste your real writing to get an AI voice fingerprint</p>
            </div>
          )}
        </SpotCard>
      </div>
    </motion.div>
  )
}

function PageTrends({ niche, trends, selected, setSelected, busy, fetchTrends }) {
  return (
    <motion.div {...FV} className="space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="tag tag-blue mb-4">Step 02 — Intelligence</p>
          <h1 className="font-display text-5xl md:text-6xl text-ink mb-3">
            Trend<br /><span className="font-editorial grad-text">Signals.</span>
          </h1>
          <p className="text-ink-2 text-sm leading-relaxed max-w-md">
            Groq AI picks the best news sources for your niche from 20+ feeds, fetches live stories, and filters for what your audience will actually care about.
          </p>
        </div>
        <button id="btn-fetch-trends" className="cta-btn mag-btn" onClick={fetchTrends} disabled={busy('trends')}>
          {busy('trends') ? <Spin /> : <Flame size={13} />}
          {busy('trends') ? 'Analysing…' : 'Fetch & Filter'}
        </button>
      </div>

      {selected && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl alert-ok text-sm">
          <CheckCircle2 size={14} /> Topic selected: <strong>{selected}</strong>
        </motion.div>
      )}

      {busy('trends') ? (
        <SpotCard className="p-8">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="flex items-center gap-3">
              <Loader2 size={18} className="animate-spin" style={{ color: '#60a5fa' }} />
              <span style={{ fontSize: 13, fontFamily: '"Inter Tight", sans-serif', color: 'rgba(232,234,242,0.5)' }}>
                Groq selecting best sources → Fetching live stories → Filtering for relevance…
              </span>
            </div>
            <div className="w-full max-w-sm"><SkeletonCard lines={3} /></div>
          </div>
        </SpotCard>
      ) : (
        <SpotCard className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <TrendingUp size={14} style={{ color: '#60a5fa' }} />
              </div>
              <span className="font-display text-sm font-bold tracking-tight text-ink">AI-Filtered Topics</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="tag tag-blue">{niche}</span>
              {trends.length > 0 && <span className="tag tag-muted">{trends.length} results</span>}
            </div>
          </div>

          {trends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20" style={{ color: 'rgba(232,234,242,0.12)' }}>
              <TrendingUp size={48} className="mb-4 animate-float" />
              <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif' }}>Click "Fetch & Filter" to get niche-relevant topics</p>
            </div>
          ) : (
            <motion.div className="space-y-3" initial="initial" animate="animate" variants={{ animate: { transition: { staggerChildren: 0.06 } } }}>
              {trends.map((t, i) => (
                <motion.button key={i}
                  variants={{ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }}
                  onClick={() => setSelected(t.title)}
                  className="w-full text-left rounded-xl border p-4 transition-all duration-200"
                  style={{ borderColor: selected === t.title ? 'rgba(167,139,250,0.4)' : 'var(--c-border)', background: selected === t.title ? 'rgba(167,139,250,0.06)' : 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <span className="text-sm font-medium leading-snug text-ink flex-1">{t.title}</span>
                    <span className="tag tag-violet shrink-0">{(t.score * 100).toFixed(0)}%</span>
                  </div>
                  {t.reason && (
                    <div className="flex items-start gap-2 mb-3">
                      <Lightbulb size={10} style={{ color: '#fbbf24', marginTop: 2, flexShrink: 0 }} />
                      <p style={{ fontSize: 11, color: 'rgba(232,234,242,0.4)', lineHeight: 1.5 }}>{t.reason}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif',
                      color: t.source === 'hackernews' || t.source === 'Hacker News' ? '#f97316' : t.source === 'curated' ? '#a78bfa' : '#60a5fa',
                      padding: '2px 6px', borderRadius: 4,
                      background: t.source === 'hackernews' || t.source === 'Hacker News' ? 'rgba(249,115,22,0.1)' : t.source === 'curated' ? 'rgba(167,139,250,0.08)' : 'rgba(96,165,250,0.08)',
                    }}>{t.source === 'hackernews' ? '⬡ HN' : t.source === 'curated' ? '✦ Curated' : `◈ ${t.source}`}</span>
                    <div className="flex-1 h-[3px] rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <motion.div className="h-full rounded-full" style={{ background: selected === t.title ? '#a78bfa' : 'rgba(167,139,250,0.3)' }}
                        initial={{ width: 0 }} animate={{ width: `${t.score * 100}%` }} transition={{ duration: 0.7, ease: 'easeOut' }} />
                    </div>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </SpotCard>
      )}
    </motion.div>
  )
}

function PageKnowledge({
  knowledgeDocs, setKnowledgeDocs, knowledgeQuery, setKnowledgeQuery,
  snippets, selected, niche, goal, busy, ingestDocs, searchKnow,
}) {
  return (
    <motion.div {...FV} className="space-y-8">
      <div>
        <p className="tag tag-green mb-4">Step 03 — Context</p>
        <h1 className="font-display text-5xl md:text-6xl text-ink mb-3">
          Knowledge<br /><span className="font-editorial grad-text">Base.</span>
        </h1>
        <p className="text-ink-2 text-sm leading-relaxed max-w-md">
          Index reference material. Drafts auto-retrieve relevant context before generation — facts, stats, and insights that ground your posts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {busy('ingest') ? <SkeletonCard lines={5} /> : (
          <SpotCard className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>
                <Upload size={14} style={{ color: '#4ade80' }} />
              </div>
              <span className="font-display text-sm font-bold tracking-tight text-ink">Ingest Documents</span>
            </div>
            <div>
              <FieldLabel>Source documents — one per line</FieldLabel>
              <textarea id="textarea-knowledge-docs" className="field-input" value={knowledgeDocs} onChange={e => setKnowledgeDocs(e.target.value)} rows={7} />
            </div>
            <button id="btn-ingest-knowledge" className="cta-btn mag-btn" onClick={ingestDocs} disabled={busy('ingest')}>
              {busy('ingest') ? <Spin /> : <Upload size={13} />}
              {busy('ingest') ? 'Indexing…' : 'Index Knowledge'}
            </button>
          </SpotCard>
        )}

        {busy('retrieve') ? <SkeletonCard lines={4} /> : (
          <SpotCard className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <Search size={14} style={{ color: '#60a5fa' }} />
              </div>
              <span className="font-display text-sm font-bold tracking-tight text-ink">Preview Retrieval</span>
            </div>
            <div>
              <FieldLabel>Query</FieldLabel>
              <input id="input-knowledge-query" className="field-input" value={knowledgeQuery} onChange={e => setKnowledgeQuery(e.target.value)} placeholder={`${selected || niche} ${goal}`} />
            </div>
            <button id="btn-retrieve-knowledge" className="ghost-btn mag-btn" onClick={searchKnow} disabled={busy('retrieve')}>
              {busy('retrieve') ? <Spin /> : <Search size={12} />}
              {busy('retrieve') ? 'Searching…' : 'Search'}
            </button>
            {snippets.length > 0 ? (
              <motion.div className="space-y-2.5" initial="initial" animate="animate" variants={{ animate: { transition: { staggerChildren: 0.05 } } }}>
                {snippets.map((s, i) => (
                  <motion.div key={i} variants={{ initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 } }}
                    className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--c-border)' }}>
                    <span className="tag tag-green shrink-0 mt-0.5">{s.score}</span>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(232,234,242,0.55)' }}>{s.text}</p>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32" style={{ color: 'rgba(232,234,242,0.12)' }}>
                <Database size={30} className="mb-2 animate-float" />
                <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif' }}>Index docs first</p>
              </div>
            )}
          </SpotCard>
        )}
      </div>
    </motion.div>
  )
}

/* ── Draft Page ───────────────────────────────────────────────────────────── */
function PageDraft({
  niche, goal, setGoal, platform, setPlatform, voiceProfile,
  selected, approve, setApprove, maxRetries, setMaxRetries,
  draft, draftHistory, setDraftHistory,
  draftEdit, setDraftEdit, editMode, setEditMode,
  refineInstruction, setRefineInstruction,
  multiDraft, setMultiDraft, multiTab, setMultiTab,
  busy, generateDraft, generateAllPlatforms, refineCurrentDraft, saveEdit,
  speaking, speakText,
  competitorPost, setCompetitorPost, competitorResult, setCompetitorResult,
  streamingText, streamPhase,
}) {
  const charCount = draftEdit.length
  const charLimit = platform === 'x' ? 280 : platform === 'instagram' ? 2200 : 3000
  const [showHistory, setShowHistory] = useState(false)
  const [showCompetitor, setShowCompetitor] = useState(false)
  const activeDraft = multiDraft ? multiDraft[multiTab] : draft

  return (
    <motion.div {...FV} className="space-y-8">
      <div>
        <p className="tag tag-amber mb-4">Step 04 — Generate</p>
        <h1 className="font-display text-5xl md:text-6xl text-ink mb-3">
          Draft<br /><span className="font-editorial grad-text">Studio.</span>
        </h1>
        <p className="text-ink-2 text-sm leading-relaxed max-w-md">
          Generate in your voice → review → refine → approve. Generate for all 3 platforms at once or analyze competitor posts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Settings panel */}
        <SpotCard className="p-6 space-y-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <Zap size={14} style={{ color: '#fbbf24' }} />
            </div>
            <span className="font-display text-sm font-bold tracking-tight text-ink">Settings</span>
          </div>

          <div>
            <FieldLabel>Goal</FieldLabel>
            <input id="input-goal" className="field-input" value={goal} onChange={e => setGoal(e.target.value)} placeholder="educational, inspirational…" />
          </div>

          <div>
            <FieldLabel>Platform</FieldLabel>
            <div className="flex gap-2">
              {PLATFORMS.map(({ id, label, Icon, color }) => (
                <button key={id} id={`btn-platform-${id}`}
                  onClick={() => setPlatform(id)}
                  className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all duration-200"
                  style={{
                    background: platform === id ? `${color}18` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${platform === id ? color + '60' : 'var(--c-border)'}`,
                  }}>
                  <Icon size={13} style={{ color: platform === id ? color : 'rgba(232,234,242,0.3)' }} />
                  <span style={{ fontSize: 9, fontFamily: '"Inter Tight", sans-serif', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: platform === id ? color : 'rgba(232,234,242,0.25)' }}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <FieldLabel>Context</FieldLabel>
            {[
              { label: 'Niche',    value: niche,               color: '#a78bfa' },
              { label: 'Trend',    value: selected || '—',     color: '#60a5fa' },
              { label: 'Voice',    value: voiceProfile ? 'Loaded' : 'Missing', color: voiceProfile ? '#4ade80' : '#f87171' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--c-border)' }}>
                <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif', color: 'rgba(232,234,242,0.3)' }}>{label}</span>
                <span style={{ fontSize: 11, fontFamily: '"Inter Tight", sans-serif', fontWeight: 600, color, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
              </div>
            ))}
          </div>

          <div>
            <FieldLabel>Auto-retry if score low</FieldLabel>
            <div className="flex gap-1.5">
              {[0, 1, 2, 3].map(n => (
                <button key={n} onClick={() => setMaxRetries(n)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150"
                  style={{
                    background: maxRetries === n ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${maxRetries === n ? 'rgba(167,139,250,0.5)' : 'var(--c-border)'}`,
                    color: maxRetries === n ? '#a78bfa' : 'rgba(232,234,242,0.3)',
                    fontFamily: '"Inter Tight", sans-serif',
                  }}>{n === 0 ? 'Off' : `${n}×`}</button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3">
            <button id="toggle-approve" role="switch" aria-checked={approve}
              onClick={() => setApprove(a => !a)}
              className="relative shrink-0 rounded-full transition-colors duration-300"
              style={{ width: 40, height: 22, background: approve ? '#a78bfa' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="absolute top-[3px] rounded-full transition-transform duration-300 bg-white"
                style={{ width: 14, height: 14, left: 3, transform: approve ? 'translateX(18px)' : 'translateX(0)' }} />
            </button>
            <span style={{ fontSize: 11, fontFamily: '"Inter Tight", sans-serif', color: 'rgba(232,234,242,0.45)', letterSpacing: '0.04em' }}>
              Auto-save if score ≥ 75
            </span>
          </label>

          <button id="btn-generate-draft"
            className={`cta-btn w-full mag-btn ${streamPhase === 'streaming' ? 'streaming' : ''}`}
            onClick={generateDraft} disabled={busy('draft') || busy('multiDraft')}>
            {streamPhase === 'streaming'
              ? <><div className="stream-dot" /> Streaming…</>
              : streamPhase === 'reviewing'
              ? <><Spin /> Reviewing…</>
              : busy('draft') ? <><Spin /> Generating…</>
              : <><FileText size={13} /> Generate Draft <ArrowRight size={13} /></>}
          </button>

          <button id="btn-generate-all-platforms" className="ghost-btn w-full mag-btn" onClick={generateAllPlatforms} disabled={busy('draft') || busy('multiDraft')}>
            {busy('multiDraft') ? <Spin /> : <Layers size={13} />}
            {busy('multiDraft') ? 'Generating All…' : 'Generate All Platforms'}
          </button>

          {/* Competitor analyzer toggle */}
          <button onClick={() => setShowCompetitor(s => !s)}
            className="ghost-btn w-full mag-btn"
            style={{ borderColor: showCompetitor ? 'rgba(248,113,113,0.4)' : 'var(--c-border)', color: showCompetitor ? '#f87171' : 'var(--c-muted)' }}>
            <Swords size={13} /> {showCompetitor ? 'Hide Analyzer' : 'Analyze Competitor'}
          </button>

          {/* Draft history toggle */}
          {draftHistory.length > 0 && (
            <button onClick={() => setShowHistory(s => !s)}
              className="ghost-btn w-full mag-btn">
              <Clock size={12} /> History ({draftHistory.length})
              {showHistory ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
          )}

          {/* History list */}
          <AnimatePresence>
            {showHistory && draftHistory.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="space-y-1.5 overflow-hidden">
                {draftHistory.slice().reverse().map((h, i) => (
                  <button key={i}
                    onClick={() => { setMultiDraft(null); setDraft(h); setDraftEdit(h.draft || '') }}
                    className="w-full text-left p-2.5 rounded-xl transition-colors"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--c-border)' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="tag tag-violet" style={{ fontSize: 9 }}>{h.reviewer_score}/100</span>
                      <span style={{ fontSize: 9, color: 'rgba(232,234,242,0.25)', fontFamily: '"Inter Tight", sans-serif' }}>{h.platform}</span>
                    </div>
                    <p style={{ fontSize: 10, color: 'rgba(232,234,242,0.4)', lineHeight: 1.4 }} className="line-clamp-2">{h.draft?.slice(0, 80)}…</p>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </SpotCard>

        {/* Output panel */}
        <div className="lg:col-span-2 space-y-4">

          {/* Competitor analyzer */}
          <AnimatePresence>
            {showCompetitor && (
              <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
                <SpotCard className="p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Swords size={14} style={{ color: '#f87171' }} />
                    <span className="font-display text-sm font-bold text-ink">Competitor Post Analyzer</span>
                  </div>
                  <div>
                    <FieldLabel>Paste competitor's post</FieldLabel>
                    <textarea className="field-input" value={competitorPost} onChange={e => setCompetitorPost(e.target.value)}
                      rows={4} placeholder="Paste any competitor's LinkedIn post, tweet, or caption here…" />
                  </div>
                  <button className="ghost-btn mag-btn"
                    onClick={() => { if (competitorPost.trim()) setCompetitorResult({ loading: true }) }}
                    disabled={!competitorPost.trim() || busy('competitor')}
                    style={{ borderColor: 'rgba(248,113,113,0.3)', color: '#f87171' }}>
                    {busy('competitor') ? <Spin /> : <Swords size={12} />}
                    {busy('competitor') ? 'Analyzing…' : 'Analyze & Beat It'}
                  </button>

                  {competitorResult && !competitorResult.loading && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl" style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)' }}>
                          <p style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4ade80', fontFamily: '"Inter Tight", sans-serif', marginBottom: 6 }}>What works</p>
                          {competitorResult.strengths?.map((s, i) => (
                            <div key={i} className="flex items-start gap-1.5 mb-1">
                              <CheckCircle2 size={9} style={{ color: '#4ade80', marginTop: 2, flexShrink: 0 }} />
                              <span style={{ fontSize: 10, color: 'rgba(232,234,242,0.5)' }}>{s}</span>
                            </div>
                          ))}
                        </div>
                        <div className="p-3 rounded-xl" style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)' }}>
                          <p style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#f87171', fontFamily: '"Inter Tight", sans-serif', marginBottom: 6 }}>What's weak</p>
                          {competitorResult.weaknesses?.map((w, i) => (
                            <div key={i} className="flex items-start gap-1.5 mb-1">
                              <AlertCircle size={9} style={{ color: '#f87171', marginTop: 2, flexShrink: 0 }} />
                              <span style={{ fontSize: 10, color: 'rgba(232,234,242,0.5)' }}>{w}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {competitorResult.rewritten_post && (
                        <div className="p-4 rounded-xl" style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.2)' }}>
                          <div className="flex items-center justify-between mb-3">
                            <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a78bfa', fontFamily: '"Inter Tight", sans-serif' }}>Your version (in your voice)</span>
                            <CopyBtn text={competitorResult.rewritten_post} />
                          </div>
                          <pre className="text-sm leading-6 whitespace-pre-wrap" style={{ fontFamily: 'inherit', color: 'var(--c-ink)' }}>
                            {competitorResult.rewritten_post}
                          </pre>
                        </div>
                      )}
                    </motion.div>
                  )}
                </SpotCard>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Multi-platform tabs */}
          {multiDraft && (
            <div className="flex gap-2">
              {PLATFORMS.map(({ id, label, Icon, color }) => (
                <button key={id} onClick={() => setMultiTab(id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all duration-200"
                  style={{
                    background: multiTab === id ? `${color}18` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${multiTab === id ? color + '60' : 'var(--c-border)'}`,
                    color: multiTab === id ? color : 'rgba(232,234,242,0.3)',
                    fontSize: 11, fontFamily: '"Inter Tight", sans-serif', fontWeight: 600,
                  }}>
                  <Icon size={11} /> {label}
                </button>
              ))}
              <button onClick={() => { setMultiDraft(null); setMultiTab('linkedin') }}
                className="ml-auto ghost-btn" style={{ padding: '4px 8px', fontSize: 10 }}>
                <X size={10} /> Single
              </button>
            </div>
          )}

          {/* Streaming live view */}
          {streamPhase && streamingText && (
            <motion.div key="streaming" {...FV}
              className="border-shine-anim rounded-2xl overflow-hidden">
              <div className="p-5" style={{ background: 'rgba(12,15,26,0.95)' }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="stream-status">
                    <div className="stream-dot" />
                    {streamPhase === 'reviewing' ? 'Analyzing quality…' : 'Generating…'}
                  </div>
                  {streamPhase === 'reviewing' && (
                    <div className="flex-1 progress-indeterminate" />
                  )}
                </div>
                <pre className="text-sm leading-7 whitespace-pre-wrap" style={{ fontFamily: 'inherit', color: 'var(--c-ink)', minHeight: 120 }}>
                  {streamingText}<span className="typewriter-cursor" />
                </pre>
              </div>
            </motion.div>
          )}

          {/* Busy skeleton — only shown during non-streaming fallback */}
          {(busy('draft') || busy('multiDraft')) && !streamPhase ? (
              <motion.div key="skeleton" {...FV} className="space-y-4">
                <SkeletonCard lines={3} />
                <SkeletonCard lines={2} />
                <SkeletonCard lines={6} />
              </motion.div>
            ) : null}

          <AnimatePresence mode="wait">
            {activeDraft ? (
              <motion.div key="result" {...FV} className="space-y-4">
                {/* Score + notes */}
                <SpotCard className="p-5">
                  <div className="flex items-start gap-5">
                    <ScoreRing score={activeDraft.reviewer_score} />
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-sm font-bold text-ink">Reviewer Notes</span>
                        {activeDraft.persisted && <span className="tag tag-green">✓ Saved</span>}
                        {!activeDraft.persisted && approve && <span className="tag tag-amber">Below threshold</span>}
                        {activeDraft.needs_manual_edit && <span className="tag tag-rose">Edit needed</span>}
                      </div>
                      <div className="space-y-2">
                        {activeDraft.revision_notes?.map((note, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm" style={{ color: 'rgba(232,234,242,0.5)' }}>
                            <ChevronRight size={13} style={{ color: '#a78bfa', marginTop: 2, flexShrink: 0 }} />
                            {note}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Analytics strip */}
                  <AnalyticsStrip draft={activeDraft} />
                </SpotCard>

                {/* Plan */}
                <SpotCard className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen size={13} style={{ color: 'rgba(232,234,242,0.3)' }} />
                    <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif', color: 'rgba(232,234,242,0.3)' }}>Content Plan</span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(232,234,242,0.6)' }}>{activeDraft.plan}</p>
                </SpotCard>

                {/* Draft editor */}
                <div className="border-shine rounded-2xl">
                  <SpotCard className="p-5 border-0">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Eye size={13} style={{ color: '#fbbf24' }} />
                        <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif', color: 'rgba(232,234,242,0.35)' }}>Generated Post</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CopyBtn text={activeDraft.draft} />
                        {!editMode && !multiDraft && (
                          <button id="btn-speak-draft"
                            onClick={() => speakText(activeDraft.draft)}
                            className="ghost-btn mag-btn flex items-center gap-1.5"
                            style={{ padding: '4px 10px', fontSize: 11, borderColor: speaking ? 'rgba(167,139,250,0.5)' : 'var(--c-border)', color: speaking ? '#a78bfa' : 'var(--c-muted)' }}>
                            {speaking ? <VolumeX size={11} className="animate-pulse" /> : <Volume2 size={11} />}
                            {speaking ? 'Stop' : 'Listen'}
                          </button>
                        )}
                        {!multiDraft && (
                          <button id="btn-toggle-edit"
                            onClick={() => { setEditMode(m => !m); if (!editMode) setDraftEdit(activeDraft.draft) }}
                            className="ghost-btn mag-btn"
                            style={{ padding: '4px 10px', fontSize: 11 }}>
                            <Edit3 size={11} /> {editMode ? 'Cancel' : 'Edit'}
                          </button>
                        )}
                      </div>
                    </div>

                    {editMode && !multiDraft ? (
                      <div className="space-y-3">
                        <textarea id="textarea-draft-edit" className="field-input" value={draftEdit}
                          onChange={e => setDraftEdit(e.target.value)} rows={10} style={{ resize: 'vertical' }} />
                        <div className="flex items-center justify-between">
                          <span style={{ fontSize: 11, fontFamily: '"Inter Tight", sans-serif', color: charCount > charLimit ? '#f87171' : 'rgba(232,234,242,0.25)' }}>
                            {charCount}/{charLimit} chars
                          </span>
                          <div className="flex gap-2">
                            <button id="btn-save-draft-edit" className="ghost-btn mag-btn"
                              onClick={saveEdit} disabled={busy('saveEdit')}
                              style={{ padding: '5px 12px', fontSize: 11 }}>
                              {busy('saveEdit') ? <Spin size={11} /> : <Save size={11} />} Save
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <pre className="text-sm leading-7 whitespace-pre-wrap" style={{ fontFamily: 'inherit', color: 'var(--c-ink)' }}>
                        {activeDraft.draft}
                      </pre>
                    )}

                    {/* Refine panel — only for single draft */}
                    {!multiDraft && (
                      <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--c-border)' }}>
                        <FieldLabel>Refine instruction</FieldLabel>
                        <div className="flex gap-2">
                          <input id="input-refine-instruction" className="field-input flex-1" value={refineInstruction}
                            onChange={e => setRefineInstruction(e.target.value)}
                            placeholder="Make it shorter, add bullet points…"
                            onKeyDown={e => {
                              if (e.key === 'Enter' && refineInstruction.trim()) {
                                refineCurrentDraft(refineInstruction)
                                setRefineInstruction('')
                              }
                            }}
                          />
                          <button id="btn-refine-draft" className="ghost-btn mag-btn shrink-0"
                            onClick={() => { if (refineInstruction.trim()) { refineCurrentDraft(refineInstruction); setRefineInstruction('') } }}
                            disabled={busy('refine') || !refineInstruction.trim()}>
                            {busy('refine') ? <Spin size={12} /> : <RefreshCw size={12} />}
                          </button>
                        </div>
                        <div className="flex gap-1.5 mt-2">
                          {['Make it shorter', 'Add bullet points', 'Strengthen the hook', 'More opinionated', 'Add a stat'].map(s => (
                            <button key={s} onClick={() => { refineCurrentDraft(s) }}
                              className="px-2 py-1 rounded-lg text-[10px] transition-colors"
                              disabled={busy('refine')}
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--c-border)', fontFamily: '"Inter Tight", sans-serif', color: 'rgba(232,234,242,0.3)' }}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </SpotCard>
                </div>
              </motion.div>
            ) : (
              <motion.div key="empty" {...FV}>
                <SpotCard className="p-0 overflow-hidden">
                  <div className="flex flex-col items-center justify-center h-80" style={{ color: 'rgba(232,234,242,0.08)' }}>
                    <FileText size={56} className="mb-4 animate-float" />
                    <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif' }}>Configure and generate</p>
                  </div>
                </SpotCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

/* ── Calendar Page ────────────────────────────────────────────────────────── */
function PageCalendar({ calendar, busy, loadCalendar, onSchedule }) {
  const [viewMode, setViewMode] = useState('grid')
  const [expandedEntry, setExpandedEntry] = useState(null)
  const [scheduling, setScheduling] = useState(null)   // entry_id being scheduled
  const [schedDate, setSchedDate] = useState('')
  const [schedLoading, setSchedLoading] = useState(false)
  const [schedSuccess, setSchedSuccess] = useState(null)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const entriesByDay = {}
  calendar.forEach(entry => {
    const d = new Date(entry.scheduled_for || entry.created_at)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!entriesByDay[day]) entriesByDay[day] = []
      entriesByDay[day].push(entry)
    }
  })

  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' })
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  async function handleSchedule(entryId) {
    if (!schedDate) return
    setSchedLoading(true)
    try {
      await updateCalendarEntry(entryId, { scheduled_for: new Date(schedDate).toISOString() })
      setSchedSuccess(entryId)
      setTimeout(() => { setSchedSuccess(null); setScheduling(null); setSchedDate('') }, 2000)
      if (onSchedule) onSchedule()
    } catch (e) {
      console.error('Schedule failed', e)
    } finally { setSchedLoading(false) }
  }

  return (
    <motion.div {...FV} className="space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="tag tag-rose mb-4">Step 05 — Archive</p>
          <h1 className="font-display text-5xl md:text-6xl text-ink mb-3">
            Content<br /><span className="font-editorial grad-text">Calendar.</span>
          </h1>
          <p className="text-ink-2 text-sm leading-relaxed max-w-md">
            Schedule posts for specific dates — the notification system will remind you 24h before.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
            {[['grid', Calendar], ['list', ListChecks]].map(([mode, Icon]) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className="px-3 py-2 transition-colors"
                style={{ background: viewMode === mode ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.02)', color: viewMode === mode ? '#a78bfa' : 'rgba(232,234,242,0.3)' }}>
                <Icon size={13} />
              </button>
            ))}
          </div>
          <button id="btn-load-calendar" className="ghost-btn mag-btn" onClick={loadCalendar} disabled={busy('calendar')}>
            {busy('calendar') ? <Spin /> : <RefreshCw size={12} />} Refresh
          </button>
        </div>
      </div>

      {busy('calendar') ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <SkeletonCard key={i} lines={2} />)}</div>
      ) : viewMode === 'grid' ? (
        <SpotCard className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-lg font-bold text-ink">{monthName}</h2>
            {calendar.length > 0 && <span className="tag tag-violet">{calendar.length} posts</span>}
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {dayNames.map(d => (
              <div key={d} className="text-center" style={{ fontSize: 9, fontFamily: '"Inter Tight", sans-serif', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.25)', padding: '4px 0' }}>
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const entries = entriesByDay[day] || []
              const isToday = day === now.getDate()
              const hasPost = entries.length > 0
              const hasScheduled = entries.some(e => e.scheduled_for)
              return (
                <motion.button key={day}
                  whileHover={{ scale: hasPost ? 1.05 : 1 }}
                  onClick={() => hasPost && setExpandedEntry(expandedEntry === day ? null : day)}
                  className="relative rounded-xl p-2 min-h-[56px] transition-all duration-200"
                  style={{
                    background: isToday ? 'rgba(167,139,250,0.12)' : hasScheduled ? 'rgba(52,211,153,0.06)' : hasPost ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isToday ? 'rgba(167,139,250,0.4)' : hasScheduled ? 'rgba(52,211,153,0.35)' : hasPost ? 'rgba(74,222,128,0.2)' : 'var(--c-border)'}`,
                    cursor: hasPost ? 'pointer' : 'default',
                  }}>
                  <span style={{ fontSize: 11, fontFamily: '"Inter Tight", sans-serif', fontWeight: isToday ? 700 : 400, color: isToday ? '#a78bfa' : hasScheduled ? '#34d399' : hasPost ? '#4ade80' : 'rgba(232,234,242,0.3)' }}>
                    {day}
                  </span>
                  {hasPost && (
                    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {entries.slice(0, 3).map((e, di) => (
                        <div key={di} className="w-1 h-1 rounded-full" style={{ background: e.scheduled_for ? '#34d399' : '#4ade80' }} />
                      ))}
                    </div>
                  )}
                </motion.button>
              )
            })}
          </div>

          <AnimatePresence>
            {expandedEntry && entriesByDay[expandedEntry] && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="mt-4 space-y-3 overflow-hidden">
                <div className="flex items-center gap-2 pt-4" style={{ borderTop: '1px solid var(--c-border)' }}>
                  <span className="font-display text-sm font-bold text-ink">Posts on {monthName.split(' ')[0]} {expandedEntry}</span>
                  <button onClick={() => setExpandedEntry(null)} className="ghost-btn" style={{ padding: '2px 6px', fontSize: 10 }}><X size={10} /></button>
                </div>
                {entriesByDay[expandedEntry].map(entry => {
                  const platInfo = PLATFORMS.find(p => p.id === entry.platform) || PLATFORMS[0]
                  return (
                    <div key={entry.entry_id} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--c-border)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-ink truncate flex-1 mr-3">{entry.title}</h3>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1" style={{ color: platInfo.color }}>
                            <platInfo.Icon size={10} />
                            <span style={{ fontSize: 9, fontFamily: '"Inter Tight", sans-serif', fontWeight: 600, textTransform: 'uppercase' }}>{platInfo.label}</span>
                          </div>
                          <CopyBtn text={entry.draft_excerpt || entry.title} />
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: 'rgba(232,234,242,0.4)' }}>{entry.draft_excerpt}</p>
                      {/* Schedule picker */}
                      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--c-border)' }}>
                        {scheduling === entry.entry_id ? (
                          <div className="flex items-center gap-2">
                            <CalendarClock size={12} style={{ color: '#34d399', flexShrink: 0 }} />
                            <input type="datetime-local" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                              className="field-input text-xs flex-1" style={{ padding: '4px 8px' }} />
                            <button className="cta-btn" style={{ padding: '4px 12px', fontSize: 10 }}
                              onClick={() => handleSchedule(entry.entry_id)} disabled={schedLoading || !schedDate}>
                              {schedLoading ? <Spin size={10} /> : schedSuccess === entry.entry_id ? <Check size={10} style={{ color: '#4ade80' }} /> : 'Set'}
                            </button>
                            <button className="ghost-btn" style={{ padding: '4px 8px', fontSize: 10 }} onClick={() => { setScheduling(null); setSchedDate('') }}>Cancel</button>
                          </div>
                        ) : (
                          <button className="flex items-center gap-1.5 ghost-btn" style={{ padding: '3px 8px', fontSize: 10 }}
                            onClick={() => setScheduling(entry.entry_id)}>
                            <CalendarClock size={10} style={{ color: entry.scheduled_for ? '#34d399' : 'rgba(232,234,242,0.3)' }} />
                            <span style={{ color: entry.scheduled_for ? '#34d399' : 'rgba(232,234,242,0.4)' }}>
                              {entry.scheduled_for ? `Scheduled: ${new Date(entry.scheduled_for).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Schedule for later'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </SpotCard>
      ) : (
        calendar.length === 0 ? (
          <SpotCard className="p-0">
            <div className="flex flex-col items-center justify-center h-72" style={{ color: 'rgba(232,234,242,0.08)' }}>
              <Calendar size={56} className="mb-4 animate-float" />
              <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif' }}>No entries yet</p>
              <button className="ghost-btn mag-btn mt-6" onClick={loadCalendar}>Load Calendar</button>
            </div>
          </SpotCard>
        ) : (
          <motion.div className="space-y-3" initial="initial" animate="animate" variants={{ animate: { transition: { staggerChildren: 0.06 } } }}>
            {calendar.map(entry => {
              const d = new Date(entry.created_at)
              const platInfo = PLATFORMS.find(p => p.id === entry.platform) || PLATFORMS[0]
              return (
                <motion.div key={entry.entry_id} variants={{ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }}>
                  <SpotCard className="p-5">
                    <div className="flex items-center gap-5">
                      <div className="flex flex-col items-center shrink-0 rounded-xl px-3 py-2.5 min-w-[54px]"
                        style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.18)' }}>
                        <span style={{ fontSize: 9, fontFamily: '"Inter Tight", sans-serif', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#a78bfa' }}>
                          {d.toLocaleString('default', { month: 'short' })}
                        </span>
                        <span className="font-display text-xl leading-tight" style={{ color: '#c4b5fd' }}>{d.getDate()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-ink mb-1 truncate">{entry.title}</h3>
                        <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'rgba(232,234,242,0.4)' }}>{entry.draft_excerpt}</p>
                        {entry.scheduled_for && (
                          <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#34d399' }}>
                            <CalendarClock size={9} /> {new Date(entry.scheduled_for).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="tag tag-green">{entry.status}</span>
                        <div className="flex items-center gap-1" style={{ color: platInfo.color }}>
                          <platInfo.Icon size={10} />
                          <span style={{ fontSize: 9, fontFamily: '"Inter Tight", sans-serif', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{platInfo.label}</span>
                        </div>
                        <div className="flex gap-1">
                          <CopyBtn text={entry.draft_excerpt || entry.title} className="mt-1" />
                          <button className="ghost-btn" style={{ padding: '4px 8px', fontSize: 10 }}
                            onClick={() => { setScheduling(entry.entry_id); setViewMode('grid'); setExpandedEntry(null) }}>
                            <CalendarClock size={10} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </SpotCard>
                </motion.div>
              )
            })}
          </motion.div>
        )
      )}
    </motion.div>
  )
}

/* ─── Stats Page ────────────────────────────────────────────────────────────── */
function PageStats() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    getStats().then(setStats).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  async function handleExport(format) {
    setExporting(true)
    try { await exportDrafts(format) }
    catch (e) { setError(e.message) }
    finally { setExporting(false) }
  }

  const statCards = stats ? [
    { label: 'Total Drafts',     value: stats.total_drafts,      icon: FileText,   color: '#a78bfa', suffix: '' },
    { label: 'This Week',        value: stats.drafts_this_week,  icon: TrendingUp, color: '#60a5fa', suffix: '' },
    { label: 'Avg Score',        value: stats.avg_score,         icon: Target,     color: '#fbbf24', suffix: '/100' },
    { label: 'Best Score',       value: stats.best_score,        icon: Zap,        color: '#4ade80', suffix: '/100' },
    { label: 'Day Streak',       value: stats.streak_days,       icon: Flame,      color: '#f87171', suffix: ' days' },
    { label: 'Top Platform',     value: stats.top_platform,      icon: Share2,     color: '#34d399', suffix: '' },
  ] : []

  return (
    <motion.div {...FV} className="space-y-8">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <p className="tag tag-green mb-4">Your Stats</p>
          <h1 className="font-display text-5xl md:text-6xl text-ink mb-3">
            Usage<br /><span className="font-editorial grad-text">Dashboard.</span>
          </h1>
          <p className="text-ink-2 text-sm leading-relaxed max-w-md">
            Your content creation analytics — track output, quality and consistency.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="ghost-btn mag-btn flex items-center gap-2" onClick={() => handleExport('csv')} disabled={exporting}>
            {exporting ? <Spin size={12} /> : <Upload size={12} />} Export CSV
          </button>
          <button className="ghost-btn mag-btn flex items-center gap-2" onClick={() => handleExport('json')} disabled={exporting}>
            {exporting ? <Spin size={12} /> : <Upload size={12} />} Export JSON
          </button>
        </div>
      </div>

      {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{[1,2,3,4,5,6].map(i => <SkeletonCard key={i} lines={2} />)}</div>
      ) : stats ? (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {statCards.map(({ label, value, icon: Icon, color, suffix }) => (
              <motion.div key={label} whileHover={{ y: -2, scale: 1.01 }} transition={{ duration: 0.15 }}>
                <SpotCard className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                      <Icon size={14} style={{ color }} />
                    </div>
                  </div>
                  <p className="font-display text-3xl font-bold" style={{ color }}>
                    {typeof value === 'number' ? value.toLocaleString() : value}{suffix}
                  </p>
                  <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.3)', fontFamily: '"Inter Tight", sans-serif', marginTop: 4 }}>{label}</p>
                </SpotCard>
              </motion.div>
            ))}
          </div>

          {/* Score distribution */}
          <SpotCard className="p-6">
            <p className="font-display text-sm font-bold text-ink mb-4">Score Distribution</p>
            <div className="space-y-3">
              {Object.entries(stats.score_distribution).map(([range, count]) => {
                const total = stats.total_drafts || 1
                const pct = Math.round((count / total) * 100)
                const color = range === '86-100' ? '#4ade80' : range === '71-85' ? '#fbbf24' : range === '51-70' ? '#60a5fa' : '#f87171'
                return (
                  <div key={range} className="flex items-center gap-3">
                    <span style={{ fontSize: 11, fontFamily: '"Inter Tight", sans-serif', color: 'rgba(232,234,242,0.4)', width: 52, textAlign: 'right', flexShrink: 0 }}>{range}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <motion.div className="h-full rounded-full" style={{ background: color }}
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
                    </div>
                    <span style={{ fontSize: 11, fontFamily: '"Inter Tight", sans-serif', color, width: 28, flexShrink: 0 }}>{count}</span>
                  </div>
                )
              })}
            </div>
          </SpotCard>

          {/* Top niche */}
          {stats.top_niche && stats.top_niche !== '—' && (
            <SpotCard className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
                <Brain size={18} style={{ color: '#a78bfa' }} />
              </div>
              <div>
                <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.3)', fontFamily: '"Inter Tight", sans-serif' }}>Most Written Niche</p>
                <p className="font-display text-lg font-bold text-ink capitalize mt-0.5">{stats.top_niche}</p>
              </div>
            </SpotCard>
          )}
        </>
      ) : null}
    </motion.div>
  )
}

/* ── Notification Bell ───────────────────────────────────────────────────── */
function NotificationBell({ unreadCount, notifications, onOpen, onMarkAllRead, onMarkOne, open, setOpen }) {
  const ref = useRef(null)
  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [setOpen])

  const typeIcon = (type) => {
    if (type === 'scheduled_post') return '📅'
    if (type === 'score_alert') return '⭐'
    if (type === 'welcome') return '🎉'
    return '🔔'
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="relative ghost-btn mag-btn" style={{ padding: '6px 8px' }}>
        <Bell size={15} style={{ color: unreadCount > 0 ? '#a78bfa' : 'rgba(232,234,242,0.4)' }} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 rounded-full flex items-center justify-center"
              style={{ width: 16, height: 16, background: '#7c3aed', fontSize: 8, fontWeight: 700,
                fontFamily: '"Inter Tight", sans-serif', color: 'white', border: '2px solid var(--c-bg)' }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="absolute right-0 top-10 w-80 rounded-2xl glass shadow-2xl overflow-hidden z-[200]"
            style={{ border: '1px solid var(--c-border)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
              <span className="font-display text-sm font-bold text-ink">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={onMarkAllRead}
                  style={{ fontSize: 10, fontFamily: '"Inter Tight", sans-serif', color: '#a78bfa', letterSpacing: '0.06em' }}>
                  Mark all read
                </button>
              )}
            </div>
            {/* List */}
            <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2"
                  style={{ color: 'rgba(232,234,242,0.12)' }}>
                  <Bell size={28} />
                  <p style={{ fontSize: 10, fontFamily: '"Inter Tight", sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase' }}>All caught up!</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--c-border)' }}>
                  {notifications.map(n => (
                    <motion.div key={n.id}
                      className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors"
                      style={{ background: n.is_read ? 'transparent' : 'rgba(124,58,237,0.05)',
                        borderLeft: n.is_read ? '3px solid transparent' : '3px solid #7c3aed' }}
                      onClick={() => onMarkOne(n.id)}
                      whileHover={{ background: 'rgba(255,255,255,0.03)' }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{typeIcon(n.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-ink)', lineHeight: 1.3, marginBottom: 2 }}>{n.title}</p>
                        <p style={{ fontSize: 10, color: 'rgba(232,234,242,0.4)', lineHeight: 1.5 }} className="line-clamp-2">{n.message}</p>
                        <p style={{ fontSize: 9, color: 'rgba(232,234,242,0.2)', marginTop: 4, fontFamily: '"Inter Tight", sans-serif' }}>
                          {new Date(n.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {!n.is_read && (
                        <div className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: '#7c3aed' }} />
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── User Menu ────────────────────────────────────────────────────────────── */
function UserMenu({ user, onLogout, onChangePassword }) {
  const [open, setOpen] = useState(false)
  const [showCPModal, setShowCPModal] = useState(false)
  const [cpCurrent, setCpCurrent] = useState('')
  const [cpNew, setCpNew] = useState('')
  const [cpError, setCpError] = useState('')
  const [cpLoading, setCpLoading] = useState(false)
  const [cpSuccess, setCpSuccess] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const initials = (user?.display_name || user?.username || 'U')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  async function handleChangePassword(e) {
    e.preventDefault()
    setCpError('')
    if (cpNew.length < 8) { setCpError('New password must be at least 8 characters.'); return }
    setCpLoading(true)
    try {
      await changePassword(cpCurrent, cpNew)
      setCpSuccess(true)
      setTimeout(() => { setShowCPModal(false); setCpCurrent(''); setCpNew(''); setCpSuccess(false) }, 1500)
    } catch (err) {
      setCpError(err.message || 'Failed to change password.')
    } finally {
      setCpLoading(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center justify-center rounded-full font-display text-sm font-bold text-white transition-transform hover:scale-105"
        style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #7c3aed, #1d4ed8)', boxShadow: '0 0 12px rgba(124,58,237,0.35)', flexShrink: 0 }}>
        {initials}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="absolute right-0 top-10 w-52 rounded-2xl glass shadow-2xl overflow-hidden z-[200]"
            style={{ border: '1px solid var(--c-border)' }}>
            {/* User info */}
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
              <p className="font-display text-sm font-bold text-ink truncate">{user?.display_name || user?.username}</p>
              <p style={{ fontSize: 10, fontFamily: '"Inter Tight", sans-serif', color: 'rgba(232,234,242,0.3)', letterSpacing: '0.04em' }}>@{user?.username}</p>
            </div>
            {/* Actions */}
            {[[
              <KeyRound size={12} />, 'Change Password', () => { setOpen(false); setShowCPModal(true) }
            ], [
              <LogOut size={12} />, 'Sign Out', onLogout
            ]].map(([icon, label, action], i) => (
              <button key={i} onClick={action}
                className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-sm"
                style={{ color: label === 'Sign Out' ? '#f87171' : 'rgba(232,234,242,0.7)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ color: label === 'Sign Out' ? '#f87171' : 'rgba(232,234,242,0.3)' }}>{icon}</span>
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Change Password Modal */}
      <AnimatePresence>
        {showCPModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
            onClick={e => { if (e.target === e.currentTarget) setShowCPModal(false) }}>
            <motion.div
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
              className="w-full max-w-sm">
              <SpotCard className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <KeyRound size={14} style={{ color: '#a78bfa' }} />
                    <span className="font-display text-sm font-bold text-ink">Change Password</span>
                  </div>
                  <button onClick={() => setShowCPModal(false)} className="opacity-40 hover:opacity-80 transition-opacity"><X size={14} /></button>
                </div>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <FieldLabel>Current Password</FieldLabel>
                    <input className="field-input" type="password" value={cpCurrent}
                      onChange={e => setCpCurrent(e.target.value)} placeholder="••••••••" />
                  </div>
                  <div>
                    <FieldLabel>New Password</FieldLabel>
                    <input className="field-input" type="password" value={cpNew}
                      onChange={e => setCpNew(e.target.value)} placeholder="••••••••" />
                    <PasswordStrengthBar password={cpNew} />
                  </div>
                  {cpError && <p style={{ fontSize: 11, color: '#f87171' }}>{cpError}</p>}
                  {cpSuccess && <p style={{ fontSize: 11, color: '#4ade80' }}>Password changed ✓</p>}
                  <button type="submit" className="cta-btn w-full mag-btn" disabled={cpLoading}>
                    {cpLoading ? <Spin /> : <ShieldCheck size={13} />}
                    {cpLoading ? 'Updating…' : 'Update Password'}
                  </button>
                </form>
              </SpotCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}


const VOICE_DEFAULT_TEXT = loadState('voiceText', VOICE_DEFAULT)

export default function App() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authenticated, setAuthenticated] = useState(hasAuthToken())
  const [currentUser, setCurrentUser]     = useState(() => getCurrentUser())

  const handleLogin  = useCallback(() => {
    setAuthenticated(true)
    setCurrentUser(getCurrentUser())
  }, [])
  const handleLogout = useCallback(() => { clearAuthToken(); setAuthenticated(false); setCurrentUser(null) }, [])

  // ── Core state (with localStorage restoration) ───────────────────────────
  const [page,              setPage]             = useState('voice')
  const [loading,           setLoading]          = useState({})
  const [health,            setHealth]           = useState(null)
  const [niche,             setNiche]            = useState(() => loadState('niche', 'ai'))
  const [goal,              setGoal]             = useState(() => loadState('goal', 'educational'))
  const [platform,          setPlatform]         = useState(() => loadState('platform', 'linkedin'))
  const [voiceText,         setVoiceText]        = useState(VOICE_DEFAULT_TEXT)
  const [voiceMerge,        setVoiceMerge]       = useState(false)
  const [voiceProfile,      setVoiceProfile]     = useState(() => loadState('voiceProfile', null))
  const [voiceSummary,      setVoiceSummary]     = useState(() => loadState('voiceSummary', ''))
  const [trends,            setTrends]           = useState([])
  const [selected,          setSelected]         = useState(() => loadState('selectedTrend', ''))
  const [knowledgeDocs,     setKnowledgeDocs]    = useState(() => loadState('knowledgeDocs',
    'Agentic workflows reduce repetitive status reporting overhead.\nMeasure baseline cycle time before automating.'))
  const [knowledgeQuery,    setKnowledgeQuery]   = useState('')
  const [snippets,          setSnippets]         = useState([])
  const [approve,           setApprove]          = useState(false)
  const [maxRetries,        setMaxRetries]       = useState(0)
  const [draft,             setDraft]            = useState(null)
  const [draftHistory,      setDraftHistory]     = useState([])
  const [draftEdit,         setDraftEdit]        = useState('')
  const [editMode,          setEditMode]         = useState(false)
  const [multiDraft,        setMultiDraft]       = useState(null)
  const [multiTab,          setMultiTab]         = useState('linkedin')
  const [calendar,          setCalendar]         = useState([])
  const [refineInstruction, setRefineInstruction] = useState('')
  const [competitorPost,    setCompetitorPost]   = useState('')
  const [competitorResult,  setCompetitorResult] = useState(null)
  const { toasts, push: toast, dismiss } = useToasts()
  const [speaking,          setSpeaking]         = useState(false)

  // ── Persist key state to localStorage ─────────────────────────────────────
  useEffect(() => { saveState('niche', niche) }, [niche])
  useEffect(() => { saveState('goal', goal) }, [goal])
  useEffect(() => { saveState('platform', platform) }, [platform])
  useEffect(() => { saveState('voiceText', voiceText) }, [voiceText])
  useEffect(() => { saveState('voiceProfile', voiceProfile) }, [voiceProfile])
  useEffect(() => { saveState('voiceSummary', voiceSummary) }, [voiceSummary])
  useEffect(() => { saveState('selectedTrend', selected) }, [selected])
  useEffect(() => { saveState('knowledgeDocs', knowledgeDocs) }, [knowledgeDocs])

  const speakText = useCallback((text) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    utterance.rate = platform === 'x' ? 1.08 : 0.95
    utterance.pitch = platform === 'x' ? 1.05 : 1.0
    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }, [speaking, platform])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel(); setSpeaking(false)
    }
  }, [page])

  function trackEvent(name, params) {
    if (typeof window !== 'undefined' && window.gtag) window.gtag('event', name, params)
  }

  // ── Async runner ──────────────────────────────────────────────────────────
  const run = useCallback(async (key, fn) => {
    setLoading(p => ({ ...p, [key]: true }))
    try { await fn() }
    catch (e) {
      if (e.status === 401) { handleLogout(); toast('Session expired — please log in again.', 'warning'); return }
      toast(e?.message || 'Something went wrong', 'error')
    }
    finally { setLoading(p => ({ ...p, [key]: false })) }
  }, [handleLogout, toast])

  const busy = useCallback(k => !!loading[k], [loading])

  // ── Actions ───────────────────────────────────────────────────────────────
  const checkHealth = useCallback(() => run('health', async () => {
    setHealth(await getHealth()); toast('Backend is healthy ✓')
  }), [run, toast])

  const buildVoice = useCallback(() => run('voice', async () => {
    const d = await createVoiceProfile({ samples: toLines(voiceText), merge: voiceMerge })
    setVoiceProfile(d.signals); setVoiceSummary(d.summary)
    toast(voiceMerge ? 'Voice profile merged.' : 'Voice profile built.')
    trackEvent('voice_profile_built', { merge: voiceMerge })
  }), [run, toast, voiceText, voiceMerge])

  const fetchTrends = useCallback(() => run('trends', async () => {
    const d = await getTrends(niche)
    setTrends(d.trends)
    if (d.trends[0] && !selected) setSelected(d.trends[0].title)
    if (d.cached) toast('Showing cached trends (refreshes every 5 min).', 'warning')
    trackEvent('trends_fetched', { niche, cached: d.cached })
  }), [run, toast, niche, selected])

  const ingestDocs = useCallback(() => run('ingest', async () => {
    const d = await ingestKnowledge({ niche, documents: toLines(knowledgeDocs) })
    toast(`Indexed ${d.chunks_saved} chunks for "${d.niche}".`)
  }), [run, toast, niche, knowledgeDocs])

  const searchKnow = useCallback(() => run('retrieve', async () => {
    const d = await retrieveKnowledge({ niche, query: knowledgeQuery || `${selected || niche} ${goal}`, top_k: 5 })
    setSnippets(d.snippets)
  }), [run, niche, knowledgeQuery, selected, goal])

  // streaming state
  const [streamingText, setStreamingText] = useState('')
  const [streamPhase, setStreamPhase] = useState(null) // null | 'streaming' | 'reviewing'
  const streamAbortRef = useRef(null)

  const generateDraft = useCallback(() => run('draft', async () => {
    setMultiDraft(null)
    setStreamingText('')
    setStreamPhase('streaming')

    const payload = {
      niche, goal, voice_profile: voiceProfile,
      trend_title: selected || undefined,
      knowledge_snippets: [], approve, platform,
      auto_retrieve_knowledge: true, max_retries: 0,
    }

    // Abort any prior stream
    if (streamAbortRef.current) streamAbortRef.current.abort()
    const controller = new AbortController()
    streamAbortRef.current = controller

    let accumulated = ''
    try {
      await streamDraft(
        payload,
        (token) => { accumulated += token; setStreamingText(accumulated) },
        () => {},
        controller.signal,
      )
    } catch (e) {
      if (e.name === 'AbortError') { setStreamPhase(null); return }
      // If streaming fails, fall through to regular call
      accumulated = ''
    }

    // Phase 2 — call review-text if we got streamed content
    if (accumulated.trim()) {
      setStreamPhase('reviewing')
      const token = localStorage.getItem('pp_token')
      let reviewResult = { reviewer_score: 75, reviewer_notes: [], hook_strength: 5, best_time_to_post: '', reach_tier: 'Niche', readability_grade: 'Medium' }
      try {
        const res = await fetch(`${apiConfig.baseUrl}/draft/review-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ draft_text: accumulated, platform, niche, goal }),
        })
        if (res.ok) reviewResult = await res.json()
      } catch {} // eslint-disable-line no-empty

      const d = {
        draft: accumulated,
        reviewer_score: reviewResult.reviewer_score,
        reviewer_notes: reviewResult.reviewer_notes,
        hook_strength: reviewResult.hook_strength,
        best_time_to_post: reviewResult.best_time_to_post,
        reach_tier: reviewResult.reach_tier,
        readability_grade: reviewResult.readability_grade,
        revision_notes: '',
        persisted: false,
        needs_manual_edit: false,
        draft_id: null,
      }
      setDraft(d); setDraftEdit(accumulated); setEditMode(false)
      setDraftHistory(prev => [...prev.slice(-9), { ...d, platform }])
      setStreamingText('')
      setStreamPhase(null)
      toast(`Draft generated. Score: ${reviewResult.reviewer_score}/100.`)
      trackEvent('draft_generated', { score: reviewResult.reviewer_score, platform })
      return
    }

    // Fallback to regular blocking call
    setStreamPhase(null)
    const d = await createDraft({ ...payload, max_retries: maxRetries })
    setDraft(d); setDraftEdit(d.draft); setEditMode(false)
    setDraftHistory(prev => [...prev.slice(-9), { ...d, platform }])
    if (d.needs_manual_edit) toast('Auto-retries exhausted — please edit manually.', 'warning')
    else if (d.persisted) {
      const c = await getCalendar(50); setCalendar(c.items)
      toast('Draft approved and saved to calendar.')
    } else {
      toast(`Draft generated. Score: ${d.reviewer_score}/100.`)
    }
    trackEvent('draft_generated', { score: d.reviewer_score, platform })
  }), [run, toast, niche, goal, voiceProfile, selected, approve, platform, maxRetries])

  const generateAllPlatforms = useCallback(() => run('multiDraft', async () => {
    setDraft(null)
    const d = await createMultiPlatformDraft({
      niche, goal, voice_profile: voiceProfile,
      trend_title: selected || undefined,
      knowledge_snippets: [], approve, platform,
      auto_retrieve_knowledge: true, max_retries: 0,
    })
    setMultiDraft(d); setMultiTab('linkedin')
    toast('Generated for all 3 platforms! Switch tabs to compare.')
    trackEvent('multi_platform_generated', { niche })
  }), [run, toast, niche, goal, voiceProfile, selected, approve, platform])

  const refineCurrentDraft = useCallback((instruction) => run('refine', async () => {
    const activeDraft = multiDraft ? multiDraft[multiTab] : draft
    if (!activeDraft) return
    const d = await refineDraft({
      niche, goal, voice_profile: voiceProfile,
      original_draft: draftEdit || activeDraft.draft,
      instruction, revision_notes: activeDraft.revision_notes,
      approve, platform,
    })
    if (multiDraft) {
      setMultiDraft(prev => ({ ...prev, [multiTab]: d }))
    } else {
      setDraft(d); setDraftEdit(d.draft); setEditMode(false)
    }
    toast(`Refined. New score: ${d.reviewer_score}/100.`)
  }), [run, toast, draft, multiDraft, multiTab, niche, goal, voiceProfile, draftEdit, approve, platform])

  const saveEdit = useCallback(() => run('saveEdit', async () => {
    if (!draft?.draft_id) { toast('No draft ID to save against.', 'error'); return }
    await updateDraft(draft.draft_id, { text: draftEdit, approve })
    setDraft(d => ({ ...d, draft: draftEdit })); setEditMode(false)
    toast('Draft edits saved.')
  }), [run, toast, draft, draftEdit, approve])

  const loadCalendar = useCallback(() => run('calendar', async () => {
    const d = await getCalendar(50); setCalendar(d.items)
  }), [run])

  // ── Notifications state ───────────────────────────────────────────────────
  const [notifications,    setNotifications]    = useState([])
  const [unreadCount,      setUnreadCount]      = useState(0)
  const [notifOpen,        setNotifOpen]        = useState(false)

  // Poll notification count every 60 seconds
  useEffect(() => {
    if (!authenticated) return
    const poll = async () => {
      try {
        const d = await getNotificationCount()
        setUnreadCount(d.unread || 0)
      } catch { /* silent fail — don't disrupt UX */ }
    }
    poll() // immediate first poll
    const interval = setInterval(poll, 60000)
    return () => clearInterval(interval)
  }, [authenticated])

  // Load full notification list when bell is opened
  useEffect(() => {
    if (!notifOpen || !authenticated) return
    getNotifications(20).then(d => {
      setNotifications(d.items || [])
      setUnreadCount(d.unread_count || 0)
    }).catch(() => {})
  }, [notifOpen, authenticated])

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {}
  }, [])

  const handleMarkOneRead = useCallback(async (id) => {
    try {
      await markNotificationRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {}
  }, [])

  // Check upcoming scheduled posts when Calendar page is opened
  useEffect(() => {
    if (page === 'calendar' && authenticated) {
      checkUpcomingNotifications().then(d => {
        if (d.notifications_created > 0) {
          setUnreadCount(prev => prev + d.notifications_created)
          toast(`📅 ${d.notifications_created} scheduled post reminder${d.notifications_created > 1 ? 's' : ''} added.`, 'success')
        }
      }).catch(() => {})
    }
  }, [page, authenticated])

  // Competitor analysis
  useEffect(() => {
    if (!competitorResult?.loading) return
    const analyze = async () => {
      try {
        const result = await analyzeCompetitor({
          competitor_post: competitorPost,
          niche, goal, voice_profile: voiceProfile,
        })
        setCompetitorResult(result)
      } catch (e) {
        toast(e.message || 'Competitor analysis failed', 'error')
        setCompetitorResult(null)
      } finally {
        setLoading(p => ({ ...p, competitor: false }))
      }
    }
    setLoading(p => ({ ...p, competitor: true }))
    analyze()
  }, [competitorResult])

  if (!authenticated) return <LoginPage onLogin={handleLogin} />

  return (
    <div className="dark min-h-screen" style={{ background: 'var(--c-bg)' }}>
      <AmbientBg />
      <Cursor />
      <Toast toasts={toasts} dismiss={dismiss} />

      {/* Floating Header */}
      <header className="fixed top-0 left-0 right-0 z-50" style={{ paddingTop: 12 }}>
        <div className="max-w-7xl mx-auto px-4">
          <div className="floating-nav rounded-2xl px-4" style={{ height: 52 }}>
            <div className="h-full flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', boxShadow: '0 0 16px rgba(124,58,237,0.5)' }}>
                  <Sparkles size={12} className="text-white" />
                </div>
                <div>
                  <p className="font-display text-xs font-bold tracking-tight text-ink leading-none">PersonaPost</p>
                  <p style={{ fontSize: 8, fontFamily: '"Inter Tight", sans-serif', fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(236,238,248,0.28)' }}>AI Studio</p>
                </div>
              </div>

              <nav className="hidden md:flex items-center gap-1">
                {NAV.map(({ id, label, icon: Icon, dot }) => (
                  <button key={id} id={`nav-${id}`} onClick={() => setPage(id)}
                    className={`nav-item flex items-center gap-1.5`}
                    style={page === id ? { color: dot, background: `${dot}14`, borderRadius: 8 } : {}}>
                    <Icon size={11} />
                    {label}
                  </button>
                ))}
              </nav>

              <div className="flex items-center gap-2">
                <NotificationBell
                  unreadCount={unreadCount}
                  notifications={notifications}
                  open={notifOpen}
                  setOpen={setNotifOpen}
                  onMarkAllRead={handleMarkAllRead}
                  onMarkOne={handleMarkOneRead}
                />
                <UserMenu user={currentUser} onLogout={handleLogout} />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div style={{ paddingTop: 76, position: 'relative', zIndex: 1 }}>
        <Ticker />
      </div>

      <main className="max-w-7xl mx-auto px-6 py-12 relative z-10 pb-24 md:pb-12">
        <AnimatePresence mode="wait">
          <motion.div key={page} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}>

            {page === 'voice' && (
              <PageVoice
                niche={niche} setNiche={setNiche}
                voiceText={voiceText} setVoiceText={setVoiceText}
                voiceMerge={voiceMerge} setVoiceMerge={setVoiceMerge}
                voiceProfile={voiceProfile} voiceSummary={voiceSummary}
                health={health} busy={busy}
                buildVoice={buildVoice} checkHealth={checkHealth}
              />
            )}
            {page === 'trends' && (
              <PageTrends
                niche={niche} trends={trends}
                selected={selected} setSelected={setSelected}
                busy={busy} fetchTrends={fetchTrends}
              />
            )}
            {page === 'knowledge' && (
              <PageKnowledge
                knowledgeDocs={knowledgeDocs} setKnowledgeDocs={setKnowledgeDocs}
                knowledgeQuery={knowledgeQuery} setKnowledgeQuery={setKnowledgeQuery}
                snippets={snippets} selected={selected}
                niche={niche} goal={goal}
                busy={busy} ingestDocs={ingestDocs} searchKnow={searchKnow}
              />
            )}
            {page === 'draft' && (
              <PageDraft
                niche={niche} goal={goal} setGoal={setGoal}
                platform={platform} setPlatform={setPlatform}
                voiceProfile={voiceProfile} selected={selected}
                approve={approve} setApprove={setApprove}
                maxRetries={maxRetries} setMaxRetries={setMaxRetries}
                draft={draft} draftHistory={draftHistory} setDraftHistory={setDraftHistory}
                draftEdit={draftEdit} setDraftEdit={setDraftEdit}
                editMode={editMode} setEditMode={setEditMode}
                multiDraft={multiDraft} setMultiDraft={setMultiDraft}
                multiTab={multiTab} setMultiTab={setMultiTab}
                refineInstruction={refineInstruction} setRefineInstruction={setRefineInstruction}
                competitorPost={competitorPost} setCompetitorPost={setCompetitorPost}
                competitorResult={competitorResult} setCompetitorResult={setCompetitorResult}
                busy={busy} generateDraft={generateDraft}
                generateAllPlatforms={generateAllPlatforms}
                refineCurrentDraft={refineCurrentDraft}
                saveEdit={saveEdit} speaking={speaking} speakText={speakText}
                streamingText={streamingText} streamPhase={streamPhase}
              />
            )}
            {page === 'calendar' && (
              <PageCalendar
                calendar={calendar} busy={busy} loadCalendar={loadCalendar}
                onSchedule={loadCalendar}
              />
            )}
            {page === 'stats' && <PageStats />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile bottom tab bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t"
        style={{ borderColor: 'var(--c-border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-stretch">
          {NAV.map(({ id, label, icon: Icon, dot }) => (
            <button key={id} onClick={() => setPage(id)}
              className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors"
              style={{ color: page === id ? dot : 'rgba(232,234,242,0.25)' }}>
              <Icon size={18} />
              <span style={{ fontSize: 9, fontFamily: '"Inter Tight", sans-serif', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <footer className="max-w-7xl mx-auto px-6 py-8 relative z-10 hidden md:block">
        <div className="rule mb-6" />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p style={{ fontSize: 10, fontFamily: '"Inter Tight", sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.2)' }}>
            PersonaPost AI — Studio v0.4
          </p>
          <div className="flex items-center gap-6">
            {['Voice', 'RAG', 'Trends', 'Groq', 'Multi-Platform', 'Calendar'].map(t => (
              <span key={t} style={{ fontSize: 10, fontFamily: '"Inter Tight", sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.18)' }}>{t}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
