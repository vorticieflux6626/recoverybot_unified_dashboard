import { useEffect, useState } from 'react'
import { Zap, Clock, ArrowUpDown, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LLMCall {
  id: string
  timestamp: string
  agent: string
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  latency_ms: number
  success: boolean
  error?: string
  purpose: string
}

interface Aggregates {
  total_latency_ms: number
  avg_latency_ms: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  success_rate: number
}

interface LLMCallsTabProps {
  requestId: string | null
}

export function LLMCallsTab({ requestId }: LLMCallsTabProps) {
  const [calls, setCalls] = useState<LLMCall[]>([])
  const [aggregates, setAggregates] = useState<Aggregates | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'timestamp' | 'latency' | 'tokens'>('timestamp')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    if (!requestId) {
      setCalls([])
      setAggregates(null)
      return
    }

    const fetchCalls = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(
          `/api/agent/observability/${requestId}/llm-calls?sort=${sortBy}&order=${sortOrder}`
        )
        const data = await response.json()
        if (data.success) {
          setCalls(data.data.calls)
          setAggregates(data.data.aggregates)
        } else {
          setError(data.errors?.[0] || 'Failed to fetch LLM calls')
        }
      } catch (e) {
        setError('Failed to connect to server')
      } finally {
        setLoading(false)
      }
    }

    fetchCalls()
  }, [requestId, sortBy, sortOrder])

  const toggleSort = (field: 'timestamp' | 'latency' | 'tokens') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  if (!requestId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Select an agent run to view LLM calls</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Aggregates Summary */}
      {aggregates && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Total Calls</div>
            <div className="text-lg font-semibold text-foreground">{calls.length}</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Avg Latency</div>
            <div className="text-lg font-semibold text-foreground">{aggregates.avg_latency_ms}ms</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Total Tokens</div>
            <div className="text-lg font-semibold text-foreground">{aggregates.total_tokens.toLocaleString()}</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Input/Output</div>
            <div className="text-sm font-semibold text-foreground">
              {aggregates.input_tokens.toLocaleString()} / {aggregates.output_tokens.toLocaleString()}
            </div>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Success Rate</div>
            <div className={cn(
              "text-lg font-semibold",
              aggregates.success_rate >= 0.9 ? "text-green-400" :
              aggregates.success_rate >= 0.7 ? "text-yellow-400" : "text-red-400"
            )}>
              {(aggregates.success_rate * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      )}

      {/* Sort Controls */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Sort by:</span>
        {(['timestamp', 'latency', 'tokens'] as const).map((field) => (
          <button
            key={field}
            onClick={() => toggleSort(field)}
            className={cn(
              "text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors",
              sortBy === field ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
            )}
          >
            {field.charAt(0).toUpperCase() + field.slice(1)}
            {sortBy === field && (
              <ArrowUpDown className="w-3 h-3" />
            )}
          </button>
        ))}
      </div>

      {/* LLM Calls List */}
      {calls.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          No LLM calls recorded for this run
        </div>
      ) : (
        <div className="space-y-2">
          {calls.map((call) => (
            <div
              key={call.id}
              className={cn(
                "bg-card border rounded-lg p-3",
                call.success ? "border-border" : "border-red-500/50"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {call.success ? (
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                      {call.agent}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground truncate">
                      {call.model}
                    </span>
                  </div>

                  {call.purpose && (
                    <p className="text-sm text-foreground/80 mb-1">{call.purpose}</p>
                  )}

                  {call.error && (
                    <p className="text-xs text-red-400 mt-1">{call.error}</p>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {call.latency_ms}ms
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {call.prompt_tokens}↓ {call.completion_tokens}↑
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(call.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
