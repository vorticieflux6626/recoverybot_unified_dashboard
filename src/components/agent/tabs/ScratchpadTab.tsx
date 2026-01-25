import { useEffect, useState } from 'react'
import { FileText, Plus, Edit, Trash2, Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScratchpadChange {
  id: string
  timestamp: string
  agent: string
  operation: 'add' | 'update' | 'remove'
  field: string
  value: any
  previous_value?: any
  reason?: string
}

interface ScratchpadTabProps {
  requestId: string | null
}

export function ScratchpadTab({ requestId }: ScratchpadTabProps) {
  const [changes, setChanges] = useState<ScratchpadChange[]>([])
  const [currentState, setCurrentState] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'changes' | 'current'>('changes')

  useEffect(() => {
    if (!requestId) {
      setChanges([])
      setCurrentState({})
      return
    }

    const fetchScratchpad = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/agent/observability/${requestId}/scratchpad`)
        const data = await response.json()
        if (data.success) {
          setChanges(data.data.changes)
          setCurrentState(data.data.current_state)
        } else {
          setError(data.errors?.[0] || 'Failed to fetch scratchpad')
        }
      } catch (e) {
        setError('Failed to connect to server')
      } finally {
        setLoading(false)
      }
    }

    fetchScratchpad()
  }, [requestId])

  const getOperationIcon = (op: string) => {
    switch (op) {
      case 'add': return <Plus className="w-3 h-3 text-green-400" />
      case 'update': return <Edit className="w-3 h-3 text-blue-400" />
      case 'remove': return <Trash2 className="w-3 h-3 text-red-400" />
      default: return <FileText className="w-3 h-3 text-gray-400" />
    }
  }

  const getOperationColor = (op: string) => {
    switch (op) {
      case 'add': return 'border-l-green-500'
      case 'update': return 'border-l-blue-500'
      case 'remove': return 'border-l-red-500'
      default: return 'border-l-gray-500'
    }
  }

  if (!requestId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Select an agent run to view scratchpad</p>
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
      {/* View Toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('changes')}
            className={cn(
              "text-xs px-3 py-1.5 rounded transition-colors",
              viewMode === 'changes' ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
            )}
          >
            Change History ({changes.length})
          </button>
          <button
            onClick={() => setViewMode('current')}
            className={cn(
              "text-xs px-3 py-1.5 rounded transition-colors",
              viewMode === 'current' ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
            )}
          >
            Current State ({Object.keys(currentState).length})
          </button>
        </div>
      </div>

      {viewMode === 'changes' ? (
        /* Change History View */
        changes.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No scratchpad changes recorded for this run
          </div>
        ) : (
          <div className="space-y-2">
            {changes.map((change) => (
              <div
                key={change.id}
                className={cn(
                  "bg-card border border-border rounded-lg p-3 border-l-4",
                  getOperationColor(change.operation)
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    {getOperationIcon(change.operation)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-1.5 py-0.5 bg-teal-500/20 text-teal-400 rounded">
                        {change.agent}
                      </span>
                      <span className={cn(
                        "text-xs font-medium",
                        change.operation === 'add' ? 'text-green-400' :
                        change.operation === 'update' ? 'text-blue-400' : 'text-red-400'
                      )}>
                        {change.operation.toUpperCase()}
                      </span>
                      <code className="text-xs font-mono text-foreground bg-muted px-1 rounded">
                        {change.field}
                      </code>
                    </div>

                    {change.operation !== 'remove' && (
                      <div className="mt-2">
                        <div className="text-xs text-muted-foreground mb-1">Value:</div>
                        <pre className="text-xs bg-black/50 p-2 rounded overflow-x-auto max-h-24 overflow-y-auto">
                          {typeof change.value === 'object'
                            ? JSON.stringify(change.value, null, 2)
                            : String(change.value)}
                        </pre>
                      </div>
                    )}

                    {change.operation === 'update' && change.previous_value !== undefined && (
                      <div className="mt-2">
                        <div className="text-xs text-muted-foreground mb-1">Previous:</div>
                        <pre className="text-xs bg-black/30 p-2 rounded overflow-x-auto max-h-16 overflow-y-auto text-muted-foreground">
                          {typeof change.previous_value === 'object'
                            ? JSON.stringify(change.previous_value, null, 2)
                            : String(change.previous_value)}
                        </pre>
                      </div>
                    )}

                    {change.reason && (
                      <p className="text-xs text-muted-foreground mt-2 italic">{change.reason}</p>
                    )}

                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {new Date(change.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Current State View */
        Object.keys(currentState).length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            Scratchpad is empty
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(currentState).map(([key, value]) => (
              <div key={key} className="bg-card border border-border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-teal-400" />
                  <code className="text-sm font-mono text-foreground font-medium">{key}</code>
                </div>
                <pre className="text-xs bg-black/50 p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                  {typeof value === 'object'
                    ? JSON.stringify(value, null, 2)
                    : String(value)}
                </pre>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
