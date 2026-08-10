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
  ReconciliationRules,
  ReconciliationProfile,
  ReconciliationRun,
  VarianceItem,
} from "@/lib/domain";
import {
  csvEscape,
  inferMapping,
  mappingFingerprint,
  normalizeRows,
} from "@/lib/csv";
import {
  parseSpreadsheetFile,
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
};
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function Dashboard({ user }: { user: UserInfo }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [profileOpen, setProfileOpen] = useState(false);
  const [runs, setRuns] = useState<ReconciliationRun[]>([]),
    [templates, setTemplates] = useState<MappingTemplate[]>([]),
    [selectedId, setSelectedId] = useState("");
  const [closePeriods, setClosePeriods] = useState<ClosePeriod[]>([]),
    [matchingRules, setMatchingRules] = useState<MatchingRule[]>([]),
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
      const [response, closeResponse, profileResponse] = await Promise.all([
        fetch("/api/reconciliations"),
        fetch("/api/close-periods"),
        fetch("/api/reconciliation-profiles"),
      ]);
      const data = await response.json(),
        closeData = await closeResponse.json(),
        profileData = await profileResponse.json();
      if (!response.ok) throw new Error(data.error);
      setRuns(data.runs);
      setTemplates(data.templates);
      setMatchingRules(data.rules || []);
      setClosePeriods(closeData.periods || []);
      setReconciliationProfiles(profileData.profiles || []);
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
    if (!left.mapping.amount || !right.mapping.amount)
      setNotice("We need your help identifying the amount columns.");
    setWizardStep(2);
    setError("");
  }
  async function createRun() {
    if (!left || !right || !left.mapping.amount || !right.mapping.amount)
      return setError("Choose an amount column for each source.");
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
      body: JSON.stringify({ matches, status: workflowStatus }),
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
    if (!response.ok) {
      setError("That reconciliation update could not be saved.");
      await loadRuns();
    } else {
      setError("");
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
    const open = window.open("", "_blank");
    if (!open) return;
    open.document.write(
      `<title>${selected.name} reconciliation packet</title><style>body{font:14px Arial;color:#17233b;padding:40px}h1{margin-bottom:4px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card{border:1px solid #ddd;padding:14px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border-bottom:1px solid #ddd;text-align:left;padding:8px}small{color:#667}</style><h1>${escapeText(selected.name)}</h1><p>${selected.periodEnd || "No period"} · ${selected.status}</p><div class="grid"><div class="card">Source<br><b>${money.format(sourceBalance)}</b></div><div class="card">Comparison<br><b>${money.format(comparisonBalance)}</b></div><div class="card">Explained<br><b>${money.format(explained)}</b></div><div class="card">Unexplained<br><b>${money.format(Math.abs(sourceBalance - comparisonBalance) - explained)}</b></div></div><h2>Conclusion</h2><p>${escapeText(selected.conclusion || "Not documented")}</p><table><tr><th>Item</th><th>Amount</th><th>Resolution</th><th>Explanation</th></tr>${selected.matches
        .filter((item) => item.status !== "matched")
        .map(
          (item) =>
            `<tr><td>${escapeText(item.left.id)}</td><td>${money.format(item.left.amount)}</td><td>${escapeText(item.exceptionType || item.status)}</td><td>${escapeText(item.explanation || "Open")}</td></tr>`,
        )
        .join("")}</table><script>window.print()<\/script>`,
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
            <ControlSummary
              source={sourceBalance}
              comparison={comparisonBalance}
              explained={explained}
              materiality={selected.materiality}
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
              <Results rows={rows} decide={decide} update={updateException} />
            </section>
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
  openReconciliation,
  openClose,
  start,
}: {
  runs: ReconciliationRun[];
  periods: ClosePeriod[];
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
  const closePercent = activeClose ? closeReadiness(activeClose, runs) : 0;
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
}: {
  rows: Match[];
  decide: (id: string, decision: "pending" | "approved" | "rejected") => void;
  update: (id: string, patch: Partial<Match>) => void;
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
  });
  const [error, setError] = useState("");

  async function createProfile() {
    if (!form.name.trim())
      return setError("Enter an account or reconciliation name.");
    const response = await fetch("/api/reconciliation-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
              </dl>
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
  rules,
  setRules,
}: {
  user: UserInfo;
  templates: MappingTemplate[];
  rules: MatchingRule[];
  setRules: (rules: MatchingRule[]) => void;
}) {
  const [ruleName, setRuleName] = useState("Standard matching"),
    [dateTolerance, setDateTolerance] = useState(3),
    [amountTolerance, setAmountTolerance] = useState(1),
    [autoApprove, setAutoApprove] = useState(90);
  async function saveRule() {
    const settings = {
      dateTolerance,
      amountTolerance,
      autoApprove,
      allowGrouping: true,
    };
    const response = await fetch("/api/matching-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: ruleName, settings }),
    });
    const data = await response.json();
    if (response.ok) setRules([...rules, data.rule]);
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
        <h2>Matching rules</h2>
        <p>Set the tolerances used for new reconciliations.</p>
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
        <button className="primary" onClick={saveRule}>
          Save rule
        </button>
        {rules.map((rule) => (
          <div className="template-row" key={rule.id}>
            <Gear />
            <div>
              <strong>{rule.name}</strong>
              <small>
                ±{rule.settings.dateTolerance} days ·{" "}
                {rule.settings.amountTolerance}% tolerance ·{" "}
                {rule.settings.autoApprove}% auto
              </small>
            </div>
            <CheckCircle weight="fill" />
          </div>
        ))}
      </div>
      <div className="panel">
        <h2>Saved mappings</h2>
        <p>Taliqor automatically applies these when the same columns return.</p>
        {templates.length ? (
          templates.map((template) => (
            <div className="template-row" key={template.id}>
              <FileCsv />
              <div>
                <strong>{template.name}</strong>
                <small>
                  {Object.values(template.mapping).filter(Boolean).length}{" "}
                  mapped fields
                </small>
              </div>
              <CheckCircle weight="fill" />
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
            <button onClick={() => update({ status: "changes_requested" })}>
              Request changes
            </button>
          ) : run.status === "certified" ? (
            <button
              onClick={() =>
                update({
                  status: "changes_requested",
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
  user,
  selectedCloseId,
  selectClose,
  openReconciliation,
}: {
  periods: ClosePeriod[];
  setPeriods: (periods: ClosePeriod[]) => void;
  runs: ReconciliationRun[];
  setRuns: (runs: ReconciliationRun[]) => void;
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
    await fetch(`/api/close-periods/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
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
          preview.headers.find((h) => /account|name/i.test(h)) ||
          preview.headers[0],
        current =
          preview.headers.find((h) => /current/i.test(h)) || preview.headers[1],
        prior =
          preview.headers.find((h) => /prior|previous/i.test(h)) ||
          preview.headers[2];
      const variances: VarianceItem[] = preview.rows.map((row, index) => {
        const now = Number(String(row[current] || 0).replace(/[$,]/g, "")),
          before = Number(String(row[prior] || 0).replace(/[$,]/g, "")),
          difference = now - before;
        return {
          id: `v-${index}`,
          account: row[account],
          current: now,
          prior: before,
          difference,
          percent: before ? (difference / Math.abs(before)) * 100 : 100,
          explanation: "",
          status: "open",
        };
      });
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
            const progress = closeReadiness(period, runs);
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
    readiness = closeReadiness(selected, runs);
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
        <button
          className={`primary close-period-action${selected.status === "closed" ? " closed" : ""}`}
          disabled={readiness < 100}
          onClick={() => save({ status: "closed" })}
        >
          {selected.status === "closed" ? "Closed" : "Close period"}
        </button>
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
                    {money.format(variance.prior)} →{" "}
                    {money.format(variance.current)} ·{" "}
                    {variance.percent.toFixed(1)}%
                  </small>
                </div>
                <b
                  className={
                    Math.abs(variance.difference) > selected.materiality
                      ? "warn"
                      : ""
                  }
                >
                  {money.format(variance.difference)}
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
                              status: e.target.value ? "reviewed" : "open",
                            }
                          : item,
                      ),
                    })
                  }
                  placeholder="Explain variance"
                />
              </div>
            ))
          ) : (
            <div className="empty-small">
              Import a trial-balance CSV or Excel worksheet to review period-over-period changes.
            </div>
          )}
        </div>
      </section>
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
              is required; everything else improves matching.
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
      {(
        [
          "id",
          "date",
          "description",
          "amount",
          "currency",
        ] as (keyof ColumnMapping)[]
      ).map((field) => (
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
function closeReadiness(period: ClosePeriod, runs: ReconciliationRun[]) {
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
  return Math.round(checklistProgress * 70 + certificationProgress * 30);
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
