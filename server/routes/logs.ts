import { Router } from 'express'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const logsRouter = Router()

interface LogEntry {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  source: string
  message: string
}

// SSE endpoint for real-time log streaming
logsRouter.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')

  // Send initial connection message
  res.write(`data: ${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    source: 'dashboard',
    message: 'Connected to log stream'
  })}\n\n`)

  // Demo: Send periodic system status updates
  const interval = setInterval(() => {
    const log: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      source: 'dashboard',
      message: `System heartbeat - ${new Date().toLocaleTimeString()}`
    }
    res.write(`data: ${JSON.stringify(log)}\n\n`)
  }, 30000)

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(interval)
  })
})

// GET /api/logs - Get recent logs from various sources
logsRouter.get('/', async (req, res) => {
  const { source, level, limit = 100 } = req.query
  const logs: LogEntry[] = []

  try {
    // Get journalctl logs for Ollama
    if (!source || source === 'ollama') {
      try {
        const { stdout } = await execAsync(
          `journalctl -u ollama --no-pager -n 20 --output=json 2>/dev/null || echo "[]"`
        )
        const lines = stdout.trim().split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const entry = JSON.parse(line)
            logs.push({
              timestamp: new Date(parseInt(entry.__REALTIME_TIMESTAMP) / 1000).toISOString(),
              level: 'info',
              source: 'ollama',
              message: entry.MESSAGE || ''
            })
          } catch {
            // Skip invalid JSON
          }
        }
      } catch {
        // journalctl not available
      }
    }

    // Get Docker logs for SearXNG
    if (!source || source === 'searxng') {
      try {
        const { stdout } = await execAsync(
          `docker logs searxng --tail 20 2>&1 || echo ""`
        )
        const lines = stdout.trim().split('\n').filter(Boolean)
        for (const line of lines) {
          logs.push({
            timestamp: new Date().toISOString(),
            level: 'info',
            source: 'searxng',
            message: line
          })
        }
      } catch {
        // Docker not available
      }
    }

    // Filter by level if specified
    let filteredLogs = logs
    if (level && level !== 'all') {
      filteredLogs = logs.filter(log => log.level === level)
    }

    // Sort by timestamp and limit
    filteredLogs.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    res.json(filteredLogs.slice(0, Number(limit)))
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch logs' })
  }
})
