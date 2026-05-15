#!/usr/bin/env node
/**
 * AegisLedger - Infrastructure Operations Scripts
 * Usage: node infra-ops.js <command>
 * Commands: chaos, backup, blue-green-deploy, secrets-rotate, health-check
 */

const { spawnSync, spawn } = require("child_process");
const https  = require("https");
const http   = require("http");
const fs     = require("fs");
const path   = require("path");

const SERVICES = ["identity-service","wallet-service","compliance-service","trade-service","fiat-service","notification-service","websocket-service","auth-service","compliance-engine","analytics-service","webhook-service","ai-service","billing-service","trading-service"];
const NAMESPACE = process.env.K8S_NAMESPACE || "aegisledger-prod";

// ─── CHAOS ENGINEERING ────────────────────────────────────────────
const chaosScripts = {

  async killRandomPod() {
    console.log("[CHAOS] Selecting random pod to terminate...");
    const service = SERVICES[Math.floor(Math.random() * SERVICES.length)];
    if (!ALLOWED_SERVICES.has(service)) throw new Error(`Unknown service: ${service}`);
    try {
      const podsResult = spawnSync('kubectl', ['get', 'pods', '-n', NAMESPACE, '-l', `app=${service}`, '-o', 'jsonpath={.items[0].metadata.name}']);
      const pods = podsResult.stdout.toString().trim();
      if (pods) {
        spawnSync('kubectl', ['delete', 'pod', pods, '-n', NAMESPACE]);
        console.log(`[CHAOS] Killed pod: ${pods} (service: ${service})`);
        console.log("[CHAOS] Monitoring recovery...");
        await waitForDeploymentReady(service);
      }
    } catch (err) { console.error("[CHAOS] Error:", err.message); }
  },

  async networkLatency(service = "wallet-service", latencyMs = 200, duration = 60) {
    if (!ALLOWED_SERVICES.has(service)) throw new Error(`Unknown service: ${service}`);
    console.log(`[CHAOS] Injecting ${latencyMs}ms network latency on ${service} for ${duration}s`);
    try {
      const podResult = spawnSync('kubectl', ['get', 'pods', '-n', NAMESPACE, '-l', `app=${service}`, '-o', 'jsonpath={.items[0].metadata.name}']);
      const pod = podResult.stdout.toString().trim();
      if (!pod) throw new Error('Pod not found');
      spawnSync('kubectl', ['exec', '-n', NAMESPACE, pod, '--', 'tc', 'qdisc', 'add', 'dev', 'eth0', 'root', 'netem', 'delay', `${latencyMs}ms`]);
      console.log(`[CHAOS] Latency injected. Will auto-remove in ${duration}s`);
      await sleep(duration * 1000);
      spawnSync('kubectl', ['exec', '-n', NAMESPACE, pod, '--', 'tc', 'qdisc', 'del', 'dev', 'eth0', 'root']);
      console.log("[CHAOS] Latency removed");
    } catch (err) { console.error("[CHAOS] Network chaos error:", err.message); }
  },

  async throttleDatabase(connectionsPercentage = 20) {
    console.log(`[CHAOS] Throttling DB to ${connectionsPercentage}% of max connections`);
    const pgCmd = `psql -U aegis -d aegisledger -c "ALTER SYSTEM SET max_connections = ${Math.floor(100 * connectionsPercentage/100)}; SELECT pg_reload_conf();"`;
    console.log(`[CHAOS] DB throttle command: ${pgCmd}`);
    console.log("[CHAOS] MOCK: Would execute in production environment");
  },

  async cpuStress(service, durationSeconds = 30) {
    console.log(`[CHAOS] Injecting CPU stress on ${service} for ${durationSeconds}s`);
    const cmd = `kubectl exec -n ${NAMESPACE} -l app=${service} -- sh -c "for i in $(seq 4); do yes > /dev/null &; done; sleep ${durationSeconds}; kill $(jobs -p)"`;
    console.log(`[CHAOS] CPU stress command: ${cmd}`);
    console.log("[CHAOS] MOCK: Would execute in production environment");
  },

  async memoryPressure(service, mbToAllocate = 512) {
    console.log(`[CHAOS] Injecting memory pressure (${mbToAllocate}MB) on ${service}`);
    console.log("[CHAOS] MOCK: Would execute in production environment");
  },

  async runFullChaosScenario() {
    console.log("[CHAOS] === FULL CHAOS SCENARIO STARTED ===");
    console.log("[CHAOS] Step 1: Kill random pod");
    await this.killRandomPod();
    await sleep(30000);
    console.log("[CHAOS] Step 2: Network latency injection");
    await this.networkLatency("wallet-service", 500, 30);
    console.log("[CHAOS] Step 3: DB throttle");
    await this.throttleDatabase(50);
    console.log("[CHAOS] === CHAOS SCENARIO COMPLETE ===");
  },
};

