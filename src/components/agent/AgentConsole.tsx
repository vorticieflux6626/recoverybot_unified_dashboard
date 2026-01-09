import { useEffect, useRef, useState, useCallback } from 'react'
import { Bot, Play, Square, Trash2, ChevronDown, ChevronRight, Clock, Zap, Brain, Search, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgentEvent {
  id: string
  timestamp: string
  eventType: string
  agent?: string
  data: Record<string, unknown>
  level: 'info' | 'success' | 'warning' | 'error'
}

interface AgentRun {
  requestId: string
  query: string
  preset: string
  startTime: string
  endTime?: string
  status: 'running' | 'completed' | 'failed'
  events: AgentEvent[]
  context?: Record<string, unknown>
  summary?: {
    duration_ms: number
    confidence: number
    agents_executed: string[]
    llm_calls: number
    tokens: { input: number; output: number }
  }
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  search_started: <Play className="w-3 h-3" />,
  analyzing_query: <Brain className="w-3 h-3" />,
  planning_search: <Brain className="w-3 h-3" />,
  searching: <Search className="w-3 h-3" />,
  scraping_url: <Search className="w-3 h-3" />,
  verifying_claims: <CheckCircle className="w-3 h-3" />,
  synthesizing: <Zap className="w-3 h-3" />,
  search_completed: <CheckCircle className="w-3 h-3" />,
  search_failed: <XCircle className="w-3 h-3" />,
  decision_made: <Brain className="w-3 h-3" />,
  context_updated: <Brain className="w-3 h-3" />,
  llm_call_start: <Zap className="w-3 h-3" />,
  llm_call_complete: <Zap className="w-3 h-3" />,
  confidence_scored: <CheckCircle className="w-3 h-3" />,
}

const EVENT_COLORS: Record<string, string> = {
  search_started: 'text-blue-400',
  analyzing_query: 'text-purple-400',
  planning_search: 'text-purple-400',
  searching: 'text-cyan-400',
  scraping_url: 'text-cyan-400',
  verifying_claims: 'text-yellow-400',
  synthesizing: 'text-orange-400',
  search_completed: 'text-green-400',
  search_failed: 'text-red-400',
  decision_made: 'text-indigo-400',
  context_updated: 'text-teal-400',
  llm_call_start: 'text-amber-400',
  llm_call_complete: 'text-amber-400',
  confidence_scored: 'text-emerald-400',
}

function EventItem({ event, expanded, onToggle }: { event: AgentEvent; expanded: boolean; onToggle: () => void }) {
  const hasData = Object.keys(event.data).length > 0
  const icon = EVENT_ICONS[event.eventType] || <Zap className="w-3 h-3" />
  const color = EVENT_COLORS[event.eventType] || 'text-gray-400'

  return (
    <div className="border-l-2 border-border pl-3 py-1 hover:bg-muted/30 transition-colors">
      <div
        className={cn("flex items-center gap-2 cursor-pointer", hasData && "cursor-pointer")}
        onClick={hasData ? onToggle : undefined}
      >
        {hasData ? (
          expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />
        ) : (
          <span className="w-3" />
        )}
        <span className={cn("shrink-0", color)}>{icon}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
        <span className={cn("text-sm font-medium", color)}>
          {event.eventType.replace(/_/g, ' ')}
        </span>
        {event.agent && (
          <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
            {event.agent}
          </span>
        )}
      </div>
      {expanded && hasData && (
        <pre className="mt-1 ml-6 p-2 bg-black/50 rounded text-xs text-gray-300 overflow-x-auto max-h-32 overflow-y-auto">
          {JSON.stringify(event.data, null, 2)}
        </pre>
      )}
    </div>
  )
}

function RunSummary({ run }: { run: AgentRun }) {
  if (!run.summary) return null

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-muted/30 rounded-lg mb-3">
      <div>
        <div className="text-xs text-muted-foreground">Duration</div>
        <div className="text-sm font-medium text-foreground">
          {(run.summary.duration_ms / 1000).toFixed(1)}s
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Confidence</div>
        <div className="text-sm font-medium text-foreground">
          {(run.summary.confidence * 100).toFixed(0)}%
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">LLM Calls</div>
        <div className="text-sm font-medium text-foreground">
          {run.summary.llm_calls}
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Tokens</div>
        <div className="text-sm font-medium text-foreground">
          {run.summary.tokens.input}↓ {run.summary.tokens.output}↑
        </div>
      </div>
    </div>
  )
}

