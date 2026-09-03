import type { Match, ReconciliationRules, Transaction } from "./domain.ts";

export function reconcileInWorker(
  left: Transaction[],
  right: Transaction[],
  rules: Partial<ReconciliationRules>,
) {
  return new Promise<Match[]>((resolve, reject) => {
    const worker = new Worker(new URL("./reconcile.worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<{ matches?: Match[]; error?: string }>) => {
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.matches || []);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "The matching worker stopped unexpectedly."));
    };
    worker.postMessage({ left, right, rules });
  });
}
