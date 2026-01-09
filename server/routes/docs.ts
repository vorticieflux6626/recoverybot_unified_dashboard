import { Router } from 'express'
import { readdir, readFile, stat } from 'fs/promises'
import { join, basename, extname } from 'path'

export const docsRouter = Router()

interface DocFile {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: DocFile[]
}

// Documentation paths to index
const DOC_ROOTS = [
  { name: 'Recovery_Bot', path: '/home/sparkone/sdd/Recovery_Bot' },
  { name: 'PDF_Extraction_Tools', path: '/home/sparkone/sdd/PDF_Extraction_Tools' },
  { name: 'MCP_Node_Editor', path: '/home/sparkone/sdd/MCP_Node_Editor' },
  { name: 'mcp_infrastructure', path: '/home/sparkone/sdd/mcp_infrastructure' },
]

// File patterns to include
const DOC_PATTERNS = [
  'CLAUDE.md',
  'README.md',
  'ARCHITECTURE.md',
  'IMPLEMENTATION_PHASES.md',
  'SYSTEM_MANIFEST.yaml',
  'FEATURE_REGISTRY.yaml',
  'SERVER_PORT_AUDIT',
]

async function findDocFiles(dir: string, depth: number = 0): Promise<DocFile[]> {
  if (depth > 3) return [] // Limit recursion depth

  const files: DocFile[] = []

  try {
    const entries = await readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      // Skip hidden, node_modules, venv, etc.
      if (entry.name.startsWith('.') ||
          entry.name === 'node_modules' ||
          entry.name === 'venv' ||
          entry.name === '__pycache__' ||
          entry.name === 'build' ||
          entry.name === 'dist') {
        continue
      }

      if (entry.isDirectory()) {
        // Recurse into important directories
        const importantDirs = ['docs', 'agentic', '.memOS', 'server']
        if (depth === 0 || importantDirs.includes(entry.name)) {
          const children = await findDocFiles(fullPath, depth + 1)
          if (children.length > 0) {
            files.push({
              name: entry.name,
              path: fullPath,
              type: 'directory',
              children,
            })
          }
        }
      } else if (entry.isFile()) {
        // Check if file matches doc patterns
        const name = entry.name
        const ext = extname(name)

        if (DOC_PATTERNS.some(pattern => name.includes(pattern)) ||
            (ext === '.md' && depth > 0) ||
            ext === '.yaml' && name.includes('MANIFEST')) {
          files.push({
            name,
            path: fullPath,
            type: 'file',
          })
        }
      }
    }
  } catch (error) {
    // Directory not accessible
  }

  return files.sort((a, b) => {
    // Directories first, then files
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

// GET /api/docs/tree
docsRouter.get('/tree', async (req, res) => {
  const tree: DocFile[] = []

  for (const root of DOC_ROOTS) {
    try {
      const children = await findDocFiles(root.path)
      if (children.length > 0) {
        tree.push({
          name: root.name,
          path: root.path,
          type: 'directory',
          children,
        })
      }
    } catch {
      // Root not accessible
    }
  }

  res.json(tree)
})

// GET /api/docs/content?path=...
docsRouter.get('/content', async (req, res) => {
  const filePath = req.query.path as string

  if (!filePath) {
    return res.status(400).json({ error: 'Path required' })
  }

  // Security: Ensure path is within allowed roots
  const isAllowed = DOC_ROOTS.some(root => filePath.startsWith(root.path))
  if (!isAllowed) {
    return res.status(403).json({ error: 'Access denied' })
  }

  try {
    const stats = await stat(filePath)
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Not a file' })
    }

    const content = await readFile(filePath, 'utf-8')
    res.type('text/plain').send(content)
  } catch (error) {
    res.status(404).json({ error: 'File not found' })
  }
})