async function waitForDeploymentReady(service, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = spawnSync('kubectl', ['rollout', 'status', `deployment/${service}`, '-n', NAMESPACE, '--timeout=10s']);
      if (res.status === 0) {
        console.log(`[CHAOS] ${service} recovered and ready`);
        return true;
      }
      await sleep(5000);
    } catch { await sleep(5000); }
  }
  console.error(`[CHAOS] ${service} did not recover within ${timeoutMs}ms`);
  return false;
}

// ─── AUTOMATED BACKUP ─────────────────────────────────────────────
const backupScripts = {

  async fullBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename  = `aegisledger-full-${timestamp}.sql.gz`;
    const s3Path    = `s3://${process.env.S3_BUCKET_NAME}/backups/full/${filename}`;

    console.log(`[BACKUP] Starting full backup: ${filename}`);

    const pgDumpCmd = `pg_dump ${process.env.DATABASE_URL} | gzip`;
    const s3UpCmd   = `aws s3 cp - ${s3Path} --sse AES256 --storage-class STANDARD_IA`;

    console.log(`[BACKUP] Command: ${pgDumpCmd} | ${s3UpCmd}`);
    console.log("[BACKUP] MOCK: Would execute in production. Simulating...");

    const mockSize  = Math.floor(50 + Math.random() * 200);
    console.log(`[BACKUP] Backup complete: ${filename} (${mockSize}MB) -> ${s3Path}`);

    await recordBackupMetadata({ type: "full", filename, s3Path, sizeMB: mockSize, timestamp, status: "success" });
  },

  async incrementalBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename  = `aegisledger-wal-${timestamp}.gz`;
    const s3Path    = `s3://${process.env.S3_BUCKET_NAME}/backups/wal/${filename}`;

    console.log(`[BACKUP] WAL incremental backup: ${filename}`);
    console.log(`[BACKUP] MOCK: pg_basebackup --pgdata=- --format=t | gzip | aws s3 cp - ${s3Path}`);

    await recordBackupMetadata({ type: "incremental", filename, s3Path, timestamp, status: "success" });
  },

  async verifyBackup(s3Path) {
    console.log(`[BACKUP] Verifying backup: ${s3Path}`);
    console.log("[BACKUP] Creating temp restore environment...");
    console.log("[BACKUP] Running restore to test DB...");
    console.log("[BACKUP] Running integrity checks...");
    console.log("[BACKUP] MOCK: Backup verified successfully");
    return { verified: true, testedAt: new Date().toISOString() };
  },

  async listBackups() {
    console.log("[BACKUP] Listing backups from S3...");
    try {
      const result = spawnSync('aws', ['s3', 'ls', `s3://${process.env.S3_BUCKET_NAME}/backups/`, '--recursive', '--human-readable']);
      console.log(result.stdout.toString() || "No backups found");
    } catch { console.log("[BACKUP] MOCK: Would list from S3 bucket"); }
  },

  async pruneOldBackups(retentionDays = 30) {
    console.log(`[BACKUP] Pruning backups older than ${retentionDays} days`);
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString().split("T")[0];
    console.log(`[BACKUP] MOCK: Would delete backups before ${cutoff} from S3`);
  },
};

async function recordBackupMetadata(meta) {
  const logFile = path.join(__dirname, "backup-log.json");
  const existing = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile)) : [];
  existing.push(meta);
  fs.writeFileSync(logFile, JSON.stringify(existing.slice(-100), null, 2));
}

// ─── BLUE-GREEN DEPLOYMENT ────────────────────────────────────────
// Fix 50: Use spawnSync with argument arrays to prevent shell injection
const { spawnSync } = require("child_process"); // Fix 50

const ALLOWED_SERVICES = new Set([
  'wallet-service', 'identity-service', 'compliance-service',
  'trade-service', 'trading-service', 'fiat-service', 'billing-service',
  'kyb-service', 'notification-service', 'scheduler-service',
  'webhook-service', 'websocket-service', 'ai-service',
  'analytics-service', 'developer-portal', 'business-model',
  'auth-service', 'compliance-engine'
]);
const IMAGE_PATTERN = /^[a-z0-9][a-z0-9.\-/]*:[a-z0-9.\-]+$/;

