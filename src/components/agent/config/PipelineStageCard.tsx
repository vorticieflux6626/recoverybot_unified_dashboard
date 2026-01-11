import { useState, useEffect, useCallback } from 'react'
import { Loader2, Check, Info } from 'lucide-react'
import type { ModelConfig } from '@/lib/api'

interface PipelineStageCardProps {
  stageName: string
  config: ModelConfig
  isPending: boolean
  onUpdate: (field: string, value: string | number) => void
  onCommit: () => void
}

// Common Ollama models for the dropdown
const COMMON_MODELS = [
  'qwen3:8b',
  'qwen3:14b',
  'qwen3:4b',
  'ministral-3:3b',
  'gemma3:4b',
  'gemma3:12b',
  'deepseek-r1:14b',
  'deepseek-r1:8b',
  'llama3.3:70b',
  'mistral:7b',
]

export function PipelineStageCard({
  stageName,
  config,
  isPending,
  onUpdate,
  onCommit,
}: PipelineStageCardProps) {
  const [showSaved, setShowSaved] = useState(false)
  const [localTemp, setLocalTemp] = useState(config.temperature.toString())
  const [localTokens, setLocalTokens] = useState(config.max_tokens.toString())

  // Sync local state with config
  useEffect(() => {
    setLocalTemp(config.temperature.toString())
    setLocalTokens(config.max_tokens.toString())
  }, [config.temperature, config.max_tokens])

  // Show saved indicator briefly after pending clears
  useEffect(() => {
    if (!isPending && showSaved) {
      const timer = setTimeout(() => setShowSaved(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [isPending, showSaved])

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUpdate('model', e.target.value)
      // Commit immediately for model changes
      setTimeout(onCommit, 100)
      setShowSaved(true)
    },
    [onUpdate, onCommit]
  )

  const handleTempBlur = useCallback(() => {
    const value = parseFloat(localTemp)
    if (!isNaN(value) && value >= 0 && value <= 2) {
      onUpdate('temperature', value)
      setTimeout(onCommit, 100)
      setShowSaved(true)
    } else {
      setLocalTemp(config.temperature.toString())
    }
  }, [localTemp, config.temperature, onUpdate, onCommit])

  const handleTokensBlur = useCallback(() => {
    const value = parseInt(localTokens, 10)
    if (!isNaN(value) && value > 0 && value <= 32768) {
      onUpdate('max_tokens', value)
      setTimeout(onCommit, 100)
      setShowSaved(true)
    } else {
      setLocalTokens(config.max_tokens.toString())
    }
  }, [localTokens, config.max_tokens, onUpdate, onCommit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, handler: () => void) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handler()
      }
    },
    []
  )

  // Format stage name for display
  const displayName = stageName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <div className="p-3 bg-card border border-border rounded-lg hover:border-muted-foreground/30 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-sm text-foreground">{displayName}</h4>
        <div className="flex items-center gap-1">
          {isPending && (
            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
          )}
          {!isPending && showSaved && (
            <Check className="w-3 h-3 text-green-500" />
          )}
          {config.description && (
            <div className="group relative">
              <Info className="w-3 h-3 text-muted-foreground cursor-help" />
              <div className="absolute right-0 top-full mt-1 w-48 p-2 bg-popover border border-border rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 text-xs text-muted-foreground pointer-events-none">
                {config.description}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Model Selector */}
      <div className="mb-2">
        <select
          value={config.model}
          onChange={handleModelChange}
          className="w-full bg-muted text-sm rounded px-2 py-1.5 border border-transparent focus:border-primary focus:outline-none cursor-pointer"
        >
          {/* Current model if not in common list */}
          {!COMMON_MODELS.includes(config.model) && (
            <option value={config.model}>{config.model}</option>
          )}
          {COMMON_MODELS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>

      {/* Temperature & Max Tokens */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground block mb-0.5">
            Temp
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={localTemp}
            onChange={(e) => setLocalTemp(e.target.value)}
            onBlur={handleTempBlur}
            onKeyDown={(e) => handleKeyDown(e, handleTempBlur)}
            className="w-full bg-muted text-sm rounded px-2 py-1 border border-transparent focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground block mb-0.5">
            Max Tokens
          </label>
          <input
            type="number"
            min="1"
            max="32768"
            value={localTokens}
            onChange={(e) => setLocalTokens(e.target.value)}
            onBlur={handleTokensBlur}
            onKeyDown={(e) => handleKeyDown(e, handleTokensBlur)}
            className="w-full bg-muted text-sm rounded px-2 py-1 border border-transparent focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Context Window (read-only info) */}
      <div className="mt-2 text-xs text-muted-foreground">
        Context: {(config.context_window / 1024).toFixed(0)}K tokens
      </div>
    </div>
  )
}
