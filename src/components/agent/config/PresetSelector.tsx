import { useState } from 'react'
import { Loader2, Zap, Crown, Scale, HardDrive } from 'lucide-react'

interface PresetSelectorProps {
  presets: string[]
  currentPreset?: string
  isApplying: boolean
  onApply: (preset: string) => void
}

// Preset metadata for display
const PRESET_INFO: Record<string, { icon: React.ReactNode; description: string; color: string }> = {
  speed: {
    icon: <Zap className="w-3 h-3" />,
    description: 'Fastest response times',
    color: 'text-yellow-500',
  },
  quality: {
    icon: <Crown className="w-3 h-3" />,
    description: 'Best accuracy & reasoning',
    color: 'text-purple-500',
  },
  balanced: {
    icon: <Scale className="w-3 h-3" />,
    description: 'Production default',
    color: 'text-blue-500',
  },
  low_vram: {
    icon: <HardDrive className="w-3 h-3" />,
    description: 'Minimal GPU memory',
    color: 'text-green-500',
  },
}

export function PresetSelector({
  presets,
  currentPreset,
  isApplying,
  onApply,
}: PresetSelectorProps) {
  const [selectedPreset, setSelectedPreset] = useState(currentPreset || 'balanced')

  const handleApply = () => {
    if (selectedPreset && !isApplying) {
      onApply(selectedPreset)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground whitespace-nowrap">
        Preset:
      </label>
      <div className="relative">
        <select
          value={selectedPreset}
          onChange={(e) => setSelectedPreset(e.target.value)}
          disabled={isApplying}
          className="bg-muted text-sm rounded px-3 py-1.5 pr-8 border border-transparent focus:border-primary focus:outline-none cursor-pointer disabled:opacity-50 appearance-none min-w-[120px]"
        >
          {presets.map((preset) => {
            const info = PRESET_INFO[preset]
            return (
              <option key={preset} value={preset}>
                {preset.charAt(0).toUpperCase() + preset.slice(1).replace('_', ' ')}
              </option>
            )
          })}
        </select>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          {PRESET_INFO[selectedPreset] && (
            <span className={PRESET_INFO[selectedPreset].color}>
              {PRESET_INFO[selectedPreset].icon}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={handleApply}
        disabled={isApplying}
        className="px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
      >
        {isApplying ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            Applying...
          </>
        ) : (
          'Apply'
        )}
      </button>
      {PRESET_INFO[selectedPreset] && (
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {PRESET_INFO[selectedPreset].description}
        </span>
      )}
    </div>
  )
}
