import { Router } from 'express'
import neo4j, { Driver, Session } from 'neo4j-driver'
import { NEO4J_HTTP_PORT, NEO4J_BOLT_PORT, GATEWAY_PORT } from '../../config/ports'

export const docgraphRouter = Router()

// Neo4j connection configuration
const NEO4J_URI = `bolt://localhost:${NEO4J_BOLT_PORT}`
const NEO4J_USER = 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'docgraph2026'

let driver: Driver | null = null

function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD))
  }
  return driver
}

async function runQuery<T>(query: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const session: Session = getDriver().session()
  try {
    const result = await session.run(query, params)
    return result.records.map(record => record.toObject() as T)
  } finally {
    await session.close()
  }
}

// Types
interface EntityStats {
  functions: number
  classes: number
  documents: number
  files: number
  projects: number
}

interface ProjectStats {
  name: string
  functions: number
  classes: number
  documents: number
  files: number
}

interface SearchResult {
  uuid: string
  entity_type: 'function' | 'class' | 'document'
  name: string
  qualified_name?: string
  file_path: string
  project?: string
  line_start?: number
  line_end?: number
  score?: number
}

interface DocGraphStats {
  entities: EntityStats
  projects: ProjectStats[]
  lastIndexed?: string
  services: {
    neo4j: 'up' | 'down'
    milvus: 'up' | 'down'
    gateway: 'up' | 'down'
  }
}

// GET /api/docgraph/stats - Get overall statistics
docgraphRouter.get('/stats', async (req, res) => {
  try {
    // Get entity counts
    const countQuery = `
      MATCH (n)
      WITH labels(n)[0] as label
      RETURN label, count(*) as count
      ORDER BY count DESC
    `
    const counts = await runQuery<{ label: string; count: { low: number } }>(countQuery)

    const entities: EntityStats = {
      functions: 0,
      classes: 0,
      documents: 0,
      files: 0,
      projects: 0,
    }

    for (const row of counts) {
      const count = typeof row.count === 'object' ? row.count.low : row.count
      switch (row.label) {
        case 'Function': entities.functions = count; break
        case 'Class': entities.classes = count; break
        case 'Document': entities.documents = count; break
        case 'File': entities.files = count; break
        case 'Project': entities.projects = count; break
      }
    }

    // Get per-project stats
    const projectQuery = `
      MATCH (p:Project)
      OPTIONAL MATCH (f:Function) WHERE f.file_path STARTS WITH p.root_path
      OPTIONAL MATCH (c:Class) WHERE c.file_path STARTS WITH p.root_path
      OPTIONAL MATCH (d:Document) WHERE d.path STARTS WITH p.root_path
      OPTIONAL MATCH (file:File) WHERE file.path STARTS WITH p.root_path
      RETURN p.name as name,
             count(DISTINCT f) as functions,
             count(DISTINCT c) as classes,
             count(DISTINCT d) as documents,
             count(DISTINCT file) as files
      ORDER BY functions DESC
    `
    const projectRows = await runQuery<{
      name: string
      functions: { low: number }
      classes: { low: number }
      documents: { low: number }
      files: { low: number }
    }>(projectQuery)

    const projects: ProjectStats[] = projectRows.map(row => ({
      name: row.name,
      functions: typeof row.functions === 'object' ? row.functions.low : row.functions,
      classes: typeof row.classes === 'object' ? row.classes.low : row.classes,
      documents: typeof row.documents === 'object' ? row.documents.low : row.documents,
      files: typeof row.files === 'object' ? row.files.low : row.files,
    }))

    // Check service health
    const services = {
      neo4j: 'up' as const,
      milvus: 'down' as const,
      gateway: 'down' as const,
    }

    // Check Milvus
    try {
      const milvusRes = await fetch('http://localhost:9091/healthz', { signal: AbortSignal.timeout(2000) })
      if (milvusRes.ok) services.milvus = 'up'
    } catch { /* ignore */ }

    // Check Gateway
    try {
      const gatewayRes = await fetch(`http://localhost:${GATEWAY_PORT}/health`, { signal: AbortSignal.timeout(2000) })
      if (gatewayRes.ok) services.gateway = 'up'
    } catch { /* ignore */ }

    const stats: DocGraphStats = {
      entities,
      projects,
      services,
    }

    res.json(stats)
  } catch (error) {
    console.error('Error fetching stats:', error)
    res.status(500).json({ error: 'Failed to fetch statistics', details: (error as Error).message })
  }
})

