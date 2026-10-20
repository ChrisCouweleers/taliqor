export type CanonicalField =
  | "id"
  | "date"
  | "description"
  | "amount"
  | "currency"
  | "account"
  | "debit"
  | "credit"
  | "entity"
  | "department"
  | "location"
  | "class"
  | "subsidiary"
  | "postingPeriod";

export type ColumnMapping = Record<CanonicalField, string>;

export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  account?: string;
  debit?: number;
  credit?: number;
  entity?: string;
  department?: string;
  location?: string;
  class?: string;
  subsidiary?: string;
  postingPeriod?: string;
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
  preparedById?: string;
  reviewedById?: string;
};

export type AccountingDimensions = {
  account?: string;
  subsidiary?: string;
  department?: string;
  location?: string;
  class?: string;
  entity?: string;
  currency?: string;
  postingPeriod?: string;
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
  resultStorage: "inline" | "rows";
  resultCount: number;
  resolvedCount: number;
  openCount: number;
  periodEnd?: string;
  closePeriodId?: string;
  profileId?: string;
  method: "transaction" | "balance" | "account_analysis" | "variance";
  status: "draft" | "review" | "changes_requested" | "certified";
  materiality: number;
  sourceBalance?: number;
  comparisonBalance?: number;
  beginningBalance?: number;
  periodActivity?: number;
  conclusion: string;
  certification: Certification;
  rules: ReconciliationRules;
  priorReconciliationId?: string;
  lockedAt?: string;
  certificationVersion: number;
  changeReason?: string;
  dimensions: AccountingDimensions;
};

export type JournalLine = {
  account: string;
  description: string;
  debit: number;
  credit: number;
};

export type JournalAdjustment = {
  id: string;
  reconciliationId?: string;
  closePeriodId?: string;
  matchId?: string;
  title: string;
  description: string;
  postingDate?: string;
  status: "draft" | "review" | "approved" | "posted" | "no_entry";
  lines: JournalLine[];
  recurring: boolean;
  autoReverse: boolean;
  reversalDate?: string;
  externalReference: string;
  preparedBy: string;
  reviewedBy: string;
  entryKind: "original" | "recurring_copy" | "reversal";
  createdAt: string;
  updatedAt: string;
};

export type EvidenceFile = {
  id: string;
  reconciliationId?: string;
  adjustmentId?: string;
  matchId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
};

export type ReconciliationProfile = {
  id: string;
  name: string;
  accountNumber?: string;
  accountType: string;
  method: ReconciliationRun["method"];
  frequency: "monthly" | "quarterly" | "yearly";
  risk: "low" | "medium" | "high";
  materiality: number;
  preparer: string;
  reviewer: string;
  preparerId?: string;
  reviewerId?: string;
  dueOffset: number;
  dimensions: AccountingDimensions;
  requiredSupport: string[];
  active: boolean;
  createdAt: string;
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
  owner?: string;
  reviewer?: string;
  dueDate?: string;
  percentageThreshold?: number;
  priorExplanation?: string;
  reviewedBy?: string;
  reviewedAt?: string;
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
  closeConclusion?: string;
  reopenReason?: string;
  closedBy?: string;
  reopenedAt?: string;
};

export type AuditEvent = {
  id: string;
  actorName: string;
  entityType: "reconciliation" | "close" | "adjustment" | "evidence" | "profile" | "variance";
  entityId: string;
  action: string;
  summary: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type SafeUser = {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: "owner" | "member";
};
