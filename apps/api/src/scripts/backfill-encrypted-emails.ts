import { PrismaClient } from "@nexus/database";
import { createCipheriv, createHmac, randomBytes } from "crypto";

const prisma = new PrismaClient();

function readKey(name: string): Buffer {
  const value = process.env[name];
  const key = value ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (key.length !== 32)
    throw new Error(`${name} must be a 32-byte base64 value`);
  return key;
}

const encryptionKey = readKey("DATA_ENCRYPTION_KEY");
const lookupKey = readKey("DATA_LOOKUP_HMAC_KEY");

function lookup(value: string): string {
  return createHmac("sha256", lookupKey)
    .update(value.trim().toLowerCase())
    .digest("base64url");
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
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

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { not: null } },
    select: { id: true, email: true },
  });

  for (const user of users) {
    const email = user.email!;
    const emailLookupHash = lookup(email);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { email: null, emailEncrypted: encrypt(email), emailLookupHash },
      }),
      prisma.authProvider.updateMany({
        where: { userId: user.id, provider: "EMAIL", providerId: email },
        data: { providerId: emailLookupHash },
      }),
    ]);
  }

  console.log(
    `Encrypted and removed plaintext email for ${users.length} user(s).`,
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error("Email encryption backfill failed:", error);
    process.exitCode = 1;
  });
