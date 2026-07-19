import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion'
import {
  Mic2, TrendingUp, Database, FileText, Calendar,
  ArrowRight, RefreshCw, CheckCircle2, AlertCircle, Info,
  Loader2, ChevronRight, Sparkles, Zap, Search,
  Upload, Eye, BookOpen, Activity, LogOut, Edit3, Save,
  Share2, Camera, X, Lock, User, Volume2, VolumeX,
} from 'lucide-react'
import './styles.css'
import {
  apiConfig, createDraft, createVoiceProfile, getCalendar,
  getHealth, getTrends, ingestKnowledge, retrieveKnowledge,
  login as apiLogin, clearAuthToken, hasAuthToken, refineDraft, updateDraft,
} from './lib/api'

/* ── Utils ───────────────────────────────────────────────────────────────── */
function toLines(t) { return t.split('\n').map(l => l.trim()).filter(Boolean) }
function cls(...c) { return c.filter(Boolean).join(' ') }

/* ── Custom Cursor ───────────────────────────────────────────────────────── */
function Cursor() {
  const mx = useMotionValue(0), my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 120, damping: 18 })
  const sy = useSpring(my, { stiffness: 120, damping: 18 })
  useEffect(() => {
    const move = e => { mx.set(e.clientX); my.set(e.clientY) }
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
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
  'Multi-step Orchestration', 'Quality Reviewer', 'Content Calendar',
  'Groq LLM', 'ChromaDB', 'FastAPI', 'React + Vite', 'JWT Auth', 'Alembic',
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

/* ── Ambient background ──────────────────────────────────────────────────── */
function AmbientBg() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      <div className="glow-blob" style={{ width: 600, height: 600, background: 'radial-gradient(circle, #7c3aed, transparent)', top: '-15%', left: '-10%', opacity: 0.1 }} />
      <div className="glow-blob" style={{ width: 500, height: 500, background: 'radial-gradient(circle, #1d4ed8, transparent)', bottom: '-10%', right: '-5%', opacity: 0.09 }} />
      <div className="glow-blob" style={{ width: 300, height: 300, background: 'radial-gradient(circle, #065f46, transparent)', top: '40%', left: '30%', opacity: 0.06 }} />
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
  { id: 'x',         label: 'X',         Icon: X,   color: '#a78bfa' },
  { id: 'instagram', label: 'Instagram', Icon: Camera, color: '#f87171' },
]

/* ── Nav ─────────────────────────────────────────────────────────────────── */
const NAV = [
  { id: 'voice',     label: 'Voice',     icon: Mic2,       dot: '#a78bfa' },
  { id: 'trends',    label: 'Trends',    icon: TrendingUp, dot: '#60a5fa' },
  { id: 'knowledge', label: 'Knowledge', icon: Database,   dot: '#4ade80' },
  { id: 'draft',     label: 'Draft',     icon: FileText,   dot: '#fbbf24' },
  { id: 'calendar',  label: 'Calendar',  icon: Calendar,   dot: '#f87171' },
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
function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await apiLogin(username, password)
      onLogin()
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--c-bg)' }}>
      <AmbientBg />
      <motion.div initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #1d4ed8)', boxShadow: '0 0 40px rgba(124,58,237,0.35)' }}>
            <Sparkles size={24} className="text-white" />
          </div>
          <p className="font-display text-2xl font-bold text-ink">PersonaPost</p>
          <p style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.3)', fontFamily: '"Inter Tight", sans-serif' }}>AI Studio</p>
        </div>

        <SpotCard className="p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <FieldLabel>Username</FieldLabel>
              <div className="relative">
                <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(232,234,242,0.3)' }} />
                <input id="login-username" className="field-input pl-8" value={username}
                  onChange={e => setUsername(e.target.value)} placeholder="admin" autoComplete="username" required />
              </div>
            </div>
            <div>
              <FieldLabel>Password</FieldLabel>
              <div className="relative">
                <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(232,234,242,0.3)' }} />
                <input id="login-password" className="field-input pl-8" type="password" value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
              </div>
            </div>
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-sm alert-err px-3 py-2 rounded-xl">
                  <AlertCircle size={13} /> {error}
                </motion.div>
              )}
            </AnimatePresence>
            <button id="login-submit" type="submit" className="cta-btn w-full mag-btn" disabled={loading}>
              {loading ? <><Spin /> Signing in…</> : <><Lock size={13} /> Sign In</>}
            </button>
          </form>
        </SpotCard>
        <p className="text-center mt-6" style={{ fontSize: 10, color: 'rgba(232,234,242,0.2)', letterSpacing: '0.08em' }}>
          PersonaPost AI — Internship MVP · Single-user mode
        </p>
      </motion.div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   APP
