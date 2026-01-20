import { useQuery } from '@tanstack/react-query'
import { fetchGPUStatus } from '@/lib/api'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useEffect } from 'react'
import { Cpu, Thermometer, Zap, HardDrive, Loader2 } from 'lucide-react'
import { formatBytes } from '@/lib/utils'

export function GPUMonitor() {
  const { gpuStatus, setGPUStatus } = useDashboardStore()

  const { data, isLoading, error } = useQuery({
    queryKey: ['gpu'],
    queryFn: fetchGPUStatus,
    refetchInterval: 3000,
  })

  useEffect(() => {
    if (data) {
      setGPUStatus(data)
    }
  }, [data, setGPUStatus])

  const displayData = data || gpuStatus

  if (isLoading && !displayData) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Cpu className="w-5 h-5" />
          GPU Monitor
        </h3>
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error && !displayData) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Cpu className="w-5 h-5" />
          GPU Monitor
        </h3>
        <p className="text-center text-muted-foreground">
          Unable to fetch GPU status
        </p>
      </div>
    )
  }

  if (!displayData) return null

  const vramPercent = (displayData.vramUsed / displayData.vramTotal) * 100

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <Cpu className="w-5 h-5" />
        {displayData.name}
      </h3>

      <div className="space-y-4">
        {/* VRAM */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <HardDrive className="w-4 h-4" />
              VRAM
            </span>
            <span className="text-foreground">
              {formatBytes(displayData.vramUsed * 1024 * 1024 * 1024)} /{' '}
              {formatBytes(displayData.vramTotal * 1024 * 1024 * 1024)}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                vramPercent > 90
                  ? 'bg-red-500'
                  : vramPercent > 75
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
              }`}
              style={{ width: `${vramPercent}%` }}
            />
          </div>
        </div>

        {/* Utilization */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <Cpu className="w-4 h-4" />
              Utilization
            </span>
            <span className="text-foreground">{displayData.utilization}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${displayData.utilization}%` }}
            />
          </div>
        </div>

        {/* Temperature & Power */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-orange-500" />
            <span className="text-sm text-foreground">
              {displayData.temperature}°C
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            <span className="text-sm text-foreground">
              {displayData.powerDraw}W
            </span>
          </div>
        </div>

        {/* Loaded Models */}
        {displayData.loadedModels.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">Loaded Models:</p>
            <div className="flex flex-wrap gap-1">
              {displayData.loadedModels.map((model, index) => {
                const modelName = typeof model === 'string' ? model : model.name
                const vramGb = typeof model === 'object' && model.vram_gb ? model.vram_gb : null
                return (
                  <span
                    key={modelName || index}
                    className="px-2 py-0.5 bg-muted text-xs rounded text-foreground"
                    title={vramGb ? `${vramGb} GB VRAM` : undefined}
                  >
                    {modelName}
                    {vramGb && <span className="text-muted-foreground ml-1">({vramGb}GB)</span>}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
