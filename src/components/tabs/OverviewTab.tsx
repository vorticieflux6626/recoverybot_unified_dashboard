import { SystemHealthGrid } from '@/components/health/SystemHealthGrid'
import { GPUMonitor } from '@/components/gpu/GPUMonitor'
import { ProcessList } from '@/components/processes/ProcessList'

export function OverviewTab() {
  return (
    <div className="space-y-6">
      {/* Health Grid */}
      <section>
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Service Health
        </h3>
        <SystemHealthGrid />
      </section>

      {/* GPU and Processes Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GPUMonitor />
        <ProcessList />
      </div>
    </div>
  )
}
