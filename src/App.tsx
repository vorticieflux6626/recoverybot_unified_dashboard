import { useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { OverviewTab } from '@/components/tabs/OverviewTab'
import { LogsTab } from '@/components/tabs/LogsTab'
import { DocsTab } from '@/components/tabs/DocsTab'
import { SettingsTab } from '@/components/tabs/SettingsTab'
import { AgentConsole } from '@/components/agent/AgentConsole'
import { CodeIntelligenceTab } from '@/components/tabs/CodeIntelligenceTab'

export type TabType = 'overview' | 'agent' | 'logs' | 'docs' | 'code-intel' | 'settings'

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab />
      case 'agent':
        return <AgentConsole />
      case 'logs':
        return <LogsTab />
      case 'docs':
        return <DocsTab />
      case 'code-intel':
        return <CodeIntelligenceTab />
      case 'settings':
        return <SettingsTab />
      default:
        return <OverviewTab />
    }
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header activeTab={activeTab} />
        <main className="flex-1 overflow-auto p-6">
          {renderTab()}
        </main>
      </div>
    </div>
  )
}

export default App
