import express from 'express'
import cors from 'cors'
import { healthRouter } from './routes/health'
import { logsRouter } from './routes/logs'
import { docsRouter } from './routes/docs'
import { gpuRouter } from './routes/gpu'
import { processesRouter } from './routes/processes'
import { agentRouter } from './routes/agent'

const app = express()
const PORT = process.env.PORT || 3101

app.use(cors())
app.use(express.json())

// API routes
app.use('/api/health', healthRouter)
app.use('/api/logs', logsRouter)
app.use('/api/docs', docsRouter)
app.use('/api/gpu', gpuRouter)
app.use('/api/processes', processesRouter)
app.use('/api/agent', agentRouter)

// Root health check
app.get('/api/health-check', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`Dashboard backend running on port ${PORT}`)
  console.log(`Health aggregation active`)
  console.log(`Log streaming available at /api/logs/stream`)
})
