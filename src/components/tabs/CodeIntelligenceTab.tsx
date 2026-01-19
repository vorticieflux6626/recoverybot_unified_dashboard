import { useState } from 'react'
import { Search, BarChart3, FileText, Network } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SearchPanel, StatsPanel, GraphExplorer } from '@/components/docgraph'
import { DocsTab } from './DocsTab'

type SubTab = 'search' | 'browse' | 'stats' | 'graph'

const subTabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'search', label: 'Search', icon: <Search className="w-4 h-4" /> },
  { id: 'browse', label: 'Browse', icon: <FileText className="w-4 h-4" /> },
  { id: 'stats', label: 'Stats', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'graph', label: 'Graph', icon: <Network className="w-4 h-4" /> },
]

export function CodeIntelligenceTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('search')

  const renderSubTabContent = () => {
    switch (activeSubTab) {
      case 'search':
        return <SearchPanel />
      case 'browse':
        return <DocsTab />
      case 'stats':
        return <StatsPanel />
      case 'graph':
        return <GraphExplorer />
      default:
        return <SearchPanel />
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab Navigation */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit mb-4">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors',
              activeSubTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab Content */}
      <div className="flex-1 min-h-0">
        {renderSubTabContent()}
      </div>
    </div>
  )
}
