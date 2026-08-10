export type CanonicalField = "id" | "date" | "description" | "amount" | "currency";

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
};

export type SafeUser = { id: string; name: string; email: string; organizationId: string; organizationName: string };

