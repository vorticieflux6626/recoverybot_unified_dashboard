import { useEffect, useState } from 'react'
import { ArrowRight, Database, AlertTriangle, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ContextTransfer {
  source_agent: string
  target_agent: string
  token_count: number
  timestamp: string
}

interface SankeyNode {
  id: string
  name: string
  tokens: number
}

interface SankeyLink {
  source: string
  target: string
  value: number
}

interface ContextFlowTabProps {
  requestId: string | null
}

export function ContextFlowTab({ requestId }: ContextFlowTabProps) {
  const [transfers, setTransfers] = useState<ContextTransfer[]>([])
  const [nodes, setNodes] = useState<SankeyNode[]>([])
  const [links, setLinks] = useState<SankeyLink[]>([])
  const [totalTokens, setTotalTokens] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!requestId) {
      setTransfers([])
      setNodes([])
      setLinks([])
      setTotalTokens(0)
      return
    }

    const fetchContextFlow = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/agent/observability/${requestId}/context-flow`)
        const data = await response.json()
        if (data.success) {
          setTransfers(data.data.transfers)
          setNodes(data.data.sankey.nodes)
          setLinks(data.data.sankey.links)
          setTotalTokens(data.data.total_tokens)
        } else {
          setError(data.errors?.[0] || 'Failed to fetch context flow')
        }
      } catch (e) {
        setError('Failed to connect to server')
      } finally {
        setLoading(false)
      }
    }

    fetchContextFlow()
  }, [requestId])

  if (!requestId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Select an agent run to view context flow</p>
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

  // Find max tokens for relative sizing
  const maxTokens = Math.max(...links.map(l => l.value), 1)

  // Group transfers by agent pair
  const groupedLinks = links.reduce((acc, link) => {
    const key = `${link.source}->${link.target}`
    if (!acc[key]) {
      acc[key] = { ...link, count: 1 }
    } else {
      acc[key].value += link.value
      acc[key].count += 1
    }
    return acc
  }, {} as Record<string, SankeyLink & { count: number }>)

  return (
    <div className="p-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="text-xs text-muted-foreground">Total Transfers</div>
          <div className="text-lg font-semibold text-foreground">{transfers.length}</div>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="text-xs text-muted-foreground">Total Tokens</div>
          <div className="text-lg font-semibold text-foreground">{totalTokens.toLocaleString()}</div>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="text-xs text-muted-foreground">Unique Agents</div>
          <div className="text-lg font-semibold text-foreground">{nodes.length}</div>
        </div>
      </div>

      {transfers.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          No context transfers recorded for this run
        </div>
      ) : (
        <>
          {/* Agent Nodes */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Database className="w-4 h-4" />
              Agents (by token throughput)
            </h3>
            <div className="flex flex-wrap gap-2">
              {nodes.sort((a, b) => b.tokens - a.tokens).map((node) => (
                <div
                  key={node.id}
                  className="bg-card border border-border rounded-lg px-3 py-2 flex items-center gap-2"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: `hsl(${(nodes.indexOf(node) * 37) % 360}, 70%, 50%)`,
                    }}
                  />
                  <span className="text-sm font-medium text-foreground">{node.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {node.tokens.toLocaleString()} tokens
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Flow Diagram (simplified) */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Token Flow
            </h3>
            <div className="space-y-2">
              {Object.values(groupedLinks)
                .sort((a, b) => b.value - a.value)
                .map((link, idx) => {
                  const widthPercent = Math.max(10, (link.value / maxTokens) * 100)
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-28 text-xs text-foreground text-right truncate">
                        {link.source}
                      </div>
                      <div className="flex-1 relative h-8">
                        <div
                          className="absolute inset-y-1 left-0 bg-gradient-to-r from-cyan-500/50 to-cyan-500/20 rounded-full flex items-center justify-center transition-all"
                          style={{ width: `${widthPercent}%` }}
                        >
                          <ArrowRight className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs font-mono text-foreground bg-background/80 px-1 rounded">
                            {link.value.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="w-28 text-xs text-foreground truncate">
                        {link.target}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Transfer Timeline */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Transfer Timeline</h3>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {transfers.map((transfer, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-xs p-2 bg-muted/30 rounded"
                >
                  <span className="text-muted-foreground w-20">
                    {new Date(transfer.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-foreground">{transfer.source_agent}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="text-foreground">{transfer.target_agent}</span>
                  <span className="text-muted-foreground ml-auto">
                    {transfer.token_count.toLocaleString()} tokens
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
