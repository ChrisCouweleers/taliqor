export type CanonicalField =
  | "id"
  | "date"
  | "description"
  | "amount"
  | "currency";

export type ColumnMapping = Record<CanonicalField, string>;

export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  source: string;
  raw: Record<string, string>;
};

export type MatchStatus = "matched" | "review" | "unmatched";
export type Decision = "pending" | "approved" | "rejected";

export type Match = {
  id: string;
  left: Transaction;
  right?: Transaction;
  status: MatchStatus;
  decision: Decision;
  confidence: number;
  reason: string;
  evidence: string[];
  groupedRight?: Transaction[];
  exceptionType?:
    | "timing"
    | "fee"
    | "refund"
    | "chargeback"
    | "duplicate"
    | "missing_ledger"
    | "missing_source"
    | "amount"
    | "currency"
    | "deposit_transit"
    | "outstanding"
    | "journal"
    | "other";
  explanation?: string;
  owner?: string;
  dueDate?: string;
  proposedAdjustment?: number;
  resolvedAt?: string;
  supportUrl?: string;
};

export type ReconciliationRules = {
  dateTolerance: number;
  amountTolerance: number;
  autoApprove: number;
  allowGrouping: boolean;
};
export type Certification = {
  preparedBy?: string;
  preparedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
};

export type MappingTemplate = {
  id: string;
  organizationId: string;
  name: string;
  fingerprint: string;
  mapping: ColumnMapping;
  createdAt: string;
  updatedAt: string;
};

export type ReconciliationRun = {
  id: string;
  organizationId: string;
  createdBy: string;
  name: string;
  leftName: string;
  rightName: string;
  createdAt: string;
  updatedAt: string;
  matches: Match[];
  periodEnd?: string;
  closePeriodId?: string;
  method: "transaction" | "balance" | "account_analysis" | "variance";
  status: "draft" | "review" | "changes_requested" | "certified";
  materiality: number;
  sourceBalance?: number;
  comparisonBalance?: number;
  conclusion: string;
  certification: Certification;
  rules: ReconciliationRules;
  priorReconciliationId?: string;
};

export type MatchingRule = {
  id: string;
  name: string;
  settings: ReconciliationRules;
  createdAt: string;
};
export type CloseTask = {
  id: string;
  name: string;
  area: string;
  owner: string;
  reviewer: string;
  dueOffset: number;
  dueDate: string;
  status: "todo" | "doing" | "blocked" | "done";
  dependencyId?: string;
  notes: string;
  reconciliationId?: string;
  completedAt?: string;
};
export type VarianceItem = {
  id: string;
  account: string;
  current: number;
  prior: number;
  difference: number;
  percent: number;
  explanation: string;
  status: "open" | "reviewed";
};
export type ClosePeriod = {
  id: string;
  name: string;
  periodType: "month" | "quarter" | "year";
  periodEnd: string;
  status: "open" | "closed";
  materiality: number;
  tasks: CloseTask[];
  variances: VarianceItem[];
  closedAt?: string;
  createdAt: string;
};

export type SafeUser = {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  organizationName: string;
};
