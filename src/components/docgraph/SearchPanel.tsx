import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Filter, Code, FileText, Box, Loader2, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { searchDocGraph, fetchDocGraphEntity, fetchSourceCode, type DocGraphSearchResult, type SourceCodeResponse } from '@/lib/api'
import { useDebouncedCallback } from 'use-debounce'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface SearchPanelProps {
  onSelectEntity?: (uuid: string) => void
}

type SearchMode = 'keyword' | 'semantic' | 'hybrid'
type EntityTypeFilter = 'function' | 'class' | 'document'

const entityTypeConfig: Record<EntityTypeFilter, { icon: React.ReactNode; color: string; label: string }> = {
  function: { icon: <Code className="w-4 h-4" />, color: 'text-blue-400', label: 'Functions' },
  class: { icon: <Box className="w-4 h-4" />, color: 'text-green-400', label: 'Classes' },
  document: { icon: <FileText className="w-4 h-4" />, color: 'text-orange-400', label: 'Documents' },
}

const extensionToLanguage: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  tsx: 'tsx',
  jsx: 'jsx',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',
  rs: 'rust',
  go: 'go',
  rb: 'ruby',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  md: 'markdown',
  txt: 'text',
}

export function SearchPanel({ onSelectEntity }: SearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('keyword')
  const [entityFilters, setEntityFilters] = useState<EntityTypeFilter[]>(['function', 'class', 'document'])
  const [showFilters, setShowFilters] = useState(false)
  const [selectedResult, setSelectedResult] = useState<DocGraphSearchResult | null>(null)
  const [panelWidth, setPanelWidth] = useState(400)
  const [isResizing, setIsResizing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setDebouncedQuery(value)
  }, 300)

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    debouncedSearch(value)
  }, [debouncedSearch])

  const { data: searchResults, isLoading: searchLoading, error: searchError } = useQuery({
    queryKey: ['docgraph-search', debouncedQuery, searchMode, entityFilters],
    queryFn: () => searchDocGraph({
      query: debouncedQuery,
      type: searchMode,
      limit: 50,
      entityTypes: entityFilters,
    }),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30000,
  })

  const { data: entityDetails, isLoading: entityLoading } = useQuery({
    queryKey: ['docgraph-entity', selectedResult?.uuid],
    queryFn: () => fetchDocGraphEntity(selectedResult!.uuid),
    enabled: !!selectedResult?.uuid,
  })

  const { data: sourceCode, isLoading: sourceLoading, error: sourceError } = useQuery({
    queryKey: ['docgraph-source', selectedResult?.file_path, selectedResult?.line_start, selectedResult?.line_end],
    queryFn: () => fetchSourceCode({
      path: selectedResult!.file_path,
      lineStart: selectedResult?.line_start,
      lineEnd: selectedResult?.line_end,
      context: 20,
    }),
    enabled: !!selectedResult?.file_path,
    staleTime: 60000,
    retry: (failureCount, error) => {
      // Don't retry on 404 (file not found)
      if (error instanceof Error && error.message.includes('not found')) return false
      return failureCount < 2
    },
  })

  const toggleEntityFilter = (type: EntityTypeFilter) => {
    setEntityFilters(prev => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev
        return prev.filter(t => t !== type)
      }
      return [...prev, type]
    })
  }

  const handleSelectResult = (result: DocGraphSearchResult) => {
    setSelectedResult(result)
    onSelectEntity?.(result.uuid)
  }

  // Resizable panel logic
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const newWidth = containerRect.right - e.clientX
      setPanelWidth(Math.max(250, Math.min(800, newWidth)))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  const isMarkdown = selectedResult?.file_path?.endsWith('.md')
  const language = sourceCode ? extensionToLanguage[sourceCode.extension] || 'text' : 'text'

  return (
    <div className="flex flex-col h-full" ref={containerRef}>
      {/* Search Header */}
      <div className="space-y-3 mb-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search code, classes, and documents..."
            className="w-full pl-10 pr-10 py-2 bg-background border border-border rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded',
              showFilters ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Options */}
        {showFilters && (
          <div className="flex flex-wrap gap-4 p-3 bg-muted/30 rounded-lg">
            {/* Search Mode */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Mode:</span>
              <div className="flex gap-1">
                {(['keyword', 'semantic', 'hybrid'] as SearchMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setSearchMode(mode)}
                    className={cn(
                      'px-2 py-1 text-xs rounded capitalize',
                      searchMode === mode
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Entity Type Filters */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Types:</span>
              <div className="flex gap-1">
                {(Object.keys(entityTypeConfig) as EntityTypeFilter[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => toggleEntityFilter(type)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 text-xs rounded',
                      entityFilters.includes(type)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {entityTypeConfig[type].icon}
                    {entityTypeConfig[type].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results / Details Split View */}
      <div className="flex-1 flex min-h-0">
        {/* Search Results */}
        <div className="flex-1 overflow-auto pr-2">
          {searchLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : searchError ? (
            <div className="p-4 text-sm text-red-400">
              Search failed: {(searchError as Error).message}
            </div>
          ) : !debouncedQuery ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Search className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm">Enter a search query to find code entities</p>
              <p className="text-xs mt-1">Search functions, classes, and documents</p>
            </div>
          ) : searchResults?.results.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No results found for "{debouncedQuery}"
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground px-1 mb-2">
                {searchResults?.count} results for "{debouncedQuery}"
              </div>
              {searchResults?.results.map((result) => (
                <SearchResultCard
                  key={result.uuid}
                  result={result}
                  isSelected={selectedResult?.uuid === result.uuid}
                  onClick={() => handleSelectResult(result)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Resizable Divider */}
        {selectedResult && (
          <div
            className={cn(
              'w-2 flex-shrink-0 flex items-center justify-center cursor-col-resize group',
              isResizing && 'bg-primary/20'
            )}
            onMouseDown={handleMouseDown}
          >
            <GripVertical className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />
          </div>
        )}

        {/* Entity Details Panel */}
        {selectedResult && (
          <div
            className="flex-shrink-0 bg-card border border-border rounded-lg overflow-hidden flex flex-col"
            style={{ width: panelWidth }}
          >
            {/* Panel Header */}
            <div className="p-3 border-b border-border bg-muted/50 flex items-center gap-2">
              <span className={cn('flex items-center gap-1.5', entityTypeConfig[selectedResult.entity_type]?.color)}>
                {entityTypeConfig[selectedResult.entity_type]?.icon}
                <span className="text-xs font-medium uppercase tracking-wide">
                  {selectedResult.entity_type}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                ({sourceCode?.filename || selectedResult.file_path?.split('/').pop()})
              </span>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-auto">
              {sourceLoading || entityLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : sourceError ? (
                <div className="p-4">
                  <p className="text-sm text-red-400 mb-4">
                    Could not load source: {(sourceError as Error).message}
                  </p>
                  {entityDetails && (
                    <EntityMetadata entity={entityDetails} result={selectedResult} />
                  )}
                </div>
              ) : sourceCode ? (
                <div className="flex flex-col h-full">
                  {/* Entity name and path */}
                  <div className="p-3 border-b border-border">
                    <h3 className="font-semibold text-foreground">{selectedResult.name}</h3>
                    {selectedResult.qualified_name && selectedResult.qualified_name !== selectedResult.name && (
                      <p className="text-xs text-muted-foreground font-mono mt-1 break-all">
                        {selectedResult.qualified_name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Lines {sourceCode.startLine}-{sourceCode.endLine} of {sourceCode.totalLines}
                    </p>
                  </div>

                  {/* Source content */}
                  <div className="flex-1 overflow-auto">
                    {isMarkdown ? (
                      <article className="prose prose-invert prose-sm max-w-none p-4">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {sourceCode.content}
                        </ReactMarkdown>
                      </article>
                    ) : (
                      <SyntaxHighlighter
                        language={language}
                        style={oneDark}
                        showLineNumbers
                        startingLineNumber={sourceCode.startLine}
                        wrapLines
                        lineProps={(lineNumber) => {
                          const isHighlighted =
                            lineNumber >= sourceCode.highlightStart &&
                            lineNumber <= sourceCode.highlightEnd
                          return {
                            style: {
                              backgroundColor: isHighlighted ? 'rgba(59, 130, 246, 0.15)' : undefined,
                              display: 'block',
                            },
                          }
                        }}
                        customStyle={{
                          margin: 0,
                          padding: '1rem',
                          fontSize: '0.75rem',
                          background: 'transparent',
                        }}
                      >
                        {sourceCode.content}
                      </SyntaxHighlighter>
                    )}
                  </div>

                  {/* Callers/Callees metadata */}
                  {entityDetails && (entityDetails.callers.length > 0 || entityDetails.callees.length > 0) && (
                    <div className="p-3 border-t border-border">
                      <EntityMetadata entity={entityDetails} result={selectedResult} />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface EntityMetadataProps {
  entity: {
    callers: string[]
    callees: string[]
    documents: string[]
    documented_by: string[]
  }
  result: DocGraphSearchResult
}

function EntityMetadata({ entity }: EntityMetadataProps) {
  return (
    <div className="space-y-3 text-xs">
      {entity.callers.length > 0 && (
        <div>
          <h4 className="text-muted-foreground mb-1">Called by ({entity.callers.length})</h4>
          <div className="flex flex-wrap gap-1">
            {entity.callers.slice(0, 6).map((caller, i) => (
              <span key={i} className="px-2 py-0.5 bg-muted rounded font-mono text-xs">
                {caller}
              </span>
            ))}
            {entity.callers.length > 6 && (
              <span className="px-2 py-0.5 text-muted-foreground">
                +{entity.callers.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}

      {entity.callees.length > 0 && (
        <div>
          <h4 className="text-muted-foreground mb-1">Calls ({entity.callees.length})</h4>
          <div className="flex flex-wrap gap-1">
            {entity.callees.slice(0, 6).map((callee, i) => (
              <span key={i} className="px-2 py-0.5 bg-muted rounded font-mono text-xs">
                {callee}
              </span>
            ))}
            {entity.callees.length > 6 && (
              <span className="px-2 py-0.5 text-muted-foreground">
                +{entity.callees.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface SearchResultCardProps {
  result: DocGraphSearchResult
  isSelected: boolean
  onClick: () => void
}

function SearchResultCard({ result, isSelected, onClick }: SearchResultCardProps) {
  const config = entityTypeConfig[result.entity_type]
  const fileName = result.file_path?.split('/').pop() || ''
  const dirPath = result.file_path?.split('/').slice(0, -1).join('/') || ''

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-colors',
        isSelected
          ? 'bg-primary/10 border-primary'
          : 'bg-card border-border hover:bg-muted/50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={config.color}>{config.icon}</span>
          <span className="font-medium text-foreground truncate">{result.name}</span>
        </div>
        {result.score !== undefined && (
          <span className="text-xs text-muted-foreground shrink-0">
            {Math.round(result.score * 100)}%
          </span>
        )}
      </div>

      {result.qualified_name && result.qualified_name !== result.name && (
        <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
          {result.qualified_name}
        </p>
      )}

      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
        <FileText className="w-3 h-3" />
        <span className="truncate">
          {dirPath && <span className="opacity-60">{dirPath}/</span>}
          <span>{fileName}</span>
          {result.line_start && <span className="text-primary">:{result.line_start}</span>}
        </span>
      </div>
    </button>
  )
}
