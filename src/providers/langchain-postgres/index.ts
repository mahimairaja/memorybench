import { PGVectorStore } from "@langchain/community/vectorstores/pgvector"
import { OpenAIEmbeddings } from "@langchain/openai"
import { Document } from "@langchain/core/documents"
import pg from "pg"
import type { Provider, ProviderConfig, IngestOptions, IngestResult, SearchOptions } from "../../types/provider"
import type { UnifiedSession } from "../../types/unified"
import { logger } from "../../utils/logger"

export class LangChainPostgresProvider implements Provider {
    name = "langchain-postgres"
    private vectorStore: PGVectorStore | null = null
    private pgPool: pg.Pool | null = null

    async initialize(config: ProviderConfig): Promise<void> {
        const postgresUrl = config.postgresUrl as string | undefined

        if (!postgresUrl) {
            throw new Error("POSTGRES_URL is required for langchain-postgres provider")
        }

        const poolConfig = {
            connectionString: postgresUrl,
        }

        this.pgPool = new pg.Pool(poolConfig)
        
        const embeddings = new OpenAIEmbeddings({
            apiKey: config.apiKey, // Uses config.openaiApiKey set in utils/config.ts
            batchSize: 512,
            model: "text-embedding-3-small", 
        })

        const configPg = {
            postgresConnectionOptions: {
                ...poolConfig,
            },
            tableName: "memorybench_embeddings",
            columns: {
                idColumnName: "id",
                vectorColumnName: "vector",
                contentColumnName: "content",
                metadataColumnName: "metadata",
            },
        }

        this.vectorStore = await PGVectorStore.initialize(embeddings, configPg)

        logger.info(`Initialized LangChain Postgres provider`)
    }

    async ingest(sessions: UnifiedSession[], options: IngestOptions): Promise<IngestResult> {
        if (!this.vectorStore) throw new Error("Provider not initialized")

        const documents: Document[] = []
        const documentIds: string[] = []

        for (const session of sessions) {
            const sessionStr = JSON.stringify(session.messages)
            
            const formattedDate = session.metadata?.formattedDate as string
            const isoDate = session.metadata?.date as string
            
            const content = formattedDate
                ? `Date: ${formattedDate}\n\n${sessionStr}`
                : sessionStr

            const metadata = {
                sessionId: session.sessionId,
                containerTag: options.containerTag, // Important for clearing later
                ...(isoDate ? { date: isoDate } : {}),
                ...options.metadata
            }

            documents.push(new Document({
                pageContent: content,
                metadata,
            }))
            
            // We don't get IDs back immediately from addDocuments in all implementations effortlessly, 
            // but we can assume success or generate them if validation is needed. 
            // For now, we'll just track that we attempted it.
            documentIds.push(session.sessionId) 
        }

        await this.vectorStore.addDocuments(documents)
        logger.debug(`Ingested ${documents.length} sessions`)

        return { documentIds }
    }

    async awaitIndexing(_result: IngestResult, _containerTag: string): Promise<void> {
        // PGVector with LangChain is synchronous/immediate consistency for our purposes
        // generally, so no specific wait time needed besides the await above.
        // We add a small delay just in case of any replication lag if applicable, but usually 0 is fine.
        return
    }

    async search(query: string, options: SearchOptions): Promise<unknown[]> {
        if (!this.vectorStore) throw new Error("Provider not initialized")

        // Filter by containerTag to ensure we only search within the specific benchmark run
        const filter = {
            containerTag: options.containerTag
        }

        const results = await this.vectorStore.similaritySearch(query, options.limit || 10, filter)

        return results.map(doc => ({
            content: doc.pageContent,
            metadata: doc.metadata,
        }))
    }

    async clear(containerTag: string): Promise<void> {
        if (!this.pgPool) throw new Error("Provider not initialized")
        
        // LangChain PGVector doesn't have a simple "delete by metadata" method exposed easily in all versions,
        // so we use raw SQL for efficiency and correctness.
        const tableName = "memorybench_embeddings"
        
        try {
            await this.pgPool.query(
                `DELETE FROM ${tableName} WHERE metadata->>'containerTag' = $1`,
                [containerTag]
            )
            logger.info(`Cleared data for containerTag: ${containerTag}`)
        } catch (error) {
            logger.error(`Error clearing data for ${containerTag}:`, { error })
            throw error
        }
    }
}

export default LangChainPostgresProvider
