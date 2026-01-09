import { useQuery } from '@tanstack/react-query'
import { fetchProcesses } from '@/lib/api'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useEffect } from 'react'
import { Activity, Container, Loader2 } from 'lucide-react'
import { formatUptime } from '@/lib/utils'

export function ProcessList() {
  const { processes, setProcesses } = useDashboardStore()

  const { data, isLoading, error } = useQuery({
    queryKey: ['processes'],
    queryFn: fetchProcesses,
    refetchInterval: 10000,
  })

  useEffect(() => {
    if (data) {
      setProcesses(data)
    }
  }, [data, setProcesses])

  const displayData = data || processes

  if (isLoading && displayData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Process Monitor
        </h3>
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error && displayData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Process Monitor
        </h3>
        <p className="text-center text-muted-foreground">
          Unable to fetch process list
        </p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 flex flex-col h-full">
      <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2 shrink-0">
        <Activity className="w-5 h-5" />
        Process Monitor
        <span className="text-xs text-muted-foreground font-normal">
          ({displayData.length} processes)
        </span>
      </h3>

      <div className="space-y-2 overflow-y-auto max-h-64 pr-2">
        {displayData.map((process) => (
          <div
            key={process.pid}
            className="flex items-center justify-between p-2 rounded bg-muted/50"
          >
            <div className="flex items-center gap-2">
              {process.type === 'docker' ? (
                <Container className="w-4 h-4 text-blue-500" />
              ) : (
                <Activity className="w-4 h-4 text-green-500" />
              )}
              <span className="text-sm text-foreground">{process.name}</span>
              <span className="text-xs text-muted-foreground">
                PID: {process.pid}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>CPU: {process.cpu.toFixed(1)}%</span>
              <span>MEM: {process.memory.toFixed(1)}%</span>
              <span>{process.uptime}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
