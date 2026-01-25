import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { MEMOS_BASE_URL } from '../../config/ports'

export const agentRouter = Router()

// Store active search requests
const activeSearches = new Map<string, { query: string; preset: string; startTime: number }>()

// GET /api/agent/stream/global - SSE stream for ALL active agent events from memOS
// This connects to memOS's chat-gateway SSE endpoint to capture live events
agentRouter.get('/stream/global', async (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // Send initial connection event
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    message: 'Connected to global event stream',
    timestamp: new Date().toISOString(),
  })}\n\n`)

  // For global monitoring, we poll the memOS observability dashboard
  // and send events as they appear
  let lastEventCount = 0
  const pollInterval = setInterval(async () => {
    try {
      const response = await fetch(`${MEMOS_BASE_URL}/api/v1/observability/recent?limit=20`)
      if (response.ok) {
        const data = await response.json()
        if (data.requests && data.requests.length > lastEventCount) {
          // Send new requests as events
          const newRequests = data.requests.slice(0, data.requests.length - lastEventCount)
          for (const req of newRequests) {
            res.write(`data: ${JSON.stringify({
              type: 'request_update',
              request: req,
              timestamp: new Date().toISOString(),
            })}\n\n`)
          }
          lastEventCount = data.requests.length
        }
      }
    } catch (e) {
      // Silent fail - memOS may not have observability endpoint
    }
  }, 2000)

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(pollInterval)
  })
})

// POST /api/agent/search - Start a new agentic search
agentRouter.post('/search', async (req: Request, res: Response) => {
  const { query, preset = 'balanced' } = req.body

  if (!query) {
    return res.status(400).json({ error: 'Query is required' })
  }

  const requestId = randomUUID()
  activeSearches.set(requestId, {
    query,
    preset,
    startTime: Date.now(),
  })

  // Clean up old searches after 30 minutes
  setTimeout(() => {
    activeSearches.delete(requestId)
  }, 30 * 60 * 1000)

  res.json({
    requestId,
    query,
    preset,
    streamUrl: `/api/agent/events/${requestId}`,
  })
})

// GET /api/agent/events/:requestId - SSE stream for agent events
agentRouter.get('/events/:requestId', async (req: Request, res: Response) => {
  const { requestId } = req.params
  const searchInfo = activeSearches.get(requestId)

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // Send initial connection event
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    requestId,
    timestamp: new Date().toISOString(),
  })}\n\n`)

  if (!searchInfo) {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: 'Search request not found. Start a search first.',
      timestamp: new Date().toISOString(),
    })}\n\n`)
    res.end()
    return
  }

  try {
    // Connect to memOS gateway stream endpoint
    const memosUrl = `${MEMOS_BASE_URL}/api/v1/search/gateway/stream`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000) // 5 minute timeout

    const response = await fetch(memosUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        query: searchInfo.query,
        preset: searchInfo.preset,
        request_id: requestId,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: `memOS returned ${response.status}: ${response.statusText}`,
        timestamp: new Date().toISOString(),
      })}\n\n`)
      clearTimeout(timeout)
      res.end()
      return
    }

    if (!response.body) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: 'No response body from memOS',
        timestamp: new Date().toISOString(),
      })}\n\n`)
      clearTimeout(timeout)
      res.end()
      return
    }

    // Stream events from memOS to client
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    const readStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            res.write(`data: ${JSON.stringify({
              type: 'stream_complete',
              timestamp: new Date().toISOString(),
            })}\n\n`)
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          // Forward the raw SSE data
          res.write(chunk)
        }
      } catch (err) {
        const error = err as Error
        if (error.name !== 'AbortError') {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            message: error.message,
            timestamp: new Date().toISOString(),
          })}\n\n`)
        }
      } finally {
        clearTimeout(timeout)
        res.end()
      }
    }

    // Handle client disconnect
    req.on('close', () => {
      controller.abort()
      clearTimeout(timeout)
    })

    await readStream()

  } catch (err) {
    const error = err as Error
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: `Failed to connect to memOS: ${error.message}`,
      timestamp: new Date().toISOString(),
    })}\n\n`)
    res.end()
  }
})

// GET /api/agent/history - Get list of recent searches from database
agentRouter.get('/history', async (req: Request, res: Response) => {
  const { limit = '50', offset = '0', hours } = req.query

  // Get local active searches (in progress)
  const localSearches = Array.from(activeSearches.entries()).map(([id, info]) => ({
    request_id: id,
    query: info.query,
    preset: info.preset,
    started_at: new Date(info.startTime).toISOString(),
    status: 'running',
    duration_ms: Date.now() - info.startTime,
    confidence: 0,
    confidence_level: 'unknown',
    llm_calls: 0,
    tokens: { input: 0, output: 0 },
    source: 'local',
  }))

  // Get historical runs from memOS database
  let dbSearches: any[] = []
  try {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    if (hours) params.append('hours', String(hours))

    const response = await fetch(`${MEMOS_BASE_URL}/api/v1/observability/history?${params}`, {
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data?.runs) {
        dbSearches = data.data.runs.map((r: any) => ({
          ...r,
          source: 'database',
        }))
      }
    }
  } catch (e) {
    console.error('Failed to fetch from database:', e)
    // Fall back to in-memory observability
    try {
      const response = await fetch(`${MEMOS_BASE_URL}/api/v1/observability/recent?limit=${limit}`, {
        signal: AbortSignal.timeout(3000),
      })
      if (response.ok) {
        const data = await response.json()
        dbSearches = (data.requests || []).map((r: any) => ({
          request_id: r.request_id,
          query: r.query,
          preset: r.preset,
          started_at: r.timestamp,
          status: r.summary?.success ? 'completed' : (r.error_message ? 'failed' : 'running'),
          confidence: r.summary?.confidence || 0,
          confidence_level: r.summary?.confidence_level || 'unknown',
          duration_ms: r.summary?.duration_ms || 0,
          llm_calls: r.llm_calls?.count || 0,
          tokens: {
            input: r.llm_calls?.input_tokens || 0,
            output: r.llm_calls?.output_tokens || 0,
          },
          source: 'memory',
        }))
      }
    } catch (e2) {
      // memOS not available
    }
  }

  // Merge: local (running) first, then database (completed)
  // Deduplicate by request_id
  const seenIds = new Set<string>()
  const allSearches: any[] = []

  for (const search of localSearches) {
    if (!seenIds.has(search.request_id)) {
      seenIds.add(search.request_id)
      allSearches.push(search)
    }
  }

  for (const search of dbSearches) {
    if (!seenIds.has(search.request_id)) {
      seenIds.add(search.request_id)
      allSearches.push(search)
    }
  }

  res.json({
    success: true,
    data: {
      runs: allSearches,
      total: allSearches.length,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  })
})

// GET /api/agent/history/:requestId/events - Get events for a specific run
agentRouter.get('/history/:requestId/events', async (req: Request, res: Response) => {
  const { requestId } = req.params

  try {
    const response = await fetch(
      `${MEMOS_BASE_URL}/api/v1/observability/history/${requestId}/events`,
      { signal: AbortSignal.timeout(5000) }
    )

    if (response.ok) {
      const data = await response.json()
      res.json(data)
    } else {
      res.status(response.status).json({
        success: false,
        data: { events: [], count: 0 },
        errors: [`memOS returned ${response.status}`],
      })
    }
  } catch (err) {
    const error = err as Error
    res.status(500).json({
      success: false,
      data: { events: [], count: 0 },
      errors: [`Failed to fetch events: ${error.message}`],
    })
  }
})

// GET /api/agent/memos/stats - Get observability statistics from memOS
agentRouter.get('/memos/stats', async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${MEMOS_BASE_URL}/api/v1/observability/stats`, {
      signal: AbortSignal.timeout(5000),
    })
    if (response.ok) {
      const data = await response.json()
      res.json(data)
    } else {
      res.status(response.status).json({ error: 'Failed to fetch memOS stats' })
    }
  } catch (e) {
    const err = e as Error
    res.status(503).json({ error: `memOS not available: ${err.message}` })
  }
})

