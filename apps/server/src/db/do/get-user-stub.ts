import type { UserDurableObject } from "./user-durable-object";

export function getUserDOStub(
	env: Env,
	userId: string,
): DurableObjectStub<UserDurableObject> {
	const id = env.USER_DO.idFromName(userId);
	// @ts-expect-error - Cloudflare Workers type instantiation limitation
	return env.USER_DO.get(id) as DurableObjectStub<UserDurableObject>;
}
