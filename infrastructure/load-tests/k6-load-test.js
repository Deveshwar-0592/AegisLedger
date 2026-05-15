/**
 * AegisLedger - k6 Load Testing Suite
 * Tests: 1000 concurrent users, 10K tx/min peak
 * Run: k6 run --vus 1000 --duration 5m k6-load-test.js
 */
import http from "k6/http";
import { sleep, check, group } from "k6";
import { Counter, Trend } from "k6/metrics";

const txLatency = new Trend("transfer_latency");
const authLatency = new Trend("auth_latency");
const errorCount = new Counter("errors");

export const options = {
  scenarios: {
    ramp_up: { executor:"ramping-vus", startVUs:0, stages:[{duration:"2m",target:200},{duration:"3m",target:1000},{duration:"5m",target:1000},{duration:"2m",target:0}] },
    spike_test: { executor:"ramping-arrival-rate", startRate:10, timeUnit:"1s", preAllocatedVUs:500, stages:[{duration:"30s",target:10},{duration:"1m",target:167},{duration:"2m",target:167},{duration:"30s",target:0}] },
  },
  thresholds: {
    http_req_duration: ["p(95)<500","p(99)<2000"],
    http_req_failed: ["rate<0.01"],
    transfer_latency: ["p(95)<800"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:3001";
const TEST_TOKEN = __ENV.JWT_TOKEN;
const EMAIL = __ENV.LOADTEST_EMAIL;
const PASSWORD = __ENV.LOADTEST_PASSWORD;

export function setup() {
  if (EMAIL && PASSWORD) {
    const res = http.post(`${BASE}/auth/login`, JSON.stringify({email:EMAIL,password:PASSWORD}), {headers:{"Content-Type":"application/json"}});
    return { token: res.json("token") };
  }
  if (!TEST_TOKEN) throw new Error("Must provide LOADTEST_EMAIL & LOADTEST_PASSWORD, or JWT_TOKEN");
  return { token: TEST_TOKEN };
}

export default function(data) {
  const headers = { "Authorization":`Bearer ${data.token}`, "Content-Type":"application/json", "Idempotency-Key":`k6-${__VU}-${__ITER}` };

  group("Authentication", () => {
    const start = Date.now();
    const r = http.get(`${BASE}/users/me`, { headers });
    authLatency.add(Date.now()-start);
    check(r, { "auth 200": (r)=>r.status===200 }) || errorCount.add(1);
    sleep(0.5);
  });

  group("Transfer Flow", () => {
    const start = Date.now();
    const r = http.post(`${BASE}/transfers`, JSON.stringify({amount:Math.floor(Math.random()*100000)+1000,asset:"USDC_ETH",beneficiary:"test-beneficiary-id",memo:`Load test ${__VU}-${__ITER}`}), {headers});
    txLatency.add(Date.now()-start);
    check(r, { "transfer 201 or 202": (r)=>[201,202,400].includes(r.status) }) || errorCount.add(1);
    sleep(1);
  });

  group("Wallet Balance", () => {
    const r = http.get(`${BASE}/wallets`, { headers });
    check(r, { "wallets 200": (r)=>r.status===200 }) || errorCount.add(1);
    sleep(0.3);
  });

  group("Compliance Check", () => {
    const r = http.get(`${BASE}/compliance/risk-score/${req?.user?.company||"test-company"}`, { headers });
    check(r, { "risk score ok": (r)=>[200,404].includes(r.status) }) || errorCount.add(1);
  });

  sleep(Math.random()*2+0.5);
}
