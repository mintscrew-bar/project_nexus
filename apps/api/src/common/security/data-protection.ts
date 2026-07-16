import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "crypto";

function decodeKey(value: string | undefined, name: string): Buffer {
  if (!value) throw new Error(`${name} is required`);
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error(`${name} must decode to 32 bytes`);
  return key;
}

export function encryptSensitive(value: string): string {
  const key = decodeKey(process.env.DATA_ENCRYPTION_KEY, "DATA_ENCRYPTION_KEY");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "enc:v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSensitive(value: string): string {
  const [prefix, iv, tag, ciphertext] = value.split(".");
  if (prefix !== "enc:v1" || !iv || !tag || !ciphertext) {
    throw new Error("Invalid encrypted value");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    decodeKey(process.env.DATA_ENCRYPTION_KEY, "DATA_ENCRYPTION_KEY"),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function sensitiveLookup(value: string): string {
  const key = decodeKey(
    process.env.DATA_LOOKUP_HMAC_KEY,
    "DATA_LOOKUP_HMAC_KEY",
  );
  return createHmac("sha256", key)
    .update(value.trim().toLowerCase())
    .digest("base64url");
}
