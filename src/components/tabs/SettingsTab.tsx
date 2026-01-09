import { Settings, Server, Database, Cpu, HardDrive, ExternalLink } from 'lucide-react'

interface ServiceLink {
  name: string
  url: string
  port: number
  icon: React.ReactNode
  description: string
}

const serviceLinks: ServiceLink[] = [
  {
    name: 'memOS API',
    url: 'http://localhost:8001/docs',
    port: 8001,
    icon: <Server className="w-5 h-5" />,
    description: 'FastAPI documentation for memOS server',
  },
  {
    name: 'LLM Gateway',
    url: 'http://localhost:8100/docs',
    port: 8100,
    icon: <Cpu className="w-5 h-5" />,
    description: 'LLM routing and management',
  },
  {
    name: 'PDF Tools API',
    url: 'http://localhost:8002/docs',
    port: 8002,
    icon: <HardDrive className="w-5 h-5" />,
    description: 'PDF extraction and graph operations',
  },
  {
    name: 'SearXNG',
    url: 'http://localhost:8888',
    port: 8888,
    icon: <ExternalLink className="w-5 h-5" />,
    description: 'Metasearch engine',
  },
  {
    name: 'Grafana',
    url: 'http://localhost:3000',
    port: 3000,
    icon: <Database className="w-5 h-5" />,
    description: 'Metrics visualization',
  },
  {
    name: 'Milvus WebUI',
    url: 'http://localhost:9091',
    port: 9091,
    icon: <Database className="w-5 h-5" />,
    description: 'Vector database management',
  },
  {
    name: 'MinIO Console',
    url: 'http://localhost:9001',
    port: 9001,
    icon: <HardDrive className="w-5 h-5" />,
    description: 'Object storage management',
  },
  {
    name: 'Open-WebUI',
    url: 'http://localhost:8080',
    port: 8080,
    icon: <Cpu className="w-5 h-5" />,
    description: 'LLM chat interface',
  },
]

export function SettingsTab() {
  return (
    <div className="space-y-6">
      {/* Service Links */}
      <section>
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <ExternalLink className="w-5 h-5" />
          Quick Links to Services
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {serviceLinks.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-4 bg-card border border-border rounded-lg hover:border-primary transition-colors group"
            >
              <span className="text-muted-foreground group-hover:text-primary transition-colors">
                {link.icon}
              </span>
              <div>
                <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">
                  {link.name}
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Port {link.port}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {link.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Dashboard Settings */}
      <section>
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Dashboard Settings
        </h3>
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-foreground">Dark Mode</h4>
                <p className="text-sm text-muted-foreground">
                  Toggle dark/light theme
                </p>
              </div>
              <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">
                Dark
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <div>
                <h4 className="font-medium text-foreground">Health Poll Interval</h4>
                <p className="text-sm text-muted-foreground">
                  How often to check service health
                </p>
              </div>
              <select className="bg-muted text-foreground px-3 py-2 rounded border border-border">
                <option value="3">3 seconds</option>
                <option value="5" selected>5 seconds</option>
                <option value="10">10 seconds</option>
                <option value="30">30 seconds</option>
              </select>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <div>
                <h4 className="font-medium text-foreground">Log Buffer Size</h4>
                <p className="text-sm text-muted-foreground">
                  Maximum number of log entries to keep
                </p>
              </div>
              <select className="bg-muted text-foreground px-3 py-2 rounded border border-border">
                <option value="500">500</option>
                <option value="1000" selected>1000</option>
                <option value="2000">2000</option>
                <option value="5000">5000</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* System Info */}
      <section>
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Server className="w-5 h-5" />
          System Information
        </h3>
        <div className="bg-card border border-border rounded-lg p-6">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Dashboard Version</dt>
              <dd className="text-foreground font-medium">0.1.0</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Dashboard Port</dt>
              <dd className="text-foreground font-medium">3100</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Backend Port</dt>
              <dd className="text-foreground font-medium">3101</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">React Version</dt>
              <dd className="text-foreground font-medium">18.3.1</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  )
}
