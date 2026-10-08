/**
 * Déchiffrement du vault FortuneMemory (AES-256-GCM, node:crypto).
 * Format : "gcm1:" + base64(nonce12 || ciphertext || tag16)
 * Compatible avec clone/.opencode/plugins/vault-crypto.ts (WebCrypto).
 * Lignes legacy sans préfixe = clair (migration glissante).
 */
import { createDecipheriv } from "node:crypto";

export const VAULT_PREFIX = "gcm1:";

export function loadVaultKey(env = process.env): Buffer {
	const hex = (env.FORTUNE_VAULT_KEY || "").trim();
	if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
		throw new Error(
			"FORTUNE_VAULT_KEY manquante ou invalide (64 caractères hex attendus).",
		);
	}
	return Buffer.from(hex, "hex");
}

export function vaultDecrypt(
	key: Buffer,
	stored: string | null | undefined,
): string {
	const text = stored ?? "";
	if (!text.startsWith(VAULT_PREFIX)) return text; // legacy clair
	const buf = Buffer.from(text.slice(VAULT_PREFIX.length), "base64");
	const iv = buf.subarray(0, 12);
	const tag = buf.subarray(buf.length - 16);
	const ct = buf.subarray(12, buf.length - 16);
	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
		"utf8",
	);
}