// GET /api/docgraph/search?q=...&type=keyword|semantic&limit=20
docgraphRouter.get('/search', async (req, res) => {
  try {
    const query = req.query.q as string
    const type = (req.query.type as string) || 'keyword'
    const limit = neo4j.int(parseInt(req.query.limit as string) || 20)
    const entityTypes = (req.query.entityTypes as string)?.split(',') || ['function', 'class', 'document']

    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' })
    }

    let results: SearchResult[] = []

    if (type === 'keyword' || type === 'hybrid') {
      // Use fulltext search for code entities
      if (entityTypes.includes('function') || entityTypes.includes('class')) {
        const codeQuery = `
          CALL db.index.fulltext.queryNodes("code_search", $query) YIELD node, score
          RETURN node.uuid as uuid,
                 CASE WHEN node:Function THEN 'function' ELSE 'class' END as entity_type,
                 node.name as name,
                 node.qualified_name as qualified_name,
                 node.file_path as file_path,
                 node.line_start as line_start,
                 node.line_end as line_end,
                 score
          ORDER BY score DESC
          LIMIT $limit
        `
        const codeResults = await runQuery<SearchResult & { score: number }>(codeQuery, { query, limit })
        results.push(...codeResults.map(r => ({
          ...r,
          line_start: typeof r.line_start === 'object' ? (r.line_start as any).low : r.line_start,
          line_end: typeof r.line_end === 'object' ? (r.line_end as any).low : r.line_end,
        })))
      }

      // Search documents by title (case-insensitive contains)
      if (entityTypes.includes('document')) {
        const docQuery = `
          MATCH (d:Document)
          WHERE toLower(d.title) CONTAINS toLower($query)
             OR toLower(d.path) CONTAINS toLower($query)
          RETURN d.uuid as uuid,
                 'document' as entity_type,
                 d.title as name,
                 d.path as file_path,
                 d.project as project,
                 1.0 as score
          LIMIT $limit
        `
        const docResults = await runQuery<SearchResult>(docQuery, { query, limit })
        results.push(...docResults)
      }

      // Sort combined results by score
      results.sort((a, b) => (b.score || 0) - (a.score || 0))
      results = results.slice(0, limit.toNumber())
    }

    if (type === 'semantic' || type === 'hybrid') {
      // For semantic search, we need to generate embeddings via Gateway
      // and query Milvus - this is a more complex operation
      // For now, return a message that semantic search requires Milvus
      if (type === 'semantic') {
        return res.json({
          results: [],
          message: 'Semantic search requires Milvus integration (coming soon)',
          query,
          type,
        })
      }
    }

    res.json({
      results,
      query,
      type,
      count: results.length,
    })
  } catch (error) {
    console.error('Error searching:', error)
    res.status(500).json({ error: 'Search failed', details: (error as Error).message })
  }
})

// GET /api/docgraph/entity/:uuid - Get entity details with enhanced information
docgraphRouter.get('/entity/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params

    const query = `
      MATCH (n {uuid: $uuid})
      OPTIONAL MATCH (n)-[:HAS_ARGUMENT]->(arg:Argument)
      WITH n, arg
      ORDER BY arg.position
      WITH n, collect(CASE WHEN arg IS NOT NULL THEN {
        name: arg.name,
        type: arg.type,
        required: COALESCE(arg.required, true),
        default_value: arg.default_value,
        position: arg.position
      } ELSE null END) as args
      OPTIONAL MATCH (parentClass:Class)-[:DEFINES]->(n)
      RETURN n,
             labels(n)[0] as label,
             [(n)-[:CALLS]->(callee) | {uuid: callee.uuid, name: callee.name, qualified_name: callee.qualified_name}] as callees,
             [(caller)-[:CALLS]->(n) | {uuid: caller.uuid, name: caller.name, qualified_name: caller.qualified_name}] as callers,
             [(n)-[:DOCUMENTS]->(doc) | {uuid: doc.uuid, title: doc.title, path: doc.path}] as documents,
             [(doc)-[:DOCUMENTS]->(n) | {uuid: doc.uuid, title: doc.title, path: doc.path}] as documented_by,
             [a IN args WHERE a IS NOT NULL] as arguments,
             CASE WHEN parentClass IS NOT NULL
                  THEN {uuid: parentClass.uuid, name: parentClass.name, qualified_name: parentClass.qualified_name}
                  ELSE null END as parent_class
    `
    const results = await runQuery<{
      n: Record<string, unknown>
      label: string
      callees: Array<{ uuid: string; name: string; qualified_name: string }>
      callers: Array<{ uuid: string; name: string; qualified_name: string }>
      documents: Array<{ uuid: string; title: string; path: string }>
      documented_by: Array<{ uuid: string; title: string; path: string }>
      arguments: Array<{
        name: string
        type: string
        required: boolean
        default_value: string
        position: number | { low: number }
      }>
      parent_class: { uuid: string; name: string; qualified_name: string } | null
    }>(query, { uuid })

    if (results.length === 0) {
      return res.status(404).json({ error: 'Entity not found' })
    }

    const row = results[0]
    const entity = row.n as Record<string, any>

    // Extract numeric values from Neo4j integer format
    const extractNum = (val: any): number | undefined => {
      if (val === null || val === undefined) return undefined
      if (typeof val === 'object' && 'low' in val) return val.low
      return val
    }

    res.json({
      uuid: entity.uuid,
      name: entity.name,
      qualified_name: entity.qualified_name,
      entity_type: row.label.toLowerCase(),
      file_path: entity.file_path || entity.path,
      line_start: extractNum(entity.line_start),
      line_end: extractNum(entity.line_end),
      docstring: entity.docstring,
      // Function-specific fields
      signature: entity.signature,
      return_type: entity.return_type,
      is_async: entity.is_async ?? false,
      is_static: entity.is_static ?? false,
      is_method: entity.is_method ?? false,
      visibility: entity.visibility || 'public',
      // Relationships
      callees: row.callees || [],
      callers: row.callers || [],
      documents: row.documents || [],
      documented_by: row.documented_by || [],
      arguments: row.arguments?.map(arg => ({
        ...arg,
        position: typeof arg.position === 'object' ? (arg.position as any).low : arg.position,
      })) || [],
      parent_class: row.parent_class,
    })
  } catch (error) {
    console.error('Error fetching entity:', error)
    res.status(500).json({ error: 'Failed to fetch entity', details: (error as Error).message })
  }
})

