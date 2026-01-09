import { Router } from 'express'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const processesRouter = Router()

interface ProcessInfo {
  pid: number
  name: string
  cpu: number
  memory: number
  uptime: string
  type: 'native' | 'docker'
}

// Process patterns to monitor
const PROCESS_PATTERNS = [
  { pattern: 'uvicorn', name: 'memOS Server' },
  { pattern: 'ollama serve', name: 'Ollama' },
  { pattern: 'python.*aiohttp', name: 'Pipeline Launcher' },
  { pattern: 'node.*vite', name: 'Dashboard Dev' },
  { pattern: 'postgres', name: 'PostgreSQL' },
  { pattern: 'redis-server', name: 'Redis' },
]

// Docker containers to monitor
const DOCKER_CONTAINERS = [
  'searxng',
  'milvus-standalone',
  'milvus-minio',
  'milvus-etcd',
  'qdrant',
  'meilisearch',
]

async function getNativeProcesses(): Promise<ProcessInfo[]> {
  const processes: ProcessInfo[] = []

  for (const { pattern, name } of PROCESS_PATTERNS) {
    try {
      const { stdout } = await execAsync(
        `ps aux | grep -E "${pattern}" | grep -v grep | head -1`
      )

      if (stdout.trim()) {
        const parts = stdout.trim().split(/\s+/)
        if (parts.length >= 11) {
          processes.push({
            pid: parseInt(parts[1] || '0'),
            name,
            cpu: parseFloat(parts[2] || '0'),
            memory: parseFloat(parts[3] || '0'),
            uptime: parts[9] || '0:00',
            type: 'native',
          })
        }
      }
    } catch {
      // Process not running
    }
  }

  return processes
}

async function getDockerProcesses(): Promise<ProcessInfo[]> {
  const processes: ProcessInfo[] = []

  try {
    const { stdout } = await execAsync(
      'docker stats --no-stream --format "{{.Name}},{{.PIDs}},{{.CPUPerc}},{{.MemPerc}}"'
    )

    for (const line of stdout.trim().split('\n')) {
      if (!line) continue
      const [name, pids, cpu, mem] = line.split(',')

      if (DOCKER_CONTAINERS.includes(name)) {
        processes.push({
          pid: parseInt(pids || '0'),
          name: `${name} (docker)`,
          cpu: parseFloat(cpu?.replace('%', '') || '0'),
          memory: parseFloat(mem?.replace('%', '') || '0'),
          uptime: 'docker',
          type: 'docker',
        })
      }
    }
  } catch {
    // Docker not available
  }

  return processes
}

// GET /api/processes
processesRouter.get('/', async (req, res) => {
  try {
    const [nativeProcesses, dockerProcesses] = await Promise.all([
      getNativeProcesses(),
      getDockerProcesses(),
    ])

    const allProcesses = [...nativeProcesses, ...dockerProcesses]
      .sort((a, b) => b.cpu - a.cpu) // Sort by CPU usage

    res.json(allProcesses)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch processes' })
  }
})
