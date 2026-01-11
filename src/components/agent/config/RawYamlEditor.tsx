import { useState, useEffect, useCallback } from 'react'
import { Save, Loader2, AlertTriangle, Check } from 'lucide-react'

interface RawYamlEditorProps {
  yaml: string
  isLoading: boolean
  isSaving: boolean
  onSave: (content: string) => void
}

export function RawYamlEditor({
  yaml,
  isLoading,
  isSaving,
  onSave,
}: RawYamlEditorProps) {
  const [content, setContent] = useState(yaml)
  const [hasChanges, setHasChanges] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSaved, setShowSaved] = useState(false)

  // Sync with external yaml prop
  useEffect(() => {
    setContent(yaml)
    setHasChanges(false)
  }, [yaml])

  // Show saved indicator
  useEffect(() => {
    if (showSaved) {
      const timer = setTimeout(() => setShowSaved(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [showSaved])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value
      setContent(newContent)
      setHasChanges(newContent !== yaml)
      setError(null)
    },
    [yaml]
  )

  const handleSave = useCallback(() => {
    // Basic YAML validation - check for common issues
    if (!content.trim()) {
      setError('YAML content cannot be empty')
      return
    }

    // Check for tabs (YAML should use spaces)
    if (content.includes('\t')) {
      setError('YAML should use spaces, not tabs, for indentation')
      return
    }

    onSave(content)
    setHasChanges(false)
    setShowSaved(true)
  }, [content, onSave])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Save on Ctrl/Cmd + S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (hasChanges && !isSaving) {
          handleSave()
        }
      }
      // Insert spaces for Tab key
      if (e.key === 'Tab') {
        e.preventDefault()
        const textarea = e.target as HTMLTextAreaElement
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newContent =
          content.substring(0, start) + '  ' + content.substring(end)
        setContent(newContent)
        setHasChanges(newContent !== yaml)
        // Move cursor after the spaces
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2
        }, 0)
      }
    },
    [content, yaml, hasChanges, isSaving, handleSave]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            llm_models.yaml
          </span>
          {hasChanges && (
            <span className="text-xs text-yellow-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
              Unsaved changes
            </span>
          )}
          {showSaved && !hasChanges && (
            <span className="text-xs text-green-500 flex items-center gap-1">
              <Check className="w-3 h-3" />
              Saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Ctrl+S to save
          </span>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="px-3 py-1 bg-primary text-primary-foreground text-sm rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-3 h-3" />
                Save YAML
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-2 mb-2 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Editor */}
      <textarea
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        className="flex-1 min-h-[300px] bg-muted rounded-lg p-3 font-mono text-sm resize-none border border-transparent focus:border-primary focus:outline-none leading-relaxed"
        placeholder="Loading YAML configuration..."
      />

      {/* Footer info */}
      <div className="flex items-center justify-between mt-2 px-1 text-xs text-muted-foreground">
        <span>{content.split('\n').length} lines</span>
        <span>
          Edit with caution - invalid YAML will prevent config from loading
        </span>
      </div>
    </div>
  )
}
