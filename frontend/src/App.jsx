import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion'
import {
  Mic2, TrendingUp, Database, FileText, Calendar,
  ArrowRight, RefreshCw, CheckCircle2, AlertCircle,
  Loader2, ChevronRight, Sparkles, Zap, Search,
  Upload, Eye, BookOpen, Activity,
} from 'lucide-react'
import './styles.css'
import {
  apiConfig, createDraft, createVoiceProfile, getCalendar,
  getHealth, getTrends, ingestKnowledge, retrieveKnowledge,
} from './lib/api'

/* ── Utils ───────────────────────────────────────────────── */
function toLines(t) { return t.split('\n').map(l => l.trim()).filter(Boolean) }
function cls(...c) { return c.filter(Boolean).join(' ') }

/* ── Custom Cursor ───────────────────────────────────────── */
function Cursor() {
  const dotRef  = useRef(null)
  const ringRef = useRef(null)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 120, damping: 18 })
  const sy = useSpring(my, { stiffness: 120, damping: 18 })

  useEffect(() => {
    const move = e => { mx.set(e.clientX); my.set(e.clientY) }
    const enter = () => document.body.classList.add('cursor-hover')
    const leave = () => document.body.classList.remove('cursor-hover')
    window.addEventListener('mousemove', move)
    document.querySelectorAll('button,a,[data-hover]').forEach(el => {
      el.addEventListener('mouseenter', enter)
      el.addEventListener('mouseleave', leave)
    })
    return () => { window.removeEventListener('mousemove', move) }
  }, [mx, my])

  return (
    <>
      <motion.div id="cursor-dot"  style={{ x: mx, y: my }} />
      <motion.div id="cursor-ring" style={{ x: sx, y: sy }} />
    </>
  )
}

