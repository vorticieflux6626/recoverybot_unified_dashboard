import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchFileTree, fetchDocGraphProjects, type FileTreeResponse } from '@/lib/api'
import { Folder, FolderOpen, File, ChevronDown, ChevronRight, Loader2, Code, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileTreePanelProps {
  onSelectFile?: (path: string) => void
  selectedProject?: string
  onProjectChange?: (project: string) => void
}

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  entityCount?: number
  children: Map<string, TreeNode>
}

export function FileTreePanel({ onSelectFile, selectedProject, onProjectChange }: FileTreePanelProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  // Fetch projects
  const { data: projectsData } = useQuery({
    queryKey: ['docgraph-projects'],
    queryFn: fetchDocGraphProjects,
    staleTime: 300000,
  })
  const projects = projectsData?.projects || []

  // Fetch file tree
  const { data: fileTreeData, isLoading } = useQuery({
    queryKey: ['docgraph-files', selectedProject],
    queryFn: () => fetchFileTree(selectedProject),
    staleTime: 60000,
  })

  // Build hierarchical tree from flat file list
  const tree = useMemo(() => {
    if (!fileTreeData?.files) return null

    const root: TreeNode = {
      name: 'root',
      path: '',
      type: 'directory',
      children: new Map(),
    }

    for (const file of fileTreeData.files) {
      const parts = file.path.split('/').filter(Boolean)
      let current = root
      let currentPath = ''

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!
        currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`
        const isFile = i === parts.length - 1

        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            path: currentPath,
            type: isFile ? 'file' : 'directory',
            entityCount: isFile ? file.entityCount : undefined,
            children: new Map(),
          })
        }

        const child = current.children.get(part)
        if (!child) continue
        current = child

        // Accumulate entity counts for directories
        if (!isFile && file.entityCount) {
          current.entityCount = (current.entityCount || 0) + file.entityCount
        }
      }
    }

    return root
  }, [fileTreeData])

  // Filter tree based on search
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim() || !fileTreeData?.files) return null
    const query = searchQuery.toLowerCase()
    return fileTreeData.files
      .filter(f => f.path.toLowerCase().includes(query))
      .slice(0, 100)
  }, [searchQuery, fileTreeData])

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleFileClick = useCallback((path: string) => {
    setSelectedPath(path)
    onSelectFile?.(path)
  }, [onSelectFile])

  const handleKeyDown = useCallback((e: React.KeyboardEvent, node: TreeNode) => {
    if (e.key === 'Enter') {
      if (node.type === 'directory') {
        toggleExpand(node.path)
      } else {
        handleFileClick(node.path)
      }
    } else if (e.key === 'ArrowRight' && node.type === 'directory') {
      if (!expandedPaths.has(node.path)) {
        toggleExpand(node.path)
      }
    } else if (e.key === 'ArrowLeft' && node.type === 'directory') {
      if (expandedPaths.has(node.path)) {
        toggleExpand(node.path)
      }
    }
  }, [expandedPaths, toggleExpand, handleFileClick])

  // Render a single tree node
  const renderNode = useCallback((node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedPaths.has(node.path)
    const isSelected = selectedPath === node.path
    const hasChildren = node.children.size > 0

    // Sort children: directories first, then files, alphabetically
    const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return (
      <div key={node.path}>
        <div
          role="treeitem"
          tabIndex={0}
          aria-expanded={node.type === 'directory' ? isExpanded : undefined}
          onClick={() => {
            if (node.type === 'directory') {
              toggleExpand(node.path)
            } else {
              handleFileClick(node.path)
            }
          }}
          onKeyDown={(e) => handleKeyDown(e, node)}
          className={cn(
            'flex items-center gap-1 py-1 px-2 text-xs cursor-pointer hover:bg-muted/50 rounded',
            isSelected && 'bg-primary/10 text-primary',
            'focus:outline-none focus:ring-1 focus:ring-primary/50'
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {/* Expand/collapse icon */}
          {node.type === 'directory' ? (
            hasChildren ? (
              isExpanded ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />
            ) : (
              <span className="w-3" />
            )
          ) : (
            <span className="w-3" />
          )}

          {/* File/folder icon */}
          {node.type === 'directory' ? (
            isExpanded ? (
              <FolderOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
            )
          ) : (
            <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}

          {/* Name */}
          <span className="truncate flex-1">{node.name}</span>

          {/* Entity count badge */}
          {node.entityCount !== undefined && node.entityCount > 0 && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[10px] flex-shrink-0">
              <Code className="w-2.5 h-2.5" />
              {node.entityCount}
            </span>
          )}
        </div>

        {/* Children */}
        {node.type === 'directory' && isExpanded && (
          <div role="group">
            {sortedChildren.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }, [expandedPaths, selectedPath, toggleExpand, handleFileClick, handleKeyDown])

  return (
    <div className="flex flex-col h-full">
      {/* Header with project selector */}
      <div className="p-2 border-b border-border">
        <select
          value={selectedProject || 'all'}
          onChange={(e) => onProjectChange?.(e.target.value === 'all' ? '' : e.target.value)}
          className="w-full px-2 py-1 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">All Projects</option>
          {projects.map(p => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Tree view */}
      <div className="flex-1 overflow-auto p-2" role="tree">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredFiles ? (
          // Show filtered results
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground mb-2">
              {filteredFiles.length} matching files
            </p>
            {filteredFiles.map(file => (
              <div
                key={file.path}
                role="treeitem"
                tabIndex={0}
                onClick={() => handleFileClick(file.path)}
                onKeyDown={(e) => e.key === 'Enter' && handleFileClick(file.path)}
                className={cn(
                  'flex items-center gap-2 py-1 px-2 text-xs cursor-pointer hover:bg-muted/50 rounded',
                  selectedPath === file.path && 'bg-primary/10 text-primary',
                  'focus:outline-none focus:ring-1 focus:ring-primary/50'
                )}
              >
                <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1" title={file.path}>
                  {file.path.split('/').pop()}
                </span>
                {file.entityCount > 0 && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[10px] flex-shrink-0">
                    <Code className="w-2.5 h-2.5" />
                    {file.entityCount}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : tree ? (
          // Show tree view
          <div>
            {Array.from(tree.children.values())
              .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
                return a.name.localeCompare(b.name)
              })
              .map(child => renderNode(child, 0))}
          </div>
        ) : (
          <div className="text-center py-8 text-xs text-muted-foreground">
            No files indexed
          </div>
        )}
      </div>

      {/* Footer with stats */}
      {fileTreeData && (
        <div className="p-2 border-t border-border text-xs text-muted-foreground">
          {fileTreeData.count} files indexed
        </div>
      )}
    </div>
  )
}
