const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (value: ArrayBuffer | ArrayBufferView): string => {
	const bytes =
		value instanceof ArrayBuffer
			? new Uint8Array(value)
			: new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	return btoa(String.fromCodePoint(...bytes));
};
const fromBase64 = (value: string): Uint8Array =>
	Uint8Array.from(atob(value), (char) => char.codePointAt(0) ?? 0);

const importKey = async (secret: string): Promise<CryptoKey> => {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
	return await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
};

export const encryptCredential = async (credential: string, secret: string): Promise<string> => {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ iv, name: "AES-GCM" },
		await importKey(secret),
		encoder.encode(credential),
	);
	return JSON.stringify({ alg: "AES-GCM", ciphertext: toBase64(ciphertext), iv: toBase64(iv) });
};

export const decryptCredential = async (
	encryptedCredential: string,
	secret: string,
): Promise<string> => {
	const payload = JSON.parse(encryptedCredential) as { iv: string; ciphertext: string };
	const plaintext = await crypto.subtle.decrypt(
		{ iv: fromBase64(payload.iv), name: "AES-GCM" },
		await importKey(secret),
		fromBase64(payload.ciphertext),
	);
	return decoder.decode(plaintext);
};

export const redactCredential = (credential: string): string => {
	if (credential.length <= 8) {
		return "••••";
	}
	return `${credential.slice(0, 4)}…${credential.slice(-4)}`;
};
