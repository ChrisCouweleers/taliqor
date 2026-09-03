import * as XLSX from "xlsx";
import { CsvPreview, parseCsvPreview } from "./csv";

export const spreadsheetExtensions = ["csv", "xlsx", "xls"] as const;
export const spreadsheetAccept =
  ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
export const MAX_SPREADSHEET_ROWS = 100_000;
export const MAX_SPREADSHEET_COLUMNS = 250;
export const MAX_WORKBOOK_SHEETS = 50;

export type SpreadsheetPreview = CsvPreview & {
  sheetNames: string[];
  sheetName?: string;
  fileType: "csv" | "xlsx" | "xls";
};

function extensionOf(name: string) {
  return name.toLowerCase().split(".").pop() || "";
}

function uniqueHeaders(values: unknown[]) {
  const counts = new Map<string, number>();
  return values.map((value, index) => {
    const base = String(value ?? "").trim() || `Column ${index + 1}`;
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function worksheetPreview(
  workbook: XLSX.WorkBook,
  sheetName: string,
  fileType: "xlsx" | "xls",
): SpreadsheetPreview {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error("Choose a valid worksheet.");
  const data = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
    dateNF: "yyyy-mm-dd",
  });
  if (data.length < 2)
    throw new Error(`“${sheetName}” needs a header and at least one data row.`);
  if (data.length > MAX_SPREADSHEET_ROWS + 1)
    throw new Error(
      `Worksheets are limited to ${MAX_SPREADSHEET_ROWS.toLocaleString()} rows.`,
    );
  let headerIndex = 0;
  for (let index = 1; index < Math.min(data.length, 8); index++) {
    const populated = data[index].filter((value) => String(value).trim()).length;
    const current = data[headerIndex].filter((value) => String(value).trim()).length;
    if (populated > current) headerIndex = index;
  }
  const headers = uniqueHeaders(data[headerIndex]);
  if (headers.length < 2)
    throw new Error("We couldn't detect multiple columns in this worksheet.");
  if (headers.length > MAX_SPREADSHEET_COLUMNS)
    throw new Error(
      `Worksheets are limited to ${MAX_SPREADSHEET_COLUMNS} columns.`,
    );
  const rows = data
    .slice(headerIndex + 1)
    .map((values) =>
      Object.fromEntries(
        headers.map((header, index) => [header, String(values[index] ?? "")]),
      ),
    )
    .filter((row) => Object.values(row).some((value) => value.trim()));
  if (!rows.length) throw new Error(`“${sheetName}” does not contain data rows.`);
  return {
    headers,
    rows,
    delimiter: "workbook",
    sheetNames: workbook.SheetNames,
    sheetName,
    fileType,
  };
}

export function parseSpreadsheetBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  requestedSheet?: string,
): SpreadsheetPreview {
  const extension = extensionOf(fileName);
  if (extension === "xlsm")
    throw new Error("Macro-enabled .xlsm workbooks are not supported.");
  if (extension !== "xlsx" && extension !== "xls")
    throw new Error("Choose a CSV, XLSX, or XLS file.");
  try {
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      sheetRows: MAX_SPREADSHEET_ROWS + 2,
    });
    if (!workbook.SheetNames.length) throw new Error("The workbook has no worksheets.");
    if (workbook.SheetNames.length > MAX_WORKBOOK_SHEETS)
      throw new Error(`Workbooks are limited to ${MAX_WORKBOOK_SHEETS} worksheets.`);
    if (requestedSheet)
      return worksheetPreview(workbook, requestedSheet, extension);
    let firstError: unknown;
    for (const sheetName of workbook.SheetNames) {
      try {
        return worksheetPreview(workbook, sheetName, extension);
      } catch (error) {
        firstError ??= error;
      }
    }
    throw firstError || new Error("The workbook does not contain a usable worksheet.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/password|encrypt/i.test(message))
      throw new Error("Password-protected or encrypted workbooks are not supported.");
    if (
      message.includes("worksheet") ||
      message.includes("Workbook") ||
      message.includes("workbook") ||
      message.includes("supported") ||
      message.includes("limited") ||
      message.includes("data rows")
    )
      throw error;
    throw new Error("We couldn't read this Excel workbook.");
  }
}

export async function parseSpreadsheetFile(
  file: File,
  requestedSheet?: string,
): Promise<SpreadsheetPreview> {
  const extension = extensionOf(file.name);
  if (extension === "csv") {
    const preview = parseCsvPreview(await file.text());
    if (preview.rows.length > MAX_SPREADSHEET_ROWS)
      throw new Error(`CSV files are limited to ${MAX_SPREADSHEET_ROWS.toLocaleString()} rows.`);
    if (preview.headers.length > MAX_SPREADSHEET_COLUMNS)
      throw new Error(`CSV files are limited to ${MAX_SPREADSHEET_COLUMNS} columns.`);
    return { ...preview, sheetNames: [], fileType: "csv" };
  }
  return parseSpreadsheetBuffer(await file.arrayBuffer(), file.name, requestedSheet);
}

export function spreadsheetSourceName(preview: SpreadsheetPreview, fileName: string) {
  return preview.sheetName ? `${fileName} · ${preview.sheetName}` : fileName;
}

export function downloadXlsx(
  fileName: string,
  rows: Record<string, string | number>[],
) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Journal Entry");
  XLSX.writeFile(workbook, fileName, { compression: true });
}