// GET /api/agent/observability/:requestId - Get observability data for a request
agentRouter.get('/observability/:requestId', async (req: Request, res: Response) => {
  const { requestId } = req.params

  try {
    const response = await fetch(
      `${MEMOS_BASE_URL}/api/v1/observability/request/${requestId}`,
      { method: 'GET' }
    )

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch observability data: ${response.statusText}`,
      })
    }

    const data = await response.json()
    res.json(data)
  } catch (err) {
    const error = err as Error
    res.status(500).json({
      error: `Failed to connect to memOS: ${error.message}`,
    })
  }
})

// ============================================================================
// Phase 4: Observability Detail Endpoints
// Extract specific parts of observability data for the Agent Console tabs
// ============================================================================

// Helper function to fetch full observability data
async function fetchObservabilityData(requestId: string) {
  const response = await fetch(
    `${MEMOS_BASE_URL}/api/v1/observability/request/${requestId}`,
    { signal: AbortSignal.timeout(10000) }
  )
  if (!response.ok) {
    throw new Error(`memOS returned ${response.status}: ${response.statusText}`)
  }
  return response.json()
}

// GET /api/agent/observability/:requestId/decisions - Extract decisions for Decision Log Tab
agentRouter.get('/observability/:requestId/decisions', async (req: Request, res: Response) => {
  const { requestId } = req.params

  try {
    const data = await fetchObservabilityData(requestId)
    const decisions = data.data?.decisions || data.decisions || []

    // Format decisions for timeline display
    const formattedDecisions = decisions.map((d: any, index: number) => ({
      id: d.id || `decision-${index}`,
      timestamp: d.timestamp,
      agent: d.agent || d.agent_name,
      decision_type: d.decision_type || d.type,
      decision: d.decision || d.value,
      reasoning: d.reasoning || d.rationale,
      alternatives: d.alternatives || [],
      confidence: d.confidence,
      context: d.context || {},
    }))

    res.json({
      success: true,
      data: {
        decisions: formattedDecisions,
        count: formattedDecisions.length,
      },
      meta: { timestamp: new Date().toISOString(), requestId },
    })
  } catch (err) {
    const error = err as Error
    res.status(500).json({
      success: false,
      data: { decisions: [], count: 0 },
      errors: [error.message],
    })
  }
})

// GET /api/agent/observability/:requestId/context-flow - Extract context transfers for Context Flow Tab
agentRouter.get('/observability/:requestId/context-flow', async (req: Request, res: Response) => {
  const { requestId } = req.params

  try {
    const data = await fetchObservabilityData(requestId)
    const transfers = data.data?.context_transfers || data.context_transfers || []

    // Format for Sankey diagram visualization
    const nodes = new Map<string, { id: string; name: string; tokens: number }>()
    const links: { source: string; target: string; value: number }[] = []

    transfers.forEach((t: any) => {
      const sourceId = t.source_agent || t.from || 'input'
      const targetId = t.target_agent || t.to || 'output'
      const tokens = t.token_count || t.tokens || 0

      if (!nodes.has(sourceId)) {
        nodes.set(sourceId, { id: sourceId, name: sourceId, tokens: 0 })
      }
      if (!nodes.has(targetId)) {
        nodes.set(targetId, { id: targetId, name: targetId, tokens: 0 })
      }

      const sourceNode = nodes.get(sourceId)!
      sourceNode.tokens += tokens

      links.push({
        source: sourceId,
        target: targetId,
        value: tokens,
      })
    })

    res.json({
      success: true,
      data: {
        transfers: transfers,
        sankey: {
          nodes: Array.from(nodes.values()),
          links: links,
        },
        total_tokens: transfers.reduce((sum: number, t: any) => sum + (t.token_count || t.tokens || 0), 0),
        count: transfers.length,
      },
      meta: { timestamp: new Date().toISOString(), requestId },
    })
  } catch (err) {
    const error = err as Error
    res.status(500).json({
      success: false,
      data: { transfers: [], sankey: { nodes: [], links: [] }, total_tokens: 0, count: 0 },
      errors: [error.message],
    })
  }
})

// GET /api/agent/observability/:requestId/llm-calls - Extract LLM calls for LLM Calls Tab
agentRouter.get('/observability/:requestId/llm-calls', async (req: Request, res: Response) => {
  const { requestId } = req.params
  const { sort = 'timestamp', order = 'asc' } = req.query

  try {
    const data = await fetchObservabilityData(requestId)
    const llmCalls = data.data?.llm_calls || data.llm_calls || []

    // Format LLM calls with metrics
    const formattedCalls = llmCalls.map((call: any, index: number) => ({
      id: call.id || `llm-${index}`,
      timestamp: call.timestamp || call.started_at,
      agent: call.agent || call.agent_name,
      model: call.model || call.model_name,
      prompt_tokens: call.prompt_tokens || call.input_tokens || 0,
      completion_tokens: call.completion_tokens || call.output_tokens || 0,
      total_tokens: (call.prompt_tokens || call.input_tokens || 0) + (call.completion_tokens || call.output_tokens || 0),
      latency_ms: call.latency_ms || call.duration_ms || 0,
      success: call.success !== false,
      error: call.error,
      purpose: call.purpose || call.operation,
    }))

    // Sort calls
    if (sort === 'latency') {
      formattedCalls.sort((a: any, b: any) => order === 'desc' ? b.latency_ms - a.latency_ms : a.latency_ms - b.latency_ms)
    } else if (sort === 'tokens') {
      formattedCalls.sort((a: any, b: any) => order === 'desc' ? b.total_tokens - a.total_tokens : a.total_tokens - b.total_tokens)
    } else {
      formattedCalls.sort((a: any, b: any) => {
        const aTime = new Date(a.timestamp).getTime()
        const bTime = new Date(b.timestamp).getTime()
        return order === 'desc' ? bTime - aTime : aTime - bTime
      })
    }

    // Calculate aggregates
    const totalLatency = formattedCalls.reduce((sum: number, c: any) => sum + c.latency_ms, 0)
    const totalTokens = formattedCalls.reduce((sum: number, c: any) => sum + c.total_tokens, 0)
    const totalInputTokens = formattedCalls.reduce((sum: number, c: any) => sum + c.prompt_tokens, 0)
    const totalOutputTokens = formattedCalls.reduce((sum: number, c: any) => sum + c.completion_tokens, 0)

    res.json({
      success: true,
      data: {
        calls: formattedCalls,
        count: formattedCalls.length,
        aggregates: {
          total_latency_ms: totalLatency,
          avg_latency_ms: formattedCalls.length > 0 ? Math.round(totalLatency / formattedCalls.length) : 0,
          total_tokens: totalTokens,
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
          success_rate: formattedCalls.length > 0 ? formattedCalls.filter((c: any) => c.success).length / formattedCalls.length : 0,
        },
      },
      meta: { timestamp: new Date().toISOString(), requestId },
    })
  } catch (err) {
    const error = err as Error
    res.status(500).json({
      success: false,
      data: { calls: [], count: 0, aggregates: {} },
      errors: [error.message],
    })
  }
})

// GET /api/agent/observability/:requestId/scratchpad - Extract scratchpad changes for Scratchpad Tab
agentRouter.get('/observability/:requestId/scratchpad', async (req: Request, res: Response) => {
  const { requestId } = req.params

  try {
    const data = await fetchObservabilityData(requestId)
    const changes = data.data?.scratchpad_changes || data.scratchpad_changes || []

    // Format scratchpad changes as state evolution
    const formattedChanges = changes.map((change: any, index: number) => ({
      id: change.id || `scratchpad-${index}`,
      timestamp: change.timestamp,
      agent: change.agent || change.agent_name,
      operation: change.operation || change.action, // 'add', 'update', 'remove'
      field: change.field || change.key,
      value: change.value || change.new_value,
      previous_value: change.previous_value || change.old_value,
      reason: change.reason,
    }))

    // Build current state from changes
    const currentState: Record<string, any> = {}
    const stateHistory: { timestamp: string; state: Record<string, any> }[] = []

    for (const change of formattedChanges) {
      if (change.operation === 'remove') {
        delete currentState[change.field]
      } else {
        currentState[change.field] = change.value
      }
      stateHistory.push({
        timestamp: change.timestamp,
        state: { ...currentState },
      })
    }

    res.json({
      success: true,
      data: {
        changes: formattedChanges,
        current_state: currentState,
        state_history: stateHistory,
        count: formattedChanges.length,
      },
      meta: { timestamp: new Date().toISOString(), requestId },
    })
  } catch (err) {
    const error = err as Error
    res.status(500).json({
      success: false,
      data: { changes: [], current_state: {}, state_history: [], count: 0 },
      errors: [error.message],
    })
  }
})

// GET /api/agent/observability/:requestId/confidence - Extract confidence breakdown for Confidence Tab
agentRouter.get('/observability/:requestId/confidence', async (req: Request, res: Response) => {
  const { requestId } = req.params

  try {
    const data = await fetchObservabilityData(requestId)
    const breakdown = data.data?.confidence_breakdown || data.confidence_breakdown || {}
    const history = data.data?.confidence_history || data.confidence_history || []

    // Format confidence breakdown
    const signals = Object.entries(breakdown).map(([signal, value]) => ({
      signal,
      value: typeof value === 'number' ? value : (value as any)?.score || 0,
      weight: (value as any)?.weight || 1.0,
      description: (value as any)?.description || '',
    }))

    // Calculate weighted average
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0)
    const weightedSum = signals.reduce((sum, s) => sum + s.value * s.weight, 0)
    const overallConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0

    res.json({
      success: true,
      data: {
        overall_confidence: overallConfidence,
        signals,
        history: history.map((h: any) => ({
          timestamp: h.timestamp,
          confidence: h.confidence || h.value,
          agent: h.agent,
          reason: h.reason,
        })),
        breakdown_raw: breakdown,
      },
      meta: { timestamp: new Date().toISOString(), requestId },
    })
  } catch (err) {
    const error = err as Error
    res.status(500).json({
      success: false,
      data: { overall_confidence: 0, signals: [], history: [], breakdown_raw: {} },
      errors: [error.message],
    })
  }
})

// ============================================================================
// LLM Model Configuration API - Proxies to memOS config endpoints
// ============================================================================

// GET /api/agent/config/llm-models - Get full LLM config
agentRouter.get('/config/llm-models', async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${MEMOS_BASE_URL}/api/v1/config/llm-models`, {
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const data = await response.json()
      res.json(data)
    } else {
      res.status(response.status).json({
        error: `memOS returned ${response.status}: ${response.statusText}`,
      })
    }
  } catch (err) {
    const error = err as Error
    res.status(503).json({ error: `memOS not available: ${error.message}` })
  }
})

