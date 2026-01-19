import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d'
import { fetchSampleGraph, fetchGraphData, fetchDocGraphProjects, type GraphNode, type GraphEdge } from '@/lib/api'
import { Loader2, ZoomIn, ZoomOut, Maximize2, Code, Box, FileText, X, Info, ChevronDown, Keyboard, File } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NodeDetailPanel } from './NodeDetailPanel'

interface GraphExplorerProps {
  initialNodeId?: string
  onSelectNode?: (nodeId: string) => void
}

// Node colors by entity type
const nodeColors: Record<string, string> = {
  function: '#3b82f6', // blue
  class: '#22c55e',    // green
  document: '#f97316', // orange
  file: '#eab308',     // yellow
  directory: '#8b5cf6', // purple
  unknown: '#6b7280',  // gray
}

// Edge styles by relationship type
const edgeStyles: Record<string, { color: string; style: 'solid' | 'dashed' | 'dotted'; width: number }> = {
  CALLS: { color: '#6366f1', style: 'solid', width: 2 },       // indigo - function calls
  DOCUMENTS: { color: '#a855f7', style: 'solid', width: 2 },   // purple - documentation
  EXTENDS: { color: '#22c55e', style: 'solid', width: 3 },     // green - inheritance
  IMPLEMENTS: { color: '#3b82f6', style: 'dashed', width: 2 }, // blue dashed - interfaces
  CONTAINS: { color: '#f97316', style: 'dotted', width: 1 },   // orange dotted - file contains
  DEFINES: { color: '#eab308', style: 'dotted', width: 1 },    // yellow dotted - class defines
}

// Layout modes
type LayoutMode = 'force' | 'hierarchy' | 'radial'

// Helper to extract number from Neo4j integer format
function extractDegree(degree: any): number {
  if (typeof degree === 'number') return degree
  if (degree && typeof degree === 'object' && 'low' in degree) {
    return degree.low
  }
  return 1
}

