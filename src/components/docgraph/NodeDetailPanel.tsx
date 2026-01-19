import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEnhancedEntity, fetchClassHierarchy, type EnhancedDocGraphEntity, type ClassHierarchy } from '@/lib/api'
import { Code, Box, FileText, ChevronDown, ChevronRight, ExternalLink, Lock, Unlock, Zap, Play, File } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NodeDetailPanelProps {
  nodeId: string
  onNavigateToNode?: (nodeId: string) => void
  onExploreConnections?: () => void
  showExploreButton?: boolean
}

const nodeColors: Record<string, string> = {
  function: '#3b82f6',
  class: '#22c55e',
  document: '#f97316',
  file: '#eab308',
  unknown: '#6b7280',
}

export function NodeDetailPanel({
  nodeId,
  onNavigateToNode,
  onExploreConnections,
  showExploreButton = true,
}: NodeDetailPanelProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  // Fetch enhanced entity details
  const { data: entity, isLoading } = useQuery({
    queryKey: ['docgraph-enhanced-entity', nodeId],
    queryFn: () => fetchEnhancedEntity(nodeId),
    enabled: !!nodeId,
  })

  // Fetch class hierarchy if entity is a class
  const { data: classHierarchy } = useQuery({
    queryKey: ['docgraph-class-hierarchy', nodeId],
    queryFn: () => fetchClassHierarchy(nodeId),
    enabled: entity?.entity_type === 'class',
  })

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  if (isLoading) {
    return (
      <div className="w-72 bg-card border border-border rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-3" />
        <div className="h-6 bg-muted rounded w-2/3 mb-2" />
        <div className="h-3 bg-muted rounded w-full mb-4" />
        <div className="h-8 bg-muted rounded w-full" />
      </div>
    )
  }

  if (!entity) {
    return (
      <div className="w-72 bg-card border border-border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">Entity not found</p>
      </div>
    )
  }

  const TypeIcon = entity.entity_type === 'function' ? Code
    : entity.entity_type === 'class' ? Box
    : entity.entity_type === 'file' ? File
    : FileText

  return (
    <div className="w-72 bg-card border border-border rounded-lg p-4 overflow-auto max-h-full">
      {/* Entity type badge */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: nodeColors[entity.entity_type] || nodeColors.unknown }}
        />
        <TypeIcon className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {entity.entity_type}
        </span>
        {entity.visibility && entity.visibility !== 'public' && (
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            {entity.visibility === 'private' ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            {entity.visibility}
          </span>
        )}
        {entity.is_async && (
          <span className="text-xs text-amber-500 flex items-center gap-0.5">
            <Zap className="w-3 h-3" />
            async
          </span>
        )}
        {entity.is_static && (
          <span className="text-xs text-purple-500">static</span>
        )}
      </div>

      {/* Name */}
      <h3 className="font-semibold text-foreground mb-2">{entity.name}</h3>

      {/* Qualified name */}
      {entity.qualified_name && entity.qualified_name !== entity.name && (
        <p className="text-xs text-muted-foreground font-mono mb-3 break-all">
          {entity.qualified_name}
        </p>
      )}

      {/* Signature (for functions) */}
      {entity.signature && (
        <div className="mb-3 p-2 bg-muted/50 rounded font-mono text-xs overflow-x-auto">
          <code className="text-foreground whitespace-pre-wrap break-all">{entity.signature}</code>
        </div>
      )}

      {/* Return type */}
      {entity.return_type && (
        <div className="mb-3 text-xs">
          <span className="text-muted-foreground">Returns: </span>
          <code className="font-mono text-foreground">{entity.return_type}</code>
        </div>
      )}

      {/* Parent class (for methods) */}
      {entity.parent_class && (
        <div className="mb-3 text-xs">
          <span className="text-muted-foreground">Method of: </span>
          <button
            onClick={() => onNavigateToNode?.(entity.parent_class!.uuid)}
            className="text-primary hover:underline font-mono"
          >
            {entity.parent_class.name}
          </button>
        </div>
      )}

      {/* File path */}
      {entity.file_path && (
        <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
          <span className="truncate flex-1" title={entity.file_path}>
            {entity.file_path}
          </span>
          {entity.line_start && (
            <span className="text-foreground flex-shrink-0">:{entity.line_start}</span>
          )}
        </p>
      )}

      {/* Docstring */}
      {entity.docstring && (
        <div className="mb-3 p-2 bg-muted/30 rounded text-xs text-muted-foreground italic">
          {entity.docstring.slice(0, 200)}
          {entity.docstring.length > 200 && '...'}
        </div>
      )}

      {/* Arguments (for functions) */}
      {entity.arguments && entity.arguments.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => toggleSection('arguments')}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
          >
            {expandedSection === 'arguments' ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Arguments ({entity.arguments.length})
          </button>
          {expandedSection === 'arguments' && (
            <div className="mt-2 pl-4 space-y-1">
              {entity.arguments.map((arg, i) => (
                <div key={i} className="text-xs font-mono">
                  <span className="text-foreground">{arg.name}</span>
                  {arg.type && <span className="text-muted-foreground">: {arg.type}</span>}
                  {!arg.required && <span className="text-muted-foreground"> = {arg.default_value || '?'}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Class hierarchy (for classes) */}
      {classHierarchy && (
        <>
          {classHierarchy.parent && (
            <div className="mb-3">
              <span className="text-xs text-muted-foreground">Extends: </span>
              <button
                onClick={() => onNavigateToNode?.(classHierarchy.parent!.uuid)}
                className="text-xs text-primary hover:underline font-mono"
              >
                {classHierarchy.parent.name}
              </button>
            </div>
          )}

          {classHierarchy.interfaces.length > 0 && (
            <div className="mb-3">
              <span className="text-xs text-muted-foreground">Implements: </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {classHierarchy.interfaces.map((iface) => (
                  <button
                    key={iface.uuid}
                    onClick={() => onNavigateToNode?.(iface.uuid)}
                    className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono text-primary hover:bg-muted/80"
                  >
                    {iface.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {classHierarchy.children.length > 0 && (
            <div className="mb-3">
              <button
                onClick={() => toggleSection('children')}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
              >
                {expandedSection === 'children' ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Subclasses ({classHierarchy.children.length})
              </button>
              {expandedSection === 'children' && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {classHierarchy.children.map((child) => (
                    <button
                      key={child.uuid}
                      onClick={() => onNavigateToNode?.(child.uuid)}
                      className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono text-primary hover:bg-muted/80"
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {classHierarchy.methods.length > 0 && (
            <div className="mb-3">
              <button
                onClick={() => toggleSection('methods')}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
              >
                {expandedSection === 'methods' ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Methods ({classHierarchy.methods.length})
              </button>
              {expandedSection === 'methods' && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {classHierarchy.methods.map((method) => (
                    <button
                      key={method.uuid}
                      onClick={() => onNavigateToNode?.(method.uuid)}
                      className={cn(
                        'flex items-center gap-1 text-xs font-mono w-full text-left hover:bg-muted/50 rounded px-1 py-0.5',
                        'text-primary hover:underline'
                      )}
                    >
                      {method.is_async && <Zap className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                      {method.is_static && <span className="text-purple-500 text-[10px] flex-shrink-0">S</span>}
                      <span className="truncate">{method.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Explore button */}
      {showExploreButton && (
        <button
          onClick={onExploreConnections}
          className="w-full px-3 py-2 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 mb-4"
        >
          Explore connections
        </button>
      )}

      {/* Callers */}
      {entity.callers && entity.callers.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => toggleSection('callers')}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
          >
            {expandedSection === 'callers' ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Called by ({entity.callers.length})
          </button>
          {expandedSection === 'callers' && (
            <div className="mt-2 flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              {entity.callers.map((caller) => (
                <button
                  key={caller.uuid}
                  onClick={() => onNavigateToNode?.(caller.uuid)}
                  className="px-2 py-0.5 bg-muted rounded text-xs font-mono text-primary hover:bg-muted/80"
                  title={caller.qualified_name}
                >
                  {caller.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Callees */}
      {entity.callees && entity.callees.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => toggleSection('callees')}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
          >
            {expandedSection === 'callees' ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Calls ({entity.callees.length})
          </button>
          {expandedSection === 'callees' && (
            <div className="mt-2 flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              {entity.callees.map((callee) => (
                <button
                  key={callee.uuid}
                  onClick={() => onNavigateToNode?.(callee.uuid)}
                  className="px-2 py-0.5 bg-muted rounded text-xs font-mono text-primary hover:bg-muted/80"
                  title={callee.qualified_name}
                >
                  {callee.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Documentation */}
      {(entity.documents?.length > 0 || entity.documented_by?.length > 0) && (
        <div className="mb-3">
          <button
            onClick={() => toggleSection('docs')}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
          >
            {expandedSection === 'docs' ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Documentation ({(entity.documents?.length || 0) + (entity.documented_by?.length || 0)})
          </button>
          {expandedSection === 'docs' && (
            <div className="mt-2 space-y-1">
              {entity.documented_by?.map((doc) => (
                <button
                  key={doc.uuid}
                  onClick={() => onNavigateToNode?.(doc.uuid)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline w-full text-left"
                >
                  <FileText className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{doc.title}</span>
                </button>
              ))}
              {entity.documents?.map((doc) => (
                <button
                  key={doc.uuid}
                  onClick={() => onNavigateToNode?.(doc.uuid)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline w-full text-left"
                >
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{doc.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
