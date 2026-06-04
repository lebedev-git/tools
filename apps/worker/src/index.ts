import { latestAnalyticsRun } from "@tools/analytics";
import { latestProtocolRun } from "@tools/protocols";
import { integrationRegistry } from "@tools/integrations";

const runs = [latestAnalyticsRun, latestProtocolRun];

console.log("Worker runtime preview");
console.table(
  runs.map((run) => ({
    id: run.id,
    tool: run.toolType,
    status: run.status,
    steps: run.steps.length
  }))
);
console.log("Registered integrations:", integrationRegistry.map((item) => item.id).join(", "));