// GET /api/docgraph/callers/:uuid - Get functions that call this entity
docgraphRouter.get('/callers/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params
    const depth = parseInt(req.query.depth as string) || 1
    const limit = neo4j.int(parseInt(req.query.limit as string) || 50)

    const query = `
      MATCH (target {uuid: $uuid})
      MATCH path = (caller)-[:CALLS*1..${Math.min(depth, 5)}]->(target)
      WHERE caller:Function OR caller:Class
      RETURN DISTINCT caller.uuid as uuid,
             caller.name as name,
             caller.qualified_name as qualified_name,
             caller.file_path as file_path,
             caller.line_start as line_start,
             length(path) as distance
      ORDER BY distance, name
      LIMIT $limit
    `
    const results = await runQuery<{
      uuid: string
      name: string
      qualified_name: string
      file_path: string
      line_start: number | { low: number }
      distance: number | { low: number }
    }>(query, { uuid, limit })

    res.json({
      uuid,
      callers: results.map(r => ({
        ...r,
        line_start: typeof r.line_start === 'object' ? r.line_start.low : r.line_start,
        distance: typeof r.distance === 'object' ? r.distance.low : r.distance,
      })),
      count: results.length,
    })
  } catch (error) {
    console.error('Error fetching callers:', error)
    res.status(500).json({ error: 'Failed to fetch callers', details: (error as Error).message })
  }
})

// GET /api/docgraph/callees/:uuid - Get functions called by this entity
docgraphRouter.get('/callees/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params
    const depth = parseInt(req.query.depth as string) || 1
    const limit = neo4j.int(parseInt(req.query.limit as string) || 50)

    const query = `
      MATCH (source {uuid: $uuid})
      MATCH path = (source)-[:CALLS*1..${Math.min(depth, 5)}]->(callee)
      WHERE callee:Function OR callee:Class
      RETURN DISTINCT callee.uuid as uuid,
             callee.name as name,
             callee.qualified_name as qualified_name,
             callee.file_path as file_path,
             callee.line_start as line_start,
             length(path) as distance
      ORDER BY distance, name
      LIMIT $limit
    `
    const results = await runQuery<{
      uuid: string
      name: string
      qualified_name: string
      file_path: string
      line_start: number | { low: number }
      distance: number | { low: number }
    }>(query, { uuid, limit })

    res.json({
      uuid,
      callees: results.map(r => ({
        ...r,
        line_start: typeof r.line_start === 'object' ? r.line_start.low : r.line_start,
        distance: typeof r.distance === 'object' ? r.distance.low : r.distance,
      })),
      count: results.length,
    })
  } catch (error) {
    console.error('Error fetching callees:', error)
    res.status(500).json({ error: 'Failed to fetch callees', details: (error as Error).message })
  }
})

// GET /api/docgraph/projects - List all indexed projects
docgraphRouter.get('/projects', async (req, res) => {
  try {
    const query = `
      MATCH (p:Project)
      RETURN p.name as name,
             p.root_path as root_path,
             p.description as description,
             p.repository as repository
      ORDER BY p.name
    `
    const results = await runQuery<{
      name: string
      root_path: string
      description: string
      repository: string
    }>(query)

    res.json({ projects: results })
  } catch (error) {
    console.error('Error fetching projects:', error)
    res.status(500).json({ error: 'Failed to fetch projects', details: (error as Error).message })
  }
})

