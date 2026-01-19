import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchClassHierarchy, type ClassHierarchy, type ClassHierarchyMethod } from '@/lib/api'
import { Box, ChevronDown, ChevronRight, Loader2, ArrowUp, ArrowDown, Zap, Lock, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClassHierarchyPanelProps {
  classId: string
  onNavigateToNode?: (nodeId: string) => void
}

export function ClassHierarchyPanel({ classId, onNavigateToNode }: ClassHierarchyPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['parent', 'interfaces', 'children', 'methods'])
  )
  const [methodFilter, setMethodFilter] = useState<'all' | 'public' | 'private'>('all')

  // Fetch class hierarchy
  const { data: hierarchy, isLoading, error } = useQuery({
    queryKey: ['docgraph-class-hierarchy', classId],
    queryFn: () => fetchClassHierarchy(classId),
    enabled: !!classId,
  })

  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }, [])

  // Filter methods
  const filteredMethods = hierarchy?.methods.filter(m => {
    if (methodFilter === 'all') return true
    if (methodFilter === 'public') return m.visibility === 'public' || !m.visibility
    if (methodFilter === 'private') return m.visibility === 'private' || m.visibility === 'protected'
    return true
  }) || []

  // Sort methods: constructors first, then by name
  const sortedMethods = [...filteredMethods].sort((a, b) => {
    const aIsConstructor = a.name === '__init__' || a.name === 'constructor' || a.name === hierarchy?.class.name
    const bIsConstructor = b.name === '__init__' || b.name === 'constructor' || b.name === hierarchy?.class.name
    if (aIsConstructor && !bIsConstructor) return -1
    if (!aIsConstructor && bIsConstructor) return 1
    return a.name.localeCompare(b.name)
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !hierarchy) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        {error ? 'Failed to load class hierarchy' : 'Select a class to view hierarchy'}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Box className="w-5 h-5 text-green-500" />
          <div>
            <h3 className="text-sm font-medium">{hierarchy.class.name}</h3>
            {hierarchy.class.qualified_name && hierarchy.class.qualified_name !== hierarchy.class.name && (
              <p className="text-[10px] text-muted-foreground font-mono truncate">
                {hierarchy.class.qualified_name}
              </p>
            )}
          </div>
        </div>
        {hierarchy.class.file_path && (
          <p className="text-[10px] text-muted-foreground mt-1 truncate">
            {hierarchy.class.file_path}
            {hierarchy.class.line_start && `:${hierarchy.class.line_start}`}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {/* Parent class */}
        {hierarchy.parent && (
          <div className="border-b border-border">
            <button
              onClick={() => toggleSection('parent')}
              className="flex items-center gap-2 w-full p-2 text-xs hover:bg-muted/50"
            >
              {expandedSections.has('parent') ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              )}
              <ArrowUp className="w-3 h-3 text-blue-500" />
              <span className="text-muted-foreground">Extends</span>
            </button>
            {expandedSections.has('parent') && (
              <div className="pb-2 px-4">
                <button
                  onClick={() => onNavigateToNode?.(hierarchy.parent!.uuid)}
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded hover:bg-muted w-full text-left"
                >
                  <Box className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-medium truncate">{hierarchy.parent.name}</p>
                    {hierarchy.parent.qualified_name && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {hierarchy.parent.qualified_name}
                      </p>
                    )}
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Interfaces */}
        {hierarchy.interfaces.length > 0 && (
          <div className="border-b border-border">
            <button
              onClick={() => toggleSection('interfaces')}
              className="flex items-center gap-2 w-full p-2 text-xs hover:bg-muted/50"
            >
              {expandedSections.has('interfaces') ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              )}
              <GitBranch className="w-3 h-3 text-purple-500" />
              <span className="text-muted-foreground">Implements ({hierarchy.interfaces.length})</span>
            </button>
            {expandedSections.has('interfaces') && (
              <div className="pb-2 px-4 space-y-1">
                {hierarchy.interfaces.map(iface => (
                  <button
                    key={iface.uuid}
                    onClick={() => onNavigateToNode?.(iface.uuid)}
                    className="flex items-center gap-2 p-1.5 hover:bg-muted rounded w-full text-left"
                  >
                    <Box className="w-3 h-3 text-purple-500 flex-shrink-0" />
                    <span className="text-xs font-mono truncate">{iface.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Child classes */}
        {hierarchy.children.length > 0 && (
          <div className="border-b border-border">
            <button
              onClick={() => toggleSection('children')}
              className="flex items-center gap-2 w-full p-2 text-xs hover:bg-muted/50"
            >
              {expandedSections.has('children') ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              )}
              <ArrowDown className="w-3 h-3 text-amber-500" />
              <span className="text-muted-foreground">Subclasses ({hierarchy.children.length})</span>
            </button>
            {expandedSections.has('children') && (
              <div className="pb-2 px-4 space-y-1 max-h-40 overflow-y-auto">
                {hierarchy.children.map(child => (
                  <button
                    key={child.uuid}
                    onClick={() => onNavigateToNode?.(child.uuid)}
                    className="flex items-center gap-2 p-1.5 hover:bg-muted rounded w-full text-left"
                  >
                    <Box className="w-3 h-3 text-green-500 flex-shrink-0" />
                    <span className="text-xs font-mono truncate">{child.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Methods */}
        <div>
          <button
            onClick={() => toggleSection('methods')}
            className="flex items-center gap-2 w-full p-2 text-xs hover:bg-muted/50"
          >
            {expandedSections.has('methods') ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
            <span className="text-muted-foreground">Methods ({hierarchy.methods.length})</span>
          </button>
          {expandedSections.has('methods') && (
            <div className="pb-2">
              {/* Method filter */}
              <div className="flex gap-1 px-4 mb-2">
                {(['all', 'public', 'private'] as const).map(filter => (
                  <button
                    key={filter}
                    onClick={() => setMethodFilter(filter)}
                    className={cn(
                      'px-2 py-0.5 text-[10px] rounded capitalize',
                      methodFilter === filter
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Method list */}
              <div className="px-4 space-y-0.5 max-h-60 overflow-y-auto">
                {sortedMethods.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No methods found</p>
                ) : (
                  sortedMethods.map(method => (
                    <MethodItem
                      key={method.uuid}
                      method={method}
                      onClick={() => onNavigateToNode?.(method.uuid)}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Docstring */}
      {hierarchy.class.docstring && (
        <div className="p-3 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground italic line-clamp-3">
            {hierarchy.class.docstring}
          </p>
        </div>
      )}
    </div>
  )
}

// Method item component
function MethodItem({
  method,
  onClick,
}: {
  method: ClassHierarchyMethod
  onClick: () => void
}) {
  const isConstructor = method.name === '__init__' || method.name === 'constructor'

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 p-1.5 hover:bg-muted rounded w-full text-left',
        'group'
      )}
    >
      {/* Visibility indicator */}
      {method.visibility === 'private' || method.visibility === 'protected' ? (
        <Lock className="w-3 h-3 text-amber-500 flex-shrink-0" />
      ) : (
        <span className="w-3 h-3 flex-shrink-0" />
      )}

      {/* Static indicator */}
      {method.is_static && (
        <span className="text-[10px] text-purple-500 flex-shrink-0">S</span>
      )}

      {/* Async indicator */}
      {method.is_async && (
        <Zap className="w-3 h-3 text-amber-500 flex-shrink-0" />
      )}

      {/* Name */}
      <span
        className={cn(
          'text-xs font-mono truncate',
          isConstructor ? 'text-amber-600 font-medium' : 'text-foreground'
        )}
      >
        {method.name}
      </span>

      {/* Signature preview */}
      {method.signature && (
        <span className="text-[10px] text-muted-foreground truncate opacity-0 group-hover:opacity-100 transition-opacity">
          {method.signature.slice(0, 30)}
          {method.signature.length > 30 && '...'}
        </span>
      )}

      {/* Line number */}
      {method.line_start && (
        <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
          :{method.line_start}
        </span>
      )}
    </button>
  )
}
