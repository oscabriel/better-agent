import { Think } from "@cloudflare/think";
import type { LanguageModel, ToolSet } from "ai";

export class ThinkspaceAgent extends Think {
	private readonly modelReadinessErrorMessage =
		"Thinkspace Agent model execution is deferred until model readiness is implemented.";
	private readonly runtimeToolSet: ToolSet = {};

	override maxSteps = 1;
	override workspaceBash = false;

	override getModel(): LanguageModel {
		throw new Error(this.modelReadinessErrorMessage);
	}

	override getTools(): ToolSet {
		return this.runtimeToolSet;
	}

	override beforeTurn() {
		return {
			activeTools: [],
			maxSteps: this.maxSteps,
		};
	}
}
