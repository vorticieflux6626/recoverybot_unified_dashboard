import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchDocTree, fetchDocContent, type DocFile } from '@/lib/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, Folder, FolderOpen, ChevronRight, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DocTreeItemProps {
  item: DocFile
  level: number
  selectedPath: string | null
  onSelect: (path: string) => void
}

function DocTreeItem({ item, level, selectedPath, onSelect }: DocTreeItemProps) {
  const [isOpen, setIsOpen] = useState(level < 2)

  if (item.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'flex items-center gap-1 w-full px-2 py-1 text-sm hover:bg-accent rounded text-left',
            'text-muted-foreground hover:text-foreground'
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          {isOpen ? (
            <ChevronDown className="w-4 h-4 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0" />
          )}
          {isOpen ? (
            <FolderOpen className="w-4 h-4 shrink-0 text-yellow-500" />
          ) : (
            <Folder className="w-4 h-4 shrink-0 text-yellow-500" />
          )}
          <span className="truncate">{item.name}</span>
        </button>
        {isOpen && item.children && (
          <div>
            {item.children.map((child) => (
              <DocTreeItem
                key={child.path}
                item={child}
                level={level + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelect(item.path)}
      className={cn(
        'flex items-center gap-2 w-full px-2 py-1 text-sm rounded text-left',
        selectedPath === item.path
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
      style={{ paddingLeft: `${level * 12 + 8}px` }}
    >
      <FileText className="w-4 h-4 shrink-0" />
      <span className="truncate">{item.name}</span>
    </button>
  )
}

export function DocsTab() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const { data: docTree, isLoading: treeLoading } = useQuery({
    queryKey: ['docTree'],
    queryFn: fetchDocTree,
  })

  const { data: docContent, isLoading: contentLoading } = useQuery({
    queryKey: ['docContent', selectedPath],
    queryFn: () => (selectedPath ? fetchDocContent(selectedPath) : Promise.resolve('')),
    enabled: !!selectedPath,
  })

  return (
    <div className="flex h-full gap-4">
      {/* Sidebar - Document Tree */}
      <div className="w-72 shrink-0 bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/50">
          <h3 className="font-semibold text-foreground text-sm">Documentation</h3>
        </div>
        <div className="p-2 overflow-auto h-[calc(100%-48px)]">
          {treeLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : docTree ? (
            docTree.map((item) => (
              <DocTreeItem
                key={item.path}
                item={item}
                level={0}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground p-2">
              No documentation available
            </p>
          )}
        </div>
      </div>

      {/* Content Viewer */}
      <div className="flex-1 bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/50">
          <h3 className="font-semibold text-foreground text-sm truncate">
            {selectedPath || 'Select a document'}
          </h3>
        </div>
        <div className="p-6 overflow-auto h-[calc(100%-48px)]">
          {contentLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : docContent ? (
            <article className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{docContent}</ReactMarkdown>
            </article>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select a document from the sidebar to view</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
