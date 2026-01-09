import { Router } from 'express'
import { createConnection } from 'net'

export const healthRouter = Router()

interface ServiceConfig {
  name: string
  port: number
  healthEndpoint: string
  type: 'http' | 'tcp'
}

const SERVICES: ServiceConfig[] = [
  { name: 'memOS', port: 8001, healthEndpoint: '/api/v1/system/health/aggregate', type: 'http' },
  { name: 'Gateway', port: 8100, healthEndpoint: '/health', type: 'http' },
  { name: 'SearXNG', port: 8888, healthEndpoint: '/healthz', type: 'http' },
  { name: 'PDF Tools', port: 8002, healthEndpoint: '/health', type: 'http' },
  { name: 'Ollama', port: 11434, healthEndpoint: '/api/version', type: 'http' },
  { name: 'Milvus', port: 9091, healthEndpoint: '/healthz', type: 'http' },
  { name: 'PostgreSQL', port: 5432, healthEndpoint: '', type: 'tcp' },
  { name: 'Redis', port: 6379, healthEndpoint: '', type: 'tcp' },
]

async function checkHttpHealth(service: ServiceConfig): Promise<{
  status: 'healthy' | 'unhealthy' | 'unknown'
  latency?: number
  message?: string
}> {
  const start = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const url = `http://localhost:${service.port}${service.healthEndpoint}`
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    const latency = Date.now() - start

    if (response.ok) {
      return { status: 'healthy', latency }
    } else {
      return { status: 'unhealthy', latency, message: `HTTP ${response.status}` }
    }
  } catch (error) {
    clearTimeout(timeout)
    const err = error as Error
    return { status: 'unhealthy', message: err.message }
  }
}

async function checkTcpHealth(service: ServiceConfig): Promise<{
  status: 'healthy' | 'unhealthy' | 'unknown'
  latency?: number
  message?: string
}> {
  const start = Date.now()

  return new Promise((resolve) => {
    const socket = createConnection({ port: service.port, host: 'localhost' })

    const timeout = setTimeout(() => {
      socket.destroy()
      resolve({ status: 'unhealthy', message: 'Connection timeout' })
    }, 3000)

    socket.on('connect', () => {
      clearTimeout(timeout)
      const latency = Date.now() - start
      socket.destroy()
      resolve({ status: 'healthy', latency })
    })

    socket.on('error', (err) => {
      clearTimeout(timeout)
      socket.destroy()
      resolve({ status: 'unhealthy', message: err.message })
    })
  })
}

// GET /api/health/aggregate
healthRouter.get('/aggregate', async (req, res) => {
  const results = await Promise.all(
    SERVICES.map(async (service) => {
      const check =
        service.type === 'http'
          ? await checkHttpHealth(service)
          : await checkTcpHealth(service)

      return {
        name: service.name,
        port: service.port,
        status: check.status,
        latency: check.latency,
        message: check.message,
        lastCheck: new Date().toISOString(),
      }
    })
  )

  res.json(results)
})

// GET /api/health/:service
healthRouter.get('/:service', async (req, res) => {
  const serviceName = req.params.service
  const service = SERVICES.find(
    (s) => s.name.toLowerCase() === serviceName.toLowerCase()
  )

  if (!service) {
    return res.status(404).json({ error: 'Service not found' })
  }

  const check =
    service.type === 'http'
      ? await checkHttpHealth(service)
      : await checkTcpHealth(service)

  res.json({
    name: service.name,
    port: service.port,
    ...check,
    lastCheck: new Date().toISOString(),
  })
})
