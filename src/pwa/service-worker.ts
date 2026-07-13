export function renderServiceWorker(buildId: string): string {
  const version = `kyle-shell-${buildId}`;
  return [
    'import { startServiceWorker } from "/sw-runtime.js";',
    `startServiceWorker(self, ${JSON.stringify(version)});`,
    "",
  ].join("\n");
}
