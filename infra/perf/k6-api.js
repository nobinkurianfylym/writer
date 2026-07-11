// §10 backend budgets, enforced as k6 thresholds (E7-2):
//   - hot REST reads: p95 < 120 ms
//   - cold script open (300-page state fetch): p95 < 800 ms
//
// Requires a seeded target (infra/perf/seed.mjs) with env:
//   API_URL, TOKEN, ORG_ID, PROJECT_ID, SCRIPT_ID
//
//   docker run --rm --network host -e API_URL=… -e TOKEN=… -e ORG_ID=… \
//     -e PROJECT_ID=… -e SCRIPT_ID=… -v $PWD:/perf grafana/k6 run /perf/k6-api.js

import http from "k6/http";
import { check } from "k6";

const API = __ENV.API_URL || "http://localhost:3001";
const AUTH = { headers: { Authorization: `Bearer ${__ENV.TOKEN}` } };

export const options = {
  // Open (arrival-rate) model: the budget is service latency at a target
  // load, so iterations arrive on schedule regardless of response times. A
  // closed zero-sleep VU loop would saturate the server and measure queue
  // depth, not latency (observed: 2–5 ms service time reading as 400 ms p95).
  scenarios: {
    hot_reads: {
      executor: "constant-arrival-rate",
      exec: "hotReads",
      rate: 50, // 50 iterations/s × 4 requests = 200 req/s of hot reads
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 30,
      maxVUs: 100,
    },
    cold_open: {
      executor: "constant-arrival-rate",
      exec: "coldOpen",
      rate: 10, // 10 cold opens/s of a ~380-page script
      timeUnit: "1s",
      duration: "30s",
      startTime: "31s", // run after hot_reads so scenarios don't contend
      preAllocatedVUs: 10,
      maxVUs: 40,
    },
  },
  thresholds: {
    // §10: hot REST reads p95 < 120 ms.
    "http_req_duration{scenario:hot_reads}": ["p(95)<120"],
    // §10: cold script open (snapshot fetch) < 800 ms for a 300-page script.
    "http_req_duration{scenario:cold_open}": ["p(95)<800"],
    // Nothing may error.
    http_req_failed: ["rate==0"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export function hotReads() {
  // The dashboard/editor read path. /auth/* is deliberately excluded — it
  // carries the strict auth rate-limit budget (20/min) by design (§9).
  const responses = [
    http.get(`${API}/v1/orgs`, AUTH),
    http.get(`${API}/v1/orgs/${__ENV.ORG_ID}/projects`, AUTH),
    http.get(`${API}/v1/projects/${__ENV.PROJECT_ID}/scripts`, AUTH),
    http.get(`${API}/v1/scripts/${__ENV.SCRIPT_ID}`, AUTH),
  ];
  for (const res of responses) {
    check(res, { "status 200": (r) => r.status === 200 });
  }
}

export function coldOpen() {
  const res = http.get(`${API}/v1/scripts/${__ENV.SCRIPT_ID}/state`, AUTH);
  check(res, {
    "status 200": (r) => r.status === 200,
    "carries state": (r) => r.json("ydocState") !== undefined,
  });
}

export function handleSummary(data) {
  // Machine-readable summary for the CI trend artifact.
  return {
    "k6-summary.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const lines = ["", "§10 budget results:"];
  for (const [name, metric] of Object.entries(data.metrics)) {
    if (!name.startsWith("http_req_duration{scenario")) continue;
    const p95 = metric.values["p(95)"];
    lines.push(`  ${name}: p95=${p95.toFixed(1)}ms`);
  }
  const failed = data.metrics.http_req_failed?.values.rate ?? 0;
  lines.push(`  http_req_failed rate: ${failed}`);
  lines.push("");
  return lines.join("\n");
}
