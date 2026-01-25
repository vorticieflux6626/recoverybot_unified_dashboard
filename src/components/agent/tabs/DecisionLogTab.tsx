import { useEffect, useState } from 'react'
import { Brain, ChevronDown, ChevronRight, Clock, CheckCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Decision {
  id: string
  timestamp: string
  agent: string
  decision_type: string
  decision: string
  reasoning: string
  alternatives: { option: string; reason: string }[]
  confidence: number
  context: Record<string, unknown>
}

interface DecisionLogTabProps {
  requestId: string | null
}

export function DecisionLogTab({ requestId }: DecisionLogTabProps) {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedDecisions, setExpandedDecisions] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!requestId) {
      setDecisions([])
      return
    }

    const fetchDecisions = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/agent/observability/${requestId}/decisions`)
        const data = await response.json()
        if (data.success) {
          setDecisions(data.data.decisions)
        } else {
          setError(data.errors?.[0] || 'Failed to fetch decisions')
        }
      } catch (e) {
        setError('Failed to connect to server')
      } finally {
        setLoading(false)
      }
    }

    fetchDecisions()
  }, [requestId])

  const toggleDecision = (id: string) => {
    setExpandedDecisions(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (!requestId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Select an agent run to view decisions</p>
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
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Brain className="w-4 h-4" />
          Decision Timeline
        </h3>
        <span className="text-xs text-muted-foreground">{decisions.length} decisions</span>
      </div>

      {decisions.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          No decisions recorded for this run
        </div>
      ) : (
        <div className="space-y-2">
          {decisions.map((decision) => {
            const isExpanded = expandedDecisions.has(decision.id)
            const confidenceColor = decision.confidence >= 0.8 ? 'text-green-400' :
                                   decision.confidence >= 0.5 ? 'text-yellow-400' : 'text-red-400'

            return (
              <div
                key={decision.id}
                className="bg-card border border-border rounded-lg overflow-hidden"
              >
                <div
                  className="p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleDecision(decision.id)}
                >
                  <div className="flex items-start gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                          {decision.agent}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {decision.decision_type}
                        </span>
                        <span className={cn("text-xs font-mono", confidenceColor)}>
                          {(decision.confidence * 100).toFixed(0)}%
                        </span>
                      </div>

                      <p className="text-sm text-foreground font-medium truncate">
                        {decision.decision}
                      </p>

                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {new Date(decision.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 pt-0 border-t border-border/50">
                    {decision.reasoning && (
                      <div className="mt-3">
                        <div className="text-xs text-muted-foreground mb-1">Reasoning:</div>
                        <p className="text-sm text-foreground/80 bg-muted/30 p-2 rounded">
                          {decision.reasoning}
                        </p>
                      </div>
                    )}

                    {decision.alternatives && decision.alternatives.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs text-muted-foreground mb-1">Alternatives considered:</div>
                        <ul className="space-y-1">
                          {decision.alternatives.map((alt, idx) => (
                            <li key={idx} className="text-xs text-foreground/70 flex items-start gap-2">
                              <span className="text-muted-foreground">-</span>
                              <span><strong>{alt.option}</strong>: {alt.reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {Object.keys(decision.context).length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs text-muted-foreground mb-1">Context:</div>
                        <pre className="text-xs bg-black/50 p-2 rounded overflow-x-auto max-h-24 overflow-y-auto">
                          {JSON.stringify(decision.context, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