export function AgentConsole() {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())
  const [autoScroll, setAutoScroll] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [globalEvents, setGlobalEvents] = useState<AgentEvent[]>([])
  const [testQuery, setTestQuery] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [memosStatus, setMemosStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown')
  const eventsEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const globalStreamRef = useRef<EventSource | null>(null)

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [runs, globalEvents, autoScroll])

  // Check memOS status on mount
  useEffect(() => {
    const checkMemosStatus = async () => {
      try {
        const response = await fetch('/api/health/memOS')
        const data = await response.json()
        setMemosStatus(data.status === 'healthy' ? 'connected' : 'disconnected')
      } catch {
        setMemosStatus('disconnected')
      }
    }
    checkMemosStatus()
    const interval = setInterval(checkMemosStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  // Load history from memOS on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await fetch('/api/agent/history')
        if (response.ok) {
          const history = await response.json()
          // Convert history to runs format
          const historyRuns: AgentRun[] = history.map((h: any) => ({
            requestId: h.requestId,
            query: h.query || 'Unknown query',
            preset: h.preset || 'balanced',
            startTime: h.startTime,
            endTime: h.endTime,
            status: h.status || 'completed',
            events: [],
            summary: h.confidence ? {
              duration_ms: h.duration_ms || 0,
              confidence: h.confidence,
              agents_executed: [],
              llm_calls: 0,
              tokens: { input: 0, output: 0 },
            } : undefined,
          }))
          setRuns(prev => {
            // Merge with existing runs, avoiding duplicates
            const existingIds = new Set(prev.map(r => r.requestId))
            const newRuns = historyRuns.filter((r: AgentRun) => !existingIds.has(r.requestId))
            return [...prev, ...newRuns]
          })
        }
      } catch {
        // Ignore errors
      }
    }
    loadHistory()
  }, [])

  // Toggle live mode - connect to global event stream
  const toggleLiveMode = useCallback(() => {
    if (isLiveMode) {
      // Disconnect
      if (globalStreamRef.current) {
        globalStreamRef.current.close()
        globalStreamRef.current = null
      }
      setIsLiveMode(false)
      setIsConnected(false)
    } else {
      // Connect to global stream
      const eventSource = new EventSource('/api/agent/stream/global')
      globalStreamRef.current = eventSource

      eventSource.onopen = () => {
        setIsConnected(true)
        setIsLiveMode(true)
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const agentEvent: AgentEvent = {
            id: `global-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: data.timestamp || new Date().toISOString(),
            eventType: data.type || data.event_type || 'update',
            agent: data.agent || data.request?.query?.substring(0, 30),
            data: data.request || data,
            level: 'info',
          }
          setGlobalEvents(prev => [...prev.slice(-200), agentEvent]) // Keep last 200 events
        } catch (e) {
          console.error('Failed to parse global SSE event:', e)
        }
      }

      eventSource.onerror = () => {
        setIsConnected(false)
        setIsLiveMode(false)
      }
    }
  }, [isLiveMode])

  // Connect to SSE stream
  const connectToStream = useCallback((requestId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const eventSource = new EventSource(`/api/agent/events/${requestId}`)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setIsConnected(true)
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const agentEvent: AgentEvent = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: data.timestamp || new Date().toISOString(),
          eventType: data.event_type || data.type || 'unknown',
          agent: data.agent || data.agent_name,
          data: data.data || data,
          level: data.level || 'info',
        }

        setRuns(prev => {
          const updated = [...prev]
          const runIndex = updated.findIndex(r => r.requestId === requestId)
          if (runIndex !== -1) {
            updated[runIndex] = {
              ...updated[runIndex],
              events: [...updated[runIndex].events, agentEvent],
            }

            // Check for completion
            if (agentEvent.eventType === 'search_completed' || agentEvent.eventType === 'gateway_complete') {
              updated[runIndex].status = 'completed'
              updated[runIndex].endTime = new Date().toISOString()
              if (data.summary || data.result) {
                updated[runIndex].summary = data.summary || {
                  duration_ms: data.duration_ms || 0,
                  confidence: data.confidence || 0,
                  agents_executed: data.agents_executed || [],
                  llm_calls: data.llm_calls || 0,
                  tokens: data.tokens || { input: 0, output: 0 },
                }
              }
              setIsRunning(false)
            } else if (agentEvent.eventType === 'search_failed') {
              updated[runIndex].status = 'failed'
              updated[runIndex].endTime = new Date().toISOString()
              setIsRunning(false)
            }
          }
          return updated
        })
      } catch (e) {
        console.error('Failed to parse SSE event:', e)
      }
    }

    eventSource.onerror = () => {
      setIsConnected(false)
      setIsRunning(false)
    }

    return () => {
      eventSource.close()
    }
  }, [])

  // Run a test query
  const runTestQuery = async () => {
    if (!testQuery.trim() || isRunning) return

    setIsRunning(true)
    const requestId = `test-${Date.now()}`

    // Create new run
    const newRun: AgentRun = {
      requestId,
      query: testQuery,
      preset: 'balanced',
      startTime: new Date().toISOString(),
      status: 'running',
      events: [],
    }

    setRuns(prev => [newRun, ...prev])
    setSelectedRun(requestId)

    try {
      // Start the search via the backend
      const response = await fetch('/api/agent/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: testQuery, preset: 'balanced', request_id: requestId }),
      })

      if (response.ok) {
        // Connect to SSE stream for this request
        connectToStream(requestId)
      } else {
        setRuns(prev => prev.map(r =>
          r.requestId === requestId
            ? { ...r, status: 'failed', endTime: new Date().toISOString() }
            : r
        ))
        setIsRunning(false)
      }
    } catch (e) {
      setRuns(prev => prev.map(r =>
        r.requestId === requestId
          ? { ...r, status: 'failed', endTime: new Date().toISOString() }
          : r
      ))
      setIsRunning(false)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      if (globalStreamRef.current) {
        globalStreamRef.current.close()
      }
    }
  }, [])

  const toggleEvent = (eventId: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) {
        next.delete(eventId)
      } else {
        next.add(eventId)
      }
      return next
    })
  }

  const clearRuns = () => {
    setRuns([])
    setSelectedRun(null)
    setExpandedEvents(new Set())
    setGlobalEvents([])
  }

  const currentRun = runs.find(r => r.requestId === selectedRun)

  // Show global events when in live mode and no run selected
  const displayEvents = isLiveMode && !selectedRun ? globalEvents : (currentRun?.events || [])

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Controls Header */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          {/* memOS Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg">
            <div className={cn(
              "w-2 h-2 rounded-full",
              memosStatus === 'connected' ? 'bg-green-500' :
              memosStatus === 'disconnected' ? 'bg-red-500' : 'bg-yellow-500'
            )} />
            <span className="text-xs text-muted-foreground">
              memOS: {memosStatus === 'connected' ? 'Online' : memosStatus === 'disconnected' ? 'Offline' : 'Checking...'}
            </span>
          </div>

          {/* Live Mode Toggle */}
          <button
            onClick={toggleLiveMode}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors",
              isLiveMode
                ? "bg-green-600 text-white"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {isLiveMode ? (
              <>
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                Live Feed Active
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Connect Live Feed
              </>
            )}
          </button>

          <div className="flex-1" />

          {/* Global Events Count */}
          {isLiveMode && (
            <span className="text-xs text-muted-foreground">
              {globalEvents.length} live events
            </span>
          )}
        </div>

        {/* Test Query Input */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runTestQuery()}
              placeholder="Enter a test query to run through the agent pipeline..."
              className="w-full bg-muted text-foreground px-4 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isRunning}
            />
          </div>
          <button
            onClick={runTestQuery}
            disabled={isRunning || !testQuery.trim() || memosStatus !== 'connected'}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
              isRunning || memosStatus !== 'connected'
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isRunning ? (
              <>
                <Square className="w-4 h-4" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Agent
              </>
            )}
          </button>
        </div>
        {memosStatus !== 'connected' && (
          <p className="text-xs text-yellow-500 mt-2">
            memOS server not available. Start it to run agent queries.
          </p>
        )}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Run History */}
        <div className="w-64 shrink-0 bg-card border border-border rounded-lg overflow-hidden flex flex-col">
          <div className="p-3 border-b border-border bg-muted/50 flex items-center justify-between">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Bot className="w-4 h-4" />
              Agent Runs
            </h3>
            <button
              onClick={clearRuns}
              className="p-1 hover:bg-accent rounded transition-colors"
              title="Clear all runs"
            >
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {runs.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2 text-center">
                No agent runs yet
              </p>
            ) : (
              runs.map(run => (
                <button
                  key={run.requestId}
                  onClick={() => setSelectedRun(run.requestId)}
                  className={cn(
                    "w-full text-left p-2 rounded-lg transition-colors",
                    selectedRun === run.requestId
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {run.status === 'running' && (
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    )}
                    {run.status === 'completed' && (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    )}
                    {run.status === 'failed' && (
                      <XCircle className="w-3 h-3 text-red-500" />
                    )}
                    <span className="text-sm truncate flex-1">{run.query}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs opacity-70">
                    <Clock className="w-3 h-3" />
                    {new Date(run.startTime).toLocaleTimeString()}
                    <span className="text-xs px-1 bg-muted rounded">{run.preset}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Event Stream */}
        <div className="flex-1 bg-card border border-border rounded-lg overflow-hidden flex flex-col">
          <div className="p-3 border-b border-border bg-muted/50 flex items-center justify-between">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Zap className="w-4 h-4" />
              {isLiveMode && !selectedRun ? 'Live Event Feed' : 'Event Stream'}
              <span className="text-xs font-normal text-muted-foreground">
                ({displayEvents.length} events)
              </span>
            </h3>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded"
                />
                Auto-scroll
              </label>
              {isConnected && (
                <span className="flex items-center gap-1 text-xs text-green-500">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
              )}
            </div>
          </div>

          {(currentRun || (isLiveMode && displayEvents.length > 0)) ? (
            <div className="flex-1 overflow-y-auto p-3">
              {currentRun && <RunSummary run={currentRun} />}

              <div className="space-y-1">
                {displayEvents.map(event => (
                  <EventItem
                    key={event.id}
                    event={event}
                    expanded={expandedEvents.has(event.id)}
                    onToggle={() => toggleEvent(event.id)}
                  />
                ))}
                <div ref={eventsEndRef} />
              </div>

              {currentRun?.status === 'running' && displayEvents.length === 0 && (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  <div className="text-center">
                    <Bot className="w-8 h-8 mx-auto mb-2 animate-pulse" />
                    <p className="text-sm">Waiting for events...</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{isLiveMode ? 'Waiting for live events...' : 'Select a run or start a new agent query'}</p>
                {!isLiveMode && (
                  <p className="text-xs mt-2">Click "Connect Live Feed" to monitor all agent activity</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
