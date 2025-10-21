import { ConversationPanel } from './ConversationPanel'
import { ConfigSidebar } from './ConfigSidebar'
import { SessionHeader } from './SessionHeader'
import { SupportRail } from './SupportRail'

export function RealtimeApp() {
  return (
    <div id="app" className="app-shell">
      <main className="app-main">
        <SessionHeader />
        <div className="content-grid">
          <ConversationPanel />
          <SupportRail />
        </div>
        <ConfigSidebar />
      </main>
    </div>
  )
}
