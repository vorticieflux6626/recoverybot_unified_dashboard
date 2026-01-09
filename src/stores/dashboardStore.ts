import { create } from 'zustand'
import type { ServiceHealth, GPUStatus, ProcessInfo, LogEntry } from '@/lib/api'

interface DashboardState {
  // Health state
  services: ServiceHealth[]
  setServices: (services: ServiceHealth[]) => void

  // GPU state
  gpuStatus: GPUStatus | null
  setGPUStatus: (status: GPUStatus | null) => void

  // Processes state
  processes: ProcessInfo[]
  setProcesses: (processes: ProcessInfo[]) => void

  // Logs state
  logs: LogEntry[]
  addLog: (log: LogEntry) => void
  clearLogs: () => void

  // SSE connection state
  sseConnected: boolean
  setSSEConnected: (connected: boolean) => void

  // UI state
  logFilter: {
    source: string | null
    level: string | null
  }
  setLogFilter: (filter: { source?: string | null; level?: string | null }) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  // Health
  services: [],
  setServices: (services) => set({ services }),

  // GPU
  gpuStatus: null,
  setGPUStatus: (gpuStatus) => set({ gpuStatus }),

  // Processes
  processes: [],
  setProcesses: (processes) => set({ processes }),

  // Logs
  logs: [],
  addLog: (log) =>
    set((state) => ({
      logs: [...state.logs.slice(-999), log], // Keep last 1000 logs
    })),
  clearLogs: () => set({ logs: [] }),

  // SSE
  sseConnected: false,
  setSSEConnected: (sseConnected) => set({ sseConnected }),

  // UI
  logFilter: { source: null, level: null },
  setLogFilter: (filter) =>
    set((state) => ({
      logFilter: { ...state.logFilter, ...filter },
    })),
}))