export function GraphExplorer({ initialNodeId, onSelectNode }: GraphExplorerProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialNodeId || null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [graphMode, setGraphMode] = useState<'sample' | 'focused'>('sample')
  const [entityType, setEntityType] = useState<'function' | 'class' | 'document'>('function')
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [showProjectDropdown, setShowProjectDropdown] = useState(false)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force')
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)
  const [currentZoom, setCurrentZoom] = useState(1)
  const graphRef = useRef<ForceGraphMethods>()
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  // Resize observer for container
  useEffect(() => {
    if (!containerRef.current) return
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowProjectDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case 'Escape':
          setSelectedNodeId(null)
          setShowKeyboardHelp(false)
          break
        case 'f':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            searchInputRef.current?.focus()
          }
          break
        case '+':
        case '=':
          e.preventDefault()
          graphRef.current?.zoom((graphRef.current.zoom() || 1) * 1.3, 300)
          break
        case '-':
          e.preventDefault()
          graphRef.current?.zoom((graphRef.current.zoom() || 1) / 1.3, 300)
          break
        case '0':
          e.preventDefault()
          graphRef.current?.zoomToFit(400, 50)
          break
        case 'h':
          if (!e.ctrlKey && !e.metaKey) {
            setLayoutMode(prev => prev === 'hierarchy' ? 'force' : 'hierarchy')
          }
          break
        case '?':
          setShowKeyboardHelp(prev => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Fetch projects for filter
  const { data: projectsData } = useQuery({
    queryKey: ['docgraph-projects'],
    queryFn: fetchDocGraphProjects,
    staleTime: 300000,
  })
  const projects = projectsData?.projects || []

  // Fetch sample graph
  const { data: sampleGraph, isLoading: sampleLoading } = useQuery({
    queryKey: ['docgraph-sample', entityType, selectedProject],
    queryFn: () => fetchSampleGraph(entityType, 80, selectedProject !== 'all' ? selectedProject : undefined),
    enabled: graphMode === 'sample',
    staleTime: 120000,
  })

  // Fetch focused graph when a node is selected
  const { data: focusedGraph, isLoading: focusedLoading } = useQuery({
    queryKey: ['docgraph-graph', selectedNodeId],
    queryFn: () => fetchGraphData(selectedNodeId!, 2, 60),
    enabled: graphMode === 'focused' && !!selectedNodeId,
    staleTime: 60000,
  })

  const graphData = graphMode === 'sample' ? sampleGraph : focusedGraph
  const isLoading = graphMode === 'sample' ? sampleLoading : focusedLoading

  // Transform data for force graph with proper degree extraction
  const forceGraphData = useMemo(() => {
    if (!graphData?.nodes) {
      return { nodes: [], links: [], maxDegree: 1 }
    }

    const nodes = graphData.nodes.map(n => {
      const degree = extractDegree((n as any).degree) || 1
      return {
        ...n,
        degreeNum: degree,
      }
    })

    // Calculate max degree for scaling (ensure it's at least 1)
    const maxDegree = Math.max(...nodes.map(n => n.degreeNum), 1)

    return {
      nodes: nodes.map(n => ({
        ...n,
        // Scale val between 10 and 30 based on relative degree - ensure minimum size for clickability
        val: Math.max(10, 10 + (n.degreeNum / maxDegree) * 20),
      })),
      links: (graphData.edges || []).map(e => ({
        source: e.source,
        target: e.target,
        type: e.type,
      })),
      maxDegree,
    }
  }, [graphData])

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNodeId(node.id)
    onSelectNode?.(node.id)

    // Center on node
    if (graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 500)
      graphRef.current.zoom(2, 500)
    }
  }, [onSelectNode])

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node || null)
    if (containerRef.current) {
      containerRef.current.style.cursor = node ? 'pointer' : 'default'
    }
  }, [])

  const handleZoomIn = () => graphRef.current?.zoom((graphRef.current.zoom() || 1) * 1.5, 300)
  const handleZoomOut = () => graphRef.current?.zoom((graphRef.current.zoom() || 1) / 1.5, 300)
  const handleFitView = () => graphRef.current?.zoomToFit(400, 50)

  const handleFocusOnNode = () => {
    if (selectedNodeId) {
      setGraphMode('focused')
    }
  }

  const handleBackToSample = () => {
    setGraphMode('sample')
    setSelectedNodeId(null)
  }

  const handleNavigateToNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    onSelectNode?.(nodeId)

    // Find node in current graph and center on it
    const node = forceGraphData.nodes.find(n => n.id === nodeId)
    if (node && graphRef.current) {
      graphRef.current.centerAt((node as any).x, (node as any).y, 500)
      graphRef.current.zoom(2, 500)
    }
  }, [forceGraphData.nodes, onSelectNode])

  // Track zoom level for LOD rendering
  const handleZoomChange = useCallback((transform: { k: number }) => {
    setCurrentZoom(transform.k)
  }, [])

  // Custom node rendering with level-of-detail
  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.name || 'Unknown'
    const nodeSize = Math.sqrt(node.val || 8) * 2.5
    const isSelected = node.id === selectedNodeId
    const isHovered = node.id === hoveredNode?.id

    // Level of detail based on zoom
    const showFullDetail = globalScale > 1.5
    const showMediumDetail = globalScale > 0.5
    const showMinimalDetail = globalScale <= 0.5

    // Draw outer glow for selected/hovered
    if (isSelected || isHovered) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, nodeSize + 4, 0, 2 * Math.PI)
      ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)'
      ctx.fill()
    }

    // Draw node circle
    ctx.beginPath()
    ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI)
    const color = nodeColors[node.type as keyof typeof nodeColors] || '#6b7280'
    ctx.fillStyle = color
    ctx.fill()

    // Draw border
    ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = isSelected ? 2 : 1
    ctx.stroke()

    // Draw icon for high detail
    if (showFullDetail) {
      const iconSize = nodeSize * 0.6
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
      ctx.font = `${iconSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const icon = node.type === 'function' ? 'f'
        : node.type === 'class' ? 'C'
        : node.type === 'file' ? 'F'
        : node.type === 'directory' ? 'D'
        : '?'
      ctx.fillText(icon, node.x, node.y)
    }

    // Always draw label for larger nodes, or when zoomed in enough
    const showLabel = showMediumDetail || node.degreeNum > 10 || isSelected || isHovered
    if (showLabel && !showMinimalDetail) {
      const fontSize = Math.max(11 / globalScale, 4)
      ctx.font = `${isSelected ? 'bold ' : ''}${fontSize}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      // Truncate label based on zoom level
      const maxChars = showFullDetail ? 30 : 15
      const displayLabel = label.slice(0, maxChars) + (label.length > maxChars ? '...' : '')

      // Draw text background for readability
      const textWidth = ctx.measureText(displayLabel).width
      const padding = 2
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
      ctx.fillRect(
        node.x - textWidth / 2 - padding,
        node.y + nodeSize + 3,
        textWidth + padding * 2,
        fontSize + padding
      )

      ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.9)'
      ctx.fillText(displayLabel, node.x, node.y + nodeSize + 4)

      // Show signature preview on high detail for functions
      if (showFullDetail && node.signature && node.type === 'function') {
        const sigFontSize = fontSize * 0.7
        ctx.font = `${sigFontSize}px monospace`
        const sigPreview = node.signature.slice(0, 40) + (node.signature.length > 40 ? '...' : '')
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
        ctx.fillText(sigPreview, node.x, node.y + nodeSize + 4 + fontSize + 4)
      }
    }
  }, [selectedNodeId, hoveredNode])

  // Custom link rendering with edge type styling
  const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const start = link.source
    const end = link.target
    if (!start.x || !end.x) return

    const edgeType = link.type || 'CALLS'
    const defaultStyle = { color: '#6366f1', style: 'solid' as const, width: 2 }
    const style = edgeStyles[edgeType] || defaultStyle

    ctx.beginPath()

    // Draw based on style
    if (style.style === 'dashed') {
      ctx.setLineDash([5 / globalScale, 5 / globalScale])
    } else if (style.style === 'dotted') {
      ctx.setLineDash([2 / globalScale, 3 / globalScale])
    } else {
      ctx.setLineDash([])
    }

    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.strokeStyle = style.color
    ctx.lineWidth = Math.max(style.width, style.width / globalScale)
    ctx.globalAlpha = 0.7
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.setLineDash([])

    // Draw edge label when zoomed in
    if (globalScale > 1.5) {
      const midX = (start.x + end.x) / 2
      const midY = (start.y + end.y) / 2
      const fontSize = 8 / globalScale
      ctx.font = `${fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = style.color
      ctx.globalAlpha = 0.8
      ctx.fillText(edgeType.toLowerCase(), midX, midY)
      ctx.globalAlpha = 1
    }

    // Draw arrow
    const arrowLength = 6 / globalScale
    const angle = Math.atan2(end.y - start.y, end.x - start.x)
    const endNodeSize = Math.sqrt(end.val || 8) * 2.5

    const arrowX = end.x - Math.cos(angle) * (endNodeSize + 2)
    const arrowY = end.y - Math.sin(angle) * (endNodeSize + 2)

    ctx.beginPath()
    ctx.moveTo(arrowX, arrowY)
    ctx.lineTo(
      arrowX - arrowLength * Math.cos(angle - Math.PI / 6),
      arrowY - arrowLength * Math.sin(angle - Math.PI / 6)
    )
    ctx.lineTo(
      arrowX - arrowLength * Math.cos(angle + Math.PI / 6),
      arrowY - arrowLength * Math.sin(angle + Math.PI / 6)
    )
    ctx.closePath()
    ctx.fillStyle = style.color
    ctx.fill()
  }, [])

  // Define clickable area for nodes (larger than visual size for easier clicking/dragging)
  // This paints an invisible hit area that determines if mouse events should trigger on this node
  const nodePointerAreaPaint = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    // Use a fixed large radius for ALL nodes to ensure they're always easy to click/drag
    // The color parameter is used internally by force-graph for hit detection
    const clickableRadius = 25  // Fixed 25px radius for all nodes regardless of visual size
    ctx.beginPath()
    ctx.arc(node.x, node.y, clickableRadius, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
  }, [])

  // Generate context description
  const contextDescription = useMemo(() => {
    if (graphMode === 'focused' && selectedNodeId) {
      const node = forceGraphData.nodes.find(n => n.id === selectedNodeId)
      return `Exploring connections of "${node?.name || 'entity'}" (${node?.type || 'unknown'})`
    }
    const projectLabel = selectedProject === 'all' ? 'all indexed projects' : selectedProject
    const typeLabel = entityType === 'function' ? 'functions' : entityType === 'class' ? 'classes' : 'documents'
    return `Most connected ${typeLabel} in ${projectLabel}`
  }, [graphMode, entityType, selectedProject, selectedNodeId, forceGraphData.nodes])

  // Get unique edge types in current graph
  const edgeTypesInGraph = useMemo(() => {
    const types = new Set(forceGraphData.links.map(l => l.type))
    return Array.from(types)
  }, [forceGraphData.links])

  return (
    <div className="flex flex-col h-full">
      {/* Context Header */}
      <div className="mb-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">{contextDescription}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {graphMode === 'sample'
              ? 'Showing entities with the most connections. Click a node to see details, then "Explore connections" to see its call graph.'
              : 'Showing callers and callees up to 2 levels deep. Click nodes to explore further.'}
          </p>
        </div>
        <button
          onClick={() => setShowKeyboardHelp(prev => !prev)}
          className="p-1 hover:bg-muted rounded"
          title="Keyboard shortcuts (?)"
        >
          <Keyboard className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Keyboard help overlay */}
      {showKeyboardHelp && (
        <div className="mb-3 p-3 bg-muted/50 rounded-lg text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div><kbd className="px-1 bg-muted rounded">Esc</kbd> Deselect node</div>
            <div><kbd className="px-1 bg-muted rounded">Ctrl+F</kbd> Focus search</div>
            <div><kbd className="px-1 bg-muted rounded">+/-</kbd> Zoom in/out</div>
            <div><kbd className="px-1 bg-muted rounded">0</kbd> Fit to view</div>
            <div><kbd className="px-1 bg-muted rounded">H</kbd> Toggle hierarchy</div>
            <div><kbd className="px-1 bg-muted rounded">?</kbd> Toggle this help</div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          {/* Entity type filter for sample mode */}
          {graphMode === 'sample' && (
            <>
              <div className="flex gap-1">
                {(['function', 'class', 'document'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setEntityType(type)}
                    className={cn(
                      'flex items-center gap-1 px-3 py-1.5 text-xs rounded capitalize',
                      entityType === type
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {type === 'function' && <Code className="w-3 h-3" />}
                    {type === 'class' && <Box className="w-3 h-3" />}
                    {type === 'document' && <FileText className="w-3 h-3" />}
                    {type}s
                  </button>
                ))}
              </div>

              {/* Project filter dropdown */}
              <div ref={dropdownRef} className="relative">
                <button
                  onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-muted text-muted-foreground hover:bg-muted/80 rounded"
                >
                  {selectedProject === 'all' ? 'All Projects' : selectedProject}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showProjectDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 min-w-[160px] py-1">
                    <button
                      onClick={() => { setSelectedProject('all'); setShowProjectDropdown(false) }}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-xs hover:bg-muted',
                        selectedProject === 'all' && 'bg-muted'
                      )}
                    >
                      All Projects
                    </button>
                    {projects.map((project) => (
                      <button
                        key={project.name}
                        onClick={() => { setSelectedProject(project.name); setShowProjectDropdown(false) }}
                        className={cn(
                          'w-full text-left px-3 py-1.5 text-xs hover:bg-muted',
                          selectedProject === project.name && 'bg-muted'
                        )}
                      >
                        {project.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Back button for focused mode */}
          {graphMode === 'focused' && (
            <button
              onClick={handleBackToSample}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-muted text-muted-foreground hover:bg-muted/80 rounded"
            >
              <X className="w-3 h-3" />
              Back to Overview
            </button>
          )}

          {/* Layout mode toggle */}
          <div className="flex gap-1 ml-2">
            {(['force', 'hierarchy'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setLayoutMode(mode)}
                className={cn(
                  'px-2 py-1 text-xs rounded capitalize',
                  layoutMode === mode
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomIn}
            className="p-1.5 bg-muted hover:bg-muted/80 rounded"
            title="Zoom in (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 bg-muted hover:bg-muted/80 rounded"
            title="Zoom out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleFitView}
            className="p-1.5 bg-muted hover:bg-muted/80 rounded"
            title="Fit to view (0)"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Graph container */}
      <div className="flex-1 flex min-h-0 gap-4">
        {/* Graph canvas */}
        <div
          ref={containerRef}
          className="flex-1 bg-card border border-border rounded-lg overflow-hidden relative"
        >
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : forceGraphData.nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <p>No graph data available</p>
            </div>
          ) : (
            <ForceGraph2D
              ref={graphRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={forceGraphData}
              nodeCanvasObject={nodeCanvasObject}
              nodePointerAreaPaint={nodePointerAreaPaint}
              linkCanvasObject={linkCanvasObject}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              onNodeDrag={handleNodeHover}
              onNodeDragEnd={() => setHoveredNode(null)}
              onZoom={handleZoomChange}
              nodeLabel={() => ''}
              enableNodeDrag={true}
              enableZoomInteraction={true}
              enablePanInteraction={true}
              linkDirectionalArrowLength={0}
              linkWidth={2}
              cooldownTicks={100}
              warmupTicks={50}
              backgroundColor="transparent"
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.3}
              nodeRelSize={6}
              minZoom={0.1}
              maxZoom={10}
              dagMode={layoutMode === 'hierarchy' ? 'td' : undefined}
              dagLevelDistance={layoutMode === 'hierarchy' ? 50 : undefined}
              autoPauseRedraw={false}
            />
          )}

          {/* Hover tooltip */}
          {hoveredNode && (
            <div className="absolute bottom-4 left-4 bg-card/95 border border-border rounded-lg p-3 shadow-lg max-w-sm">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: nodeColors[hoveredNode.type] }}
                />
                <span className="font-medium text-sm">{hoveredNode.name}</span>
                <span className="text-xs text-muted-foreground uppercase">
                  {hoveredNode.type}
                </span>
              </div>
              {hoveredNode.qualified_name && (
                <p className="text-xs text-muted-foreground font-mono mb-1 break-all">
                  {hoveredNode.qualified_name}
                </p>
              )}
              {hoveredNode.file_path && (
                <p className="text-xs text-muted-foreground truncate">
                  {hoveredNode.file_path}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border">
                {(hoveredNode as any).project && (
                  <span className="text-xs text-muted-foreground">
                    Project: <span className="text-foreground">{(hoveredNode as any).project}</span>
                  </span>
                )}
                {(hoveredNode as any).degreeNum !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    Connections: <span className="text-foreground">{(hoveredNode as any).degreeNum}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-primary mt-2">Click to select</p>
            </div>
          )}

          {/* Legend */}
          <div className="absolute top-4 right-4 bg-card/90 border border-border rounded-lg p-2 text-xs">
            <div className="font-medium mb-2 text-muted-foreground">Nodes</div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Function</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span>Class</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span>Document</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              <span>File</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <span>Directory</span>
            </div>

            {/* Edge types in current graph */}
            {edgeTypesInGraph.length > 0 && (
              <>
                <div className="font-medium mt-3 mb-2 text-muted-foreground border-t border-border pt-2">Edges</div>
                {edgeTypesInGraph.map(type => {
                  const defaultStyle = { color: '#6366f1', style: 'solid' as const, width: 2 }
                  const style = edgeStyles[type] || defaultStyle
                  return (
                    <div key={type} className="flex items-center gap-2 mb-1">
                      <span
                        className="w-4 h-0.5"
                        style={{
                          backgroundColor: style.color,
                          borderStyle: style.style === 'dashed' ? 'dashed' : style.style === 'dotted' ? 'dotted' : 'solid',
                        }}
                      />
                      <span className="capitalize">{type.toLowerCase()}</span>
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* Stats */}
          {graphData && (
            <div className="absolute bottom-4 right-4 bg-card/90 border border-border rounded-lg p-2 text-xs text-muted-foreground">
              {graphData.nodeCount} nodes, {graphData.edgeCount} edges
              <span className="ml-2">zoom: {currentZoom.toFixed(1)}x</span>
            </div>
          )}
        </div>

        {/* Node details panel */}
        {selectedNodeId && (
          <NodeDetailPanel
            nodeId={selectedNodeId}
            onNavigateToNode={handleNavigateToNode}
            onExploreConnections={handleFocusOnNode}
            showExploreButton={graphMode === 'sample'}
          />
        )}
      </div>
    </div>
  )
}
