import { CanonicalField, ColumnMapping, Transaction } from "./domain";

export type CsvPreview = { headers: string[]; rows: Record<string, string>[]; delimiter: string };

const aliases: Record<CanonicalField, string[]> = {
  id: ["id", "transaction id", "transaction_id", "reference", "reference id", "order id", "order_id", "invoice", "payment id", "ref", "number"],
  date: ["date", "transaction date", "transaction_date", "posting date", "posted", "created at", "created_at", "paid at", "settled at", "settlement date"],
  description: ["description", "memo", "customer", "customer name", "merchant", "name", "details", "narrative", "payee", "account name"],
  amount: ["amount", "total", "gross", "net", "value", "credit", "debit", "payment amount", "deposit"],
  currency: ["currency", "ccy", "currency code", "iso currency"],
};

function splitRow(line: string, delimiter: string) {
  const cells: string[] = [];
  let value = "", quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { cells.push(value.trim()); value = ""; }
    else value += char;
  }
  cells.push(value.trim());
  return cells;
}

function detectDelimiter(line: string) {
  return [",", ";", "\t", "|"].map((delimiter) => ({ delimiter, count: splitRow(line, delimiter).length })).sort((a, b) => b.count - a.count)[0].delimiter;
}

export function parseCsvPreview(text: string): CsvPreview {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("The file needs a header and at least one data row.");
  let headerIndex = 0;
  let delimiter = detectDelimiter(lines[0]);
  for (let index = 0; index < Math.min(lines.length, 8); index++) {
    const candidate = detectDelimiter(lines[index]);
    if (splitRow(lines[index], candidate).length > splitRow(lines[headerIndex], delimiter).length) { headerIndex = index; delimiter = candidate; }
  }
  const headers = splitRow(lines[headerIndex], delimiter).map((header, index) => header || `Column ${index + 1}`);
  if (headers.length < 2) throw new Error("We couldn't detect multiple columns in this file.");
  const rows = lines.slice(headerIndex + 1).map((line) => {
    const cells = splitRow(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  }).filter((row) => Object.values(row).some(Boolean));
  return { headers, rows, delimiter };
}

function normalize(value: string) { return value.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function looksNumeric(value: string) { return /^\(?[-+]?[$€£]?\s*[\d,.]+\)?$/.test(value.trim()); }
function looksDate(value: string) { return !looksNumeric(value) && Number.isFinite(Date.parse(value)); }

export function inferMapping(preview: CsvPreview): ColumnMapping {
  const result = { id: "", date: "", description: "", amount: "", currency: "" };
  (Object.keys(result) as CanonicalField[]).forEach((field) => {
    let best = "", bestScore = 0;
    preview.headers.forEach((header) => {
      const normalized = normalize(header);
      let score = aliases[field].includes(normalized) ? 100 : aliases[field].some((alias) => normalized.includes(alias) || alias.includes(normalized)) ? 65 : 0;
      const values = preview.rows.slice(0, 20).map((row) => row[header]).filter(Boolean);
      if (field === "amount" && values.length && values.filter(looksNumeric).length / values.length > .8) score += 25;
      if (field === "date" && values.length && values.filter(looksDate).length / values.length > .8) score += 25;
      if (field === "currency" && values.some((value) => /^[A-Z]{3}$/.test(value))) score += 35;
      if (field === "id" && values.length && new Set(values).size === values.length) score += 8;
      if (score > bestScore) { best = header; bestScore = score; }
    });
    result[field] = bestScore >= 25 ? best : "";
  });
  return result;
}

function parseAmount(value: string) {
  const negative = /^\s*\(.*\)\s*$/.test(value) || /^\s*-/.test(value);
  let cleaned = value.replace(/[^\d,.-]/g, "").replace(/[()-]/g, "");
  if (cleaned.includes(",") && !cleaned.includes(".") && /,\d{1,2}$/.test(cleaned)) cleaned = cleaned.replace(",", ".");
  else cleaned = cleaned.replace(/,/g, "");
  const amount = Number(cleaned);
  return negative ? -amount : amount;
}

export function normalizeRows(preview: CsvPreview, mapping: ColumnMapping, source: string): Transaction[] {
  if (!mapping.amount) throw new Error("Choose an amount column for both files.");
  return preview.rows.map((raw, index) => {
    const amount = parseAmount(raw[mapping.amount] || "");
    if (!Number.isFinite(amount)) throw new Error(`Invalid amount in ${source}, row ${index + 2}.`);
    const rawDate = mapping.date ? raw[mapping.date] : "";
    const parsedDate = rawDate && Number.isFinite(Date.parse(rawDate)) ? new Date(rawDate).toISOString().slice(0, 10) : rawDate;
    return { id: mapping.id ? raw[mapping.id] || `${source}-${index + 1}` : `${source}-${index + 1}`, date: parsedDate, description: mapping.description ? raw[mapping.description] || "Transaction" : "Transaction", amount, currency: mapping.currency ? raw[mapping.currency] || "USD" : "USD", source, raw };
  });
}

export function mappingFingerprint(headers: string[]) { return headers.map(normalize).sort().join("|"); }

export function csvEscape(value: unknown) {
  let text = String(value ?? "");
  // Keep values supplied by uploaded files from becoming formulas when an
  // exported report is opened in spreadsheet software.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
