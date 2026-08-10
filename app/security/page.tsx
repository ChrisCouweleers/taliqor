import type { Metadata } from "next";
import { CheckCircle, FileCsv, Key, LockKey, ShieldCheck, Trash } from "@phosphor-icons/react/dist/ssr";
import { PublicDocument } from "@/components/public-document";

export const metadata: Metadata = {
  title: "Security — Taliqor",
  description: "The controls Taliqor uses to protect financial workspace data.",
};

const controls = [
  { icon: LockKey, title: "Private storage", text: "Archived source files and supporting evidence are kept in access-controlled storage and are not published on the open web." },
  { icon: ShieldCheck, title: "Organization isolation", text: "Database and file policies limit authenticated users to information belonging to their organization." },
  { icon: Key, title: "Verified login", text: "Every login requires a single-use six-digit code delivered to the account email address." },
  { icon: FileCsv, title: "Defensive uploads", text: "Taliqor validates CSV and Excel file types, signatures, size, structure, worksheet, row, column, and reconciliation ownership limits." },
  { icon: CheckCircle, title: "Layered browser protection", text: "Content Security Policy, anti-clickjacking, content-sniffing, referrer, and permissions controls reduce browser-side risk." },
  { icon: Trash, title: "Account deletion", text: "Users can delete their account. Private workspace deletion also removes application records and archived source files." },
];

export default function SecurityPage() {
  return (
    <PublicDocument eyebrow="SECURITY AT TALIQOR" title="Practical protection for financial work." description="Taliqor uses layered, clearly defined controls while keeping reconciliation simple for the people doing the work.">
      <div className="security-control-grid">{controls.map(({ icon: Icon, title, text }) => <article key={title}><span><Icon weight="duotone" /></span><h2>{title}</h2><p>{text}</p></article>)}</div>
      <section><h2>Encryption</h2><p>Taliqor is served over HTTPS. Its infrastructure providers encrypt data in transit and at rest. Taliqor does not currently claim end-to-end or zero-knowledge encryption.</p></section>
      <section><h2>Abuse and injection protection</h2><p>Sensitive actions are rate-limited. Uploaded files receive generated storage names and are rejected when they appear empty, malformed, oversized, executable, HTML, XML, macro-enabled, encrypted, or inconsistent with their declared spreadsheet type. Taliqor reads stored worksheet values without executing workbook formulas or automation. CSV exports neutralize values that could become spreadsheet formulas.</p></section>
      <section><h2>Secure infrastructure</h2><p>Taliqor uses established managed services for authentication, data storage, private files, and application delivery. These providers maintain independent security and compliance programs. Taliqor itself is not currently SOC 2 certified.</p></section>
      <section><h2>Shared responsibility</h2><p>Customers should invite only trusted teammates, protect access to their email accounts, verify reconciliation conclusions, and avoid uploading information they are not authorized to process. No online system can guarantee absolute security.</p></section>
      <section><h2>Reporting a concern</h2><p>If you believe you found a security issue, do not access or modify other users’ information. Report the issue by replying to an official Taliqor email or using the contact method provided inside your workspace, and include clear reproduction details.</p></section>
    </PublicDocument>
  );
}
