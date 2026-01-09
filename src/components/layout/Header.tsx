import { useDashboardStore } from '@/stores/dashboardStore'
import { RefreshCw, Wifi, WifiOff } from 'lucide-react'
import type { TabType } from '@/App'

interface HeaderProps {
  activeTab: TabType
}

const tabTitles: Record<TabType, string> = {
  overview: 'System Overview',
  agent: 'Agent Console',
  logs: 'Log Viewer',
  docs: 'Documentation Browser',
  settings: 'Settings',
}

export function Header({ activeTab }: HeaderProps) {
  const { sseConnected, services } = useDashboardStore()

  const healthyCount = services.filter((s) => s.status === 'healthy').length
  const totalCount = services.length

  return (
    <header className="h-14 border-b border-border bg-card px-6 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-foreground">
        {tabTitles[activeTab]}
      </h2>

      <div className="flex items-center gap-4">
        {/* Health summary */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Services:</span>
          <span
            className={
              healthyCount === totalCount ? 'text-green-500' : 'text-yellow-500'
            }
          >
            {healthyCount}/{totalCount} healthy
          </span>
        </div>

        {/* SSE connection status */}
        <div className="flex items-center gap-2">
          {sseConnected ? (
            <>
              <Wifi className="w-4 h-4 text-green-500" />
              <span className="text-xs text-green-500">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Offline</span>
            </>
          )}
        </div>

        {/* Refresh button */}
        <button
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          onClick={() => window.location.reload()}
          title="Refresh dashboard"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </header>
  )
}