/* ── Ticker ──────────────────────────────────────────────── */
const TICKER_ITEMS = [
  'Voice Profiling', 'Trend Intelligence', 'RAG Pipeline',
  'Multi-step Orchestration', 'Quality Reviewer', 'Content Calendar',
  'Groq LLM', 'ChromaDB', 'FastAPI', 'React + Vite',
]
function Ticker() {
  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS]
  return (
    <div className="ticker-wrap">
      <div className="ticker-track">
        {doubled.map((item, i) => (
          <span key={i} className="ticker-item">
            {item}
            <span className="ticker-sep" />
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── Spinner ─────────────────────────────────────────────── */
function Spin({ size = 14 }) {
  return <Loader2 size={size} className="animate-spin" />
}

/* ── Score Ring ──────────────────────────────────────────── */
function ScoreRing({ score }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 80 ? '#4ade80' : score >= 60 ? '#fbbf24' : '#f87171'
  return (
    <div className="score-wrap">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
        <motion.circle
          cx="44" cy="44" r={r} fill="none"
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

/* ── Ambient glow background ─────────────────────────────── */
function AmbientBg() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      <div className="glow-blob" style={{ width: 600, height: 600, background: 'radial-gradient(circle, #7c3aed, transparent)', top: '-15%', left: '-10%', opacity: 0.1 }} />
      <div className="glow-blob" style={{ width: 500, height: 500, background: 'radial-gradient(circle, #1d4ed8, transparent)', bottom: '-10%', right: '-5%', opacity: 0.09 }} />
      <div className="glow-blob" style={{ width: 300, height: 300, background: 'radial-gradient(circle, #065f46, transparent)', top: '40%', left: '30%', opacity: 0.06 }} />
    </div>
  )
}

/* ── Spotlight card ──────────────────────────────────────── */
function SpotCard({ children, className, style }) {
  const ref = useRef(null)
  const handleMove = e => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const x = ((e.clientX - r.left) / r.width * 100).toFixed(1)
    const y = ((e.clientY - r.top) / r.height * 100).toFixed(1)
    ref.current.style.setProperty('--mx', x + '%')
    ref.current.style.setProperty('--my', y + '%')
  }
  return (
    <div ref={ref} onMouseMove={handleMove}
      className={cls('card-glow glass rounded-2xl', className)}
      style={style}>
      {children}
    </div>
  )
}

/* ── Field label ─────────────────────────────────────────── */
function FieldLabel({ children }) {
  return (
    <span className="block mb-2 font-display text-[10px] font-semibold tracking-[0.12em] uppercase"
      style={{ color: 'rgba(232,234,242,0.35)' }}>
      {children}
    </span>
  )
}

/* ── Nav ─────────────────────────────────────────────────── */
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

/* ═══════════════════════════════════════════════════════════
   APP
═══════════════════════════════════════════════════════════ */
export default function App() {
  const [page,          setPage]          = useState('voice')
  const [loading,       setLoading]       = useState({})
  const [globalError,   setGlobalError]   = useState('')
  const [notice,        setNotice]        = useState('')
  const [niche,         setNiche]         = useState('ai')
  const [goal,          setGoal]          = useState('educational')
  const [voiceText,     setVoiceText]     = useState(VOICE_DEFAULT)
  const [voiceProfile,  setVoiceProfile]  = useState(null)
  const [voiceSummary,  setVoiceSummary]  = useState('')
  const [health,        setHealth]        = useState(null)
  const [trends,        setTrends]        = useState([])
  const [selected,      setSelected]      = useState('')
  const [knowledgeDocs, setKnowledgeDocs] = useState(
    'Agentic workflows reduce repetitive status reporting overhead.\nMeasure baseline cycle time before automating.',
  )
  const [knowledgeQuery,setKnowledgeQuery]= useState('')
  const [snippets,      setSnippets]      = useState([])
  const [approve,       setApprove]       = useState(false)
  const [draft,         setDraft]         = useState(null)
  const [calendar,      setCalendar]      = useState([])

  const run = useCallback(async (key, fn) => {
    setGlobalError('')
    setNotice('')
    setLoading(p => ({ ...p, [key]: true }))
    try { await fn() }
    catch (e) { setGlobalError(e?.message || 'Something went wrong') }
    finally   { setLoading(p => ({ ...p, [key]: false })) }
  }, [])
  const busy = k => !!loading[k]

  const checkHealth   = () => run('health', async () => { setHealth(await getHealth()); setNotice('Backend is healthy.') })
  const buildVoice    = () => run('voice', async () => {
    const d = await createVoiceProfile({ samples: toLines(voiceText) })
    setVoiceProfile(d.signals); setVoiceSummary(d.summary); setNotice('Voice profile built.')
  })
  const fetchTrends   = () => run('trends', async () => {
    const d = await getTrends(niche)
    setTrends(d.trends)
    if (d.trends[0]) setSelected(d.trends[0].title)
  })
  const ingestDocs    = () => run('ingest', async () => {
    const d = await ingestKnowledge({ niche, documents: toLines(knowledgeDocs) })
    setNotice(`Indexed ${d.chunks_saved} chunks for "${d.niche}".`)
  })
  const searchKnow    = () => run('retrieve', async () => {
    const d = await retrieveKnowledge({ niche, query: knowledgeQuery || `${selected || niche} ${goal}`, top_k: 5 })
    setSnippets(d.snippets)
  })
  const generateDraft = () => run('draft', async () => {
    const d = await createDraft({ niche, goal, voice_profile: voiceProfile, trend_title: selected || undefined, knowledge_snippets: [], approve, auto_retrieve_knowledge: true })
    setDraft(d)
    if (d.persisted) { const c = await getCalendar(50); setCalendar(c.items); setNotice('Draft saved to calendar.') }
  })
  const loadCalendar  = () => run('calendar', async () => { const d = await getCalendar(50); setCalendar(d.items) })

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
                  { k: 'Tone',        v: voiceProfile.tone },
                  { k: 'Formality',   v: `${voiceProfile.formality}/10` },
                  { k: 'Sentences',   v: voiceProfile.sentence_length },
                  { k: 'CTA Style',   v: voiceProfile.cta_style },
                  { k: 'Emoji',       v: voiceProfile.emoji_usage },
                  { k: 'Confidence',  v: `${(voiceProfile.confidence * 100).toFixed(0)}%` },
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
              Live signals from Hacker News and Reddit, ranked by relevance and freshness for your niche.
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
                <motion.button
                  key={i}
                  variants={{ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }}
                  onClick={() => setSelected(t.title)}
                  className="w-full text-left rounded-xl border p-4 transition-all duration-200"
                  style={{
                    borderColor: selected === t.title ? 'rgba(167,139,250,0.4)' : 'var(--c-border)',
                    background: selected === t.title ? 'rgba(167,139,250,0.06)' : 'rgba(255,255,255,0.02)',
                  }}
                >
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
        </div>
      </motion.div>
    )
  }

  function PageDraft() {
    return (
      <motion.div {...FV} className="space-y-8">
        <div>
          <p className="tag tag-amber mb-4">Step 04 — Generate</p>
          <h1 className="font-display text-5xl md:text-6xl text-ink mb-3">
            Draft<br /><span className="font-editorial grad-text">Studio.</span>
          </h1>
          <p className="text-ink-2 text-sm leading-relaxed max-w-md">
            Plan → generate in your voice → auto-review. All in one pipeline.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Settings */}
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

            <div className="space-y-2.5">
              <FieldLabel>Context</FieldLabel>
              {[
                { label: 'Niche',    value: niche,    color: '#a78bfa' },
                { label: 'Trend',    value: selected || '—',   color: '#60a5fa' },
                { label: 'Voice',    value: voiceProfile ? 'Loaded' : 'Missing', color: voiceProfile ? '#4ade80' : '#f87171' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--c-border)' }}>
                  <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif', color: 'rgba(232,234,242,0.3)' }}>{label}</span>
                  <span style={{ fontSize: 11, fontFamily: '"Inter Tight", sans-serif', fontWeight: 600, color, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Toggle */}
            <label className="flex items-center gap-3 group" style={{ cursor: 'default' }}>
              <button
                id="toggle-approve"
                role="switch"
                aria-checked={approve}
                onClick={() => setApprove(a => !a)}
                className="relative shrink-0 rounded-full transition-colors duration-300"
                style={{ width: 40, height: 22, background: approve ? '#a78bfa' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
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

          {/* Output */}
          <div className="lg:col-span-2">
            <AnimatePresence mode="wait">
              {draft ? (
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

                  {/* Draft text */}
                  <div className="border-shine rounded-2xl">
                    <SpotCard className="p-5 border-0">
                      <div className="flex items-center gap-2 mb-4">
                        <Eye size={13} style={{ color: '#fbbf24' }} />
                        <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: '"Inter Tight", sans-serif', color: 'rgba(232,234,242,0.35)' }}>Generated Post</span>
                      </div>
                      <pre className="text-sm leading-7 whitespace-pre-wrap" style={{ fontFamily: 'inherit', color: 'var(--c-ink)' }}>{draft.draft}</pre>
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

        {calendar.length === 0 ? (
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
                      <span className="tag tag-green shrink-0">{entry.status}</span>
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
      <Cursor />
      <AmbientBg />

      {/* ── Topbar ── */}
      <header className="fixed top-0 left-0 right-0 z-50 glass" style={{ height: 64 }}>
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center relative" style={{ background: 'linear-gradient(135deg, #7c3aed, #1d4ed8)', boxShadow: '0 0 20px rgba(124,58,237,0.4)' }}>
              <Sparkles size={14} className="text-white" />
            </div>
            <div>
              <p className="font-display text-sm font-bold tracking-tight text-ink leading-none">PersonaPost</p>
              <p style={{ fontSize: 9, fontFamily: '"Inter Tight", sans-serif', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.3)' }}>AI Studio</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {NAV.map(({ id, label, dot }) => (
              <button key={id} id={`nav-${id}`} onClick={() => setPage(id)}
                className={cls('nav-item', page === id && 'active')}
                data-hover>
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-2 transition-colors" style={{ background: page === id ? dot : 'transparent', border: `1px solid ${dot}`, verticalAlign: 'middle' }} />
                {label}
              </button>
            ))}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--c-border)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: health ? '#4ade80' : 'rgba(232,234,242,0.2)', boxShadow: health ? '0 0 6px #4ade80' : 'none' }} />
              <span style={{ fontSize: 10, fontFamily: '"Inter Tight", sans-serif', letterSpacing: '0.08em', color: 'rgba(232,234,242,0.4)' }}>{apiConfig.baseUrl}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Ticker under header */}
      <div style={{ paddingTop: 64, position: 'relative', zIndex: 1 }}>
        <Ticker />
      </div>

      {/* Alerts */}
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <AnimatePresence>
          {globalError && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-4 flex items-center gap-2.5 px-4 py-2.5 rounded-xl alert-err text-sm">
              <AlertCircle size={14} /> {globalError}
            </motion.div>
          )}
          {notice && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-4 flex items-center gap-2.5 px-4 py-2.5 rounded-xl alert-ok text-sm">
              <CheckCircle2 size={14} /> {notice}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden sticky top-16 z-40 glass px-4 py-3 flex gap-2 overflow-x-auto">
        {NAV.map(({ id, label, icon: Icon, dot }) => (
          <button key={id} onClick={() => setPage(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all whitespace-nowrap"
            style={{
              background: page === id ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${page === id ? 'rgba(167,139,250,0.3)' : 'var(--c-border)'}`,
              fontSize: 11, fontFamily: '"Inter Tight", sans-serif', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: page === id ? dot : 'rgba(232,234,242,0.4)',
            }}>
            <Icon size={11} /> {label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-12 relative z-10">
        <AnimatePresence mode="wait">
          <motion.div key={page} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}>
            <ActivePage />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-8 relative z-10">
        <div className="rule mb-6" />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p style={{ fontSize: 10, fontFamily: '"Inter Tight", sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.2)' }}>
            PersonaPost AI — Internship MVP
          </p>
          <div className="flex items-center gap-6">
            {['Voice', 'RAG', 'Trends', 'Groq'].map(t => (
              <span key={t} style={{ fontSize: 10, fontFamily: '"Inter Tight", sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(232,234,242,0.18)' }}>{t}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
