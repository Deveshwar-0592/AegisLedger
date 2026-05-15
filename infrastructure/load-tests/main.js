/**
 * AegisLedger - k6 Load Testing Suite
 * Run: k6 run --env BASE_URL=http://localhost:8080 load-tests/main.js
 * Scenarios: smoke (10 users), load (1000 users), stress (2000 users), soak (500 users 30min)
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";
import { SharedArray } from "k6/data";

const BASE_URL     = __ENV.BASE_URL || "http://localhost:8080";
const SCENARIO     = __ENV.SCENARIO || "load";
const TEST_API_KEY = __ENV.TEST_API_KEY;

// Custom metrics
const errorRate          = new Rate("error_rate");
const settlementLatency  = new Trend("settlement_latency_ms", true);
const authLatency        = new Trend("auth_latency_ms", true);
const txThroughput       = new Counter("transactions_processed");

// Test scenarios
const SCENARIOS = {
  smoke: {
    executor: "constant-vus",
    vus: 5, duration: "1m",
    gracefulStop: "30s",
  },
  load: {
    executor: "ramping-vus",
    stages: [
      { duration: "2m", target: 100  },
      { duration: "5m", target: 500  },
      { duration: "5m", target: 1000 },
      { duration: "2m", target: 0    },
    ],
    gracefulRampDown: "30s",
  },
  stress: {
    executor: "ramping-vus",
    stages: [
      { duration: "2m", target: 500  },
      { duration: "5m", target: 1500 },
      { duration: "2m", target: 2000 },
      { duration: "5m", target: 2000 },
      { duration: "2m", target: 0    },
    ],
  },
  soak: {
    executor: "constant-vus",
    vus: 500, duration: "30m",
  },
  spike: {
    executor: "ramping-vus",
    stages: [
      { duration: "30s", target: 0    },
      { duration: "10s", target: 2000 },
      { duration: "1m",  target: 2000 },
      { duration: "10s", target: 0    },
    ],
  },
};

export const options = {
  scenarios: { [SCENARIO]: SCENARIOS[SCENARIO] || SCENARIOS.load },
  thresholds: {
    error_rate:                  ["rate<0.01"],      // < 1% errors
    http_req_duration:           ["p(95)<2000"],     // 95% under 2s
    http_req_duration:           ["p(99)<5000"],     // 99% under 5s
    auth_latency_ms:             ["p(95)<500"],      // Auth under 500ms
    settlement_latency_ms:       ["avg<30000"],      // Avg settlement under 30s
    http_req_failed:             ["rate<0.01"],
  },
};

const AUTH_HEADERS = { "Authorization": `Bearer ${TEST_API_KEY}`, "Content-Type": "application/json", "X-SDK-Version": "k6-test" };

function checkResponse(res, name) {
  const ok = check(res, {
    [`${name}: status 200-201`]: (r) => r.status >= 200 && r.status < 300,
    [`${name}: response time < 2s`]: (r) => r.timings.duration < 2000,
  });
  errorRate.add(!ok);
  return ok;
}

// ─── TEST SCENARIOS ───────────────────────────────────────────────
export default function () {
  const scenario = Math.random();

  if (scenario < 0.3) testAuthFlow();
  else if (scenario < 0.6) testWalletOperations();
  else if (scenario < 0.8) testComplianceScreening();
  else testAnalytics();

  sleep(1 + Math.random() * 2);
}

function testAuthFlow() {
  group("Auth Flow", () => {
    const start = Date.now();
    if (!__ENV.LOADTEST_EMAIL || !__ENV.LOADTEST_PASSWORD) {
      console.warn("Skipping Auth Flow: LOADTEST_EMAIL and LOADTEST_PASSWORD environment variables are required.");
      return;
    }
    const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`,
      JSON.stringify({ email: __ENV.LOADTEST_EMAIL, password: __ENV.LOADTEST_PASSWORD }),
      { headers: { "Content-Type": "application/json" } }
    );
    authLatency.add(Date.now() - start);
    checkResponse(loginRes, "login");

    if (loginRes.status === 200) {
      const token = loginRes.json("token");
      const profileRes = http.get(`${BASE_URL}/api/v1/users/me`,
        { headers: { ...AUTH_HEADERS, Authorization: `Bearer ${token}` } }
      );
      checkResponse(profileRes, "get-profile");
    }
  });
}

function testWalletOperations() {
  group("Wallet Operations", () => {
    const balancesRes = http.get(`${BASE_URL}/api/v1/wallets/test-company/balances`, { headers: AUTH_HEADERS });
    checkResponse(balancesRes, "get-balances");

    const ratesRes = http.get(`${BASE_URL}/api/v1/rates`, { headers: AUTH_HEADERS });
    checkResponse(ratesRes, "get-rates");

    const transferRes = http.post(`${BASE_URL}/api/v1/transfers`,
      JSON.stringify({ amount: 50000 + Math.floor(Math.random()*950000), assetKey: "USDC_ETH", beneficiaryAddress: "0x" + "1".repeat(40), reference: `k6-test-${Date.now()}` }),
      { headers: AUTH_HEADERS }
    );
    checkResponse(transferRes, "initiate-transfer");
    if (transferRes.status === 201) { txThroughput.add(1); settlementLatency.add(transferRes.timings.duration); }
  });
}

function testComplianceScreening() {
  group("Compliance Screening", () => {
    const screenRes = http.post(`${BASE_URL}/api/v1/compliance/screen/transaction`,
      JSON.stringify({ txId: `test-${Date.now()}`, amount: Math.random() * 1000000, originatorName: "Test Corp", beneficiaryName: "DMCC Trading" }),
      { headers: AUTH_HEADERS }
    );
    checkResponse(screenRes, "compliance-screen");

    const analyticsRes = http.get(`${BASE_URL}/api/v1/analytics/overview?period=7d`, { headers: AUTH_HEADERS });
    checkResponse(analyticsRes, "compliance-analytics");
  });
}

function testAnalytics() {
  group("Analytics", () => {
    const txAnalyticsRes = http.get(`${BASE_URL}/api/v1/transactions/analytics?groupBy=day`, { headers: AUTH_HEADERS });
    checkResponse(txAnalyticsRes, "tx-analytics");

    const heatmapRes = http.get(`${BASE_URL}/api/v1/heatmap/flows?days=30`, { headers: AUTH_HEADERS });
    checkResponse(heatmapRes, "heatmap");
  });
}

export function handleSummary(data) {
  const summary = {
    testRun: new Date().toISOString(),
    scenario: SCENARIO,
    totalRequests:  data.metrics.http_reqs?.values?.count,
    errorRate:      `${(data.metrics.error_rate?.values?.rate * 100).toFixed(2)}%`,
    p95ResponseMs:  data.metrics.http_req_duration?.values?.["p(95)"]?.toFixed(0),
    p99ResponseMs:  data.metrics.http_req_duration?.values?.["p(99)"]?.toFixed(0),
    transactionsProcessed: data.metrics.transactions_processed?.values?.count,
    avgSettlementMs: data.metrics.settlement_latency_ms?.values?.avg?.toFixed(0),
    passed: data.metrics.error_rate?.values?.rate < 0.01,
  };
  return {
    "stdout": JSON.stringify(summary, null, 2),
    "load-test-results.json": JSON.stringify({ ...summary, raw: data }, null, 2),
  };
}
