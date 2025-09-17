import type { BenchmarkRegistry, BenchmarkType } from "../../benchmarks";
import type { PreparedData, TemplateType } from "../_template";

import { initDatabase } from "./src/db";

await initDatabase();

export default {
	name: "AQRAG",
	addContext: async (data: PreparedData) => {
		// Process context with full type safety for AQRAG
		console.log(`Processing AQRAG context: ${data.context}`);
		console.log(`Metadata:`, data.metadata);
		// Add your AQRAG-specific context processing here
	},

	searchQuery: async (query: string) => {
		// AQRAG search implementation
		return [];
	},

	prepareProvider: <T extends BenchmarkType>(
		benchmarkType: T,
		data: BenchmarkRegistry[T][],
	): PreparedData[] => {
		switch (benchmarkType) {
			case "RAG": {
				const ragData = data as BenchmarkRegistry["RAG"][];
				return ragData.map((item) => ({
					context: `AQRAG Format:\nQuery: ${item.question}\n\nContext Sources:\n${item.documents.map((d, idx) => `[${idx + 1}] ${d.title || `Source ${idx + 1}`}:\n${d.content}`).join("\n\n")}`,
					metadata: {
						benchmarkId: item.id,
						query: item.question,
						expectedResponse: item.expected_answer,
						difficulty: item.metadata.difficulty,
						category: item.metadata.category,
						sources: item.documents.map((d) => ({
							id: d.id,
							title: d.title,
							source: d.source,
						})),
						aqragProcessed: true,
					},
				}));
			}

			default:
				throw new Error(
					`AQRAG provider does not support benchmark type: ${benchmarkType}`,
				);
		}
	},
} satisfies TemplateType;