// GET /api/docgraph/health - DocGraph-specific health check
docgraphRouter.get('/health', async (req, res) => {
  const health = {
    neo4j: { status: 'down' as const, latency: 0 },
    milvus: { status: 'down' as const, latency: 0 },
    gateway: { status: 'down' as const, latency: 0 },
  }

  // Check Neo4j
  try {
    const start = Date.now()
    await runQuery('RETURN 1')
    health.neo4j = { status: 'up', latency: Date.now() - start }
  } catch { /* ignore */ }

  // Check Milvus
  try {
    const start = Date.now()
    const response = await fetch('http://localhost:9091/healthz', { signal: AbortSignal.timeout(3000) })
    if (response.ok) {
      health.milvus = { status: 'up', latency: Date.now() - start }
    }
  } catch { /* ignore */ }

  // Check Gateway
  try {
    const start = Date.now()
    const response = await fetch(`http://localhost:${GATEWAY_PORT}/health`, { signal: AbortSignal.timeout(3000) })
    if (response.ok) {
      health.gateway = { status: 'up', latency: Date.now() - start }
    }
  } catch { /* ignore */ }

  const allUp = Object.values(health).every(h => h.status === 'up')

  res.status(allUp ? 200 : 503).json({
    status: allUp ? 'healthy' : 'degraded',
    services: health,
    timestamp: new Date().toISOString(),
  })
})

// GET /api/docgraph/source - Fetch source code content for a file
docgraphRouter.get('/source', async (req, res) => {
  try {
    const filePath = req.query.path as string
    const lineStart = parseInt(req.query.lineStart as string) || 1
    const lineEnd = parseInt(req.query.lineEnd as string) || 0
    const context = parseInt(req.query.context as string) || 10

    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' })
    }

    // Security: only allow reading from known project directories
    const allowedPrefixes = [
      '/home/sparkone/sdd/',
      '/home/sparkone/Documents/',
    ]

    const isAllowed = allowedPrefixes.some(prefix => filePath.startsWith(prefix))
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied to this path' })
    }

    const fs = await import('fs/promises')
    const path = await import('path')

    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const lines = content.split('\n')

      // Determine which lines to return
      let startLine = 1
      let endLine = lines.length

      if (lineStart > 0 && lineEnd > 0) {
        // Return specific range with context
        startLine = Math.max(1, lineStart - context)
        endLine = Math.min(lines.length, lineEnd + context)
      } else if (lineStart > 0) {
        // Return around a single line
        startLine = Math.max(1, lineStart - context)
        endLine = Math.min(lines.length, lineStart + context)
      }

      const selectedLines = lines.slice(startLine - 1, endLine)
      const extension = path.extname(filePath).slice(1) || 'txt'

      res.json({
        path: filePath,
        filename: path.basename(filePath),
        extension,
        content: selectedLines.join('\n'),
        startLine,
        endLine,
        totalLines: lines.length,
        highlightStart: lineStart,
        highlightEnd: lineEnd || lineStart,
      })
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' })
      }
      throw err
    }
  } catch (error) {
    console.error('Error fetching source:', error)
    res.status(500).json({ error: 'Failed to fetch source', details: (error as Error).message })
  }
})

