const fs = require('fs');

let content = fs.readFileSync('D:/AegisLedger_v4_Complete/AegisLedger/services/scheduler-service/src/index.js', 'utf8');

// Add Redis
content = content.replace(/const { Kafka } = require\("kafkajs"\);/, 'const { Kafka } = require("kafkajs");\nconst Redis = require("ioredis");');
content = content.replace(/const app = express\(\);/, 'const app = express();\nconst redis = new Redis(process.env.REDIS_URL);');

// Add withLock
const withLockStr = `
// Redis SET NX PX provides automatic TTL expiry as a crash recovery mechanism
// — if the process dies mid-job the lock expires naturally
async function withLock(redisClient, lockKey, ttlMs, fn) {
  const acquired = await redisClient.set(lockKey, '1', 'NX', 'PX', ttlMs);
  if (!acquired) {
    console.log('Skipped job ' + lockKey + ' — another instance holds the lock');
    return;
  }
  try {
    await fn();
  } finally {
    await redisClient.del(lockKey);
  }
}
`;
content = content.replace(/\/\/ ─── RECURRING PAYMENTS/, withLockStr + '\n// ─── RECURRING PAYMENTS');

// Update cron jobs
const cron1 = `cron.schedule("*/5 * * * *", () => withLock(redis, 'lock:recurring-payments', 4 * 60 * 1000, async () => {`;
content = content.replace(/cron\.schedule\("\*\/5 \* \* \* \*", async \(\) => {/, cron1);
content = content.replace(/\n\}\);\n\n\/\/ ─── APPROVAL MATRIX/, '\n}));\n\n// ─── APPROVAL MATRIX'); // Add extra parenthesis

const cron2 = `cron.schedule("0 8 * * *", () => withLock(redis, 'lock:kyb-renewal', 23 * 60 * 60 * 1000, async () => {`;
content = content.replace(/cron\.schedule\("0 8 \* \* \*", async \(\) => {/, cron2);
content = content.replace(/\n\}\);\n\n\/\/ Document expiry alerts/, '\n}));\n\n// Document expiry alerts');

const cron3 = `cron.schedule("0 9 * * *", () => withLock(redis, 'lock:doc-expiry', 23 * 60 * 60 * 1000, async () => {`;
content = content.replace(/cron\.schedule\("0 9 \* \* \*", async \(\) => {/, cron3);
content = content.replace(/\n\}\);\n\nfunction requireAuth/, '\n}));\n\nfunction requireAuth');

fs.writeFileSync('D:/AegisLedger_v4_Complete/AegisLedger/services/scheduler-service/src/index.js', content);
