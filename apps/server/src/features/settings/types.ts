import { DEFAULT_MODEL_ID } from "../models/types";
import { DEFAULT_ENABLED_MCP_SERVERS } from "../tools/mcp/types";

export type ReasoningEffort = "off" | "low" | "medium" | "high";

export type UserSettingsRecord = {
	selectedModel: string;
	apiKeys: Record<string, string>;
	enabledModels: string[];
	enabledMcpServers: string[];
	webSearchEnabled: boolean;
	reasoningEffort: ReasoningEffort;
	theme: string;
	chatWidth: string;
};

export const DEFAULT_SETTINGS: UserSettingsRecord = {
	selectedModel: DEFAULT_MODEL_ID,
	apiKeys: {},
	enabledModels: [],
	enabledMcpServers: [...DEFAULT_ENABLED_MCP_SERVERS],
	webSearchEnabled: false,
	reasoningEffort: "medium",
	theme: "system",
	chatWidth: "cozy",
};
