import { useStore } from './useStore'
import { fmtDuration } from '../model/timeline'

export function AgentActivity() {
  const snap = useStore()
  const entries = [...snap.activity].reverse()

  return (
    <aside className="activity">
      <div className="activity-head">
        <h2>Activity</h2>
        <span className="live">live</span>
      </div>

      {entries.length === 0 ? (
        <div className="activity-empty">
          <p>Nothing yet. In your agent, try:</p>
          <ul className="prompts">
            <li>“Remove all the ums and tighten every pause over half a second.”</li>
            <li>“Cut the tangent about the four hundred dollar desk.”</li>
            <li>“What did I change by hand? Then reorder to lead with the recommendation.”</li>
          </ul>
          <p className="dim">Every tool the agent calls shows up here, and on the transcript, live.</p>
        </div>
      ) : (
        <ul className="activity-list">
          {entries.map((e) => (
            <li key={e.id} className={`entry ${e.actor}`}>
              <span className="who" aria-hidden>
                {e.actor === 'agent' ? '🤖' : '🖐'}
              </span>
              <span className="what">
                <span className="tool">{e.tool}</span>
                <span className="detail">{e.detail}</span>
              </span>
              {Math.abs(e.deltaSec) >= 0.05 && (
                <span className={`delta ${e.deltaSec < 0 ? 'down' : 'up'}`}>
                  {e.deltaSec < 0 ? '−' : '+'}
                  {fmtDuration(Math.abs(e.deltaSec))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
