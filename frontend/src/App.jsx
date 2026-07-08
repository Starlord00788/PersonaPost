const pipeline = [
  'Voice learning',
  'Knowledge retrieval',
  'Trend intelligence',
  'Planning',
  'Draft generation',
  'Review',
  'Calendar',
]

const mockTrends = [
  'AI agents for internal workflows',
  'RAG for practical content generation',
  'Building with free LLM APIs',
]

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Inspire AI internship project</p>
          <h1>PersonaPost AI</h1>
          <p className="lede">
            A voice-aware content operating system for interns, reviewers, and recruiters.
          </p>
        </div>

        <nav className="nav-list" aria-label="Project pipeline">
          {pipeline.map((item) => (
            <span key={item} className="nav-pill">
              {item}
            </span>
          ))}
        </nav>
      </aside>

      <main className="content-grid">
        <section className="hero-card">
          <div>
            <p className="eyebrow">MVP status</p>
            <h2>Built to look like a real team deliverable</h2>
          </div>
          <p>
            The first version keeps the scope tight: voice profiling, trend discovery, draft generation,
            review, and a content calendar. Everything is arranged so three people can own distinct modules.
          </p>
        </section>

        <section className="panel">
          <h3>Voice profile</h3>
          <div className="stamp-card">
            <strong>Conversational</strong>
            <span>Short sentences</span>
            <span>Low emoji usage</span>
            <span>Question-led CTA</span>
          </div>
        </section>

        <section className="panel">
          <h3>Trend feed</h3>
          <ul className="trend-list">
            {mockTrends.map((trend) => (
              <li key={trend}>{trend}</li>
            ))}
          </ul>
        </section>

        <section className="panel wide">
          <h3>Draft review</h3>
          <div className="draft-box">
            <p>
              AI agents are changing how teams handle routine work. The useful version is not the hype cycle;
              it is the repeatable workflow that saves time every week.
            </p>
          </div>
        </section>

        <section className="panel wide">
          <h3>Calendar</h3>
          <div className="calendar-grid">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
          </div>
        </section>
      </main>
    </div>
  )
}
