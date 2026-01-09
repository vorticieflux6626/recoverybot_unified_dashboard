import { cn } from '@/lib/utils'
import type { TabType } from '@/App'
import {
  LayoutDashboard,
  ScrollText,
  FileText,
  Settings,
  Cpu,
  Bot,
} from 'lucide-react'

interface SidebarProps {
  activeTab: TabType
  setActiveTab: (tab: TabType) => void
}

const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'agent', label: 'Agent Console', icon: <Bot className="w-5 h-5" /> },
  { id: 'logs', label: 'Logs', icon: <ScrollText className="w-5 h-5" /> },
  { id: 'docs', label: 'Documentation', icon: <FileText className="w-5 h-5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
]

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Cpu className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-foreground">Recovery Bot</h1>
            <p className="text-xs text-muted-foreground">System Dashboard</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  activeTab === item.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground">
          <p>Port: 3100</p>
          <p>Version: 0.1.0</p>
        </div>
      </div>
    </aside>
  )
}
