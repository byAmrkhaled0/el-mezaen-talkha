import { performance } from "node:perf_hooks";

const base = (process.argv[2] || process.env.PERFORMANCE_BASE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const routes = ["/", "/admin/", "/account/", "/services/", "/packages/", "/reviews/"];
const rounds = Math.max(3, Math.min(20, Number(process.env.PERFORMANCE_ROUNDS || 8)));
const results = [];

const percentile = (values, ratio) => values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)] || 0;

for (let round = 0; round < rounds; round += 1) {
  for (const route of routes) {
    const started = performance.now();
    try {
      const response = await fetch(`${base}${route}`, { redirect: "follow", cache: "no-store" });
      await response.arrayBuffer();
      results.push({ route, ms: performance.now() - started, ok: response.ok, status: response.status });
    } catch (error) {
      results.push({ route, ms: performance.now() - started, ok: false, status: 0, error: error?.message || String(error) });
    }
  }
}

const durations = results.map(item => item.ms).sort((a, b) => a - b);
const failures = results.filter(item => !item.ok);
const report = {
  base,
  requests: results.length,
  concurrency: 1,
  p50Ms: Math.round(percentile(durations, .5)),
  p95Ms: Math.round(percentile(durations, .95)),
  errorRate: Number((failures.length / results.length * 100).toFixed(2)),
  routes: Object.fromEntries(routes.map(route => {
    const values = results.filter(item => item.route === route).map(item => item.ms).sort((a, b) => a - b);
    return [route, { p50Ms: Math.round(percentile(values, .5)), p95Ms: Math.round(percentile(values, .95)) }];
  }))
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error("Failures:", failures);
  process.exitCode = 1;
}
