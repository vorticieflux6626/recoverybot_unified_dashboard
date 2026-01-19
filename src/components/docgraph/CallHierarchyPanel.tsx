import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchDocGraphCallers, fetchDocGraphCallees, fetchEnhancedEntity } from '@/lib/api'
import { ChevronDown, ChevronRight, ArrowUpRight, ArrowDownRight, Loader2, Code, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CallHierarchyPanelProps {
  entityId: string
  onNavigateToNode?: (nodeId: string) => void
}

type HierarchyMode = 'callers' | 'callees'

interface ExpandedNode {
  uuid: string
  name: string
  qualified_name?: string
  file_path?: string
  line_start?: number
  distance: number
  children?: ExpandedNode[]
  isLoading?: boolean
  isExpanded?: boolean
}

export function CallHierarchyPanel({ entityId, onNavigateToNode }: CallHierarchyPanelProps) {
  const [mode, setMode] = useState<HierarchyMode>('callers')
  const [expandedNodes, setExpandedNodes] = useState<Record<string, ExpandedNode[]>>({})
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set())

  // Fetch root entity details
  const { data: rootEntity } = useQuery({
    queryKey: ['docgraph-enhanced-entity', entityId],
    queryFn: () => fetchEnhancedEntity(entityId),
    enabled: !!entityId,
  })

  // Fetch initial callers/callees
  const { data: callersData, isLoading: callersLoading } = useQuery({
    queryKey: ['docgraph-callers', entityId],
    queryFn: () => fetchDocGraphCallers(entityId, 1, 100),
    enabled: mode === 'callers' && !!entityId,
  })

  const { data: calleesData, isLoading: calleesLoading } = useQuery({
    queryKey: ['docgraph-callees', entityId],
    queryFn: () => fetchDocGraphCallees(entityId, 1, 100),
    enabled: mode === 'callees' && !!entityId,
  })

  const isLoading = mode === 'callers' ? callersLoading : calleesLoading
  const items = mode === 'callers' ? callersData?.callers : calleesData?.callees

  // Load children for a node
  const loadChildren = useCallback(async (nodeId: string) => {
    if (loadingNodes.has(nodeId)) return

    setLoadingNodes(prev => new Set(prev).add(nodeId))

    try {
      let children: Array<{
        uuid: string
        name: string
        qualified_name: string
        file_path: string
        line_start: number
        distance: number
      }>

      if (mode === 'callers') {
        const data = await fetchDocGraphCallers(nodeId, 1, 50)
        children = data.callers
      } else {
        const data = await fetchDocGraphCallees(nodeId, 1, 50)
        children = data.callees
      }

      setExpandedNodes(prev => ({
        ...prev,
        [nodeId]: children.map((c) => ({
          ...c,
          distance: (prev[nodeId]?.[0]?.distance || 0) + 1,
        })),
      }))
    } catch (error) {
      console.error('Failed to load children:', error)
    } finally {
      setLoadingNodes(prev => {
        const next = new Set(prev)
        next.delete(nodeId)
        return next
      })
    }
  }, [mode, loadingNodes])

  // Toggle node expansion
  const toggleNode = useCallback((nodeId: string) => {
    if (expandedNodes[nodeId]) {
      setExpandedNodes(prev => {
        const next = { ...prev }
        delete next[nodeId]
        return next
      })
    } else {
      loadChildren(nodeId)
    }
  }, [expandedNodes, loadChildren])

  // Render a tree item
  const renderItem = useCallback((item: {
    uuid: string
    name: string
    qualified_name?: string
    file_path?: string
    line_start?: number
    distance?: number
  }, depth: number = 0) => {
    const hasChildren = expandedNodes[item.uuid]
    const isExpanded = !!hasChildren
    const isNodeLoading = loadingNodes.has(item.uuid)

    return (
      <div key={`${item.uuid}-${depth}`}>
        <div
          className={cn(
            'flex items-center gap-1 py-1.5 px-2 text-xs hover:bg-muted/50 rounded cursor-pointer',
            'group'
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {/* Expand/collapse button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleNode(item.uuid)
            }}
            className="p-0.5 hover:bg-muted rounded flex-shrink-0"
          >
            {isNodeLoading ? (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            ) : isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </button>

          {/* Direction indicator */}
          {mode === 'callers' ? (
            <ArrowUpRight className="w-3 h-3 text-blue-500 flex-shrink-0" />
          ) : (
            <ArrowDownRight className="w-3 h-3 text-green-500 flex-shrink-0" />
          )}

          {/* Name */}
          <button
            onClick={() => onNavigateToNode?.(item.uuid)}
            className="text-foreground hover:text-primary hover:underline truncate text-left flex-1 font-mono"
          >
            {item.name}
          </button>

          {/* Distance badge */}
          {item.distance !== undefined && item.distance > 0 && (
            <span className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[10px] flex-shrink-0">
              +{item.distance}
            </span>
          )}

          {/* Line number */}
          {item.line_start && (
            <span className="text-muted-foreground text-[10px] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              :{item.line_start}
            </span>
          )}
        </div>

        {/* File path on hover row */}
        {item.file_path && (
          <div
            className="text-[10px] text-muted-foreground truncate opacity-60"
            style={{ paddingLeft: `${depth * 16 + 36}px` }}
            title={item.file_path}
          >
            {item.file_path.split('/').slice(-2).join('/')}
          </div>
        )}

        {/* Children */}
        {isExpanded && hasChildren && (
          <div>
            {hasChildren.map(child => renderItem(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }, [expandedNodes, loadingNodes, mode, toggleNode, onNavigateToNode])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Call Hierarchy</h3>
          <button
            onClick={() => {
              setExpandedNodes({})
              setLoadingNodes(new Set())
            }}
            className="p-1 hover:bg-muted rounded"
            title="Collapse all"
          >
            <RefreshCw className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1">
          <button
            onClick={() => setMode('callers')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded',
              mode === 'callers'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            <ArrowUpRight className="w-3 h-3" />
            Callers
          </button>
          <button
            onClick={() => setMode('callees')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded',
              mode === 'callees'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            <ArrowDownRight className="w-3 h-3" />
            Callees
          </button>
        </div>
      </div>

      {/* Root entity */}
      {rootEntity && (
        <div className="p-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 text-xs">
            <Code className="w-4 h-4 text-blue-500" />
            <span className="font-mono font-medium truncate">{rootEntity.name}</span>
          </div>
          {rootEntity.file_path && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate pl-6">
              {rootEntity.file_path}
            </p>
          )}
        </div>
      )}

      {/* Tree view */}
      <div className="flex-1 overflow-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !items || items.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            {mode === 'callers' ? 'No callers found' : 'No callees found'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {items.map(item => renderItem(item, 0))}
          </div>
        )}
      </div>

      {/* Footer */}
      {items && items.length > 0 && (
        <div className="p-2 border-t border-border text-xs text-muted-foreground">
          {items.length} {mode === 'callers' ? 'caller' : 'callee'}{items.length !== 1 ? 's' : ''} at depth 1
        </div>
      )}
    </div>
  )
}
