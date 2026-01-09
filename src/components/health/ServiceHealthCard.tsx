import { cn } from '@/lib/utils'
import type { ServiceHealth } from '@/lib/api'
import { CheckCircle, XCircle, HelpCircle, Clock } from 'lucide-react'

interface ServiceHealthCardProps {
  service: ServiceHealth
}

export function ServiceHealthCard({ service }: ServiceHealthCardProps) {
  const statusConfig = {
    healthy: {
      icon: <CheckCircle className="w-5 h-5" />,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
      border: 'border-green-500/20',
    },
    unhealthy: {
      icon: <XCircle className="w-5 h-5" />,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
    },
    unknown: {
      icon: <HelpCircle className="w-5 h-5" />,
      color: 'text-muted-foreground',
      bg: 'bg-muted/50',
      border: 'border-border',
    },
  }

  const config = statusConfig[service.status]

  return (
    <div
      className={cn(
        'p-4 rounded-lg border transition-colors',
        config.bg,
        config.border
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-foreground">{service.name}</h3>
          <p className="text-sm text-muted-foreground">Port {service.port}</p>
        </div>
        <span className={config.color}>{config.icon}</span>
      </div>

      {service.latency !== undefined && (
        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{service.latency}ms</span>
        </div>
      )}

      {service.message && (
        <p className="mt-2 text-xs text-muted-foreground truncate" title={service.message}>
          {service.message}
        </p>
      )}
    </div>
  )
}