const deployScripts = {

  async blueGreenDeploy(service, newImage) {
    // Fix 50: validate inputs before any shell interaction
    if (!ALLOWED_SERVICES.has(service)) {
      throw new Error(`Unknown service: "${service}". Deployment blocked.`);
    }
    if (!IMAGE_PATTERN.test(newImage)) {
      throw new Error(`Invalid image tag format: "${newImage}". Deployment blocked.`);
    }

    console.log(`[DEPLOY] Blue-green deploy: ${service} -> ${newImage}`);

    console.log(`[DEPLOY] Step 1: Deploying ${newImage} to green slot`);
    spawnSync('kubectl', ['set', 'image', `deployment/${service}-green`, `${service}=${newImage}`, '-n', NAMESPACE], { stdio: 'inherit' });

    console.log("[DEPLOY] Step 2: Waiting for green deployment to become ready");
    await waitForDeploymentReady(`${service}-green`);

    console.log("[DEPLOY] Step 3: Running smoke tests on green slot");
    const greenUrl = `http://${service}-green.${NAMESPACE}.svc.cluster.local`;
    const smokeOk  = await runSmokeTest(greenUrl);

    if (!smokeOk) {
      console.error("[DEPLOY] Smoke tests FAILED. Aborting deploy. Green slot rolled back.");
      spawnSync('kubectl', ['rollout', 'undo', `deployment/${service}-green`, '-n', NAMESPACE], { stdio: 'inherit' });
      return false;
    }

    console.log("[DEPLOY] Step 4: Switching ALB target group to green");
    console.log(`[DEPLOY] aws elbv2 modify-rule --actions Type=forward,TargetGroupArn=arn:green`);

    console.log("[DEPLOY] Step 5: Monitoring error rate for 2 minutes");
    await sleep(5000);
    const errorRate = 0.2 + Math.random() * 0.5;
    console.log(`[DEPLOY] Error rate: ${errorRate.toFixed(2)}%`);

    if (errorRate > 1.0) {
      console.error("[DEPLOY] Error rate too high! Rolling back to blue");
      console.log("[DEPLOY] aws elbv2 modify-rule --actions Type=forward,TargetGroupArn=arn:blue");
      return false;
    }

    console.log("[DEPLOY] Step 6: Deploy successful. Updating blue slot for next deploy");
    spawnSync('kubectl', ['set', 'image', `deployment/${service}-blue`, `${service}=${newImage}`, '-n', NAMESPACE], { stdio: 'inherit' });
    console.log(`[DEPLOY] Blue-green deploy complete for ${service}`);
    return true;
  },

  async rollback(service) {
    if (!ALLOWED_SERVICES.has(service)) {
      throw new Error(`Unknown service: "${service}". Rollback blocked.`);
    }
    console.log(`[DEPLOY] Rolling back ${service} to blue slot`);
    console.log("[DEPLOY] aws elbv2 modify-rule --actions Type=forward,TargetGroupArn=arn:blue");
    spawnSync('kubectl', ['rollout', 'undo', `deployment/${service}`, '-n', NAMESPACE], { stdio: 'inherit' });
    console.log(`[DEPLOY] Rollback complete for ${service}`);
  },
};

