/// <reference lib="webworker" />

import { reconcile } from "./reconcile.ts";
import type { ReconciliationRules, Transaction } from "./domain.ts";

type ReconcileMessage = {
  left: Transaction[];
  right: Transaction[];
  rules: Partial<ReconciliationRules>;
};

self.onmessage = (event: MessageEvent<ReconcileMessage>) => {
  try {
    self.postMessage({ matches: reconcile(event.data.left, event.data.right, event.data.rules) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Reconciliation failed." });
  }
};

export {};
