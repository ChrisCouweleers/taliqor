"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  CalendarCheck,
  CaretDown,
  ChartLineUp,
  Check,
  CheckCircle,
  Copy,
  ClockCounterClockwise,
  DownloadSimple,
  FileCsv,
  Gear,
  House,
  LockKey,
  MagnifyingGlass,
  Moon,
  Printer,
  Rows,
  SealCheck,
  SignOut,
  Sparkle,
  Sun,
  Trash,
  UploadSimple,
  UserPlus,
  Warning,
  X,
} from "@phosphor-icons/react";
import { Logo } from "./logo";
import {
  ClosePeriod,
  CloseTask,
  ColumnMapping,
  MappingTemplate,
  MatchingRule,
  Match,
  JournalAdjustment,
  JournalLine,
  EvidenceFile,
  ReconciliationRules,
  ReconciliationProfile,
  ReconciliationRun,
  VarianceItem,
  AuditEvent,
} from "@/lib/domain";
import {
  csvEscape,
  inferMapping,
  mappingFingerprint,
  normalizeRows,
} from "@/lib/csv";
import {
  parseSpreadsheetFile,
  downloadXlsx,
  spreadsheetAccept,
  SpreadsheetPreview,
  spreadsheetSourceName,
} from "@/lib/spreadsheet";
import { reconcile } from "@/lib/reconcile";
import { createClient } from "@/lib/supabase/client";

type UserInfo = {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: "owner" | "member";
};
type UploadState = {
  file: File;
  preview: SpreadsheetPreview;
  mapping: ColumnMapping;
};
type View =
  | "overview"
  | "reconciliation"
  | "history"
  | "accounts"
  | "exceptions"
  | "close"
  | "settings";
const blankMapping: ColumnMapping = {
  id: "",
  date: "",
  description: "",
  amount: "",
  currency: "",
  account: "",
  debit: "",
  credit: "",
  entity: "",
  department: "",
  location: "",
  class: "",
  subsidiary: "",
  postingPeriod: "",
};
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const displayMoney = (value: number) => Number.isFinite(value) ? money.format(value) : "—";

