import { Router } from 'express'
import { MEMOS_BASE_URL } from '../../config/ports'

export const gpuRouter = Router()

// GET /api/gpu/status - Proxy to memOS GPU endpoint
gpuRouter.get('/status', async (req, res) => {
  try {
    const response = await fetch(`${MEMOS_BASE_URL}/api/v1/models/gpu/status`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    // Transform to dashboard format
    const gpuStatus = {
      name: data.gpu_name || 'Unknown GPU',
      vramUsed: data.vram_used_gb || data.memory_used / 1024 || 0,
      vramTotal: data.vram_total_gb || data.memory_total / 1024 || 24,
      utilization: data.gpu_utilization || data.utilization || 0,
      temperature: data.temperature || 0,
      powerDraw: data.power_draw || data.power_usage || 0,
      loadedModels: data.loaded_models || [],
    }

    res.json(gpuStatus)
  } catch (error) {
    // Fallback to nvidia-smi if memOS endpoint fails
    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      const { stdout } = await execAsync(
        'nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu,power.draw --format=csv,noheader,nounits'
      )

      const [name, memUsed, memTotal, util, temp, power] = stdout.trim().split(', ')

      res.json({
        name: name.trim(),
        vramUsed: parseFloat(memUsed) / 1024, // MB to GB
        vramTotal: parseFloat(memTotal) / 1024,
        utilization: parseInt(util),
        temperature: parseInt(temp),
        powerDraw: parseFloat(power),
        loadedModels: [],
      })
    } catch (nvidiaError) {
      res.status(503).json({
        error: 'GPU status unavailable',
        message: 'Neither memOS nor nvidia-smi available',
      })
    }
  }
})