// PUT /api/agent/config/llm-models - Update a single model assignment
agentRouter.put('/config/llm-models', async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${MEMOS_BASE_URL}/api/v1/config/llm-models`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const data = await response.json()
      res.json(data)
    } else {
      const errorText = await response.text()
      res.status(response.status).json({
        error: `memOS returned ${response.status}: ${errorText}`,
      })
    }
  } catch (err) {
    const error = err as Error
    res.status(503).json({ error: `memOS not available: ${error.message}` })
  }
})

// POST /api/agent/config/llm-models/reload - Reload config from YAML file
agentRouter.post('/config/llm-models/reload', async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${MEMOS_BASE_URL}/api/v1/config/llm-models/reload`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const data = await response.json()
      res.json(data)
    } else {
      res.status(response.status).json({
        error: `memOS returned ${response.status}: ${response.statusText}`,
      })
    }
  } catch (err) {
    const error = err as Error
    res.status(503).json({ error: `memOS not available: ${error.message}` })
  }
})

// POST /api/agent/config/llm-models/save - Save current config to YAML file
agentRouter.post('/config/llm-models/save', async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${MEMOS_BASE_URL}/api/v1/config/llm-models/save`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const data = await response.json()
      res.json(data)
    } else {
      res.status(response.status).json({
        error: `memOS returned ${response.status}: ${response.statusText}`,
      })
    }
  } catch (err) {
    const error = err as Error
    res.status(503).json({ error: `memOS not available: ${error.message}` })
  }
})

// GET /api/agent/config/llm-models/presets - List available presets
agentRouter.get('/config/llm-models/presets', async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${MEMOS_BASE_URL}/api/v1/config/llm-models/presets`, {
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const data = await response.json()
      res.json(data)
    } else {
      res.status(response.status).json({
        error: `memOS returned ${response.status}: ${response.statusText}`,
      })
    }
  } catch (err) {
    const error = err as Error
    res.status(503).json({ error: `memOS not available: ${error.message}` })
  }
})

