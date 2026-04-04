import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadScenario, simulate, writeOutputs } from "./core.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveArg(index, fallback = null) {
  return process.argv[index] ?? fallback;
}

const scenarioArg = resolveArg(2);

if (!scenarioArg) {
  console.error("Usage: node src/run-scenario.mjs <scenario-path> [--out <dir>]");
  process.exit(1);
}

let outputDir = null;
for (let i = 3; i < process.argv.length; i += 1) {
  if (process.argv[i] === "--out") outputDir = process.argv[i + 1];
}

const scenarioPath = path.resolve(__dirname, "..", scenarioArg);
const config = loadScenario(scenarioPath);
const result = simulate(config);

const finalOutputDir =
  outputDir
    ? path.resolve(process.cwd(), outputDir)
    : path.resolve(__dirname, "..", "outputs", config.name);

writeOutputs(finalOutputDir, result);

console.log(`Scenario: ${config.name}`);
console.log(`Output: ${finalOutputDir}`);
console.log(JSON.stringify(result.summary, null, 2));
