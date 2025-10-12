export interface ModelDefinition {
	id: string;
	name: string;
	provider: string;
	description: string;
	access: "free" | "byok";
	capabilities: string[];
	contextWindow: number;
	maxOutputTokens?: number;
	costPer1MTokens?: {
		input: number;
		output: number;
	};
}

export const DEFAULT_MODEL_ID = "google:gemini-2.5-flash-lite";