// POST /api/agent/config/llm-models/presets/:name - Apply a preset
agentRouter.post('/config/llm-models/presets/:name', async (req: Request, res: Response) => {
  const { name } = req.params

  try {
    const response = await fetch(`${MEMOS_BASE_URL}/api/v1/config/llm-models/presets/${name}`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const data = await response.json()
      res.json(data)
    } else {
      const errorText = await response.text()
      res.status(response.status).json({
        error: `memOS returned ${response.status}: ${errorText}`,
      })
    }
  } catch (err) {
    const error = err as Error
    res.status(503).json({ error: `memOS not available: ${error.message}` })
  }
})

// GET /api/agent/config/llm-models/raw - Get raw YAML content
agentRouter.get('/config/llm-models/raw', async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${MEMOS_BASE_URL}/api/v1/config/llm-models/raw`, {
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const yamlContent = await response.text()
      res.type('text/yaml').send(yamlContent)
    } else {
      res.status(response.status).json({
        error: `memOS returned ${response.status}: ${response.statusText}`,
      })
    }
  } catch (err) {
    const error = err as Error
    res.status(503).json({ error: `memOS not available: ${error.message}` })
  }
})

// PUT /api/agent/config/llm-models/raw - Save raw YAML content
agentRouter.put('/config/llm-models/raw', async (req: Request, res: Response) => {
  try {
    const yamlContent = typeof req.body === 'string' ? req.body : req.body.yaml

    if (!yamlContent) {
      return res.status(400).json({ error: 'YAML content required in body' })
    }

    const response = await fetch(`${MEMOS_BASE_URL}/api/v1/config/llm-models/raw`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/yaml' },
      body: yamlContent,
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const data = await response.json()
      res.json(data)
    } else {
      const errorText = await response.text()
      res.status(response.status).json({
        error: `memOS returned ${response.status}: ${errorText}`,
      })
    }
  } catch (err) {
    const error = err as Error
    res.status(503).json({ error: `memOS not available: ${error.message}` })
  }
})