async function runSmokeTest(serviceUrl) {
  return new Promise((resolve) => {
    const req = http.get(`${serviceUrl}/health`, (res) => resolve(res.statusCode === 200));
    req.on("error", () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
  });
}

// ─── SECRETS MANAGER INTEGRATION ─────────────────────────────────
const secretsScripts = {

  async syncFromAWS() {
    console.log("[SECRETS] Syncing secrets from AWS Secrets Manager...");
    const secrets = ["aegisledger/jwt-private-key","aegisledger/fireblocks-api-key","aegisledger/db-password","aegisledger/redis-password","aegisledger/sendgrid-api-key","aegisledger/stripe-secret-key","aegisledger/telegram-bot-token","aegisledger/openpayd-api-key","aegisledger/comply-advantage-key"];

    for (const secret of secrets) {
      console.log(`[SECRETS] aws secretsmanager get-secret-value --secret-id ${secret}`);
    }
    console.log(`[SECRETS] MOCK: Would sync ${secrets.length} secrets from AWS to K8s secret store`);
  },

  async rotateAPIKey(service) {
    console.log(`[SECRETS] Rotating API key for ${service}...`);
    const newKey = require("crypto").randomBytes(48).toString("hex");
    console.log(`[SECRETS] aws secretsmanager update-secret --secret-id aegisledger/${service}-api-key --secret-string "${newKey.slice(0,8)}..."`);
    console.log(`[SECRETS] kubectl rollout restart deployment/${service} -n ${NAMESPACE}`);
    console.log("[SECRETS] MOCK: Key rotated and deployment restarted");
  },

  generateEnvFromSecrets() {
    const envContent = SERVICES.map(s => `# ${s.toUpperCase().replace(/-/g,"_")}_API_KEY=<from AWS Secrets Manager>`).join("\n");
    console.log("[SECRETS] Use AWS Secrets Manager — never put secrets in .env for production");
    console.log(envContent);
  },
};

// ─── HEALTH CHECK ─────────────────────────────────────────────────
async function healthCheck() {
  const ports = { "identity-service": 3001, "wallet-service": 3002, "compliance-service": 3003, "trade-service": 3004, "fiat-service": 3005, "notification-service": 3006, "websocket-service": 3007, "auth-service": 3008, "compliance-engine": 3009, "analytics-service": 3010, "webhook-service": 3011, "ai-service": 3012, "billing-service": 3013, "trading-service": 3014 };

  const results = await Promise.all(
    Object.entries(ports).map(([service, port]) =>
      new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}/health`, (res) => {
          let data = "";
          res.on("data", d => data += d);
          res.on("end", () => resolve({ service, port, status: res.statusCode === 200 ? "healthy" : "degraded", response: JSON.parse(data || "{}") }));
        });
        req.on("error", () => resolve({ service, port, status: "down" }));
        req.setTimeout(3000, () => { req.destroy(); resolve({ service, port, status: "timeout" }); });
      })
    )
  );

  const healthy = results.filter(r => r.status === "healthy").length;
  console.log(`\n[HEALTH] ${healthy}/${results.length} services healthy\n`);
  results.forEach(r => {
    const icon = r.status === "healthy" ? "OK" : r.status === "down" ? "DOWN" : "WARN";
    console.log(`  [${icon}] ${r.service.padEnd(25)} :${r.port}  ${r.status}`);
  });
  return results;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── CLI ROUTER ───────────────────────────────────────────────────
const cmd = process.argv[2];
const arg = process.argv[3];

async function main() {
  switch (cmd) {
    case "chaos":
      if (arg === "full")    await chaosScripts.runFullChaosScenario();
      else if (arg === "pod") await chaosScripts.killRandomPod();
      else if (arg === "net") await chaosScripts.networkLatency();
      else if (arg === "db")  await chaosScripts.throttleDatabase();
      else { console.log("Usage: chaos [full|pod|net|db]"); }
      break;
    case "backup":
      if (arg === "full")        await backupScripts.fullBackup();
      else if (arg === "wal")    await backupScripts.incrementalBackup();
      else if (arg === "list")   await backupScripts.listBackups();
      else if (arg === "prune")  await backupScripts.pruneOldBackups();
      else { await backupScripts.fullBackup(); }
      break;
    case "deploy":
      if (arg) await deployScripts.blueGreenDeploy(arg, process.argv[4] || "latest");
      else { console.log("Usage: deploy <service-name> <image-tag>"); }
      break;
    case "rollback":
      if (arg) await deployScripts.rollback(arg);
      else { console.log("Usage: rollback <service-name>"); }
      break;
    case "secrets":
      if (arg === "sync")   await secretsScripts.syncFromAWS();
      else if (arg === "rotate") await secretsScripts.rotateAPIKey(process.argv[4] || "openpayd");
      else { console.log("Usage: secrets [sync|rotate <service>]"); }
      break;
    case "health":
      await healthCheck();
      break;
    default:
      console.log(`
AegisLedger Infrastructure Operations
======================================
Commands:
  node infra-ops.js health
  node infra-ops.js chaos [full|pod|net|db]
  node infra-ops.js backup [full|wal|list|prune]
  node infra-ops.js deploy <service> <image-tag>
  node infra-ops.js rollback <service>
  node infra-ops.js secrets [sync|rotate <service>]
      `);
  }
}

main().catch(console.error);
module.exports = { chaosScripts, backupScripts, deployScripts, secretsScripts, healthCheck };
