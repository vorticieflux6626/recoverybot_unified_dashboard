import { useEffect, useRef, useState } from 'react'
import { useDashboardStore } from '@/stores/dashboardStore'
import { createSSEConnection } from '@/lib/api'
import { Terminal, Filter, Trash2 } from 'lucide-react'

const LOG_SOURCES = ['all', 'memOS', 'gateway', 'searxng', 'pdf_tools', 'ollama']
const LOG_LEVELS = ['all', 'debug', 'info', 'warn', 'error']

export function LogsTab() {
  const { logs, addLog, clearLogs, logFilter, setLogFilter, setSSEConnected } =
    useDashboardStore()
  const logsEndRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // SSE connection for real-time logs
  useEffect(() => {
    const eventSource = createSSEConnection(
      '/logs/stream',
      (event) => {
        try {
          const log = JSON.parse(event.data)
          addLog(log)
        } catch {
          // Handle non-JSON messages
          addLog({
            timestamp: new Date().toISOString(),
            level: 'info',
            source: 'system',
            message: event.data,
          })
        }
      },
      () => {
        setSSEConnected(false)
      }
    )

    setSSEConnected(true)

    return () => {
      eventSource.close()
      setSSEConnected(false)
    }
  }, [addLog, setSSEConnected])

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (logFilter.source && logFilter.source !== 'all' && log.source !== logFilter.source) {
      return false
    }
    if (logFilter.level && logFilter.level !== 'all' && log.level !== logFilter.level) {
      return false
    }
    return true
  })

  const levelColors: Record<string, string> = {
    debug: 'text-gray-400',
    info: 'text-blue-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={logFilter.source || 'all'}
              onChange={(e) => setLogFilter({ source: e.target.value })}
              className="bg-muted text-foreground text-sm rounded px-2 py-1 border border-border"
            >
              {LOG_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source === 'all' ? 'All Sources' : source}
                </option>
              ))}
            </select>
            <select
              value={logFilter.level || 'all'}
              onChange={(e) => setLogFilter({ level: e.target.value })}
              className="bg-muted text-foreground text-sm rounded px-2 py-1 border border-border"
            >
              {LOG_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level === 'all' ? 'All Levels' : level.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
          <button
            onClick={clearLogs}
            className="flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
        </div>
      </div>

      {/* Log Viewer */}
      <div className="flex-1 bg-black rounded-lg border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {filteredLogs.length} logs
          </span>
        </div>

        <div className="h-[calc(100%-40px)] overflow-auto p-4 font-mono text-sm">
          {filteredLogs.length === 0 ? (
            <p className="text-muted-foreground">No logs to display</p>
          ) : (
            filteredLogs.map((log, index) => (
              <div key={index} className="flex gap-2 mb-1 hover:bg-white/5">
                <span className="text-muted-foreground shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`shrink-0 uppercase w-12 ${
                    levelColors[log.level] || 'text-gray-400'
                  }`}
                >
                  {log.level}
                </span>
                <span className="text-cyan-400 shrink-0">[{log.source}]</span>
                <span className="text-gray-300">{log.message}</span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  )
}
