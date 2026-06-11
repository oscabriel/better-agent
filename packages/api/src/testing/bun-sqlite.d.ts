/**
 * Minimal ambient declaration for `bun:sqlite`, which the test runtime (bun)
 * provides but the compilation's type roots (node, workers-types) do not.
 * Only the surface the test-support database helper touches is declared.
 */
declare module "bun:sqlite" {
	export class Database {
		constructor(filename?: string);
		close(): void;
		exec(sql: string): void;
	}
}
