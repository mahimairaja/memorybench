import { create, open } from "@memvid/sdk"
import fs from "fs/promises"
import path from "path"
import type {
  Provider,
  ProviderConfig,
  IngestOptions,
  IngestResult,
  SearchOptions,
  IndexingProgressCallback,
} from "../../types/provider"
import type { UnifiedSession } from "../../types/unified"
import { logger } from "../../utils/logger"

const DATA_DIR = path.join(process.cwd(), "data", "memvid")

export class MemVidProvider implements Provider {
  name = "memvid"
  
  // Set lower concurrency since we are operating on local files
  concurrency = {
    default: 50, 
  }

  async initialize(_config: ProviderConfig): Promise<void> {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true })
      logger.info(`Initialized MemVid provider. Data directory: ${DATA_DIR}`)
    } catch (e) {
      logger.error(`Failed to create data directory: ${e}`)
      throw e
    }
  }

  private getFilePath(containerTag: string): string {
    const filename = containerTag.replace(/[^a-z0-9-]/gi, "_") + ".mv2"
    return path.join(DATA_DIR, filename)
  }

  async ingest(sessions: UnifiedSession[], options: IngestOptions): Promise<IngestResult> {
    const filePath = this.getFilePath(options.containerTag)
    
    let mem
    try {
      await fs.access(filePath)
      mem = await open(filePath, "basic", { readOnly: false })
    } catch {
      mem = await create(filePath)
    }

    const documentIds: string[] = []

    try {
        for (const session of sessions) {            
            for (const message of session.messages) {
                const text = `${message.role.toUpperCase()}: ${message.content}`
                
                await mem.put({
                    text,
                    tags: [options.containerTag, session.sessionId],
                    metadata: {
                        sessionId: session.sessionId,
                        role: message.role,
                        timestamp: session.metadata?.date
                    },
                })
                documentIds.push(`${session.sessionId}-${Date.now()}-${Math.random()}`)
            }
        }
        
        await mem.seal()
    } finally {
    }

    return { documentIds }
  }

  async awaitIndexing(
    result: IngestResult,
    _containerTag: string,
    onProgress?: IndexingProgressCallback
  ): Promise<void> {
    onProgress?.({
        completedIds: result.documentIds,
        failedIds: [],
        total: result.documentIds.length
    })
  }

  async search(query: string, options: SearchOptions): Promise<unknown[]> {
    const filePath = this.getFilePath(options.containerTag)
    
    try {
        await fs.access(filePath)
    } catch {
        logger.warn(`Memory file not found for ${options.containerTag}`)
        return []
    }

    const mem = await open(filePath, "basic", { readOnly: true })
    
    const results = await mem.find(query, {
        k: options.limit || 10,
    })

    return results.hits.map((h: any) => ({
        content: h.text,
        score: h.score,
        metadata: h.metadata
    }))
  }

  async clear(containerTag: string): Promise<void> {
    const filePath = this.getFilePath(containerTag)
    try {
        await fs.unlink(filePath)
        logger.info(`Deleted memory file: ${filePath}`)
    } catch (e) {
    }
  }
}

export default MemVidProvider
