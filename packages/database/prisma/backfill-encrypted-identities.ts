import { PrismaClient } from "@prisma/client";
import { createCipheriv, createHmac, randomBytes } from "crypto";

const prisma = new PrismaClient();

function key(name: string) {
  const value = process.env[name];
  const decoded = value ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (decoded.length !== 32) throw new Error(`${name} must be a 32-byte base64 value`);
  return decoded;
}

const encryptionKey = key("DATA_ENCRYPTION_KEY");
const lookupKey = key("DATA_LOOKUP_HMAC_KEY");

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["enc:v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function lookup(value: string) {
  return createHmac("sha256", lookupKey).update(value.trim().toLowerCase()).digest("base64url");
}

async function main() {
  const users = await prisma.user.findMany({ where: { email: { not: null }, emailEncrypted: null }, select: { id: true, email: true } });
  for (const user of users) {
    await prisma.user.update({ where: { id: user.id }, data: { emailEncrypted: encrypt(user.email!), emailLookupHash: lookup(user.email!) } });
  }

  const providers = await prisma.authProvider.findMany({ where: { providerIdEncrypted: null }, select: { id: true, provider: true, providerId: true } });
  for (const provider of providers) {
    await prisma.authProvider.update({ where: { id: provider.id }, data: { providerIdEncrypted: encrypt(provider.providerId), providerLookupHash: lookup(`${provider.provider}:${provider.providerId}`) } });
  }

  const accounts = await prisma.riotAccount.findMany({ where: { puuidEncrypted: null }, select: { id: true, puuid: true, summonerId: true } });
  for (const account of accounts) {
    await prisma.riotAccount.update({ where: { id: account.id }, data: { puuidEncrypted: encrypt(account.puuid), puuidLookupHash: lookup(account.puuid), summonerIdEncrypted: account.summonerId ? encrypt(account.summonerId) : null } });
  }

  console.log(`Backfilled ${users.length} emails, ${providers.length} provider IDs, ${accounts.length} Riot accounts.`);
}

main().finally(() => prisma.$disconnect());
