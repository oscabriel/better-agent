import {
	createThinkspaceRuntimeToolSet,
	createThinkspaceRuntimeTurnConfig,
	THINKSPACE_RUNTIME_POLICY,
} from "@better-agent/api/thinkspaces/runtime-policy";
import { Think } from "@cloudflare/think";
import type { LanguageModel, ToolSet } from "ai";

export class ThinkspaceAgent extends Think {
	private readonly modelReadinessErrorMessage =
		"Thinkspace Agent model execution is deferred until model readiness is implemented.";
	private readonly runtimeToolSet: ToolSet = createThinkspaceRuntimeToolSet();

	override maxSteps = THINKSPACE_RUNTIME_POLICY.maxSteps;
	override workspaceBash = THINKSPACE_RUNTIME_POLICY.workspaceBash;

	override getModel(): LanguageModel {
		throw new Error(this.modelReadinessErrorMessage);
	}

	override getTools(): ToolSet {
		return this.runtimeToolSet;
	}

	override beforeTurn() {
		return {
			...createThinkspaceRuntimeTurnConfig(),
			maxSteps: this.maxSteps,
		};
	}
}