export function Dashboard({ user }: { user: UserInfo }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [profileOpen, setProfileOpen] = useState(false);
  const [runs, setRuns] = useState<ReconciliationRun[]>([]),
    [templates, setTemplates] = useState<MappingTemplate[]>([]),
    [selectedId, setSelectedId] = useState("");
  const [closePeriods, setClosePeriods] = useState<ClosePeriod[]>([]),
    [matchingRules, setMatchingRules] = useState<MatchingRule[]>([]),
    [adjustments, setAdjustments] = useState<JournalAdjustment[]>([]),
    [evidence, setEvidence] = useState<EvidenceFile[]>([]),
    [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]),
    [reconciliationProfiles, setReconciliationProfiles] = useState<
      ReconciliationProfile[]
    >([]);
  const [view, setView] = useState<View>("overview"),
    [activeCloseId, setActiveCloseId] = useState(""),
    [loading, setLoading] = useState(true),
    [wizard, setWizard] = useState(false),
    [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [left, setLeft] = useState<UploadState>(),
    [right, setRight] = useState<UploadState>(),
    [runName, setRunName] = useState("");
  const [runOptions, setRunOptions] = useState({
    method: "transaction" as ReconciliationRun["method"],
    periodEnd: new Date().toISOString().slice(0, 10),
    closePeriodId: "",
    profileId: "",
    materiality: 0,
    sourceBalance: "",
    comparisonBalance: "",
  });
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false),
    [adjustmentDraftMatchId, setAdjustmentDraftMatchId] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState<"all" | Match["status"]>("all");
  const leftRef = useRef<HTMLInputElement>(null),
    rightRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    loadRuns();
  }, []);
  useEffect(() => {
    function restoreFromUrl() {
      const params = new URLSearchParams(location.search);
      const requested = params.get("view") as View | null;
      const allowed: View[] = [
        "overview",
        "reconciliation",
        "history",
        "accounts",
        "exceptions",
        "close",
        "settings",
      ];
      setView(
        requested && allowed.includes(requested) ? requested : "overview",
      );
      const reconciliationId = params.get("reconciliation");
      if (reconciliationId) setSelectedId(reconciliationId);
      setActiveCloseId(params.get("close") || "");
    }
    restoreFromUrl();
    if (!new URLSearchParams(location.search).has("view")) {
      history.replaceState({}, "", "/dashboard?view=overview");
    }
    addEventListener("popstate", restoreFromUrl);
    return () => removeEventListener("popstate", restoreFromUrl);
  }, []);

  function navigateDashboard(
    nextView: View,
    options: { reconciliationId?: string; closeId?: string } = {},
  ) {
    const params = new URLSearchParams({ view: nextView });
    if (options.reconciliationId) {
      params.set("reconciliation", options.reconciliationId);
      setSelectedId(options.reconciliationId);
    }
    setActiveCloseId(options.closeId || "");
    if (options.closeId) params.set("close", options.closeId);
    setView(nextView);
    history.pushState({}, "", `/dashboard?${params.toString()}`);
  }
  useEffect(() => {
    const saved = localStorage.getItem("taliqor-theme");
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    const next = saved === "dark" || saved === "light" ? saved : preferred;
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("taliqor-theme", next);
    document.documentElement.dataset.theme = next;
  }
  async function loadRuns() {
    try {
      const [response, closeResponse, profileResponse, adjustmentResponse, evidenceResponse, auditResponse] = await Promise.all([
        fetch("/api/reconciliations"),
        fetch("/api/close-periods"),
        fetch("/api/reconciliation-profiles"),
        fetch("/api/adjustments"),
        fetch("/api/evidence"),
        fetch("/api/audit-events"),
      ]);
      const data = await response.json(),
        closeData = await closeResponse.json(),
        profileData = await profileResponse.json(),
        adjustmentData = await adjustmentResponse.json(),
        evidenceData = await evidenceResponse.json(),
        auditData = await auditResponse.json();
      if (!response.ok) throw new Error(data.error);
      setRuns(data.runs);
      setTemplates(data.templates);
      setMatchingRules(data.rules || []);
      setClosePeriods(closeData.periods || []);
      setReconciliationProfiles(profileData.profiles || []);
      setAdjustments(adjustmentData.adjustments || []);
      setEvidence(evidenceData.evidence || []);
      setAuditEvents(auditData.events || []);
      setSelectedId((current) => current || data.runs[0]?.id || "");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load your workspace.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function refreshAudit() {
    const response = await fetch("/api/audit-events");
    const data = await response.json();
    if (response.ok) setAuditEvents(data.events || []);
  }
  const selected = runs.find((run) => run.id === selectedId) || runs[0];
  const allMatches = selected?.matches || [];
  const matched = allMatches.filter(
    (item) => item.status === "matched" || item.decision === "approved",
  ).length;
  const exceptions = allMatches.filter(
    (item) => item.decision !== "approved" && item.status !== "matched",
  ).length;
  const total = allMatches.reduce(
    (sum, item) =>
      sum + (item.left.source === selected?.leftName ? item.left.amount : 0),
    0,
  );
  const rate = allMatches.length
    ? Math.round((matched / allMatches.length) * 1000) / 10
    : 0;
  const sourceBalance =
    selected?.sourceBalance ??
    allMatches.reduce((sum, item) => sum + item.left.amount, 0);
  const comparisonBalance =
    selected?.comparisonBalance ??
    allMatches.reduce(
      (sum, item) =>
        sum +
        (item.groupedRight?.reduce(
          (subtotal, row) => subtotal + row.amount,
          0,
        ) ??
          item.right?.amount ??
          0),
      0,
    );
  const explained = allMatches
    .filter((item) => item.exceptionType && item.explanation)
    .reduce(
      (sum, item) =>
        sum +
        (item.proposedAdjustment ??
          Math.abs(
            item.left.amount -
              (item.groupedRight?.reduce(
                (subtotal, row) => subtotal + row.amount,
                0,
              ) ??
                item.right?.amount ??
                0),
          )),
      0,
    );
  const rows = useMemo(
    () =>
      allMatches.filter(
        (item) =>
          (view !== "exceptions" ||
            (item.status !== "matched" && item.decision !== "approved")) &&
          (filter === "all" || item.status === filter) &&
          `${item.left.id} ${item.left.description} ${item.right?.description || ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [allMatches, filter, query, view],
  );

  async function chooseFile(file: File | undefined, side: "left" | "right") {
    if (!file) return;
    try {
      if (file.size > 15 * 1024 * 1024)
        throw new Error("Files must be smaller than 15 MB.");
      const preview = await parseSpreadsheetFile(file),
        fingerprint = mappingFingerprint(preview.headers);
      const saved = templates.find(
        (template) => template.fingerprint === fingerprint,
      );
      const value = {
        file,
        preview,
        mapping: saved?.mapping || inferMapping(preview),
      };
      side === "left" ? setLeft(value) : setRight(value);
      setError("");
      if (!runName)
        setRunName(`${new Date().toLocaleDateString()} reconciliation`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't read that file.",
      );
    }
  }
  async function chooseSheet(side: "left" | "right", sheetName: string) {
    const current = side === "left" ? left : right;
    if (!current) return;
    try {
      const preview = await parseSpreadsheetFile(current.file, sheetName);
      const saved = templates.find(
        (template) => template.fingerprint === mappingFingerprint(preview.headers),
      );
      const next = {
        ...current,
        preview,
        mapping: saved?.mapping || inferMapping(preview),
      };
      side === "left" ? setLeft(next) : setRight(next);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "We couldn't read that worksheet.",
      );
    }
  }
  function beginMapping() {
    if (!left || !right)
      return setError("Choose two CSV or Excel files to continue.");
    if ((!left.mapping.amount && !left.mapping.debit && !left.mapping.credit) || (!right.mapping.amount && !right.mapping.debit && !right.mapping.credit))
      setNotice("Map an amount column, or debit and credit columns, for each file.");
    setWizardStep(2);
    setError("");
  }
  async function createRun() {
    if (!left || !right || (!left.mapping.amount && !left.mapping.debit && !left.mapping.credit) || (!right.mapping.amount && !right.mapping.debit && !right.mapping.credit))
      return setError("Choose an amount column, or debit and credit columns, for each source.");
    setSaving(true);
    setError("");
    try {
      const leftRows = normalizeRows(
          left.preview,
          left.mapping,
          spreadsheetSourceName(left.preview, left.file.name),
        ),
        rightRows = normalizeRows(
          right.preview,
          right.mapping,
          spreadsheetSourceName(right.preview, right.file.name),
        );
      const rules: ReconciliationRules = matchingRules[0]?.settings || {
        dateTolerance: 3,
        amountTolerance: 1,
        autoApprove: 90,
        allowGrouping: true,
      };
      const leftSourceName = spreadsheetSourceName(left.preview, left.file.name);
      const rightSourceName = spreadsheetSourceName(right.preview, right.file.name);
      const previous = runs.find(
        (run) =>
          run.leftName === leftSourceName && run.rightName === rightSourceName,
      );
      const carried = (previous?.matches || [])
        .filter(
          (item) => item.status !== "matched" && item.decision !== "approved",
        )
        .map((item, index) => ({
          ...item,
          id: `carry-${previous?.id}-${index}`,
          reason: `Carried forward from ${previous?.name}`,
          confidence: 0,
          decision: "pending" as const,
          status: "unmatched" as const,
        }));
      const matches = [...reconcile(leftRows, rightRows, rules), ...carried];
      const templatePayload = [
        {
          name: left.file.name,
          fingerprint: mappingFingerprint(left.preview.headers),
          mapping: left.mapping,
        },
        {
          name: right.file.name,
          fingerprint: mappingFingerprint(right.preview.headers),
          mapping: right.mapping,
        },
      ];
      const response = await fetch("/api/reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: runName || "New reconciliation",
          leftName: leftSourceName,
          rightName: rightSourceName,
          matches,
          templates: templatePayload,
          periodEnd: runOptions.periodEnd,
          closePeriodId: runOptions.closePeriodId || undefined,
          profileId: runOptions.profileId || undefined,
          method: runOptions.method,
          materiality: runOptions.materiality,
          sourceBalance:
            runOptions.sourceBalance === ""
              ? leftRows.reduce((sum, row) => sum + row.amount, 0)
              : Number(runOptions.sourceBalance),
          comparisonBalance:
            runOptions.comparisonBalance === ""
              ? rightRows.reduce((sum, row) => sum + row.amount, 0)
              : Number(runOptions.comparisonBalance),
          rules,
          priorReconciliationId: previous?.id,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const form = new FormData();
      form.set("runId", data.run.id);
      form.append("files", left.file);
      form.append("files", right.file);
      const upload = await fetch("/api/uploads", {
        method: "POST",
        body: form,
      });
      if (!upload.ok)
        setNotice(
          "The reconciliation was saved, but the original files could not be archived.",
        );
      setRuns((current) => [data.run, ...current]);
      setSelectedId(data.run.id);
      setWizardStep(3);
      navigateDashboard("reconciliation", { reconciliationId: data.run.id });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Reconciliation failed.",
      );
    } finally {
      setSaving(false);
    }
  }
  function closeWizard() {
    setWizard(false);
    setWizardStep(1);
    setLeft(undefined);
    setRight(undefined);
    setRunName("");
    setRunOptions({
      method: "transaction",
      periodEnd: new Date().toISOString().slice(0, 10),
      closePeriodId: "",
      profileId: "",
      materiality: 0,
      sourceBalance: "",
      comparisonBalance: "",
    });
    setError("");
    setNotice("");
  }
  async function decide(
    matchId: string,
    decision: "pending" | "approved" | "rejected",
  ) {
    if (!selected) return;
    const workflowStatus =
      decision !== "approved" &&
      (selected.status === "review" || selected.status === "certified")
        ? "changes_requested"
        : selected.status;
    const matches = selected.matches.map((item) =>
      item.id === matchId
        ? {
            ...item,
            decision,
            status:
              decision === "approved"
                ? ("matched" as const)
                : item.right
                  ? ("review" as const)
                  : ("unmatched" as const),
            resolvedAt:
              decision === "approved" ? new Date().toISOString() : undefined,
          }
        : item,
    );
    setRuns((current) =>
      current.map((run) =>
        run.id === selected.id
          ? { ...run, matches, status: workflowStatus }
          : run,
      ),
    );
    const response = await fetch(`/api/reconciliations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matches }),
    });
    if (!response.ok) {
      setError("That decision could not be saved.");
      await loadRuns();
    } else {
      setError("");
    }
  }
  async function updateRun(patch: Partial<ReconciliationRun>) {
    if (!selected) return;
    const next = { ...selected, ...patch };
    setRuns((current) =>
      current.map((run) => (run.id === selected.id ? next : run)),
    );
    const response = await fetch(`/api/reconciliations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "That reconciliation update could not be saved.");
      await loadRuns();
    } else {
      setError("");
      await loadRuns();
    }
  }
  async function makeRunRecurring(run: ReconciliationRun) {
    if (run.profileId) return;
    setError("");
    const response = await fetch("/api/reconciliation-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: run.name.replace(/\s+reconciliation$/i, ""),
        accountType: "other",
        method: run.method,
        frequency: "monthly",
        risk: "medium",
        materiality: run.materiality,
        preparer: run.certification.preparedBy || user.name,
        reviewer: run.certification.reviewedBy || "",
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "This reconciliation could not be made recurring.");
      return;
    }
    setReconciliationProfiles((current) =>
      [...current, data.profile].sort((a, b) => a.name.localeCompare(b.name)),
    );
    await updateRun({ profileId: data.profile.id });
    setNotice("Added to Recurring accounts. Its settings will be ready for the next period.");
  }
  async function updateException(matchId: string, patch: Partial<Match>) {
    if (!selected) return;
    const matches = selected.matches.map((item) =>
      item.id === matchId ? { ...item, ...patch } : item,
    );
    await updateRun({ matches });
  }
  async function saveAdjustment(
    payload: Partial<JournalAdjustment>,
    id?: string,
  ) {
    const response = await fetch(id ? `/api/adjustments/${id}` : "/api/adjustments", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "The adjustment could not be saved.");
      return undefined;
    }
    setAdjustments((current) =>
      id
        ? current.map((item) => (item.id === id ? data.adjustment : item))
        : [data.adjustment, ...current],
    );
    setError("");
    await loadRuns();
    return data.adjustment as JournalAdjustment;
  }
  async function uploadEvidence(
    file: File | undefined,
    options: { reconciliationId?: string; adjustmentId?: string; matchId?: string },
  ) {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    if (options.reconciliationId) form.set("reconciliationId", options.reconciliationId);
    if (options.adjustmentId) form.set("adjustmentId", options.adjustmentId);
    if (options.matchId) form.set("matchId", options.matchId);
    const response = await fetch("/api/evidence", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "The supporting evidence could not be uploaded.");
      return;
    }
    setEvidence((current) => [data.evidence, ...current]);
    setNotice("Supporting evidence attached.");
    await loadRuns();
  }
  function startAdjustment(matchId: string) {
    setAdjustmentDraftMatchId(matchId);
    requestAnimationFrame(() =>
      document.querySelector(".adjustment-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }
  async function deleteEvidence(id: string) {
    const response = await fetch(`/api/evidence/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "The evidence file could not be removed.");
      return;
    }
    setEvidence((current) => current.filter((item) => item.id !== id));
    setNotice("Supporting evidence removed.");
    await loadRuns();
  }
  function exportRun() {
    if (!selected) return;
    const headers = [
      "source_id",
      "source_description",
      "source_date",
      "source_amount",
      "comparison_id",
      "comparison_description",
      "comparison_date",
      "comparison_amount",
      "status",
      "decision",
      "confidence",
      "reason",
    ];
    const output = [
      headers.join(","),
      ...selected.matches.map((item) =>
        [
          item.left.id,
          item.left.description,
          item.left.date,
          item.left.amount,
          item.right?.id,
          item.right?.description,
          item.right?.date,
          item.right?.amount,
          item.status,
          item.decision,
          item.confidence,
          item.reason,
        ]
          .map(csvEscape)
          .join(","),
      ),
    ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([output], { type: "text/csv" }));
    link.download = `${selected.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-results.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function printPacket() {
    if (!selected) return;
    const packetAdjustments = adjustments.filter((item) => item.reconciliationId === selected.id);
    const packetEvidence = evidence.filter((item) => item.reconciliationId === selected.id);
    const beginning = selected.beginningBalance ?? 0;
    const activity = selected.periodActivity ?? sourceBalance - beginning;
    const adjustmentEffect = packetAdjustments.filter((item) => item.status === "approved" || item.status === "posted").reduce((sum, item) => sum + ((item.lines[0]?.debit || 0) - (item.lines[0]?.credit || 0)), 0);
    const open = window.open("", "_blank");
    if (!open) return;
    open.document.write(
      `<title>${selected.name} reconciliation packet</title><style>body{font:14px Arial;color:#17233b;padding:40px}h1{margin-bottom:4px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card{border:1px solid #ddd;padding:14px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border-bottom:1px solid #ddd;text-align:left;padding:8px}small{color:#667}</style><h1>${escapeText(selected.name)}</h1><p>${selected.periodEnd || "No period"} · ${selected.status}</p><div class="grid"><div class="card">Source<br><b>${money.format(sourceBalance)}</b></div><div class="card">Comparison<br><b>${money.format(comparisonBalance)}</b></div><div class="card">Explained<br><b>${money.format(explained)}</b></div><div class="card">Unexplained<br><b>${money.format(Math.abs(sourceBalance - comparisonBalance) - explained)}</b></div></div><h2>Balance roll-forward</h2><p>${money.format(beginning)} beginning + ${money.format(activity)} activity + ${money.format(adjustmentEffect)} adjustments = <b>${money.format(beginning + activity + adjustmentEffect)}</b> adjusted ending.</p><h2>Conclusion</h2><p>${escapeText(selected.conclusion || "Not documented")}</p><table><tr><th>Item</th><th>Amount</th><th>Resolution</th><th>Explanation</th></tr>${selected.matches
        .filter((item) => item.status !== "matched")
        .map(
          (item) =>
            `<tr><td>${escapeText(item.left.id)}</td><td>${money.format(item.left.amount)}</td><td>${escapeText(item.exceptionType || item.status)}</td><td>${escapeText(item.explanation || "Open")}</td></tr>`,
        )
        .join("")}</table><h2>Adjusting journal entries</h2><table><tr><th>Entry</th><th>Status</th><th>Debits</th><th>Posting reference</th></tr>${packetAdjustments.map((item) => `<tr><td>${escapeText(item.title)}</td><td>${escapeText(item.status)}</td><td>${money.format(item.lines.reduce((sum, line) => sum + line.debit, 0))}</td><td>${escapeText(item.externalReference || "Not posted")}</td></tr>`).join("")}</table><h2>Supporting evidence</h2><ul>${packetEvidence.map((file) => `<li>${escapeText(file.fileName)}${file.matchId ? ` · item ${escapeText(file.matchId)}` : ""}</li>`).join("") || "<li>No supporting files attached</li>"}</ul><script>window.print()<\/script>`,
    );
    open.document.close();
  }
  async function signOut() {
    await createClient().auth.signOut();
    location.assign("/");
  }

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <Logo />
        </div>
        <nav>
          <Nav
            active={view === "overview"}
            icon={<House weight="fill" />}
            onClick={() => navigateDashboard("overview")}
          >
            Overview
          </Nav>
          <Nav
            active={view === "history" || view === "accounts"}
            icon={<Rows />}
            onClick={() => navigateDashboard("accounts")}
          >
            Reconciliations
          </Nav>
          <Nav
            active={view === "exceptions"}
            icon={<Warning />}
            onClick={() =>
              navigateDashboard("exceptions", { reconciliationId: selectedId })
            }
          >
            Exceptions <b>{exceptions}</b>
          </Nav>
          <Nav
            active={view === "close"}
            icon={<CalendarCheck />}
            onClick={() => navigateDashboard("close")}
          >
            Close Hub
          </Nav>
        </nav>
        <div className="side-bottom">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? <Moon weight="fill" /> : <Sun weight="fill" />}
            {theme === "light" ? "Dark mode" : "Light mode"}
            <span className={`theme-switch ${theme}`} aria-hidden="true">
              <i />
            </span>
          </button>
          {profileOpen && (
            <div className="profile-menu" role="menu">
              <button
                role="menuitem"
                className={view === "settings" ? "active" : ""}
                onClick={() => {
                  navigateDashboard("settings");
                  setProfileOpen(false);
                }}
              >
                <Gear />
                Settings
              </button>
              <button role="menuitem" onClick={signOut}>
                <SignOut />
                Sign out
              </button>
            </div>
          )}
          <button
            className="profile"
            onClick={() => setProfileOpen((open) => !open)}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
          >
            <span>{initials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
            <CaretDown className={profileOpen ? "open" : ""} />
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="page-kicker">{user.organizationName}</span>
            <h1>
              {view === "exceptions"
                ? "Exception review"
                : view === "history"
                  ? "Reconciliations"
                  : view === "accounts"
                    ? "Reconciliations"
                    : view === "reconciliation"
                      ? selected?.name || "Reconciliation"
                      : view === "close"
                        ? "Financial close"
                        : view === "settings"
                          ? "Workspace settings"
                          : `Good ${greeting()}, ${user.name.split(" ")[0]}`}
            </h1>
            <p>
              {view === "overview"
                ? "A high-level view of reconciliation health, close readiness, and open work."
                : view === "reconciliation"
                  ? "Review balances, evidence, exceptions, and certification for this reconciliation."
                  : view === "exceptions"
                    ? "Explain, assign, and resolve every difference."
                    : view === "history"
                      ? "Every run, decision, and result in one place."
                      : view === "accounts"
                        ? "Set up work once, then start the next period with the right owner, reviewer, and controls already filled in."
                        : view === "close"
                          ? "Run a controlled month-end, quarter-end, or year-end close."
                          : "Your free Taliqor workspace."}
            </p>
          </div>
          <div className="header-actions">
            <button className="icon-button" aria-label="Notifications">
              <Bell />
            </button>
            {view !== "close" && (
              <button className="primary" onClick={() => setWizard(true)}>
                <UploadSimple />
                New one-off reconciliation
              </button>
            )}
          </div>
        </header>
        {error && !wizard && (
          <div className="banner error">
            {error}
            <button onClick={() => setError("")}>
              <X />
            </button>
          </div>
        )}
        {notice && !wizard && (
          <div className="banner notice">
            {notice}
            <button aria-label="Dismiss notification" onClick={() => setNotice("")}>
              <X />
            </button>
          </div>
        )}
        {loading ? (
          <div className="loading-state">
            <span />
            <p>Loading your workspace…</p>
          </div>
        ) : view === "close" ? (
          <CloseHub
            periods={closePeriods}
            setPeriods={setClosePeriods}
            runs={runs}
            setRuns={setRuns}
            adjustments={adjustments}
            setAdjustments={setAdjustments}
            evidence={evidence}
            auditEvents={auditEvents}
            refreshAudit={refreshAudit}
            saveAdjustment={saveAdjustment}
            uploadEvidence={uploadEvidence}
            deleteEvidence={deleteEvidence}
            user={user}
            selectedCloseId={activeCloseId}
            selectClose={(closeId) => navigateDashboard("close", { closeId })}
            openReconciliation={(id) => {
              navigateDashboard("reconciliation", { reconciliationId: id });
            }}
          />
        ) : view === "settings" ? (
          <Settings
            user={user}
            templates={templates}
            setTemplates={setTemplates}
            rules={matchingRules}
            setRules={setMatchingRules}
          />
        ) : view === "history" ? (
          <History
            runs={runs}
            periods={closePeriods}
            openPlan={() => navigateDashboard("accounts")}
            select={(id) => {
              navigateDashboard("reconciliation", { reconciliationId: id });
            }}
          />
        ) : view === "accounts" ? (
          <AccountPlan
            profiles={reconciliationProfiles}
            setProfiles={setReconciliationProfiles}
            runs={runs}
            openHistory={() => navigateDashboard("history")}
            start={(profile) => {
              const period = new Date().toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              });
              setRunName(`${profile.name} — ${period}`);
              setRunOptions((current) => ({
                ...current,
                profileId: profile.id,
                method: profile.method,
                materiality: profile.materiality,
              }));
              setWizard(true);
            }}
          />
        ) : view === "overview" ? (
          <WorkspaceOverview
            runs={runs}
            periods={closePeriods}
            adjustments={adjustments}
            openReconciliation={(id) => {
              navigateDashboard("reconciliation", { reconciliationId: id });
            }}
            openClose={() => navigateDashboard("close")}
            start={() => setWizard(true)}
          />
        ) : !selected ? (
          <Empty onStart={() => setWizard(true)} />
        ) : (
          <>
            <section className="run-toolbar">
              <div>
                <span className="live-dot" />
                {reconciliationStatusLabel(selected.status).toUpperCase()}{" "}
                <strong>{selected.name}</strong>
                <small>
                  {selected.periodEnd ||
                    new Date(selected.createdAt).toLocaleDateString()}{" "}
                  · {selected.leftName} vs {selected.rightName}
                  {selected.closePeriodId &&
                    ` · Used in ${closePeriods.find((period) => period.id === selected.closePeriodId)?.name || "close"}`}
                </small>
                <span className="run-source-label">
                  {selected.profileId
                    ? `Recurring · ${reconciliationProfiles.find((profile) => profile.id === selected.profileId)?.name || "account"}`
                    : "One-off reconciliation"}
                </span>
              </div>
              <div>
                <select
                  value={selected.id}
                  onChange={(e) =>
                    navigateDashboard("reconciliation", {
                      reconciliationId: e.target.value,
                    })
                  }
                >
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.name} — {reconciliationStatusLabel(run.status)}
                    </option>
                  ))}
                </select>
                <button onClick={printPacket}>
                  <Printer />
                  Packet
                </button>
                <button onClick={exportRun}>
                  <DownloadSimple />
                  CSV
                </button>
                {!selected.profileId && (
                  <button onClick={() => makeRunRecurring(selected)}>
                    <Copy />
                    Make recurring
                  </button>
                )}
              </div>
            </section>
            {selected.profileId && (
              <section className="continuity-banner">
                <ClockCounterClockwise weight="duotone" />
                <div><strong>{selected.priorReconciliationId ? "Prior-period continuity connected" : "First period for this recurring account"}</strong><span>{selected.priorReconciliationId ? "The prior ending balance was carried into this roll-forward. Open the prior period to trace the handoff." : "Once this period is certified, its ending balance will become the starting point for the next reconciliation."}</span></div>
                {selected.priorReconciliationId && <button onClick={() => navigateDashboard("reconciliation", { reconciliationId: selected.priorReconciliationId })}>Open prior period <ArrowRight /></button>}
              </section>
            )}
            <ControlSummary
              source={sourceBalance}
              comparison={comparisonBalance}
              explained={explained}
              materiality={selected.materiality}
            />
            <BalanceRollforward
              run={selected}
              adjustments={adjustments.filter((item) => item.reconciliationId === selected.id)}
              update={updateRun}
            />
            <section className="metrics">
              <Metric
                label="Revenue processed"
                help="Total value of source transactions included in this reconciliation."
                value={money.format(total)}
                trend={`${allMatches.length} source rows`}
              />
              <Metric
                label="Reconciliation rate"
                help="Share of results that are matched or have been resolved."
                value={`${rate}%`}
                trend={`${matched} resolved`}
              />
              <Metric
                label="Needs attention"
                help="Unmatched or review items that still need a decision or explanation."
                value={String(exceptions)}
                trend="open exceptions"
                warn
              />
              <Metric
                label="Aged 30+ days"
                help="Open items dated more than 30 days ago that may need escalation."
                value={String(
                  allMatches.filter(
                    (item) =>
                      item.left.date &&
                      Date.now() - Date.parse(item.left.date) > 2592000000 &&
                      item.status !== "matched",
                  ).length,
                )}
                trend="stale items"
                warn
              />
            </section>
            <AdjustmentPanel
              reconciliation={selected}
              closePeriodId={selected.closePeriodId}
              adjustments={adjustments.filter((item) => item.reconciliationId === selected.id)}
              evidence={evidence.filter((item) => item.reconciliationId === selected.id)}
              draftMatch={selected.matches.find((item) => item.id === adjustmentDraftMatchId)}
              clearDraft={() => setAdjustmentDraftMatchId("")}
              saveAdjustment={saveAdjustment}
              uploadEvidence={uploadEvidence}
              deleteEvidence={deleteEvidence}
              user={user}
            />
            <CertificationPanel run={selected} user={user} update={updateRun} />
            <section className="panel activity full-activity">
              <div className="panel-title">
                <div>
                  <h2>
                    {view === "exceptions"
                      ? "Open exceptions"
                      : "Reconciliation results"}
                  </h2>
                  <InfoTip text="Each row shows how a source transaction matched, the evidence behind the match, and any action still required." />
                  <p>
                    {view === "exceptions"
                      ? "Classify differences and document their resolution."
                      : "Every match includes the evidence behind it."}
                  </p>
                </div>
                <div className="table-actions">
                  <label>
                    <MagnifyingGlass />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search transactions"
                    />
                  </label>
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as typeof filter)}
                  >
                    <option value="all">All statuses</option>
                    <option value="matched">Matched</option>
                    <option value="review">Review</option>
                    <option value="unmatched">Unmatched</option>
                  </select>
                </div>
              </div>
              <Results
                rows={rows}
                decide={decide}
                update={updateException}
                adjustments={adjustments.filter((item) => item.reconciliationId === selected.id)}
                evidence={evidence.filter((item) => item.reconciliationId === selected.id)}
                createAdjustment={startAdjustment}
                uploadEvidence={(file, matchId) => uploadEvidence(file, { reconciliationId: selected.id, matchId })}
                deleteEvidence={deleteEvidence}
              />
            </section>
            <AuditTimeline events={auditEvents.filter((event) => event.entityId === selected.id)} />
          </>
        )}
      </main>
      {wizard && (
        <Wizard
          step={wizardStep}
          left={left}
          right={right}
          runName={runName}
          periods={closePeriods}
          closePeriodId={runOptions.closePeriodId}
          profiles={reconciliationProfiles}
          profileId={runOptions.profileId}
          error={error}
          notice={notice}
          saving={saving}
          leftRef={leftRef}
          rightRef={rightRef}
          setRunName={setRunName}
          setClosePeriod={(closePeriodId) => {
            const period = closePeriods.find(
              (item) => item.id === closePeriodId,
            );
            setRunOptions((current) => ({
              ...current,
              closePeriodId,
              periodEnd: period?.periodEnd || current.periodEnd,
            }));
          }}
          setProfile={(profileId) => {
            const profile = reconciliationProfiles.find(
              (item) => item.id === profileId,
            );
            setRunOptions((current) => ({
              ...current,
              profileId,
              method: profile?.method || current.method,
              materiality: profile?.materiality ?? current.materiality,
            }));
            if (profile && !runName)
              setRunName(`${profile.name} reconciliation`);
          }}
          chooseFile={chooseFile}
          chooseSheet={chooseSheet}
          setMapping={(side, field, value) =>
            side === "left"
              ? setLeft(
                  (current) =>
                    current && {
                      ...current,
                      mapping: { ...current.mapping, [field]: value },
                    },
                )
              : setRight(
                  (current) =>
                    current && {
                      ...current,
                      mapping: { ...current.mapping, [field]: value },
                    },
                )
          }
          next={beginMapping}
          run={createRun}
          close={closeWizard}
        />
      )}
    </div>
  );
}

function Nav({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}
function Metric({
  label,
  value,
  trend,
  warn,
  help,
}: {
  label: string;
  value: string;
  trend: string;
  warn?: boolean;
  help?: string;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>
          {label}
          {help && <InfoTip text={help} />}
        </span>
        <span className={warn ? "metric-icon warning" : "metric-icon"}>
          {warn ? <Warning /> : <ChartLineUp />}
        </span>
      </div>
      <strong>{value}</strong>
      <p className={warn ? "negative" : "positive"}>
        {warn ? <ArrowDown /> : <ArrowUp />}
        {trend}
      </p>
    </div>
  );
}

function InfoTip({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={`info-tip ${className}`} tabIndex={0} aria-label={text}>
      <span role="tooltip">{text}</span>
    </span>
  );
}
function Empty({ onStart }: { onStart: () => void }) {
  return (
    <section className="empty-workspace">
      <span>
        <Sparkle weight="fill" />
      </span>
      <small>YOUR FIRST RECONCILIATION</small>
      <h2>Turn two spreadsheets into one clear answer.</h2>
      <p>
        Upload a source file and a comparison file. Taliqor will map the
        columns, find likely matches, and surface everything that needs
        attention.
      </p>
      <button className="primary" onClick={onStart}>
        <UploadSimple />
        Upload two spreadsheet files
      </button>
      <div>
        <i>
          <Check />
          Automatic column suggestions
        </i>
        <i>
          <Check />
          Explainable confidence scores
        </i>
        <i>
          <Check />
          Reusable mappings
        </i>
      </div>
    </section>
  );
}

function WorkspaceOverview({
  runs,
  periods,
  adjustments,
  openReconciliation,
  openClose,
  start,
}: {
  runs: ReconciliationRun[];
  periods: ClosePeriod[];
  adjustments: JournalAdjustment[];
  openReconciliation: (id: string) => void;
  openClose: () => void;
  start: () => void;
}) {
  if (!runs.length && !periods.length) return <Empty onStart={start} />;
  const allResults = runs.flatMap((run) => run.matches);
  const resolved = allResults.filter(
    (item) => item.status === "matched" || item.decision === "approved",
  ).length;
  const open = allResults.length - resolved;
  const certified = runs.filter((run) => run.status === "certified").length;
  const readyForReview = runs.filter((run) => run.status === "review").length;
  const activeClose =
    periods.find((period) => period.status === "open") || periods[0];
  const closeDone =
    activeClose?.tasks.filter((task) => task.status === "done").length || 0;
  const closeTotal = activeClose?.tasks.length || 0;
  const closePercent = activeClose ? closeReadiness(activeClose, runs, adjustments) : 0;
  const closeRuns = activeClose
    ? runs.filter((run) => run.closePeriodId === activeClose.id)
    : [];
  const certifiedCloseRuns = closeRuns.filter(
    (run) => run.status === "certified",
  ).length;
  const reconciliationRate = allResults.length
    ? Math.round((resolved / allResults.length) * 1000) / 10
    : 0;
  return (
    <>
      <section className="overview-welcome">
        <div>
          <span>WORKSPACE HEALTH</span>
          <h2>
            {open
              ? `${open} item${open === 1 ? "" : "s"} need attention`
              : "Everything is reconciled"}
          </h2>
          <p>Monitor every reconciliation and close period from one place.</p>
        </div>
        <button className="primary" onClick={start}>
          <UploadSimple />
          New reconciliation
        </button>
      </section>
      <section className="metrics overview-metrics">
        <Metric
          label="Overall reconciliation rate"
          help="Resolved results divided by all reconciliation results in the workspace."
          value={`${reconciliationRate}%`}
          trend={`${resolved} of ${allResults.length} results resolved`}
        />
        <Metric
          label="Open exceptions"
          help="Differences across all reconciliations that still need attention."
          value={String(open)}
          trend="across all reconciliations"
          warn={open > 0}
        />
        <Metric
          label="Ready for review"
          help="Reconciliations submitted by a preparer and waiting for reviewer approval."
          value={String(readyForReview)}
          trend={`${certified} certified · ${runs.length} total`}
        />
        <Metric
          label="Current close"
          help="Close readiness uses the same calculation as Close Hub: checklist completion supplies 70%, and connected certified reconciliations supply 30%."
          value={activeClose ? `${closePercent}%` : "—"}
          trend={activeClose?.name || "No close period started"}
        />
      </section>
      <section className="overview-grid">
        <div className="panel overview-list">
          <div className="panel-title">
            <div>
              <h2>Recent reconciliations</h2>
              <InfoTip text="Your latest reconciliation runs, their completion rate, workflow status, and connected close." />
              <p>Health and exceptions across your latest work.</p>
            </div>
          </div>
          {runs.slice(0, 5).map((run) => {
            const runResolved = run.matches.filter(
              (item) =>
                item.status === "matched" || item.decision === "approved",
            ).length;
            const runRate = run.matches.length
              ? Math.round((runResolved / run.matches.length) * 100)
              : 0;
            return (
              <button key={run.id} onClick={() => openReconciliation(run.id)}>
                <span className={`overview-status ${run.status}`}>
                  <Rows />
                </span>
                <div>
                  <strong>{run.name}</strong>
                  <small>
                    {run.leftName} vs {run.rightName} ·{" "}
                    {run.matches.length - runResolved} open
                    {run.closePeriodId &&
                      ` · Used in ${periods.find((period) => period.id === run.closePeriodId)?.name || "close"}`}
                  </small>
                </div>
                <div>
                  <strong>{runRate}%</strong>
                  <small>{reconciliationStatusLabel(run.status)}</small>
                </div>
                <ArrowRight />
              </button>
            );
          })}
        </div>
        <div className="panel close-snapshot">
          <div className="panel-title">
            <div>
              <h2>Close readiness</h2>
              <InfoTip text="The checklist supplies 70% of readiness. Connected reconciliations must be certified to supply the final 30%." />
              <p>{activeClose?.name || "Start your first close period."}</p>
            </div>
          </div>
          {activeClose ? (
            <>
              <div
                className="snapshot-ring"
                style={
                  {
                    "--progress": `${closePercent * 3.6}deg`,
                  } as React.CSSProperties
                }
              >
                <strong>{closePercent}%</strong>
                <span>close ready</span>
              </div>
              <dl>
                <div>
                  <dt>Tasks complete</dt>
                  <dd>
                    {closeDone}/{closeTotal}
                  </dd>
                </div>
                <div>
                  <dt>Certified reconciliations</dt>
                  <dd>
                    {certifiedCloseRuns}/{closeRuns.length}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="empty-small">No active close workspace.</div>
          )}
          <button onClick={openClose}>
            {activeClose ? "Open Close Hub" : "Start a close"}
            <ArrowRight />
          </button>
        </div>
      </section>
    </>
  );
}
function Results({
  rows,
  decide,
  update,
  adjustments,
  evidence,
  createAdjustment,
  uploadEvidence,
  deleteEvidence,
}: {
  rows: Match[];
  decide: (id: string, decision: "pending" | "approved" | "rejected") => void;
  update: (id: string, patch: Partial<Match>) => void;
  adjustments: JournalAdjustment[];
  evidence: EvidenceFile[];
  createAdjustment: (matchId: string) => void;
  uploadEvidence: (file: File | undefined, matchId: string) => void;
  deleteEvidence: (id: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Source transaction</th>
            <th>Comparison</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Resolution</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.left.id}</strong>
                <small>
                  {item.left.description} · {item.left.date || "No date"}
                </small>
              </td>
              <td>
                {item.right ? (
                  <>
                    <strong>
                      {item.groupedRight?.length
                        ? `${item.groupedRight.length} grouped items`
                        : item.right.id}
                    </strong>
                    <small>{item.reason}</small>
                  </>
                ) : (
                  <span className="muted">No match found</span>
                )}
              </td>
              <td>
                <strong>{money.format(item.left.amount)}</strong>
                {item.right && (
                  <small>
                    vs{" "}
                    {money.format(
                      item.groupedRight?.reduce(
                        (sum, row) => sum + row.amount,
                        0,
                      ) ?? item.right.amount,
                    )}
                  </small>
                )}
              </td>
              <td>
                <span className={`status ${item.status}`}>
                  {item.status === "matched" ? (
                    <CheckCircle weight="fill" />
                  ) : (
                    <Warning weight="fill" />
                  )}
                  {item.decision === "rejected"
                    ? "Rejected"
                    : item.status[0].toUpperCase() + item.status.slice(1)}
                </span>
                {item.confidence > 0 && (
                  <small>{item.confidence}% confidence</small>
                )}
              </td>
              <td>
                {item.status !== "matched" ? (
                  <div className="resolution-fields">
                    <select
                      value={item.exceptionType || ""}
                      onChange={(event) =>
                        update(item.id, {
                          exceptionType: event.target
                            .value as Match["exceptionType"],
                        })
                      }
                    >
                      <option value="">Classify…</option>
                      <option value="timing">Timing difference</option>
                      <option value="fee">Processing fee</option>
                      <option value="refund">Refund</option>
                      <option value="chargeback">Chargeback</option>
                      <option value="duplicate">Duplicate</option>
                      <option value="missing_ledger">
                        Missing from ledger
                      </option>
                      <option value="missing_source">
                        Missing from source
                      </option>
                      <option value="amount">Amount difference</option>
                      <option value="currency">Currency conversion</option>
                      <option value="deposit_transit">
                        Deposit in transit
                      </option>
                      <option value="outstanding">Outstanding payment</option>
                      <option value="journal">Journal entry required</option>
                      <option value="other">Other</option>
                    </select>
                    <input
                      value={item.explanation || ""}
                      onChange={(event) =>
                        update(item.id, { explanation: event.target.value })
                      }
                      placeholder="Explain the difference"
                    />
                    <div>
                      <input
                        value={item.owner || ""}
                        onChange={(event) =>
                          update(item.id, { owner: event.target.value })
                        }
                        placeholder="Owner"
                      />
                      <input
                        type="date"
                        value={item.dueDate || ""}
                        onChange={(event) =>
                          update(item.id, { dueDate: event.target.value })
                        }
                      />
                    </div>
                    <div className="exception-support-actions">
                      <button type="button" onClick={() => createAdjustment(item.id)}>
                        Create adjustment
                      </button>
                      <label>
                        Attach evidence
                        <input
                          hidden
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.xlsx,.xls"
                          onChange={(event) => {
                            uploadEvidence(event.target.files?.[0], item.id);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    {(adjustments.some((entry) => entry.matchId === item.id) ||
                      evidence.some((file) => file.matchId === item.id)) && (
                      <small className="exception-linked-records">
                        {adjustments.filter((entry) => entry.matchId === item.id).length} adjustment · {evidence.filter((file) => file.matchId === item.id).length} file
                      </small>
                    )}
                    <div className="evidence-links exception-evidence-links">
                      {evidence.filter((file) => file.matchId === item.id && !file.adjustmentId).map((file) => (
                        <span key={file.id}>
                          <a href={file.url} target="_blank" rel="noreferrer">{file.fileName}</a>
                          <button aria-label={`Remove ${file.fileName}`} onClick={() => deleteEvidence(file.id)}><X /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <small className="reason">{item.reason}</small>
                )}
              </td>
              <td>
                {item.status === "matched" || item.decision === "approved" ? (
                  <button
                    className="resolution-action reopen"
                    title="Reopen this result"
                    onClick={() => decide(item.id, "pending")}
                  >
                    Unresolve
                  </button>
                ) : (
                  <div className="row-actions">
                    <button
                      className="resolve-action"
                      title="Resolve"
                      aria-label="Resolve line item"
                      onClick={() => decide(item.id, "approved")}
                    >
                      <Check />
                    </button>
                    <button
                      className="reject-action"
                      title="Reject"
                      aria-label="Reject line item"
                      onClick={() => decide(item.id, "rejected")}
                    >
                      <X />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty">No transactions match this view.</div>
      )}
    </div>
  );
}
function History({
  runs,
  periods,
  openPlan,
  select,
}: {
  runs: ReconciliationRun[];
  periods: ClosePeriod[];
  openPlan: () => void;
  select: (id: string) => void;
}) {
  return (
    <>
      <ReconciliationTabs active="history" openPlan={openPlan} />
      <section className="history-list">
        {!runs.length ? (
          <Empty onStart={() => {}} />
        ) : (
          runs.map((run) => {
            const resolved = run.matches.filter(
              (m) => m.status === "matched" || m.decision === "approved",
            ).length;
            return (
              <button key={run.id} onClick={() => select(run.id)}>
                <span className="history-icon">
                  <ClockCounterClockwise />
                </span>
                <div>
                  <strong>{run.name}</strong>
                  <small>
                    {run.leftName} vs {run.rightName} ·{" "}
                    {new Date(run.createdAt).toLocaleString()}
                  </small>
                  {run.closePeriodId && (
                    <span className="close-link-label">
                      Used in{" "}
                      {periods.find((period) => period.id === run.closePeriodId)
                        ?.name || "close"}
                    </span>
                  )}
                  <span className={run.profileId ? "recurring-label" : "one-off-label"}>
                    {run.profileId ? "Recurring account" : "One-off"}
                  </span>
                </div>
                <div className="history-stats">
                  <span className={`reconciliation-state ${run.status}`}>
                    {reconciliationStatusLabel(run.status)}
                  </span>
                  <strong>
                    {run.matches.length
                      ? Math.round((resolved / run.matches.length) * 100)
                      : 0}
                    %
                  </strong>
                  <small>{run.matches.length} records</small>
                </div>
                <ArrowRight />
              </button>
            );
          })
        )}
      </section>
    </>
  );
}

function AccountPlan({
  profiles,
  setProfiles,
  runs,
  openHistory,
  start,
}: {
  profiles: ReconciliationProfile[];
  setProfiles: (profiles: ReconciliationProfile[]) => void;
  runs: ReconciliationRun[];
  openHistory: () => void;
  start: (profile: ReconciliationProfile) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    accountNumber: "",
    accountType: "cash",
    method: "balance" as ReconciliationRun["method"],
    frequency: "monthly" as ReconciliationProfile["frequency"],
    risk: "medium" as ReconciliationProfile["risk"],
    materiality: 0,
    preparer: "",
    reviewer: "",
    dueOffset: 5,
    subsidiary: "",
    requiredSupport: "",
  });
  const [error, setError] = useState("");

  async function createProfile() {
    if (!form.name.trim())
      return setError("Enter an account or reconciliation name.");
    const response = await fetch("/api/reconciliation-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, dimensions: { subsidiary: form.subsidiary }, requiredSupport: form.requiredSupport.split(",").map((item) => item.trim()).filter(Boolean) }),
    });
    const data = await response.json();
    if (!response.ok)
      return setError(data.error || "The plan could not be saved.");
    setProfiles(
      [...profiles, data.profile].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setCreating(false);
    setError("");
    setForm({ ...form, name: "", accountNumber: "" });
  }

  return (
    <section className="account-plan">
      <ReconciliationTabs active="plan" openHistory={openHistory} />
      <div className="account-plan-head">
        <div>
          <span>
            RECURRING ACCOUNTS{" "}
            <InfoTip text="Recurring accounts remember who prepares and reviews the work, how often it happens, and which controls to reuse. Each period still gets its own reconciliation." />
          </span>
          <h2>Set it up once. Start the next period from here.</h2>
          <p>
            These are reusable account setups—not completed reconciliations. Use
            “Start this period” to create the actual work for a new period.
          </p>
        </div>
        <button className="primary" onClick={() => setCreating(!creating)}>
          {creating ? "Cancel" : "Add account"}
        </button>
      </div>
      {creating && (
        <div className="panel account-plan-form">
          <div className="panel-title">
            <div>
              <h2>Add an account</h2>
              <p>
                Keep this lightweight; details carry into each reconciliation.
              </p>
            </div>
          </div>
          <div>
            <label>
              Account name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Operating bank account"
              />
            </label>
            <label>
              Account number
              <input
                value={form.accountNumber}
                onChange={(e) =>
                  setForm({ ...form, accountNumber: e.target.value })
                }
                placeholder="1010"
              />
            </label>
            <label>
              Account type
              <select
                value={form.accountType}
                onChange={(e) =>
                  setForm({ ...form, accountType: e.target.value })
                }
              >
                <option value="cash">Cash</option>
                <option value="receivable">Receivable</option>
                <option value="payable">Payable</option>
                <option value="prepaid">Prepaid</option>
                <option value="accrual">Accrual</option>
                <option value="clearing">Clearing</option>
                <option value="fixed_asset">Fixed asset</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Method
              <select
                value={form.method}
                onChange={(e) =>
                  setForm({
                    ...form,
                    method: e.target.value as ReconciliationRun["method"],
                  })
                }
              >
                <option value="transaction">Transaction matching</option>
                <option value="balance">Balance comparison</option>
                <option value="account_analysis">Account analysis</option>
                <option value="variance">Variance analysis</option>
              </select>
            </label>
            <label>
              Frequency
              <select
                value={form.frequency}
                onChange={(e) =>
                  setForm({
                    ...form,
                    frequency: e.target
                      .value as ReconciliationProfile["frequency"],
                  })
                }
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label>
              Risk
              <select
                value={form.risk}
                onChange={(e) =>
                  setForm({
                    ...form,
                    risk: e.target.value as ReconciliationProfile["risk"],
                  })
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label>
              Materiality threshold
              <input
                type="number"
                min="0"
                value={form.materiality}
                onChange={(e) =>
                  setForm({ ...form, materiality: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Preparer
              <input
                value={form.preparer}
                onChange={(e) => setForm({ ...form, preparer: e.target.value })}
                placeholder="Name or role"
              />
            </label>
            <label>
              Reviewer
              <input
                value={form.reviewer}
                onChange={(e) => setForm({ ...form, reviewer: e.target.value })}
                placeholder="Name or role"
              />
            </label>
            <label>
              Due days after period end
              <input type="number" min="-30" max="90" value={form.dueOffset} onChange={(e) => setForm({ ...form, dueOffset: Number(e.target.value) })} />
            </label>
            <label>
              Subsidiary or entity <small>Optional dimension</small>
              <input value={form.subsidiary} onChange={(e) => setForm({ ...form, subsidiary: e.target.value })} placeholder="Example: US parent" />
            </label>
            <label>
              Required support <small>Optional, comma separated</small>
              <input value={form.requiredSupport} onChange={(e) => setForm({ ...form, requiredSupport: e.target.value })} placeholder="Bank statement, deposit detail" />
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="primary" onClick={createProfile}>
            Save account
          </button>
        </div>
      )}
      <div className="account-plan-grid">
        {profiles.map((profile) => {
          const lastRun = runs.find((run) => run.profileId === profile.id);
          return (
            <article className="panel" key={profile.id}>
              <div>
                <span className={`risk ${profile.risk}`}>
                  {profile.risk} risk
                </span>
                <small>{profile.frequency}</small>
              </div>
              <h3>{profile.name}</h3>
              <p>
                {profile.accountNumber || "No account number"} ·{" "}
                {reconciliationMethodLabel(profile.method)}
              </p>
              <dl>
                <div>
                  <dt>Preparer</dt>
                  <dd>{profile.preparer || "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Reviewer</dt>
                  <dd>{profile.reviewer || "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Materiality</dt>
                  <dd>{money.format(profile.materiality)}</dd>
                </div>
                <div><dt>Due</dt><dd>{profile.dueOffset} days after period end</dd></div>
                {profile.dimensions.subsidiary && <div><dt>Entity</dt><dd>{profile.dimensions.subsidiary}</dd></div>}
              </dl>
              {profile.requiredSupport.length > 0 && <p className="required-support"><strong>Required support:</strong> {profile.requiredSupport.join(" · ")}</p>}
              <div className="account-plan-status">
                <span
                  className={`reconciliation-state ${lastRun?.status || "draft"}`}
                >
                  {lastRun
                    ? reconciliationStatusLabel(lastRun.status)
                    : "Not started"}
                </span>
                <small>{lastRun?.periodEnd || "No prior period"}</small>
              </div>
              <button className="primary" onClick={() => start(profile)}>
                Start this period <ArrowRight />
              </button>
            </article>
          );
        })}
        {!profiles.length && !creating && (
          <div className="empty-small">
            Add the first recurring account your team reconciles each period.
          </div>
        )}
      </div>
    </section>
  );
}

function ReconciliationTabs({
  active,
  openPlan,
  openHistory,
}: {
  active: "plan" | "history";
  openPlan?: () => void;
  openHistory?: () => void;
}) {
  return (
    <div className="reconciliation-tabs" aria-label="Reconciliation views">
      <button className={active === "plan" ? "active" : ""} onClick={openPlan}>
        Recurring accounts
      </button>
      <button
        className={active === "history" ? "active" : ""}
        onClick={openHistory}
      >
        Reconciliation history
      </button>
    </div>
  );
}
function Settings({
  user,
  templates,
  setTemplates,
  rules,
  setRules,
}: {
  user: UserInfo;
  templates: MappingTemplate[];
  setTemplates: (templates: MappingTemplate[]) => void;
  rules: MatchingRule[];
  setRules: (rules: MatchingRule[]) => void;
}) {
  const [ruleName, setRuleName] = useState("Standard matching"),
    [dateTolerance, setDateTolerance] = useState(3),
    [amountTolerance, setAmountTolerance] = useState(1),
    [autoApprove, setAutoApprove] = useState(90),
    [ruleMessage, setRuleMessage] = useState(""),
    [mappingMessage, setMappingMessage] = useState(""),
    [editingTemplateId, setEditingTemplateId] = useState(""),
    [templateName, setTemplateName] = useState(""),
    [deleteTemplateId, setDeleteTemplateId] = useState("");
  useEffect(() => {
    const current = rules[0];
    if (!current) return;
    setRuleName(current.name);
    setDateTolerance(current.settings.dateTolerance);
    setAmountTolerance(current.settings.amountTolerance);
    setAutoApprove(current.settings.autoApprove);
  }, [rules]);
  async function saveRule() {
    const settings = {
      dateTolerance,
      amountTolerance,
      autoApprove,
      allowGrouping: true,
    };
    setRuleMessage("");
    const current = rules[0];
    const response = await fetch(
      current ? `/api/matching-rules/${current.id}` : "/api/matching-rules",
      {
      method: current ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: ruleName, settings }),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      setRuleMessage(data.error || "The default rule could not be saved.");
      return;
    }
    setRules(current ? [data.rule, ...rules.slice(1)] : [data.rule, ...rules]);
    setRuleMessage("Default matching rules saved.");
  }
  function restoreRuleDefaults() {
    setRuleName("Standard matching");
    setDateTolerance(3);
    setAmountTolerance(1);
    setAutoApprove(90);
    setRuleMessage("Defaults restored in the form. Select Save defaults to apply them.");
  }
  async function renameTemplate(template: MappingTemplate) {
    const response = await fetch(`/api/mapping-templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: templateName }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMappingMessage(data.error || "The layout could not be renamed.");
      return;
    }
    setTemplates(
      templates.map((item) => (item.id === template.id ? data.template : item)),
    );
    setEditingTemplateId("");
    setTemplateName("");
    setMappingMessage("Remembered file layout renamed.");
  }
  async function deleteTemplate(template: MappingTemplate) {
    if (deleteTemplateId !== template.id) {
      setDeleteTemplateId(template.id);
      setMappingMessage("Select Confirm delete to remove this remembered layout.");
      return;
    }
    const response = await fetch(`/api/mapping-templates/${template.id}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok) {
      setMappingMessage(data.error || "The layout could not be deleted.");
      return;
    }
    setTemplates(templates.filter((item) => item.id !== template.id));
    setDeleteTemplateId("");
    setMappingMessage("Remembered file layout deleted.");
  }
  return (
    <section className="settings-grid">
      <div className="panel">
        <h2>Workspace</h2>
        <p>Your company workspace and account details.</p>
        <label>
          Organization
          <input disabled value={user.organizationName} />
        </label>
        <label>
          Account email
          <input disabled value={user.email} />
        </label>
        <span className="free-plan">
          <Sparkle weight="fill" />
          <div>
            <strong>Free workspace</strong>
            <small>No usage limits or billing information required.</small>
          </div>
        </span>
      </div>
      <TeamPanel user={user} />
      <div className="panel">
        <div className="settings-title">
          <h2>Default matching rules</h2>
          <InfoTip text="These defaults control how Taliqor scores new reconciliations. Recurring-account rules can override them later." />
        </div>
        <p>Choose how closely transactions must agree before Taliqor suggests or automatically approves a match.</p>
        <label>
          Rule name
          <input
            value={ruleName}
            onChange={(e) => setRuleName(e.target.value)}
          />
        </label>
        <div className="rule-grid">
          <label>
            Date tolerance
            <input
              type="number"
              min="0"
              value={dateTolerance}
              onChange={(e) => setDateTolerance(Number(e.target.value))}
            />
            <small>days</small>
          </label>
          <label>
            Amount tolerance
            <input
              type="number"
              min="0"
              step=".1"
              value={amountTolerance}
              onChange={(e) => setAmountTolerance(Number(e.target.value))}
            />
            <small>percent</small>
          </label>
          <label>
            Auto-approve
            <input
              type="number"
              min="1"
              max="100"
              value={autoApprove}
              onChange={(e) => setAutoApprove(Number(e.target.value))}
            />
            <small>confidence</small>
          </label>
        </div>
        <div className="settings-actions">
          <button className="primary" onClick={saveRule}>Save defaults</button>
          <button onClick={restoreRuleDefaults}>Restore defaults</button>
        </div>
        {ruleMessage && <p className="settings-message">{ruleMessage}</p>}
        {rules[0] && (
          <div className="template-row active-rule">
            <Gear />
            <div>
              <strong>Currently applied: {rules[0].name}</strong>
              <small>
                ±{rules[0].settings.dateTolerance} days · {rules[0].settings.amountTolerance}% amount difference · {rules[0].settings.autoApprove}% confidence
              </small>
            </div>
            <CheckCircle weight="fill" />
          </div>
        )}
      </div>
      <div className="panel">
        <div className="settings-title">
          <h2>Remembered file layouts</h2>
          <InfoTip text="When the same column headers return in a future upload, Taliqor automatically reuses these field assignments so you do not have to map them again." />
        </div>
        <p>Recognized spreadsheet layouts and the fields Taliqor will map automatically.</p>
        {mappingMessage && <p className="settings-message">{mappingMessage}</p>}
        {templates.length ? (
          templates.map((template) => (
            <div className="template-row mapping-template-row" key={template.id}>
              <FileCsv />
              <div>
                {editingTemplateId === template.id ? (
                  <div className="mapping-rename">
                    <input
                      value={templateName}
                      onChange={(event) => setTemplateName(event.target.value)}
                      aria-label="File layout name"
                    />
                    <button onClick={() => renameTemplate(template)}>Save</button>
                    <button onClick={() => setEditingTemplateId("")}>Cancel</button>
                  </div>
                ) : (
                  <strong>{template.name}</strong>
                )}
                <div className="mapping-fields">
                  {Object.entries(template.mapping)
                    .filter(([, column]) => Boolean(column))
                    .map(([field, column]) => (
                      <span key={field}><b>{field}</b> → {column}</span>
                    ))}
                </div>
              </div>
              <div className="mapping-row-actions">
                <button
                  onClick={() => {
                    setEditingTemplateId(template.id);
                    setTemplateName(template.name);
                    setDeleteTemplateId("");
                  }}
                >Rename</button>
                <button
                  className={deleteTemplateId === template.id ? "confirm-delete" : ""}
                  onClick={() => deleteTemplate(template)}
                >
                  {deleteTemplateId === template.id ? "Confirm delete" : "Delete"}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-small">
            Mappings appear after your first reconciliation.
          </div>
        )}
      </div>
      <AccountDeletionPanel user={user} />
    </section>
  );
}

function AccountDeletionPanel({ user }: { user: UserInfo }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const confirmed =
    email.trim().toLowerCase() === user.email.toLowerCase() &&
    confirmation === "DELETE";

  async function deleteAccount() {
    if (!confirmed || busy) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, confirmation }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Your account could not be deleted.");
      setBusy(false);
      return;
    }
    await createClient().auth.signOut({ scope: "local" });
    location.assign("/");
  }

  return (
    <div className="panel danger-zone">
      <div>
        <h2>Delete account</h2>
        <p>
          Permanently remove your Taliqor login and personal profile. If this is
          your private workspace, its reconciliations, closes, and archived source files
          are removed too. Shared company work stays with the team.
        </p>
      </div>
      {!open ? (
        <button className="danger-action" onClick={() => setOpen(true)}>
          <Trash /> Delete my account
        </button>
      ) : (
        <div className="delete-confirmation">
          <div className="delete-warning">
            <Warning weight="fill" />
            <span>This cannot be undone.</span>
          </div>
          <label>
            Confirm your email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={user.email}
              autoComplete="email"
            />
          </label>
          <label>
            Type DELETE
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </label>
          {message && <div className="team-message danger-message">{message}</div>}
          <div className="delete-actions">
            <button
              onClick={() => {
                setOpen(false);
                setEmail("");
                setConfirmation("");
                setMessage("");
              }}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="danger-action"
              onClick={deleteAccount}
              disabled={!confirmed || busy}
            >
              <Trash /> {busy ? "Deleting…" : "Permanently delete account"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "member";
  joinedAt: string;
};
type TeamInvitation = {
  id: string;
  email: string;
  token: string;
  status: "pending" | "accepted";
  expires_at: string;
  created_at: string;
};

function TeamPanel({ user }: { user: UserInfo }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = invitations.filter((item) => item.status === "pending");
  const usedSlots =
    members.filter((item) => item.role === "member").length + pending.length;

  async function loadTeam() {
    const response = await fetch("/api/team", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setMembers(data.members || []);
      setInvitations(data.invitations || []);
    } else {
      setMessage(data.error || "Team details could not be loaded.");
    }
  }

  useEffect(() => {
    loadTeam();
  }, []);

  async function invite() {
    if (!email.trim()) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    if (response.ok) {
      setInvitations((current) => [data.invitation, ...current]);
      setEmail("");
      setMessage(
        "Invitation created. Copy the secure link and send it to your teammate.",
      );
    } else {
      setMessage(data.error || "The invitation could not be created.");
    }
    setBusy(false);
  }

  async function copyInvite(token: string) {
    await navigator.clipboard.writeText(
      `${location.origin}/signup?invite=${token}`,
    );
    setMessage("Invitation link copied.");
  }

  async function revoke(id: string) {
    const response = await fetch("/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (response.ok) {
      setInvitations((current) => current.filter((item) => item.id !== id));
      setMessage("Invitation revoked.");
    } else {
      const data = await response.json();
      setMessage(data.error || "The invitation could not be revoked.");
    }
  }

  return (
    <div className="panel team-panel">
      <div className="team-heading">
        <div>
          <h2>Team</h2>
          <p>Give preparers and reviewers access to the same workspace.</p>
        </div>
        <span>{usedSlots}/3 invitation slots used</span>
      </div>
      {user.role === "owner" ? (
        <div className="team-invite">
          <label>
            Teammate email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="reviewer@company.com"
              disabled={usedSlots >= 3}
            />
          </label>
          <button
            className="primary"
            disabled={busy || usedSlots >= 3 || !email.trim()}
            onClick={invite}
          >
            <UserPlus />
            {busy ? "Creating…" : "Create invite"}
          </button>
        </div>
      ) : (
        <p className="team-note">
          Only the workspace owner can create invitations.
        </p>
      )}
      {message && (
        <div className="team-message" aria-live="polite">
          {message}
        </div>
      )}
      <div className="team-list">
        {members.map((member) => (
          <div key={member.id}>
            <span className="team-avatar">{initials(member.name)}</span>
            <span>
              <strong>{member.name}</strong>
              <small>{member.email}</small>
            </span>
            <b>{member.role}</b>
          </div>
        ))}
        {pending.map((invitation) => (
          <div key={invitation.id} className="pending-invite">
            <span className="team-avatar pending">@</span>
            <span>
              <strong>{invitation.email}</strong>
              <small>
                Pending · expires{" "}
                {new Date(invitation.expires_at).toLocaleDateString()}
              </small>
            </span>
            <div>
              <button
                aria-label="Copy invitation link"
                onClick={() => copyInvite(invitation.token)}
              >
                <Copy />
              </button>
              <button
                aria-label="Revoke invitation"
                className="danger"
                onClick={() => revoke(invitation.id)}
              >
                <Trash />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ControlSummary({
  source,
  comparison,
  explained,
  materiality,
}: {
  source: number;
  comparison: number;
  explained: number;
  materiality: number;
}) {
  const difference = Math.abs(source - comparison),
    unexplained = Math.max(0, difference - explained),
    ready = unexplained <= materiality;
  return (
    <section className={ready ? "control-summary ready" : "control-summary"}>
      <div>
        <small>CONTROL TOTALS</small>
        <h2>
          {ready ? "Balance is substantiated" : "Difference needs explanation"}
        </h2>
        <InfoTip text="Control totals compare the two balances, subtract explained items, and show the amount that remains unsupported." />
        <p>
          {ready
            ? "The unexplained difference is within materiality."
            : "Classify and explain exceptions until the unexplained balance is cleared."}
        </p>
      </div>
      <dl>
        <div>
          <dt>Source balance</dt>
          <dd>{money.format(source)}</dd>
        </div>
        <div>
          <dt>Comparison</dt>
          <dd>{money.format(comparison)}</dd>
        </div>
        <div>
          <dt>Explained</dt>
          <dd>{money.format(explained)}</dd>
        </div>
        <div>
          <dt>Unexplained</dt>
          <dd>{money.format(unexplained)}</dd>
        </div>
      </dl>
    </section>
  );
}

function BalanceRollforward({
  run,
  adjustments,
  update,
}: {
  run: ReconciliationRun;
  adjustments: JournalAdjustment[];
  update: (patch: Partial<ReconciliationRun>) => void;
}) {
  const beginning = run.beginningBalance ?? 0;
  const activity = run.periodActivity ?? (run.sourceBalance ?? 0) - beginning;
  const postedEffect = adjustments
    .filter((item) => item.status === "approved" || item.status === "posted")
    .reduce((sum, item) => sum + ((item.lines[0]?.debit || 0) - (item.lines[0]?.credit || 0)), 0);
  const ending = beginning + activity + postedEffect;
  const support = run.comparisonBalance ?? 0;
  return (
    <section className="panel rollforward-panel">
      <div className="panel-title">
        <div>
          <h2>Balance roll-forward</h2>
          <InfoTip text="Beginning balance plus period activity and approved or posted adjustments should arrive at the ending balance supported by the comparison source." />
          <p>Show how this account moved during the period and tie it to support.</p>
        </div>
      </div>
      <div className="rollforward-equation">
        <label>Beginning balance<input type="number" value={beginning} onChange={(event) => update({ beginningBalance: Number(event.target.value) })} /></label>
        <b>+</b>
        <label>Period activity<input type="number" value={activity} onChange={(event) => update({ periodActivity: Number(event.target.value) })} /></label>
        <b>+</b>
        <div><span>Adjustments</span><strong>{money.format(postedEffect)}</strong></div>
        <b>=</b>
        <div><span>Adjusted ending</span><strong>{money.format(ending)}</strong></div>
        <b>vs</b>
        <div><span>Supporting balance</span><strong>{money.format(support)}</strong></div>
      </div>
      <p className={Math.abs(ending - support) <= run.materiality ? "rollforward-tie" : "rollforward-gap"}>
        {Math.abs(ending - support) <= run.materiality
          ? "Roll-forward ties within materiality."
          : `${money.format(Math.abs(ending - support))} remains between the adjusted ending balance and support.`}
      </p>
    </section>
  );
}

function AdjustmentPanel({
  reconciliation,
  closePeriodId,
  adjustments,
  evidence,
  draftMatch,
  clearDraft,
  saveAdjustment,
  uploadEvidence,
  deleteEvidence,
  user,
}: {
  reconciliation: ReconciliationRun;
  closePeriodId?: string;
  adjustments: JournalAdjustment[];
  evidence: EvidenceFile[];
  draftMatch?: Match;
  clearDraft: () => void;
  saveAdjustment: (payload: Partial<JournalAdjustment>, id?: string) => Promise<JournalAdjustment | undefined>;
  uploadEvidence: (file: File | undefined, options: { reconciliationId?: string; adjustmentId?: string; matchId?: string }) => void;
  deleteEvidence: (id: string) => void;
  user: UserInfo;
}) {
  const blank = () => ({
    title: "", description: "", postingDate: reconciliation.periodEnd || new Date().toISOString().slice(0, 10),
    recurring: false, autoReverse: false, reversalDate: "",
    lines: [
      { account: "", description: "", debit: 0, credit: 0 },
      { account: "", description: "", debit: 0, credit: 0 },
    ] as JournalLine[],
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!draftMatch) return;
    const comparison = draftMatch.right?.amount || 0;
    const amount = Math.abs(draftMatch.proposedAdjustment ?? draftMatch.left.amount - comparison);
    setForm({
      ...blank(),
      title: `Adjustment for ${draftMatch.left.id}`,
      description: draftMatch.explanation || draftMatch.reason,
      lines: [
        { account: "", description: draftMatch.left.description, debit: amount, credit: 0 },
        { account: "", description: "Offset", debit: 0, credit: amount },
      ],
    });
    setOpen(true);
  }, [draftMatch]);
  const debits = form.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credits = form.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  async function create() {
    const saved = await saveAdjustment({
      ...form,
      reconciliationId: reconciliation.id,
      closePeriodId,
      matchId: draftMatch?.id,
      preparedBy: user.name,
    });
    if (!saved) return;
    setOpen(false);
    setForm(blank());
    clearDraft();
    setMessage("Adjustment saved and linked to this reconciliation.");
  }
  function exportAdjustment(item: JournalAdjustment) {
    const output = ["account,description,debit,credit", ...item.lines.map((line) => [line.account, line.description, line.debit, line.credit].map(csvEscape).join(","))].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([output], { type: "text/csv" }));
    link.download = `${item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-journal.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function exportAdjustmentXlsx(item: JournalAdjustment) {
    downloadXlsx(
      `${item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-journal.xlsx`,
      item.lines.map((line) => ({
        Account: line.account,
        Description: line.description,
        Debit: line.debit,
        Credit: line.credit,
      })),
    );
  }
  return (
    <section className="panel adjustment-panel">
      <div className="panel-title">
        <div>
          <h2>Adjusting journal entries</h2>
          <InfoTip text="Prepare and approve balanced entries here, post them in your accounting system, then record the posting reference. Material unfinished entries block the close." />
          <p>Turn reconciliation differences into controlled, traceable accounting actions.</p>
        </div>
        <button className="primary" onClick={() => { setOpen(!open); if (open) clearDraft(); }}>
          {open ? "Cancel" : "New adjustment"}
        </button>
      </div>
      {message && <p className="settings-message">{message}</p>}
      {open && (
        <div className="adjustment-editor">
          <div className="adjustment-meta">
            <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Accrue processor fees" /></label>
            <label>Posting date<input type="date" value={form.postingDate} onChange={(event) => setForm({ ...form, postingDate: event.target.value })} /></label>
            <label>Description<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Why this entry is needed" /></label>
          </div>
          <div className="journal-lines">
            <div className="journal-line headings"><b>Account</b><b>Description</b><b>Debit</b><b>Credit</b></div>
            {form.lines.map((line, index) => (
              <div className="journal-line" key={index}>
                <input value={line.account} onChange={(event) => setForm({ ...form, lines: form.lines.map((item, row) => row === index ? { ...item, account: event.target.value } : item) })} placeholder="Account" />
                <input value={line.description} onChange={(event) => setForm({ ...form, lines: form.lines.map((item, row) => row === index ? { ...item, description: event.target.value } : item) })} placeholder="Line description" />
                <input type="number" min="0" value={line.debit || ""} onChange={(event) => setForm({ ...form, lines: form.lines.map((item, row) => row === index ? { ...item, debit: Number(event.target.value), credit: event.target.value ? 0 : item.credit } : item) })} />
                <input type="number" min="0" value={line.credit || ""} onChange={(event) => setForm({ ...form, lines: form.lines.map((item, row) => row === index ? { ...item, credit: Number(event.target.value), debit: event.target.value ? 0 : item.debit } : item) })} />
              </div>
            ))}
          </div>
          <div className="journal-total"><span>Debits {money.format(debits)}</span><span>Credits {money.format(credits)}</span><b>{Math.abs(debits - credits) < 0.005 && debits > 0 ? "Balanced" : "Out of balance"}</b></div>
          <div className="adjustment-options">
            <label><input type="checkbox" checked={form.recurring} onChange={(event) => setForm({ ...form, recurring: event.target.checked })} /> Repeat in future closes</label>
            <label><input type="checkbox" checked={form.autoReverse} onChange={(event) => setForm({ ...form, autoReverse: event.target.checked })} /> Auto-reverse next period</label>
            {form.autoReverse && <label>Reversal date<input type="date" value={form.reversalDate} onChange={(event) => setForm({ ...form, reversalDate: event.target.value })} /></label>}
          </div>
          <button className="primary" disabled={!form.title || !form.lines.every((line) => line.account) || Math.abs(debits - credits) >= 0.005 || debits <= 0} onClick={create}>Save adjustment</button>
        </div>
      )}
      <div className="adjustment-list">
        {adjustments.map((item) => {
          const amount = item.lines.reduce((sum, line) => sum + line.debit, 0);
          return (
            <article key={item.id}>
              <div><strong>{item.title}</strong><small>{money.format(amount)} · {item.postingDate || "No posting date"}{item.recurring ? " · Recurring" : ""}{item.entryKind === "reversal" ? " · Auto-reversal" : ""}</small></div>
              <select value={item.status} onChange={(event) => saveAdjustment({ status: event.target.value as JournalAdjustment["status"], reviewedBy: event.target.value === "approved" ? user.name : item.reviewedBy }, item.id)}>
                <option value="draft">Draft</option><option value="review">Ready for review</option><option value="approved">Approved</option><option value="posted">Posted</option><option value="no_entry">No entry required</option>
              </select>
              <input defaultValue={item.externalReference} onBlur={(event) => saveAdjustment({ externalReference: event.target.value }, item.id)} placeholder="Posting reference" />
              <button onClick={() => exportAdjustment(item)}>Export CSV</button>
              <button onClick={() => exportAdjustmentXlsx(item)}>Export Excel</button>
              <label className="attachment-button">Attach<input hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.xlsx,.xls" onChange={(event) => { uploadEvidence(event.target.files?.[0], { reconciliationId: reconciliation.id, adjustmentId: item.id }); event.target.value = ""; }} /></label>
              <div className="evidence-links">{evidence.filter((file) => file.adjustmentId === item.id).map((file) => <span key={file.id}><a href={file.url} target="_blank" rel="noreferrer">{file.fileName}</a><button aria-label={`Remove ${file.fileName}`} onClick={() => deleteEvidence(file.id)}><X /></button></span>)}</div>
            </article>
          );
        })}
        {!adjustments.length && !open && <div className="empty-small">No adjusting entries are linked to this reconciliation.</div>}
      </div>
    </section>
  );
}

function CloseAdjustmentRegister({
  period,
  adjustments,
  evidence,
  saveAdjustment,
  uploadEvidence,
  deleteEvidence,
  user,
}: {
  period: ClosePeriod;
  adjustments: JournalAdjustment[];
  evidence: EvidenceFile[];
  saveAdjustment: (payload: Partial<JournalAdjustment>, id?: string) => Promise<JournalAdjustment | undefined>;
  uploadEvidence: (file: File | undefined, options: { reconciliationId?: string; adjustmentId?: string; matchId?: string }) => void;
  deleteEvidence: (id: string) => void;
  user: UserInfo;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [debitAccount, setDebitAccount] = useState("");
  const [creditAccount, setCreditAccount] = useState("");
  const [amount, setAmount] = useState(0);
  const [recurring, setRecurring] = useState(false);
  const [autoReverse, setAutoReverse] = useState(false);
  const outstanding = adjustments.filter((item) => !["posted", "no_entry"].includes(item.status));
  async function create() {
    const saved = await saveAdjustment({
      closePeriodId: period.id, title, postingDate: period.periodEnd, recurring, autoReverse,
      preparedBy: user.name,
      lines: [
        { account: debitAccount, description: title, debit: amount, credit: 0 },
        { account: creditAccount, description: `Offset — ${title}`, debit: 0, credit: amount },
      ],
    });
    if (saved) {
      setOpen(false); setTitle(""); setDebitAccount(""); setCreditAccount(""); setAmount(0);
    }
  }
  return (
    <section className="panel close-adjustments">
      <div className="panel-title">
        <div>
          <h2>Close adjustments</h2>
          <InfoTip text="Track entries discovered during the close. Material entries must be posted or marked no entry required before the period can close." />
          <p>{outstanding.length} entry{outstanding.length === 1 ? "" : "ies"} still need a final disposition.</p>
        </div>
        <button className="primary" onClick={() => setOpen(!open)}>{open ? "Cancel" : "New adjustment"}</button>
      </div>
      {open && (
        <div className="close-adjustment-form">
          <label>Entry title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Month-end accrual" /></label>
          <label>Debit account<input value={debitAccount} onChange={(event) => setDebitAccount(event.target.value)} /></label>
          <label>Credit account<input value={creditAccount} onChange={(event) => setCreditAccount(event.target.value)} /></label>
          <label>Amount<input type="number" min="0" value={amount || ""} onChange={(event) => setAmount(Number(event.target.value))} /></label>
          <label><input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} /> Repeat in future closes</label>
          <label><input type="checkbox" checked={autoReverse} onChange={(event) => setAutoReverse(event.target.checked)} /> Reverse next period</label>
          <button className="primary" disabled={!title || !debitAccount || !creditAccount || amount <= 0} onClick={create}>Save balanced entry</button>
        </div>
      )}
      <div className="close-adjustment-list">
        {adjustments.map((item) => (
          <article key={item.id}>
            <div><strong>{item.title}</strong><small>{money.format(item.lines.reduce((sum, line) => sum + line.debit, 0))}{item.entryKind === "reversal" ? " · Auto-reversal" : item.recurring ? " · Recurring" : ""}</small></div>
            <select value={item.status} onChange={(event) => saveAdjustment({ status: event.target.value as JournalAdjustment["status"], reviewedBy: event.target.value === "approved" ? user.name : item.reviewedBy }, item.id)}>
              <option value="draft">Draft</option><option value="review">Ready for review</option><option value="approved">Approved</option><option value="posted">Posted</option><option value="no_entry">No entry required</option>
            </select>
            <input defaultValue={item.externalReference} onBlur={(event) => saveAdjustment({ externalReference: event.target.value }, item.id)} placeholder="Posting reference" />
            <button onClick={() => downloadXlsx(`${item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-journal.xlsx`, item.lines.map((line) => ({ Account: line.account, Description: line.description, Debit: line.debit, Credit: line.credit })))}>Export Excel</button>
            <label className="attachment-button">Attach evidence<input hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.xlsx,.xls" onChange={(event) => { uploadEvidence(event.target.files?.[0], { adjustmentId: item.id }); event.target.value = ""; }} /></label>
            <div className="evidence-links">{evidence.filter((file) => file.adjustmentId === item.id).map((file) => <span key={file.id}><a href={file.url} target="_blank" rel="noreferrer">{file.fileName}</a><button aria-label={`Remove ${file.fileName}`} onClick={() => deleteEvidence(file.id)}><X /></button></span>)}</div>
          </article>
        ))}
        {!adjustments.length && !open && <div className="empty-small">No close adjustments yet.</div>}
      </div>
    </section>
  );
}

function CertificationPanel({
  run,
  user,
  update,
}: {
  run: ReconciliationRun;
  user: UserInfo;
  update: (patch: Partial<ReconciliationRun>) => void;
}) {
  const [conclusion, setConclusion] = useState(run.conclusion || "");
  const [changeReason, setChangeReason] = useState("");
  useEffect(
    () => setConclusion(run.conclusion || ""),
    [run.id, run.conclusion],
  );
  const certify = () =>
    update({
      status: "certified",
      conclusion,
      certification: {
        ...run.certification,
        preparedBy: run.certification.preparedBy || user.name,
        preparedAt: run.certification.preparedAt || new Date().toISOString(),
        reviewedBy: user.name,
        reviewedAt: new Date().toISOString(),
      },
    });
  const statusLabel = reconciliationStatusLabel(run.status);
  return (
    <section className="panel certification">
      <div>
        <SealCheck weight="duotone" />
        <span>
          <h2>Reconciliation certification</h2>
          <InfoTip text="The preparer submits completed work for review; the reviewer approves and certifies the conclusion for the audit trail." />
          <p>
            Submit completed work for review, then certify the reviewer-approved
            conclusion and audit trail.
          </p>
        </span>
      </div>
      <textarea
        value={conclusion}
        onChange={(e) => setConclusion(e.target.value)}
        onBlur={() => update({ conclusion })}
        placeholder="Describe the result, remaining timing items, and any adjustments posted."
      />
      {(run.status === "review" || run.status === "certified") && (
        <label className="change-reason-field">
          <span>Reason for requesting changes or reopening <InfoTip text="This explanation is preserved in the audit history and tells the preparer exactly what needs attention." /></span>
          <input value={changeReason} onChange={(event) => setChangeReason(event.target.value)} placeholder="Example: Attach the August bank statement and explain the outstanding deposit." />
        </label>
      )}
      {run.lockedAt && <div className="certification-lock"><LockKey weight="fill" /><span><strong>Certified work is locked</strong><small>Any change to balances, results, or the conclusion automatically requires another review.</small></span></div>}
      {run.changeReason && run.status === "changes_requested" && <div className="change-request-note"><Warning weight="fill" /><span><strong>Changes requested</strong><small>{run.changeReason}</small></span></div>}
      <footer>
        <span>
          <b className={`workflow-status ${run.status}`}>{statusLabel}</b>
          {run.certification.preparedBy
            ? ` · Prepared by ${run.certification.preparedBy}`
            : " · Not prepared"}
          {run.certification.reviewedBy
            ? ` · Reviewed by ${run.certification.reviewedBy}`
            : ""}
        </span>
        <div>
          {run.status === "review" ? (
            <button disabled={!changeReason.trim()} onClick={() => update({ status: "changes_requested", changeReason })}>
              Request changes
            </button>
          ) : run.status === "certified" ? (
            <button
              disabled={!changeReason.trim()}
              onClick={() =>
                update({
                  status: "changes_requested",
                  changeReason,
                  certification: {
                    ...run.certification,
                    reviewedBy: undefined,
                    reviewedAt: undefined,
                  },
                })
              }
            >
              Reopen certification
            </button>
          ) : (
            <button
              onClick={() =>
                update({
                  status: "review",
                  conclusion,
                  certification: {
                    ...run.certification,
                    preparedBy: user.name,
                    preparedAt: new Date().toISOString(),
                  },
                })
              }
            >
              Submit for review
            </button>
          )}
          <button
            className="primary"
            disabled={run.status !== "review"}
            title={
              run.status === "review"
                ? "Approve and certify this reconciliation"
                : "Submit this reconciliation for review before certifying"
            }
            onClick={certify}
          >
            {run.status === "certified" ? "Certified" : "Approve & certify"}
          </button>
        </div>
      </footer>
      <p className="review-control-note">When another teammate is available, the person who prepared this reconciliation cannot certify it. One-person workspaces are clearly recorded as self-reviewed.</p>
    </section>
  );
}

function AuditTimeline({ events, context = "reconciliation" }: { events: AuditEvent[]; context?: "reconciliation" | "close" }) {
  return (
    <section className="panel audit-timeline">
      <div className="panel-title"><div><h2>Audit history</h2><InfoTip text="A permanent, append-only record of preparation, review, certification, reopening, and important changes." /><p>Who did what, and when. These entries cannot be edited or deleted.</p></div></div>
      {events.length ? <div className="audit-event-list">{events.slice(0, 20).map((event) => <article key={event.id}><span className="audit-dot" /><div><strong>{event.summary}</strong><small>{event.actorName} · {new Date(event.createdAt).toLocaleString()}</small></div></article>)}</div> : <div className="empty-small">Activity will appear as this {context} moves through the workflow.</div>}
    </section>
  );
}

const monthTasks = [
  "Confirm all bank activity is imported",
  "Reconcile bank accounts",
  "Reconcile processor clearing accounts",
  "Review accounts receivable aging",
  "Review accounts payable aging",
  "Record accruals",
  "Record prepaid amortization",
  "Record depreciation",
  "Review payroll liabilities",
  "Review sales-tax balances",
  "Review unusual variances",
  "Confirm material accounts are reconciled",
  "Review financial statements",
  "Lock the period",
];
const yearTasks = [
  "Reconcile fixed-asset register",
  "Review asset disposals",
  "Confirm inventory count",
  "Review bad-debt allowance",
  "Review deferred revenue",
  "Confirm tax documents",
  "Prepare audit support",
  "Review retained earnings",
  "Archive final financial statements",
];
function makeTasks(
  end: string,
  type: "month" | "quarter" | "year",
  owner: string,
): CloseTask[] {
  return [...monthTasks, ...(type === "year" ? yearTasks : [])].map(
    (name, index) => ({
      id: crypto.randomUUID(),
      name,
      area:
        index < 3
          ? "Cash"
          : index < 6
            ? "General ledger"
            : index < 10
              ? "Operations"
              : "Review",
      owner,
      reviewer: "",
      dueOffset: index < 10 ? index % 5 : index - 9,
      dueDate: addDays(end, index < 10 ? index % 5 : index - 9),
      status: "todo",
      dependencyId: index ? undefined : undefined,
      notes: "",
    }),
  );
}
function CloseHub({
  periods,
  setPeriods,
  runs,
  setRuns,
  adjustments,
  setAdjustments,
  evidence,
  auditEvents,
  refreshAudit,
  saveAdjustment,
  uploadEvidence,
  deleteEvidence,
  user,
  selectedCloseId,
  selectClose,
  openReconciliation,
}: {
  periods: ClosePeriod[];
  setPeriods: (periods: ClosePeriod[]) => void;
  runs: ReconciliationRun[];
  setRuns: (runs: ReconciliationRun[]) => void;
  adjustments: JournalAdjustment[];
  setAdjustments: (adjustments: JournalAdjustment[]) => void;
  evidence: EvidenceFile[];
  auditEvents: AuditEvent[];
  refreshAudit: () => Promise<void>;
  saveAdjustment: (payload: Partial<JournalAdjustment>, id?: string) => Promise<JournalAdjustment | undefined>;
  uploadEvidence: (file: File | undefined, options: { reconciliationId?: string; adjustmentId?: string; matchId?: string }) => void;
  deleteEvidence: (id: string) => void;
  user: UserInfo;
  selectedCloseId: string;
  selectClose: (id: string) => void;
  openReconciliation: (id: string) => void;
}) {
  const [creating, setCreating] = useState(!periods.length),
    [name, setName] = useState(""),
    [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10)),
    [periodType, setPeriodType] = useState<"month" | "quarter" | "year">(
      "month",
    ),
    [materiality, setMateriality] = useState(0),
    [reconciliationToConnect, setReconciliationToConnect] = useState(""),
    [varianceUpload, setVarianceUpload] = useState<{
      file: File;
      preview: SpreadsheetPreview;
    }>(),
    [varianceError, setVarianceError] = useState("");
  const [closeMessage, setCloseMessage] = useState(""),
    [closeConclusion, setCloseConclusion] = useState(""),
    [reopenReason, setReopenReason] = useState("");
  const selected = periods.find((period) => period.id === selectedCloseId);
  async function create() {
    const tasks = makeTasks(periodEnd, periodType, user.name),
      response = await fetch("/api/close-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || `${periodEnd.slice(0, 7)} close`,
          periodEnd,
          periodType,
          materiality,
          tasks,
        }),
      }),
      data = await response.json();
    if (response.ok) {
      setPeriods([data.period, ...periods]);
      const adjustmentResponse = await fetch("/api/adjustments");
      const adjustmentData = await adjustmentResponse.json();
      if (adjustmentResponse.ok) setAdjustments(adjustmentData.adjustments || []);
      selectClose(data.period.id);
      setCreating(false);
    }
  }
  async function save(patch: Partial<ClosePeriod>) {
    if (!selected) return;
    const next = { ...selected, ...patch };
    setPeriods(
      periods.map((period) => (period.id === selected.id ? next : period)),
    );
    const response = await fetch(`/api/close-periods/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await response.json();
    if (!response.ok) {
      setCloseMessage(data.error || "That close update could not be saved.");
      setPeriods(periods);
      return false;
    }
    setCloseMessage("");
    await refreshAudit();
    return true;
  }
  async function connectReconciliation(runId: string, closePeriodId?: string) {
    const response = await fetch(`/api/reconciliations/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closePeriodId: closePeriodId || null }),
    });
    if (!response.ok) return;
    setRuns(
      runs.map((run) => (run.id === runId ? { ...run, closePeriodId } : run)),
    );
    setReconciliationToConnect("");
  }
  function printClosePacket() {
    if (!selected) return;
    const linkedRuns = runs.filter((run) => run.closePeriodId === selected.id);
    const entries = adjustments.filter((item) => item.closePeriodId === selected.id);
    const entryIds = new Set(entries.map((item) => item.id));
    const files = evidence.filter((item) =>
      (item.reconciliationId && linkedRuns.some((run) => run.id === item.reconciliationId)) ||
      (item.adjustmentId && entryIds.has(item.adjustmentId)),
    );
    const packet = window.open("", "_blank");
    if (!packet) return;
    packet.document.write(`<title>${escapeText(selected.name)} close packet</title><style>body{font:14px Arial;color:#17233b;padding:40px}h1{margin-bottom:4px}table{width:100%;border-collapse:collapse;margin:18px 0 28px}th,td{border-bottom:1px solid #ddd;text-align:left;padding:8px}.done{color:#087866}.open{color:#b33b2d}</style><h1>${escapeText(selected.name)}</h1><p>${selected.periodEnd} · ${selected.status} · ${closeReadiness(selected, runs, adjustments)}% close ready</p><h2>Close checklist</h2><table><tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th></tr>${selected.tasks.map((task) => `<tr><td>${escapeText(task.name)}</td><td>${escapeText(task.owner)}</td><td>${task.dueDate}</td><td class="${task.status === "done" ? "done" : "open"}">${task.status}</td></tr>`).join("")}</table><h2>Reconciliations</h2><table><tr><th>Name</th><th>Period</th><th>Status</th></tr>${linkedRuns.map((run) => `<tr><td>${escapeText(run.name)}</td><td>${run.periodEnd || "—"}</td><td>${escapeText(reconciliationStatusLabel(run.status))}</td></tr>`).join("")}</table><h2>Variance review</h2><table><tr><th>Account</th><th>Difference</th><th>Explanation</th></tr>${selected.variances.map((item) => `<tr><td>${escapeText(item.account)}</td><td>${money.format(item.difference)}</td><td>${escapeText(item.explanation || "Open")}</td></tr>`).join("")}</table><h2>Adjusting journal entries</h2><table><tr><th>Entry</th><th>Amount</th><th>Status</th><th>Posting reference</th></tr>${entries.map((item) => `<tr><td>${escapeText(item.title)}</td><td>${money.format(item.lines.reduce((sum, line) => sum + line.debit, 0))}</td><td>${escapeText(item.status)}</td><td>${escapeText(item.externalReference || "—")}</td></tr>`).join("")}</table><h2>Supporting evidence</h2><ul>${files.map((file) => `<li>${escapeText(file.fileName)}</li>`).join("") || "<li>No files attached</li>"}</ul><script>window.print()<\/script>`);
    packet.document.close();
  }
  function toggle(task: CloseTask) {
    if (!selected) return;
    const tasks = selected.tasks.map((item) =>
      item.id === task.id
        ? {
            ...item,
            status:
              item.status === "done" ? ("todo" as const) : ("done" as const),
            completedAt:
              item.status === "done" ? undefined : new Date().toISOString(),
          }
        : item,
    );
    save({ tasks });
  }
  function setAllTasks(status: "todo" | "done") {
    if (!selected) return;
    const completedAt =
      status === "done" ? new Date().toISOString() : undefined;
    save({
      tasks: selected.tasks.map((task) => ({
        ...task,
        status,
        completedAt,
      })),
    });
  }
  async function importVariance(file?: File, sheetName?: string) {
    if (!file || !selected) return;
    try {
      const preview = await parseSpreadsheetFile(file, sheetName);
      setVarianceUpload({ file, preview });
      const account =
          preview.headers.find((h) => /account|name|description/i.test(h)) ||
          preview.headers[0],
        current =
          preview.headers.find((h) => /current|ending|this period/i.test(h)) || preview.headers[1],
        prior =
          preview.headers.find((h) => /prior|previous/i.test(h)) ||
          preview.headers[2];
      if (!account || !current || !prior || current === prior) throw new Error("Choose a trial-balance file with account, current balance, and prior balance columns.");
      const parseBalance = (value: string) => {
        const text = String(value || "").trim();
        const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
        const number = Number(text.replace(/[^\d.,-]/g, "").replace(/[(),-]/g, "").replace(/,/g, ""));
        return negative ? -number : number;
      };
      const variances: VarianceItem[] = preview.rows.map((row, index) => {
        const now = parseBalance(row[current]),
          before = parseBalance(row[prior]),
          difference = now - before;
        const priorPeriod = periods.filter((period) => period.id !== selected.id && period.periodEnd < selected.periodEnd).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
        const priorItem = priorPeriod?.variances.find((item) => item.account === row[account]);
        return {
          id: `v-${index}`,
          account: row[account],
          current: now,
          prior: before,
          difference,
          percent: before ? (difference / Math.abs(before)) * 100 : 100,
          explanation: "",
          status: "open" as const,
          owner: user.name,
          dueDate: selected.periodEnd,
          percentageThreshold: 10,
          priorExplanation: priorItem?.explanation || "",
        };
      }).filter((item) => item.account && Number.isFinite(item.current) && Number.isFinite(item.prior));
      if (!variances.length) throw new Error("No valid account balances were found. Use account, current balance, and prior balance columns.");
      setVarianceError("");
      save({ variances });
    } catch (error) {
      setVarianceError(
        error instanceof Error ? error.message : "We couldn't read that spreadsheet.",
      );
    }
  }
  if (creating)
    return (
      <section className="panel close-create">
        <CalendarCheck weight="duotone" />
        <h2>Start a controlled close</h2>
        <InfoTip
          className="close-create-help"
          text="A close workspace combines the period checklist, connected reconciliations, variance explanations, and final approval."
        />
        <p>
          Generate a reusable checklist for month-end, quarter-end, or year-end.
        </p>
        <div className="close-create-fields">
          <label>
            Close name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="August 2026 close"
            />
          </label>
          <label>
            Period type
            <select
              value={periodType}
              onChange={(e) =>
                setPeriodType(e.target.value as typeof periodType)
              }
            >
              <option value="month">Month-end</option>
              <option value="quarter">Quarter-end</option>
              <option value="year">Year-end</option>
            </select>
          </label>
          <label>
            Period end
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </label>
          <label>
            <span className="field-label-with-help">
              Materiality threshold
              <InfoTip text="Dollar difference that requires attention. Example: $500 flags variances over $500." />
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={materiality}
              onChange={(e) => setMateriality(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="close-create-actions">
          <button className="primary" onClick={create}>
            Create close workspace
            <ArrowRight />
          </button>
          {periods.length > 0 && (
            <button onClick={() => setCreating(false)}>Cancel</button>
          )}
        </div>
      </section>
    );
  if (!selected)
    return (
      <section className="close-library">
        <div className="close-library-head">
          <div>
            <span>
              ALL CLOSES{" "}
              <InfoTip text="A close workspace organizes the tasks, reconciliations, variance reviews, and approvals needed to finish a financial period." />
            </span>
            <h2>Choose a close to continue</h2>
            <p>
              Open a period to review progress, complete work, or certify
              reconciliations.
            </p>
          </div>
          <button className="primary" onClick={() => setCreating(true)}>
            New close <ArrowRight />
          </button>
        </div>
        <div className="close-library-grid">
          {periods.map((period) => {
            const taskDone = period.tasks.filter(
              (task) => task.status === "done",
            ).length;
            const connected = runs.filter(
              (run) => run.closePeriodId === period.id,
            );
            const certifiedRuns = connected.filter(
              (run) => run.status === "certified",
            ).length;
            const progress = closeReadiness(period, runs, adjustments);
            return (
              <button key={period.id} onClick={() => selectClose(period.id)}>
                <div>
                  <span className={`close-state ${period.status}`}>
                    {period.status}
                  </span>
                  <small>
                    {period.periodType}-end · {period.periodEnd}
                  </small>
                </div>
                <h3>{period.name}</h3>
                <div className="close-progress-track">
                  <i style={{ width: `${progress}%` }} />
                </div>
                <dl>
                  <div>
                    <dt>Ready</dt>
                    <dd>{progress}%</dd>
                  </div>
                  <div>
                    <dt>Tasks</dt>
                    <dd>
                      {taskDone}/{period.tasks.length}
                    </dd>
                  </div>
                  <div>
                    <dt>Certified</dt>
                    <dd>
                      {certifiedRuns}/{connected.length}
                    </dd>
                  </div>
                </dl>
                <span className="close-open">
                  Open close <ArrowRight />
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  const done = selected.tasks.filter((task) => task.status === "done").length,
    linked = runs.filter((run) => run.closePeriodId === selected.id),
    available = runs.filter((run) => !run.closePeriodId),
    certified = linked.filter((run) => run.status === "certified").length,
    materialExceptions = linked
      .flatMap((run) => run.matches)
      .filter(
        (item) =>
          item.status !== "matched" &&
          Math.abs(item.left.amount) > selected.materiality,
      ).length,
    readiness = closeReadiness(selected, runs, adjustments);
  return (
    <>
      <section className="close-head">
        <button className="close-back" onClick={() => selectClose("")}>
          <ArrowLeft /> All closes
        </button>
        <div>
          <select
            value={selected.id}
            onChange={(e) => selectClose(e.target.value)}
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
          <h2>{selected.name}</h2>
          <p>
            {selected.periodEnd} · {selected.periodType}-end close
          </p>
        </div>
        <div className="readiness">
          <strong>{readiness}%</strong>
          <span>close ready</span>
        </div>
        <button onClick={() => setCreating(true)}>New period</button>
        <button onClick={printClosePacket}><Printer /> Close packet</button>
        <button
          className={`primary close-period-action${selected.status === "closed" ? " closed" : ""}`}
          disabled={selected.status === "open" ? (readiness < 100 || !closeConclusion.trim()) : !reopenReason.trim()}
          onClick={() => selected.status === "closed" ? save({ status: "open", reopenReason }) : save({ status: "closed", closeConclusion })}
        >
          {selected.status === "closed" ? "Reopen period" : "Close period"}
        </button>
      </section>
      <section className="panel close-approval-panel">
        <div><h2>{selected.status === "closed" ? "Closed period control" : "Final close approval"}</h2><InfoTip text={selected.status === "closed" ? "Reopening changes the period back to open and permanently records the reason and person responsible." : "The close conclusion documents the final result. Taliqor also verifies tasks, reconciliations, material variances, and adjustments before closing."} /><p>{selected.status === "closed" ? `Closed ${selected.closedAt ? new Date(selected.closedAt).toLocaleString() : ""}. Reopen only when additional accounting work is required.` : "Summarize the completed close before locking the period."}</p></div>
        {selected.status === "closed" ? <label>Reason to reopen<input value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Explain what changed and why the period must reopen" /></label> : <label>Close conclusion<textarea value={closeConclusion} onChange={(event) => setCloseConclusion(event.target.value)} placeholder="Example: All required accounts are reconciled, material variances are explained, and approved adjustments are posted." /></label>}
        {closeMessage && <p className="error">{closeMessage}</p>}
      </section>
      <section className="metrics">
        <Metric
          label="Tasks complete"
          help="Required close procedures marked complete by the team. Checklist completion supplies 70% of readiness."
          value={`${done}/${selected.tasks.length}`}
          trend={`${selected.tasks.length - done} remaining`}
        />
        <Metric
          label="Certified reconciliations"
          help="Connected reconciliations approved by a reviewer. Certification supplies the final 30% of readiness."
          value={`${certified}/${linked.length}`}
          trend="for this period"
        />
        <Metric
          label="Material exceptions"
          help="Open reconciliation differences larger than this close's materiality threshold."
          value={String(materialExceptions)}
          trend={`above ${money.format(selected.materiality)}`}
          warn
        />
        <Metric
          label="Variance reviews"
          help="Period-over-period account changes that have a documented explanation."
          value={`${selected.variances.filter((v) => v.status === "reviewed").length}/${selected.variances.length}`}
          trend="reviewed"
        />
      </section>
      <CloseAdjustmentRegister
        period={selected}
        adjustments={adjustments.filter((item) => item.closePeriodId === selected.id)}
        evidence={evidence}
        saveAdjustment={saveAdjustment}
        uploadEvidence={uploadEvidence}
        deleteEvidence={deleteEvidence}
        user={user}
      />
      <section className="panel close-reconciliations">
        <div className="panel-title">
          <div>
            <h2>Reconciliations for this close</h2>
            <InfoTip text="Connect the account reconciliations that support this period. Every connected reconciliation must be certified to finish the close." />
            <p>
              Connected reconciliations contribute the final 30% of readiness
              when certified.
            </p>
          </div>
          <div className="connect-reconciliation">
            <select
              value={reconciliationToConnect}
              onChange={(event) =>
                setReconciliationToConnect(event.target.value)
              }
            >
              <option value="">Select a reconciliation</option>
              {available.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.name} — {reconciliationStatusLabel(run.status)}
                </option>
              ))}
            </select>
            <button
              disabled={!reconciliationToConnect}
              onClick={() =>
                connectReconciliation(reconciliationToConnect, selected.id)
              }
            >
              Connect
            </button>
          </div>
        </div>
        {linked.length ? (
          <div className="connected-reconciliations">
            {linked.map((run) => (
              <div key={run.id}>
                <span className={`reconciliation-state ${run.status}`}>
                  {reconciliationStatusLabel(run.status)}
                </span>
                <div>
                  <strong>{run.name}</strong>
                  <small>
                    {run.leftName} vs {run.rightName}
                  </small>
                </div>
                <button onClick={() => openReconciliation(run.id)}>
                  Open <ArrowRight />
                </button>
                <button
                  className="disconnect-reconciliation"
                  onClick={() => connectReconciliation(run.id)}
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-small close-empty">
            No reconciliations connected yet. Select one above to make the close
            requirements explicit.
          </div>
        )}
      </section>
      <section className="close-grid">
        <div className="panel">
          <div className="panel-title">
            <div>
              <h2>Close checklist</h2>
              <InfoTip text="The repeatable procedures your team completes before closing the period. These tasks account for 70% of close readiness." />
              <p>
                Ownership, deadlines, dependencies, and evidence in one place.
              </p>
            </div>
            <div className="checklist-actions">
              <button
                disabled={done === selected.tasks.length}
                onClick={() => setAllTasks("done")}
              >
                Check all
              </button>
              <button disabled={done === 0} onClick={() => setAllTasks("todo")}>
                Uncheck all
              </button>
            </div>
          </div>
          <div className="task-list">
            {selected.tasks.map((task) => (
              <label
                key={task.id}
                className={task.status === "done" ? "done" : ""}
              >
                <input
                  type="checkbox"
                  checked={task.status === "done"}
                  onChange={() => toggle(task)}
                />
                <span>
                  <strong>{task.name}</strong>
                  <small>
                    {task.area} · {task.owner} · due {task.dueDate}
                  </small>
                </span>
                <select
                  value={task.reconciliationId || ""}
                  onChange={(e) =>
                    save({
                      tasks: selected.tasks.map((item) =>
                        item.id === task.id
                          ? { ...item, reconciliationId: e.target.value }
                          : item,
                      ),
                    })
                  }
                >
                  <option value="">Attach reconciliation</option>
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.name} — {reconciliationStatusLabel(run.status)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
        <div className="panel variance-panel">
          <div className="panel-title">
            <div>
              <h2>Variance review</h2>
              <InfoTip text="Compare current and prior balances, then explain significant changes so reviewers understand what moved and why." />
              <p>Upload account, current, and prior balances.</p>
            </div>
            <div className="variance-actions">
              <label className="upload-mini">
                {selected.variances.length ? "Replace file" : "Import file"}
                <input
                  hidden
                  type="file"
                  accept={spreadsheetAccept}
                  onChange={async (e) => {
                    await importVariance(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {varianceUpload && varianceUpload.preview.sheetNames.length > 1 && (
                <select
                  aria-label="Variance worksheet"
                  value={varianceUpload.preview.sheetName}
                  onChange={(event) =>
                    importVariance(varianceUpload.file, event.target.value)
                  }
                >
                  {varianceUpload.preview.sheetNames.map((sheet) => (
                    <option key={sheet} value={sheet}>{sheet}</option>
                  ))}
                </select>
              )}
              {selected.variances.length > 0 && (
                <button
                  className="clear-variance"
                  onClick={() => {
                    setVarianceUpload(undefined);
                    setVarianceError("");
                    save({ variances: [] });
                  }}
                >
                  Clear import
                </button>
              )}
            </div>
          </div>
          {varianceError && <p className="error">{varianceError}</p>}
          {selected.variances.length ? (
            selected.variances.map((variance) => (
              <div className="variance-row" key={variance.id}>
                <div>
                  <strong>{variance.account}</strong>
                  <small>
                    {displayMoney(variance.prior)} →{" "}
                    {displayMoney(variance.current)} ·{" "}
                    {Number.isFinite(variance.percent) ? variance.percent.toFixed(1) : "—"}%
                  </small>
                </div>
                <b
                  className={
                    Math.abs(variance.difference) > selected.materiality || Math.abs(variance.percent) > (variance.percentageThreshold ?? 10)
                      ? "warn"
                      : ""
                  }
                >
                  {displayMoney(variance.difference)}
                </b>
                <input
                  value={variance.explanation}
                  onChange={(e) =>
                    save({
                      variances: selected.variances.map((item) =>
                        item.id === variance.id
                          ? {
                              ...item,
                              explanation: e.target.value,
                              status: "open",
                            }
                          : item,
                      ),
                    })
                  }
                  placeholder="Explain variance"
                />
                <div className="variance-controls">
                  <input aria-label="Variance owner" value={variance.owner || ""} onChange={(e) => save({ variances: selected.variances.map((item) => item.id === variance.id ? { ...item, owner: e.target.value, status: "open" } : item) })} placeholder="Owner" />
                  <label>Percent threshold<input type="number" min="0" value={variance.percentageThreshold ?? 10} onChange={(e) => save({ variances: selected.variances.map((item) => item.id === variance.id ? { ...item, percentageThreshold: Number(e.target.value), status: "open" } : item) })} /></label>
                  <button disabled={!variance.explanation.trim()} className={variance.status === "reviewed" ? "variance-reviewed" : ""} onClick={() => save({ variances: selected.variances.map((item) => item.id === variance.id ? { ...item, status: item.status === "reviewed" ? "open" : "reviewed", reviewedBy: item.status === "reviewed" ? undefined : user.name, reviewedAt: item.status === "reviewed" ? undefined : new Date().toISOString() } : item) })}>{variance.status === "reviewed" ? "Reviewed ✓" : "Mark reviewed"}</button>
                </div>
                {variance.priorExplanation && <small className="prior-explanation">Prior-period explanation: {variance.priorExplanation}</small>}
              </div>
            ))
          ) : (
            <div className="empty-small">
              Import a trial-balance CSV or Excel worksheet to review period-over-period changes.
            </div>
          )}
        </div>
      </section>
      <AuditTimeline context="close" events={auditEvents.filter((event) => event.entityId === selected.id)} />
    </>
  );
}

function Wizard(props: {
  step: 1 | 2 | 3;
  left?: UploadState;
  right?: UploadState;
  runName: string;
  periods: ClosePeriod[];
  closePeriodId: string;
  profiles: ReconciliationProfile[];
  profileId: string;
  error: string;
  notice: string;
  saving: boolean;
  leftRef: React.RefObject<HTMLInputElement | null>;
  rightRef: React.RefObject<HTMLInputElement | null>;
  setRunName: (v: string) => void;
  setClosePeriod: (v: string) => void;
  setProfile: (v: string) => void;
  chooseFile: (f: File | undefined, s: "left" | "right") => void;
  chooseSheet: (s: "left" | "right", sheetName: string) => void;
  setMapping: (s: "left" | "right", f: keyof ColumnMapping, v: string) => void;
  next: () => void;
  run: () => void;
  close: () => void;
}) {
  return (
    <div className="backdrop">
      <div className="modal wizard-modal">
        <button className="close" onClick={props.close}>
          <X />
        </button>
        <div className="wizard-progress">
          <i className={props.step >= 1 ? "done" : ""}>1</i>
          <span />
          <i className={props.step >= 2 ? "done" : ""}>2</i>
          <span />
          <i className={props.step >= 3 ? "done" : ""}>3</i>
        </div>
        {props.step === 1 && (
          <>
            <span className="modal-icon">
              <UploadSimple />
            </span>
            <h2>Choose your two sources</h2>
            <p>
              Upload CSV or Excel exports from the systems you want to compare. We’ll
              inspect them locally before anything is saved.
            </p>
            <label className="run-name">
              Reconciliation name
              <input
                value={props.runName}
                onChange={(e) => props.setRunName(e.target.value)}
                placeholder="August bank reconciliation"
              />
            </label>
            <label className="run-name">
              Recurring account
              <select
                value={props.profileId}
                onChange={(event) => props.setProfile(event.target.value)}
              >
                <option value="">One-off — do not reuse this setup</option>
                {props.profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.accountNumber ? `${profile.accountNumber} · ` : ""}
                    {profile.name}
                  </option>
                ))}
              </select>
              <small>
                {props.profileId
                  ? "Account settings, method, and materiality are carried into this period."
                  : "Use this for work that is not expected to repeat every month, quarter, or year."}
              </small>
            </label>
            <label className="run-name">
              Use in close
              <select
                value={props.closePeriodId}
                onChange={(event) => props.setClosePeriod(event.target.value)}
              >
                <option value="">Not connected to a close</option>
                {props.periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name} · {period.periodEnd}
                  </option>
                ))}
              </select>
            </label>
            <div className="upload-grid">
              <UploadBox
                label="Source file"
                state={props.left}
                onClick={() => props.leftRef.current?.click()}
                onSheetChange={(sheet) => props.chooseSheet("left", sheet)}
              />
              <UploadBox
                label="Comparison file"
                state={props.right}
                onClick={() => props.rightRef.current?.click()}
                onSheetChange={(sheet) => props.chooseSheet("right", sheet)}
              />
            </div>
            <input
              ref={props.leftRef}
              hidden
              type="file"
              accept={spreadsheetAccept}
              onChange={(e) => props.chooseFile(e.target.files?.[0], "left")}
            />
            <input
              ref={props.rightRef}
              hidden
              type="file"
              accept={spreadsheetAccept}
              onChange={(e) => props.chooseFile(e.target.files?.[0], "right")}
            />
            <button className="primary run" onClick={props.next}>
              Review column mapping <ArrowRight />
            </button>
          </>
        )}
        {props.step === 2 && props.left && props.right && (
          <>
            <span className="modal-icon">
              <Sparkle weight="fill" />
            </span>
            <h2>Confirm the column mapping</h2>
            <p>
              We suggested mappings from the headers and sample values. Amount
              or debit/credit is required. Optional accounting fields make reviews and future integrations clearer.
            </p>
            <div className="mapping-grid">
              <Mapping
                title={spreadsheetSourceName(props.left.preview, props.left.file.name)}
                state={props.left}
                side="left"
                change={props.setMapping}
              />
              <Mapping
                title={spreadsheetSourceName(props.right.preview, props.right.file.name)}
                state={props.right}
                side="right"
                change={props.setMapping}
              />
            </div>
            <button
              disabled={props.saving}
              className="primary run"
              onClick={props.run}
            >
              {props.saving ? "Reconciling…" : "Run reconciliation"}
              <ArrowRight />
            </button>
          </>
        )}
        {props.step === 3 && (
          <div className="wizard-success">
            <span>
              <CheckCircle weight="fill" />
            </span>
            <small>RECONCILIATION COMPLETE</small>
            <h2>Your results are ready.</h2>
            <p>
              The original files, mappings, results, and confidence evidence
              have been saved to your workspace.
            </p>
            <button className="primary" onClick={props.close}>
              Review results <ArrowRight />
            </button>
          </div>
        )}
        {props.error && <p className="error">{props.error}</p>}
        {props.notice && <p className="notice">{props.notice}</p>}
      </div>
    </div>
  );
}
function Mapping({
  title,
  state,
  side,
  change,
}: {
  title: string;
  state: UploadState;
  side: "left" | "right";
  change: (s: "left" | "right", f: keyof ColumnMapping, v: string) => void;
}) {
  return (
    <div className="mapping-card">
      <div>
        <FileCsv />
        <span>
          <strong>{title}</strong>
          <small>
            {state.preview.rows.length} rows · {state.preview.headers.length}{" "}
            columns
          </small>
        </span>
      </div>
      {(["id", "date", "description", "amount", "currency"] as (keyof ColumnMapping)[]).map((field) => (
        <label key={field}>
          <span>
            {field[0].toUpperCase() + field.slice(1)}
            {field === "amount" && <b>Required</b>}
          </span>
          <select
            value={state.mapping[field]}
            onChange={(e) => change(side, field, e.target.value)}
          >
            <option value="">Not mapped</option>
            {state.preview.headers.map((header) => (
              <option key={header}>{header}</option>
            ))}
          </select>
          <small>
            {state.mapping[field]
              ? `Sample: ${state.preview.rows[0]?.[state.mapping[field]] || "—"}`
              : "No column selected"}
          </small>
        </label>
      ))}
      <details className="optional-mapping-fields">
        <summary>Optional accounting fields <small>Account, entity, department, and more</small></summary>
        {(["account", "debit", "credit", "entity", "department", "location", "class", "subsidiary", "postingPeriod"] as (keyof ColumnMapping)[]).map((field) => (
          <label key={field}>
            <span>{field === "postingPeriod" ? "Posting period" : field[0].toUpperCase() + field.slice(1)}</span>
            <select value={state.mapping[field]} onChange={(e) => change(side, field, e.target.value)}>
              <option value="">Not mapped</option>
              {state.preview.headers.map((header) => <option key={header}>{header}</option>)}
            </select>
            <small>{state.mapping[field] ? `Sample: ${state.preview.rows[0]?.[state.mapping[field]] || "—"}` : "Optional"}</small>
          </label>
        ))}
      </details>
    </div>
  );
}
function UploadBox({
  label,
  state,
  onClick,
  onSheetChange,
}: {
  label: string;
  state?: UploadState;
  onClick: () => void;
  onSheetChange: (sheet: string) => void;
}) {
  const file = state?.file;
  return (
    <div className={file ? "upload-box-wrap selected" : "upload-box-wrap"}>
      <button className={file ? "upload-box selected" : "upload-box"} onClick={onClick}>
        <span>
          <FileCsv weight="duotone" />
        </span>
        <strong>{file?.name || label}</strong>
        <small>
          {file
            ? `${Math.ceil(file.size / 1024)} KB · Ready`
            : "Choose a CSV, XLSX, or XLS file"}
        </small>
      </button>
      {state && state.preview.sheetNames.length > 1 && (
        <label>
          Worksheet
          <select
            value={state.preview.sheetName}
            onChange={(event) => onSheetChange(event.target.value)}
          >
            {state.preview.sheetNames.map((sheet) => (
              <option key={sheet} value={sheet}>{sheet}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function reconciliationStatusLabel(status: ReconciliationRun["status"]) {
  return {
    draft: "In progress",
    review: "Ready for review",
    changes_requested: "Changes requested",
    certified: "Certified",
  }[status];
}

function reconciliationMethodLabel(method: ReconciliationRun["method"]) {
  return {
    transaction: "Transaction matching",
    balance: "Balance comparison",
    account_analysis: "Account analysis",
    variance: "Variance analysis",
  }[method];
}
function closeReadiness(
  period: ClosePeriod,
  runs: ReconciliationRun[],
  adjustments: JournalAdjustment[] = [],
) {
  const completedTasks = period.tasks.filter(
    (task) => task.status === "done",
  ).length;
  const connectedRuns = runs.filter(
    (run) => run.closePeriodId === period.id,
  );
  const certifiedRuns = connectedRuns.filter(
    (run) => run.status === "certified",
  ).length;
  const checklistProgress = period.tasks.length
    ? completedTasks / period.tasks.length
    : 0;
  const certificationProgress = connectedRuns.length
    ? certifiedRuns / connectedRuns.length
    : 0;
  const base = Math.round(checklistProgress * 70 + certificationProgress * 30);
  const hasOpenMaterialAdjustment = adjustments
    .filter((item) => item.closePeriodId === period.id)
    .some(
      (item) =>
        !["posted", "no_entry"].includes(item.status) &&
        item.lines.reduce((sum, line) => sum + line.debit, 0) > period.materiality,
    );
  const hasOpenMaterialVariance = period.variances.some((item) =>
    (Math.abs(item.difference) > period.materiality || Math.abs(item.percent) > (item.percentageThreshold ?? 10)) && item.status !== "reviewed",
  );
  return hasOpenMaterialAdjustment || hasOpenMaterialVariance ? Math.min(base, 99) : base;
}
function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}
function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}
function escapeText(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] || character,
  );
}