// GET /api/docgraph/files?project=<name> - Get file tree with entity counts
docgraphRouter.get('/files', async (req, res) => {
  try {
    const projectName = req.query.project as string
    const limit = neo4j.int(parseInt(req.query.limit as string) || 500)

    // Build project path filter if project specified
    let projectPath = ''
    if (projectName) {
      const projectQuery = `
        MATCH (p:Project {name: $projectName})
        RETURN p.root_path as root_path
      `
      const projectResult = await runQuery<{ root_path: string }>(projectQuery, { projectName })
      projectPath = projectResult[0]?.root_path || ''
    }

    const whereClause = projectPath
      ? `WHERE f.path STARTS WITH $projectPath`
      : ''

    // Get files with entity counts
    const query = `
      MATCH (f:File)
      ${whereClause}
      OPTIONAL MATCH (f)-[:CONTAINS]->(entity)
      WITH f, count(entity) as entityCount
      RETURN f.path as path, entityCount
      ORDER BY f.path
      LIMIT $limit
    `
    const results = await runQuery<{
      path: string
      entityCount: number | { low: number }
    }>(query, { projectPath, limit })

    // Build hierarchical tree structure
    interface FileTreeNode {
      name: string
      path: string
      type: 'file' | 'directory'
      entityCount?: number
      children?: FileTreeNode[]
    }

    const root: { [key: string]: FileTreeNode } = {}

    for (const row of results) {
      const filePath = row.path
      const entityCount = typeof row.entityCount === 'object' ? row.entityCount.low : row.entityCount
      const parts = filePath.split('/')

      let current = root
      let currentPath = ''

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (!part) continue

        currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`
        const isFile = i === parts.length - 1

        if (!current[part]) {
          current[part] = {
            name: part,
            path: currentPath,
            type: isFile ? 'file' : 'directory',
            entityCount: isFile ? entityCount : undefined,
            children: isFile ? undefined : [],
          }
        }

        if (!isFile) {
          if (!current[part].children) {
            current[part].children = []
          }
          // Convert children array to object for easier lookup
          const childObj: { [key: string]: FileTreeNode } = {}
          for (const child of current[part].children!) {
            childObj[child.name] = child
          }
          current = childObj as any

          // Update parent's children array if needed
          const parentNode = root[parts.slice(1, i + 1).join('/')]
          if (parentNode && !parentNode.children?.find(c => c.name === parts[i + 1])) {
            // Will be added in next iteration
          }
        }
      }
    }

    // Convert root object to array and recursively add children
    function buildTree(obj: { [key: string]: FileTreeNode }, basePath: string): FileTreeNode[] {
      const nodes: FileTreeNode[] = []
      for (const key in obj) {
        const node = obj[key]
        nodes.push(node)
      }
      return nodes.sort((a, b) => {
        // Directories first, then by name
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    }

    // Simpler tree building - just return flat list with paths that frontend can parse
    const files = results.map(row => ({
      path: row.path,
      entityCount: typeof row.entityCount === 'object' ? row.entityCount.low : row.entityCount,
    }))

    res.json({
      files,
      count: files.length,
      project: projectName || 'all',
    })
  } catch (error) {
    console.error('Error fetching files:', error)
    res.status(500).json({ error: 'Failed to fetch files', details: (error as Error).message })
  }
})

// GET /api/docgraph/class-hierarchy/:uuid - Get class with inheritance info
docgraphRouter.get('/class-hierarchy/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params

    const query = `
      MATCH (c:Class {uuid: $uuid})
      OPTIONAL MATCH (c)-[:EXTENDS]->(parent:Class)
      OPTIONAL MATCH (c)-[:IMPLEMENTS]->(interface:Class)
      OPTIONAL MATCH (child:Class)-[:EXTENDS]->(c)
      OPTIONAL MATCH (c)-[:DEFINES]->(method:Function)
      WITH c, parent,
           collect(DISTINCT {uuid: interface.uuid, name: interface.name, qualified_name: interface.qualified_name}) as interfaces,
           collect(DISTINCT {uuid: child.uuid, name: child.name, qualified_name: child.qualified_name}) as children,
           collect(DISTINCT {
             uuid: method.uuid,
             name: method.name,
             signature: method.signature,
             is_async: method.is_async,
             is_static: method.is_static,
             visibility: method.visibility,
             line_start: method.line_start
           }) as methods
      RETURN c.uuid as uuid,
             c.name as name,
             c.qualified_name as qualified_name,
             c.file_path as file_path,
             c.line_start as line_start,
             c.line_end as line_end,
             c.docstring as docstring,
             CASE WHEN parent IS NOT NULL
                  THEN {uuid: parent.uuid, name: parent.name, qualified_name: parent.qualified_name}
                  ELSE null END as parent,
             [i IN interfaces WHERE i.uuid IS NOT NULL] as interfaces,
             [ch IN children WHERE ch.uuid IS NOT NULL] as children,
             [m IN methods WHERE m.uuid IS NOT NULL | {
               uuid: m.uuid,
               name: m.name,
               signature: m.signature,
               is_async: COALESCE(m.is_async, false),
               is_static: COALESCE(m.is_static, false),
               visibility: COALESCE(m.visibility, 'public'),
               line_start: m.line_start
             }] as methods
    `

    const results = await runQuery<{
      uuid: string
      name: string
      qualified_name: string
      file_path: string
      line_start: number | { low: number }
      line_end: number | { low: number }
      docstring: string
      parent: { uuid: string; name: string; qualified_name: string } | null
      interfaces: Array<{ uuid: string; name: string; qualified_name: string }>
      children: Array<{ uuid: string; name: string; qualified_name: string }>
      methods: Array<{
        uuid: string
        name: string
        signature: string
        is_async: boolean
        is_static: boolean
        visibility: string
        line_start: number | { low: number }
      }>
    }>(query, { uuid })

    if (results.length === 0) {
      return res.status(404).json({ error: 'Class not found' })
    }

    const row = results[0]

    res.json({
      class: {
        uuid: row.uuid,
        name: row.name,
        qualified_name: row.qualified_name,
        file_path: row.file_path,
        line_start: typeof row.line_start === 'object' ? row.line_start.low : row.line_start,
        line_end: typeof row.line_end === 'object' ? row.line_end.low : row.line_end,
        docstring: row.docstring,
      },
      parent: row.parent,
      interfaces: row.interfaces,
      children: row.children,
      methods: row.methods.map(m => ({
        ...m,
        line_start: typeof m.line_start === 'object' ? (m.line_start as any).low : m.line_start,
      })),
    })
  } catch (error) {
    console.error('Error fetching class hierarchy:', error)
    res.status(500).json({ error: 'Failed to fetch class hierarchy', details: (error as Error).message })
  }
})

// GET /api/docgraph/graph/sample - Get a sample of the graph for exploration
// NOTE: This route MUST be before /graph/:uuid to avoid matching "sample" as a uuid
docgraphRouter.get('/graph/sample', async (req, res) => {
  try {
    const limit = neo4j.int(parseInt(req.query.limit as string) || 100)
    const entityType = req.query.type as string || 'function'
    const projectFilter = req.query.project as string | undefined

    // Get project root paths for mapping
    const projectsQuery = `
      MATCH (p:Project)
      WHERE p.root_path IS NOT NULL
      RETURN collect({ name: p.name, root_path: p.root_path }) as projects
    `
    const projectsResult = await runQuery<{ projects: Array<{ name: string; root_path: string }> }>(projectsQuery)
    const projectRoots = (projectsResult[0]?.projects || [])
      .sort((a, b) => (b.root_path?.length || 0) - (a.root_path?.length || 0))

    const deriveProject = (filePath: string | null): string | null => {
      if (!filePath) return null
      for (const proj of projectRoots) {
        if (proj.root_path && filePath.startsWith(proj.root_path)) {
          return proj.name
        }
      }
      return null
    }

    const projectPathFilter = projectFilter
      ? projectRoots.find(p => p.name === projectFilter)?.root_path
      : undefined

    let nodes: Array<{
      id: string
      name: string
      type: string
      file_path: string
      qualified_name: string
      project: string | null
      degree: number
    }> = []
    let edges: Array<{ source: string; target: string; type: string }> = []

    if (entityType === 'class') {
      // For classes, get classes with their methods, inheritance, and file/directory groupings
      const whereClause = projectPathFilter
        ? `WHERE c.file_path STARTS WITH $projectPath`
        : ''

      // Get most connected classes (by number of methods they define)
      const classQuery = `
        MATCH (c:Class)-[r:DEFINES]->(m:Function)
        ${whereClause}
        WITH c, count(r) as methodCount
        ORDER BY methodCount DESC
        LIMIT $limit
        WITH collect(c) as classes
        UNWIND classes as c
        OPTIONAL MATCH (c)-[:DEFINES]->(m:Function)
        OPTIONAL MATCH (c)-[:EXTENDS]->(parent:Class)
        OPTIONAL MATCH (child:Class)-[:EXTENDS]->(c)
        OPTIONAL MATCH (f:File)-[:CONTAINS]->(c)
        WITH c, collect(DISTINCT m)[0..8] as methods, parent,
             collect(DISTINCT child)[0..3] as children,
             f
        RETURN c.uuid as classId, c.name as className, c.qualified_name as classQualified,
               c.file_path as classPath,
               [m IN methods | {id: m.uuid, name: m.name, qualified_name: m.qualified_name, file_path: m.file_path}] as methods,
               CASE WHEN parent IS NOT NULL THEN {id: parent.uuid, name: parent.name, qualified_name: parent.qualified_name, file_path: parent.file_path} ELSE null END as parent,
               [ch IN children | {id: ch.uuid, name: ch.name, qualified_name: ch.qualified_name, file_path: ch.file_path}] as children,
               CASE WHEN f IS NOT NULL THEN {id: f.uuid, path: f.path} ELSE null END as file
      `

      const results = await runQuery<{
        classId: string
        className: string
        classQualified: string
        classPath: string
        methods: Array<{ id: string; name: string; qualified_name: string; file_path: string }>
        parent: { id: string; name: string; qualified_name: string; file_path: string } | null
        children: Array<{ id: string; name: string; qualified_name: string; file_path: string }>
        file: { id: string; path: string } | null
      }>(classQuery, { limit, projectPath: projectPathFilter })

      const seenIds = new Set<string>()
      const seenEdges = new Set<string>()
      const directoryNodes = new Map<string, { id: string; name: string; path: string; parentPath: string | null }>()

      // Helper to create directory hierarchy from a file path
      const addDirectoryHierarchy = (filePath: string, fileId: string) => {
        if (!filePath) return

        const parts = filePath.split('/').filter(Boolean)
        if (parts.length <= 1) return

        // Remove filename to get directory parts
        const dirParts = parts.slice(0, -1)

        // Determine base depth to start showing directories (show last 3 levels max)
        const startIdx = Math.max(0, dirParts.length - 3)

        let parentPath: string | null = null

        for (let i = startIdx; i < dirParts.length; i++) {
          const dirPath = '/' + dirParts.slice(0, i + 1).join('/')
          const dirName = dirParts[i]!

          if (!directoryNodes.has(dirPath)) {
            // Create a stable ID from the path
            const dirId = `dir:${dirPath}`
            directoryNodes.set(dirPath, {
              id: dirId,
              name: dirName,
              path: dirPath,
              parentPath: i > startIdx ? '/' + dirParts.slice(0, i).join('/') : null,
            })
          }

          parentPath = dirPath
        }

        // Return the immediate parent directory path for this file
        return parentPath
      }

      // First pass: collect all file paths and build directory hierarchy
      const fileToParentDir = new Map<string, string>()

      for (const row of results) {
        if (row.file?.path) {
          const parentDirPath = addDirectoryHierarchy(row.file.path, row.file.id)
          if (parentDirPath) {
            fileToParentDir.set(row.file.id, parentDirPath)
          }
        }
      }

      // Add directory nodes
      for (const [dirPath, dir] of directoryNodes) {
        if (!seenIds.has(dir.id)) {
          seenIds.add(dir.id)
          nodes.push({
            id: dir.id,
            name: dir.name + '/',
            type: 'directory',
            file_path: dir.path,
            qualified_name: dir.path,
            project: deriveProject(dir.path),
            degree: 1,
          })
        }

        // Add edge from parent directory to this directory
        if (dir.parentPath) {
          const parentDir = directoryNodes.get(dir.parentPath)
          if (parentDir) {
            const edgeKey = `${parentDir.id}->${dir.id}`
            if (!seenEdges.has(edgeKey)) {
              seenEdges.add(edgeKey)
              edges.push({ source: parentDir.id, target: dir.id, type: 'CONTAINS' })
            }
          }
        }
      }

      for (const row of results) {
        // Add class node
        if (!seenIds.has(row.classId)) {
          seenIds.add(row.classId)
          nodes.push({
            id: row.classId,
            name: row.className,
            type: 'class',
            file_path: row.classPath,
            qualified_name: row.classQualified,
            project: deriveProject(row.classPath),
            degree: row.methods.length,
          })
        }

        // Add file node and connect to parent directory
        if (row.file) {
          if (!seenIds.has(row.file.id)) {
            seenIds.add(row.file.id)
            const fileName = row.file.path.split('/').pop() || row.file.path
            nodes.push({
              id: row.file.id,
              name: fileName,
              type: 'file',
              file_path: row.file.path,
              qualified_name: row.file.path,
              project: deriveProject(row.file.path),
              degree: 1,
            })

            // Connect file to its parent directory
            const parentDirPath = fileToParentDir.get(row.file.id)
            if (parentDirPath) {
              const parentDir = directoryNodes.get(parentDirPath)
              if (parentDir) {
                const edgeKey = `${parentDir.id}->${row.file.id}`
                if (!seenEdges.has(edgeKey)) {
                  seenEdges.add(edgeKey)
                  edges.push({ source: parentDir.id, target: row.file.id, type: 'CONTAINS' })
                }
              }
            }
          }

          // Add CONTAINS edge from file to class
          const containsKey = `${row.file.id}->${row.classId}`
          if (!seenEdges.has(containsKey)) {
            seenEdges.add(containsKey)
            edges.push({ source: row.file.id, target: row.classId, type: 'CONTAINS' })
          }
        }

        // Add method nodes and DEFINES edges
        for (const method of row.methods) {
          if (!seenIds.has(method.id)) {
            seenIds.add(method.id)
            nodes.push({
              id: method.id,
              name: method.name,
              type: 'function',
              file_path: method.file_path,
              qualified_name: method.qualified_name,
              project: deriveProject(method.file_path),
              degree: 1,
            })
          }
          const definesKey = `${row.classId}->${method.id}`
          if (!seenEdges.has(definesKey)) {
            seenEdges.add(definesKey)
            edges.push({ source: row.classId, target: method.id, type: 'DEFINES' })
          }
        }

        // Add parent class and EXTENDS edge
        if (row.parent) {
          if (!seenIds.has(row.parent.id)) {
            seenIds.add(row.parent.id)
            nodes.push({
              id: row.parent.id,
              name: row.parent.name,
              type: 'class',
              file_path: row.parent.file_path,
              qualified_name: row.parent.qualified_name,
              project: deriveProject(row.parent.file_path),
              degree: 1,
            })
          }
          const extendsKey = `${row.classId}->${row.parent.id}`
          if (!seenEdges.has(extendsKey)) {
            seenEdges.add(extendsKey)
            edges.push({ source: row.classId, target: row.parent.id, type: 'EXTENDS' })
          }
        }

        // Add child classes and EXTENDS edges
        for (const child of row.children) {
          if (!seenIds.has(child.id)) {
            seenIds.add(child.id)
            nodes.push({
              id: child.id,
              name: child.name,
              type: 'class',
              file_path: child.file_path,
              qualified_name: child.qualified_name,
              project: deriveProject(child.file_path),
              degree: 1,
            })
          }
          const extendsKey = `${child.id}->${row.classId}`
          if (!seenEdges.has(extendsKey)) {
            seenEdges.add(extendsKey)
            edges.push({ source: child.id, target: row.classId, type: 'EXTENDS' })
          }
        }
      }
    } else {
      // Original logic for functions and documents
      const nodeLabel = entityType === 'document' ? 'Document' : 'Function'
      const relationshipTypes = entityType === 'document' ? 'REFERENCES|DOCUMENTS' : 'CALLS|DOCUMENTS'

      const whereClause = projectPathFilter
        ? `WHERE COALESCE(n.file_path, n.path) STARTS WITH $projectPath`
        : ''

      const nameExpression = entityType === 'document'
        ? `COALESCE(n.title, CASE WHEN n.path CONTAINS '/' THEN split(n.path, '/')[-1] ELSE n.path END)`
        : 'n.name'

      const query = `
        MATCH (n:${nodeLabel})-[r:${relationshipTypes}]-()
        ${whereClause}
        WITH n, count(r) as degree
        ORDER BY degree DESC
        LIMIT $limit
        RETURN collect({
          id: n.uuid,
          name: ${nameExpression},
          type: '${entityType}',
          file_path: COALESCE(n.file_path, n.path),
          qualified_name: n.qualified_name,
          project: n.project,
          degree: degree
        }) as nodes
      `

      const nodeResults = await runQuery<{ nodes: Array<{
        id: string
        name: string
        type: string
        file_path: string
        qualified_name: string
        project: string | null
        degree: number
      }> }>(query, { limit, projectPath: projectPathFilter })

      const rawNodes = nodeResults[0]?.nodes || []
      nodes = rawNodes.map(n => ({
        ...n,
        project: n.project || deriveProject(n.file_path),
      }))

      const nodeIds = nodes.map(n => n.id)

      const edgeQuery = `
        MATCH (a)-[r:${relationshipTypes}]->(b)
        WHERE a.uuid IN $nodeIds AND b.uuid IN $nodeIds
        RETURN collect(DISTINCT {
          source: a.uuid,
          target: b.uuid,
          type: type(r)
        }) as edges
      `

      const edgeResults = await runQuery<{ edges: Array<{
        source: string
        target: string
        type: string
      }> }>(edgeQuery, { nodeIds })

      edges = edgeResults[0]?.edges || []
    }

    res.json({
      nodes,
      edges,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    })
  } catch (error) {
    console.error('Error fetching sample graph:', error)
    res.status(500).json({ error: 'Failed to fetch sample graph', details: (error as Error).message })
  }
})

// GET /api/docgraph/graph/:uuid - Get graph data centered on an entity
docgraphRouter.get('/graph/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params
    const depth = Math.min(parseInt(req.query.depth as string) || 2, 3)
    const limit = neo4j.int(parseInt(req.query.limit as string) || 50)
    // Allow filtering by relationship types
    const relTypes = (req.query.relTypes as string) || 'CALLS|DOCUMENTS|EXTENDS|IMPLEMENTS|DEFINES|CONTAINS'

    // Get the center node and its relationships
    const query = `
      MATCH (center {uuid: $uuid})
      OPTIONAL MATCH path = (center)-[r:${relTypes}*1..${depth}]-(related)
      WHERE related:Function OR related:Class OR related:Document OR related:File
      WITH center, collect(DISTINCT related) as relatedNodes
      UNWIND (relatedNodes + [center]) as node
      WITH DISTINCT node
      LIMIT $limit
      RETURN collect(DISTINCT {
        id: node.uuid,
        name: COALESCE(node.name, node.title, split(node.path, '/')[-1]),
        type: CASE
          WHEN node:Function THEN 'function'
          WHEN node:Class THEN 'class'
          WHEN node:Document THEN 'document'
          WHEN node:File THEN 'file'
          ELSE 'unknown'
        END,
        file_path: COALESCE(node.file_path, node.path),
        qualified_name: node.qualified_name,
        signature: node.signature,
        is_async: node.is_async,
        visibility: node.visibility
      }) as nodes
    `

    const nodeResults = await runQuery<{ nodes: Array<{
      id: string
      name: string
      type: string
      file_path: string
      qualified_name: string
      signature: string
      is_async: boolean
      visibility: string
    }> }>(query, { uuid, limit })

    // Get edges separately for better control - include all relationship types
    const edgeQuery = `
      MATCH (center {uuid: $uuid})
      MATCH (center)-[r:${relTypes}*1..${depth}]-(related)
      WHERE related:Function OR related:Class OR related:Document OR related:File
      WITH DISTINCT startNode(r[0]) as source, endNode(r[0]) as target, type(r[0]) as relType
      RETURN collect(DISTINCT {
        source: source.uuid,
        target: target.uuid,
        type: relType
      }) as edges
    `

    const edgeResults = await runQuery<{ edges: Array<{
      source: string
      target: string
      type: string
    }> }>(edgeQuery, { uuid })

    const nodes = nodeResults[0]?.nodes || []
    const edges = edgeResults[0]?.edges || []

    res.json({
      centerNode: uuid,
      nodes,
      edges,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    })
  } catch (error) {
    console.error('Error fetching graph:', error)
    res.status(500).json({ error: 'Failed to fetch graph data', details: (error as Error).message })
  }
})
