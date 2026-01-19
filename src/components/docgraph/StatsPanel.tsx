import { useQuery } from '@tanstack/react-query'
import { fetchDocGraphStats, fetchDocGraphHealth, type DocGraphStats } from '@/lib/api'
import { Code, Box, FileText, File, FolderGit2, Loader2, CheckCircle2, XCircle, RefreshCw, Database, Server, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatsPanelProps {
  className?: string
}

const entityTypeConfig = {
  functions: { icon: <Code className="w-5 h-5" />, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  classes: { icon: <Box className="w-5 h-5" />, color: 'text-green-400', bg: 'bg-green-400/10' },
  documents: { icon: <FileText className="w-5 h-5" />, color: 'text-orange-400', bg: 'bg-orange-400/10' },
  files: { icon: <File className="w-5 h-5" />, color: 'text-purple-400', bg: 'bg-purple-400/10' },
  projects: { icon: <FolderGit2 className="w-5 h-5" />, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
}

export function StatsPanel({ className }: StatsPanelProps) {
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['docgraph-stats'],
    queryFn: fetchDocGraphStats,
    staleTime: 60000,
    refetchInterval: 300000,
  })

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['docgraph-health'],
    queryFn: fetchDocGraphHealth,
    staleTime: 30000,
    refetchInterval: 30000,
  })

  if (statsLoading) {
    return (
      <div className={cn('flex items-center justify-center h-64', className)}>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (statsError) {
    return (
      <div className={cn('p-4', className)}>
        <div className="flex items-center gap-2 text-red-400 mb-2">
          <XCircle className="w-5 h-5" />
          <span className="font-medium">Failed to load statistics</span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {(statsError as Error).message}
        </p>
        <button
          onClick={() => refetchStats()}
          className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-muted/80 rounded text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Entity Counts */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Indexed Entities</h3>
        <div className="grid grid-cols-5 gap-3">
          {stats && (Object.entries(stats.entities) as [keyof typeof entityTypeConfig, number][]).map(([key, value]) => {
            const config = entityTypeConfig[key]
            return (
              <div key={key} className={cn('p-4 rounded-lg', config.bg)}>
                <div className={cn('flex items-center gap-2 mb-2', config.color)}>
                  {config.icon}
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {value.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground capitalize">
                  {key}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Service Health */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Service Health</h3>
        <div className="grid grid-cols-3 gap-3">
          <ServiceHealthCard
            name="Neo4j"
            icon={<Database className="w-5 h-5" />}
            status={stats?.services.neo4j || 'down'}
            latency={health?.services.neo4j.latency}
            loading={healthLoading}
          />
          <ServiceHealthCard
            name="Milvus"
            icon={<Server className="w-5 h-5" />}
            status={stats?.services.milvus || 'down'}
            latency={health?.services.milvus.latency}
            loading={healthLoading}
          />
          <ServiceHealthCard
            name="Gateway"
            icon={<Zap className="w-5 h-5" />}
            status={stats?.services.gateway || 'down'}
            latency={health?.services.gateway.latency}
            loading={healthLoading}
          />
        </div>
      </div>

      {/* Per-Project Breakdown */}
      {stats?.projects && stats.projects.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Projects</h3>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-3 font-medium">Project</th>
                  <th className="text-right p-3 font-medium">Functions</th>
                  <th className="text-right p-3 font-medium">Classes</th>
                  <th className="text-right p-3 font-medium">Documents</th>
                  <th className="text-right p-3 font-medium">Files</th>
                </tr>
              </thead>
              <tbody>
                {stats.projects.map((project) => (
                  <tr key={project.name} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <FolderGit2 className="w-4 h-4 text-cyan-400" />
                        {project.name}
                      </div>
                    </td>
                    <td className="p-3 text-right text-muted-foreground">
                      {project.functions.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">
                      {project.classes.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">
                      {project.documents.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">
                      {project.files.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Last Updated */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {stats?.lastIndexed
            ? `Last indexed: ${new Date(stats.lastIndexed).toLocaleString()}`
            : 'Index time unknown'}
        </span>
        <button
          onClick={() => refetchStats()}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>
    </div>
  )
}

interface ServiceHealthCardProps {
  name: string
  icon: React.ReactNode
  status: 'up' | 'down'
  latency?: number
  loading?: boolean
}

function ServiceHealthCard({ name, icon, status, latency, loading }: ServiceHealthCardProps) {
  const isUp = status === 'up'

  return (
    <div className={cn(
      'p-4 rounded-lg border',
      isUp ? 'bg-green-400/5 border-green-400/30' : 'bg-red-400/5 border-red-400/30'
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className={cn('flex items-center gap-2', isUp ? 'text-green-400' : 'text-red-400')}>
          {icon}
          <span className="font-medium text-foreground">{name}</span>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : isUp ? (
          <CheckCircle2 className="w-5 h-5 text-green-400" />
        ) : (
          <XCircle className="w-5 h-5 text-red-400" />
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={isUp ? 'text-green-400' : 'text-red-400'}>
          {isUp ? 'Online' : 'Offline'}
        </span>
        {latency !== undefined && isUp && (
          <span className="text-muted-foreground">{latency}ms</span>
        )}
      </div>
    </div>
  )
}