═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authenticated, setAuthenticated] = useState(hasAuthToken())

  function handleLogin() { setAuthenticated(true) }
  function handleLogout() { clearAuthToken(); setAuthenticated(false) }

  // ── Core state ────────────────────────────────────────────────────────────
  const [page,           setPage]          = useState('voice')
  const [loading,        setLoading]       = useState({})
  const [health,         setHealth]        = useState(null)
  const [niche,          setNiche]         = useState('ai')
  const [goal,           setGoal]          = useState('educational')
  const [platform,       setPlatform]      = useState('linkedin')
  const [voiceText,      setVoiceText]     = useState(VOICE_DEFAULT)
  const [voiceMerge,     setVoiceMerge]    = useState(false)
  const [voiceProfile,   setVoiceProfile]  = useState(null)
  const [voiceSummary,   setVoiceSummary]  = useState('')
  const [trends,         setTrends]        = useState([])
  const [selected,       setSelected]      = useState('')
  const [knowledgeDocs,  setKnowledgeDocs] = useState(
    'Agentic workflows reduce repetitive status reporting overhead.\nMeasure baseline cycle time before automating.'
  )
  const [knowledgeQuery, setKnowledgeQuery] = useState('')
  const [snippets,       setSnippets]      = useState([])
  const [approve,        setApprove]       = useState(false)
  const [maxRetries,     setMaxRetries]    = useState(0)
  const [draft,          setDraft]         = useState(null)
  const [draftEdit,      setDraftEdit]     = useState('')
  const [editMode,       setEditMode]      = useState(false)
  const [calendar,       setCalendar]      = useState([])
  const { toasts, push: toast, dismiss } = useToasts()
  const [speaking,       setSpeaking]      = useState(false)

  const speakText = useCallback((text) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)

    if (platform === 'linkedin') {
      utterance.rate = 0.95
      utterance.pitch = 1.0
    } else if (platform === 'x') {
      utterance.rate = 1.08
      utterance.pitch = 1.05
    } else {
      utterance.rate = 1.0
      utterance.pitch = 1.0
    }

    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }, [speaking, platform])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
    }
  }, [page])


  // ── Analytics stub ────────────────────────────────────────────────────────
  function trackEvent(name, params) {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', name, params)
    }
  }

  // ── Async runner ──────────────────────────────────────────────────────────
  const run = useCallback(async (key, fn) => {
    setLoading(p => ({ ...p, [key]: true }))
    try {
      await fn()
    } catch (e) {
      if (e.status === 401) {
        handleLogout()
        toast('Session expired — please log in again.', 'warning')
        return
      }
      toast(e?.message || 'Something went wrong', 'error')
    } finally {
      setLoading(p => ({ ...p, [key]: false }))
    }
  }, [])
  const busy = k => !!loading[k]

  // ── Actions ───────────────────────────────────────────────────────────────
  const checkHealth   = () => run('health', async () => {
    setHealth(await getHealth())
    toast('Backend is healthy ✓')
    trackEvent('health_check', {})
  })

  const buildVoice    = () => run('voice', async () => {
    const d = await createVoiceProfile({ samples: toLines(voiceText), merge: voiceMerge })
    setVoiceProfile(d.signals); setVoiceSummary(d.summary)
    toast(voiceMerge ? 'Voice profile merged.' : 'Voice profile built.')
    trackEvent('voice_profile_built', { merge: voiceMerge })
  })

  const fetchTrends   = () => run('trends', async () => {
    const d = await getTrends(niche)
    setTrends(d.trends)
    if (d.trends[0]) setSelected(d.trends[0].title)
    if (d.cached) toast('Showing cached trends (refreshes every 5 min).', 'warning')
    trackEvent('trends_fetched', { niche, cached: d.cached })
  })

  const ingestDocs    = () => run('ingest', async () => {
    const d = await ingestKnowledge({ niche, documents: toLines(knowledgeDocs) })
    toast(`Indexed ${d.chunks_saved} chunks for "${d.niche}".`)
  })

  const searchKnow    = () => run('retrieve', async () => {
    const d = await retrieveKnowledge({ niche, query: knowledgeQuery || `${selected || niche} ${goal}`, top_k: 5 })
    setSnippets(d.snippets)
  })

  const generateDraft = () => run('draft', async () => {
    const d = await createDraft({
      niche, goal, voice_profile: voiceProfile,
      trend_title: selected || undefined,
      knowledge_snippets: [], approve, platform,
      auto_retrieve_knowledge: true, max_retries: maxRetries,
    })
    setDraft(d); setDraftEdit(d.draft); setEditMode(false)
    if (d.needs_manual_edit) toast('Auto-retries exhausted — please edit manually.', 'warning')
    else if (d.persisted) {
      const c = await getCalendar(50); setCalendar(c.items)
      toast('Draft approved and saved to calendar.')
      trackEvent('draft_approved', { score: d.reviewer_score })
    } else {
      toast(`Draft generated. Score: ${d.reviewer_score}/100.`)
      trackEvent('draft_generated', { score: d.reviewer_score, platform })
    }
  })

  const refineCurrentDraft = (instruction) => run('refine', async () => {
    if (!draft) return
    const d = await refineDraft({
      niche, goal, voice_profile: voiceProfile,
      original_draft: draftEdit || draft.draft,
      instruction, revision_notes: draft.revision_notes,
      approve, platform,
    })
    setDraft(d); setDraftEdit(d.draft); setEditMode(false)
    toast(`Refined. New score: ${d.reviewer_score}/100.`)
    trackEvent('draft_refined', { score: d.reviewer_score })
  })

  const saveEdit      = () => run('saveEdit', async () => {
    if (!draft?.draft_id) { toast('No draft ID to save against.', 'error'); return }
    await updateDraft(draft.draft_id, { text: draftEdit, approve })
    setDraft(d => ({ ...d, draft: draftEdit }))
    setEditMode(false)
    toast('Draft edits saved.')
    trackEvent('draft_edited', { draft_id: draft.draft_id })
  })

  const loadCalendar  = () => run('calendar', async () => {
    const d = await getCalendar(50); setCalendar(d.items)
  })

  if (!authenticated) return <LoginPage onLogin={handleLogin} />

  /* ── PAGES ── */
  function PageVoice() {
    return (
      <motion.div {...FV} className="space-y-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="tag tag-violet mb-4">Step 01 — Voice</p>
            <h1 className="font-display text-5xl md:text-6xl text-ink mb-3">
              Voice<br /><span className="font-editorial grad-text">Profile.</span>
            </h1>
            <p className="text-ink-2 text-sm leading-relaxed max-w-md">
              Paste 5–10 writing samples and the system extracts your tone, sentence patterns, and CTA style automatically.
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

        {busy('voice') ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3"><SkeletonCard lines={5} /></div>
            <div className="lg:col-span-2"><SkeletonCard lines={6} /></div>
          </div>
        ) : (
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
                <input id="input-niche" className="field-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="ai, fintech, health…" />
              </div>
              <div>
                <FieldLabel>Samples — one per line, 5–10 recommended</FieldLabel>
                <textarea id="textarea-voice-samples" className="field-input" value={voiceText} onChange={e => setVoiceText(e.target.value)} rows={7} />
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
                  Merge with existing profile (blend signals)
                </span>
              </label>
              <button id="btn-build-voice" className="cta-btn mag-btn" onClick={buildVoice} disabled={busy('voice')}>
                {busy('voice') ? <Spin /> : <Sparkles size={13} />}
                {busy('voice') ? 'Building…' : 'Build Profile'}
                {!busy('voice') && <ArrowRight size={13} />}
              </button>
            </SpotCard>

            <SpotCard className={cls('lg:col-span-2 p-6', !voiceProfile && 'opacity-40')}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>
                  <Zap size={14} style={{ color: '#4ade80' }} />
                </div>
                <span className="font-display text-sm font-bold tracking-tight text-ink">Extracted Signals</span>
              </div>
              {voiceProfile ? (
                <motion.div initial="initial" animate="animate" variants={{ animate: { transition: { staggerChildren: 0.06 } } }} className="space-y-4">
                  {voiceSummary && <p className="text-xs leading-relaxed" style={{ color: 'rgba(232,234,242,0.45)' }}>{voiceSummary}</p>}
                  <div className="rule" />
                  {[
                    { k: 'Tone',       v: voiceProfile.tone },
                    { k: 'Formality',  v: `${voiceProfile.formality}/10` },
                    { k: 'Sentences',  v: voiceProfile.sentence_length },
                    { k: 'CTA Style',  v: voiceProfile.cta_style },
                    { k: 'Emoji',      v: voiceProfile.emoji_usage },
                    { k: 'Confidence', v: `${(voiceProfile.confidence * 100).toFixed(0)}%` },
                  ].map(({ k, v }) => (
                    <motion.div key={k} variants={{ initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 } }}
                      className="flex items-center justify-between text-sm">
                      <span style={{ color: 'rgba(232,234,242,0.35)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif' }}>{k}</span>
                      <span className="tag tag-violet">{v}</span>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48" style={{ color: 'rgba(232,234,242,0.15)' }}>
                  <Mic2 size={40} className="mb-3 animate-float" />
                  <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif' }}>Awaiting samples</p>
                </div>
              )}
            </SpotCard>
          </div>
        )}
      </motion.div>
    )
  }

  function PageTrends() {
    return (
      <motion.div {...FV} className="space-y-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="tag tag-blue mb-4">Step 02 — Intelligence</p>
            <h1 className="font-display text-5xl md:text-6xl text-ink mb-3">
              Trend<br /><span className="font-editorial grad-text">Signals.</span>
            </h1>
            <p className="text-ink-2 text-sm leading-relaxed max-w-md">
              Live signals from Hacker News and Reddit, ranked by relevance. Cached for 5 minutes.
            </p>
          </div>
          <button id="btn-fetch-trends" className="cta-btn mag-btn" onClick={fetchTrends} disabled={busy('trends')}>
            {busy('trends') ? <Spin /> : <RefreshCw size={13} />}
            {busy('trends') ? 'Fetching…' : 'Fetch Live'}
          </button>
        </div>

        {selected && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl alert-ok text-sm">
            <CheckCircle2 size={14} /> Selected: <strong>{selected}</strong>
          </motion.div>
        )}

        {busy('trends') ? (
          <SkeletonCard lines={4} />
        ) : (
          <SpotCard className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
                  <TrendingUp size={14} style={{ color: '#60a5fa' }} />
                </div>
                <span className="font-display text-sm font-bold tracking-tight text-ink">Live Topics</span>
              </div>
              <span className="tag tag-blue">{niche}</span>
            </div>

            {trends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20" style={{ color: 'rgba(232,234,242,0.12)' }}>
                <TrendingUp size={48} className="mb-4 animate-float" />
                <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif' }}>No signals yet</p>
              </div>
            ) : (
              <motion.div className="space-y-3" initial="initial" animate="animate" variants={{ animate: { transition: { staggerChildren: 0.05 } } }}>
                {trends.map((t, i) => (
                  <motion.button key={i}
                    variants={{ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }}
                    onClick={() => setSelected(t.title)}
                    className="w-full text-left rounded-xl border p-4 transition-all duration-200"
                    style={{ borderColor: selected === t.title ? 'rgba(167,139,250,0.4)' : 'var(--c-border)', background: selected === t.title ? 'rgba(167,139,250,0.06)' : 'rgba(255,255,255,0.02)' }}>
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <span className="text-sm font-medium leading-snug text-ink flex-1">{t.title}</span>
                      <span className="tag tag-violet shrink-0">{(t.score * 100).toFixed(0)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif', color: 'rgba(232,234,242,0.25)' }}>{t.source}</span>
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

  function PageKnowledge() {
    return (
      <motion.div {...FV} className="space-y-8">
        <div>
          <p className="tag tag-green mb-4">Step 03 — Context</p>
          <h1 className="font-display text-5xl md:text-6xl text-ink mb-3">
            Knowledge<br /><span className="font-editorial grad-text">Base.</span>
          </h1>
          <p className="text-ink-2 text-sm leading-relaxed max-w-md">
            Index reference material. Drafts auto-retrieve relevant context before generation.
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

  function PageDraft() {
    const [refineInstruction, setRefineInstruction] = useState('')
    const charCount = draftEdit.length
    const charLimit = platform === 'x' ? 280 : platform === 'instagram' ? 2200 : 3000

    return (
      <motion.div {...FV} className="space-y-8">
        <div>
          <p className="tag tag-amber mb-4">Step 04 — Generate</p>
          <h1 className="font-display text-5xl md:text-6xl text-ink mb-3">
            Draft<br /><span className="font-editorial grad-text">Studio.</span>
          </h1>
          <p className="text-ink-2 text-sm leading-relaxed max-w-md">
            Plan → generate in your voice → review → refine → approve.
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

            {/* Platform selector */}
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

            {/* Auto-retry */}
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

            {/* Auto-approve toggle */}
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

            <button id="btn-generate-draft" className="cta-btn w-full mag-btn" onClick={generateDraft} disabled={busy('draft')}>
              {busy('draft') ? <Spin /> : <FileText size={13} />}
              {busy('draft') ? 'Generating…' : 'Generate Draft'}
              {!busy('draft') && <ArrowRight size={13} />}
            </button>
          </SpotCard>

          {/* Output panel */}
          <div className="lg:col-span-2">
            <AnimatePresence mode="wait">
              {busy('draft') ? (
                <motion.div key="skeleton" {...FV} className="space-y-4">
                  <SkeletonCard lines={3} />
                  <SkeletonCard lines={2} />
                  <SkeletonCard lines={6} />
                </motion.div>
              ) : draft ? (
                <motion.div key="result" {...FV} className="space-y-4">
                  {/* Score + notes */}
                  <SpotCard className="p-5">
                    <div className="flex items-start gap-5">
                      <ScoreRing score={draft.reviewer_score} />
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display text-sm font-bold text-ink">Reviewer Notes</span>
                          {draft.persisted && <span className="tag tag-green">✓ Saved</span>}
                          {!draft.persisted && approve && <span className="tag tag-amber">Below threshold</span>}
                          {draft.needs_manual_edit && <span className="tag tag-rose">Edit needed</span>}
                        </div>
                        <div className="space-y-2">
                          {draft.revision_notes.map((note, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm" style={{ color: 'rgba(232,234,242,0.5)' }}>
                              <ChevronRight size={13} style={{ color: '#a78bfa', marginTop: 2, flexShrink: 0 }} />
                              {note}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </SpotCard>

                  {/* Plan */}
                  <SpotCard className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen size={13} style={{ color: 'rgba(232,234,242,0.3)' }} />
                      <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif', color: 'rgba(232,234,242,0.3)' }}>Content Plan</span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'rgba(232,234,242,0.6)' }}>{draft.plan}</p>
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
                          {!editMode && (
                            <button id="btn-speak-draft"
                              onClick={() => speakText(draft.draft)}
                              className="ghost-btn mag-btn flex items-center gap-1.5"
                              style={{ padding: '4px 10px', fontSize: 11, borderColor: speaking ? 'rgba(167,139,250,0.5)' : 'var(--c-border)', color: speaking ? '#a78bfa' : 'var(--c-muted)' }}>
                              {speaking ? <VolumeX size={11} className="animate-pulse" /> : <Volume2 size={11} />}
                              {speaking ? 'Stop' : 'Listen'}
                            </button>
                          )}
                          <button id="btn-toggle-edit"
                            onClick={() => { setEditMode(m => !m); if (!editMode) setDraftEdit(draft.draft) }}
                            className="ghost-btn mag-btn"
                            style={{ padding: '4px 10px', fontSize: 11 }}>
                            <Edit3 size={11} /> {editMode ? 'Cancel' : 'Edit'}
                          </button>
                        </div>
                      </div>

                      {editMode ? (
                        <div className="space-y-3">
                          <textarea
                            id="textarea-draft-edit"
                            className="field-input"
                            value={draftEdit}
                            onChange={e => setDraftEdit(e.target.value)}
                            rows={10}
                            style={{ resize: 'vertical' }}
                          />
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
                          {draft.draft}
                        </pre>
                      )}

                      {/* Refine panel */}
                      <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--c-border)' }}>
                        <FieldLabel>Refine instruction</FieldLabel>
                        <div className="flex gap-2">
                          <input
                            id="input-refine-instruction"
                            className="field-input flex-1"
                            value={refineInstruction}
                            onChange={e => setRefineInstruction(e.target.value)}
                            placeholder="Make it shorter, add bullet points…"
                            onKeyDown={e => { if (e.key === 'Enter' && refineInstruction.trim()) { refineCurrentDraft(refineInstruction); setRefineInstruction('') } }}
                          />
                          <button id="btn-refine-draft" className="ghost-btn mag-btn shrink-0"
                            onClick={() => { if (refineInstruction.trim()) { refineCurrentDraft(refineInstruction); setRefineInstruction('') } }}
                            disabled={busy('refine') || !refineInstruction.trim()}>
                            {busy('refine') ? <Spin size={12} /> : <RefreshCw size={12} />}
                          </button>
                        </div>
                        <div className="flex gap-1.5 mt-2">
                          {['Make it shorter', 'Add bullet points', 'Strengthen the hook'].map(s => (
                            <button key={s} onClick={() => { refineCurrentDraft(s) }}
                              className="px-2 py-1 rounded-lg text-[10px] transition-colors"
                              disabled={busy('refine')}
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--c-border)', fontFamily: '"Inter Tight", sans-serif', color: 'rgba(232,234,242,0.3)' }}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
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

  function PageCalendar() {
    return (
      <motion.div {...FV} className="space-y-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="tag tag-rose mb-4">Step 05 — Archive</p>
            <h1 className="font-display text-5xl md:text-6xl text-ink mb-3">
              Content<br /><span className="font-editorial grad-text">Calendar.</span>
            </h1>
            <p className="text-ink-2 text-sm leading-relaxed max-w-md">
              Approved posts saved from the generation pipeline.
            </p>
          </div>
          <button id="btn-load-calendar" className="ghost-btn mag-btn" onClick={loadCalendar} disabled={busy('calendar')}>
            {busy('calendar') ? <Spin /> : <RefreshCw size={12} />} Refresh
          </button>
        </div>

        {busy('calendar') ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <SkeletonCard key={i} lines={2} />)}
          </div>
        ) : calendar.length === 0 ? (
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
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="tag tag-green">{entry.status}</span>
                        <div className="flex items-center gap-1" style={{ color: platInfo.color }}>
                          <platInfo.Icon size={10} />
                          <span style={{ fontSize: 9, fontFamily: '"Inter Tight", sans-serif', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{platInfo.label}</span>
                        </div>
                      </div>
                    </div>
                  </SpotCard>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </motion.div>
    )
  }

  const PAGES = { voice: PageVoice, trends: PageTrends, knowledge: PageKnowledge, draft: PageDraft, calendar: PageCalendar }
  const ActivePage = PAGES[page] || PageVoice

  /* ─────────────────── RENDER ─────────────────── */
  return (
    <div className="dark min-h-screen" style={{ background: 'var(--c-bg)' }}>
      <AmbientBg />
      <Toast toasts={toasts} dismiss={dismiss} />

      {/* Topbar */}
      <header className="fixed top-0 left-0 right-0 z-50 glass" style={{ height: 64 }}>
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center relative"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #1d4ed8)', boxShadow: '0 0 20px rgba(124,58,237,0.4)' }}>
              <Sparkles size={14} className="text-white" />
            </div>
            <div>
              <p className="font-display text-sm font-bold tracking-tight text-ink leading-none">PersonaPost</p>
              <p style={{ fontSize: 9, fontFamily: '"Inter Tight", sans-serif', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.3)' }}>AI Studio</p>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {NAV.map(({ id, label, dot }) => (
              <button key={id} id={`nav-${id}`} onClick={() => setPage(id)}
                className={cls('nav-item', page === id && 'active')} data-hover>
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-2 transition-colors"
                  style={{ background: page === id ? dot : 'transparent', border: `1px solid ${dot}`, verticalAlign: 'middle' }} />
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--c-border)' }}>
              <span className="w-1.5 h-1.5 rounded-full"
                style={{ background: health ? '#4ade80' : 'rgba(232,234,242,0.2)', boxShadow: health ? '0 0 6px #4ade80' : 'none' }} />
              <span style={{ fontSize: 10, fontFamily: '"Inter Tight", sans-serif', letterSpacing: '0.08em', color: 'rgba(232,234,242,0.4)' }}>{apiConfig.baseUrl}</span>
            </div>
            <button id="btn-logout" onClick={handleLogout} className="ghost-btn mag-btn" style={{ padding: '5px 10px' }}>
              <LogOut size={12} />
            </button>
          </div>
        </div>
      </header>

      {/* Ticker */}
      <div style={{ paddingTop: 64, position: 'relative', zIndex: 1 }}>
        <Ticker />
      </div>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-12 relative z-10 pb-24 md:pb-12">
        <AnimatePresence mode="wait">
          <motion.div key={page} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}>
            <ActivePage />
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

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-8 relative z-10 hidden md:block">
        <div className="rule mb-6" />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p style={{ fontSize: 10, fontFamily: '"Inter Tight", sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.2)' }}>
            PersonaPost AI — Production MVP v0.2
          </p>
          <div className="flex items-center gap-6">
            {['Voice', 'RAG', 'Trends', 'Groq', 'JWT', 'Alembic'].map(t => (
              <span key={t} style={{ fontSize: 10, fontFamily: '"Inter Tight", sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.18)' }}>{t}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
