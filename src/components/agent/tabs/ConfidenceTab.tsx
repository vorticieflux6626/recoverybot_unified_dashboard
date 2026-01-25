import { useEffect, useState } from 'react'
import { TrendingUp, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfidenceSignal {
  signal: string
  value: number
  weight: number
  description: string
}

interface ConfidenceHistoryItem {
  timestamp: string
  confidence: number
  agent: string
  reason?: string
}

interface ConfidenceTabProps {
  requestId: string | null
}

export function ConfidenceTab({ requestId }: ConfidenceTabProps) {
  const [overallConfidence, setOverallConfidence] = useState<number>(0)
  const [signals, setSignals] = useState<ConfidenceSignal[]>([])
  const [history, setHistory] = useState<ConfidenceHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!requestId) {
      setOverallConfidence(0)
      setSignals([])
      setHistory([])
      return
    }

    const fetchConfidence = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/agent/observability/${requestId}/confidence`)
        const data = await response.json()
        if (data.success) {
          setOverallConfidence(data.data.overall_confidence)
          setSignals(data.data.signals)
          setHistory(data.data.history)
        } else {
          setError(data.errors?.[0] || 'Failed to fetch confidence data')
        }
      } catch (e) {
        setError('Failed to connect to server')
      } finally {
        setLoading(false)
      }
    }

    fetchConfidence()
  }, [requestId])

  const getConfidenceColor = (value: number) => {
    if (value >= 0.8) return 'text-green-400'
    if (value >= 0.5) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getConfidenceBgColor = (value: number) => {
    if (value >= 0.8) return 'bg-green-500'
    if (value >= 0.5) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getConfidenceLabel = (value: number) => {
    if (value >= 0.8) return 'High'
    if (value >= 0.5) return 'Medium'
    return 'Low'
  }

  if (!requestId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Select an agent run to view confidence breakdown</p>
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
      {/* Overall Confidence */}
      <div className="bg-card border border-border rounded-lg p-6 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Overall Confidence</div>
            <div className={cn("text-4xl font-bold", getConfidenceColor(overallConfidence))}>
              {(overallConfidence * 100).toFixed(1)}%
            </div>
            <div className={cn("text-sm mt-1", getConfidenceColor(overallConfidence))}>
              {getConfidenceLabel(overallConfidence)} Confidence
            </div>
          </div>

          <div className="w-32 h-32">
            {/* Simple circular progress indicator */}
            <svg viewBox="0 0 100 100" className="transform -rotate-90">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted/30"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={`${overallConfidence * 251.2} 251.2`}
                strokeLinecap="round"
                className={getConfidenceColor(overallConfidence)}
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Signal Breakdown */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Signal Breakdown
        </h3>

        {signals.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">
            No confidence signals recorded
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map((signal, idx) => (
              <div key={idx} className="bg-card border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground capitalize">
                      {signal.signal.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      (weight: {signal.weight.toFixed(2)})
                    </span>
                  </div>
                  <span className={cn("text-sm font-mono font-bold", getConfidenceColor(signal.value))}>
                    {(signal.value * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full transition-all duration-300", getConfidenceBgColor(signal.value))}
                    style={{ width: `${signal.value * 100}%` }}
                  />
                </div>

                {signal.description && (
                  <p className="text-xs text-muted-foreground mt-2">{signal.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confidence History */}
      {history.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Confidence Evolution
          </h3>

          <div className="space-y-2">
            {history.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 p-2 bg-muted/30 rounded">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                  {item.agent && (
                    <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
                      {item.agent}
                    </span>
                  )}
                  {item.reason && (
                    <span className="text-xs text-muted-foreground truncate">{item.reason}</span>
                  )}
                </div>
                <span className={cn("text-sm font-mono font-bold", getConfidenceColor(item.confidence))}>
                  {(item.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
