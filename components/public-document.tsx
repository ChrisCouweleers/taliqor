import Link from "next/link";
import { ArrowLeft, LockKey, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "./logo";

export function PublicDocument({
  eyebrow,
  title,
  description,
  updated = "August 10, 2026",
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="public-document">
      <nav className="document-nav">
        <Link href="/" aria-label="Taliqor home"><Logo /></Link>
        <div>
          <Link href="/security"><ShieldCheck /> Security</Link>
          <Link className="document-cta" href="/signup">Start for free</Link>
        </div>
      </nav>
      <header className="document-hero">
        <Link href="/"><ArrowLeft /> Back to Taliqor</Link>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <small>Last updated {updated}</small>
      </header>
      <main className="document-body">{children}</main>
      <footer className="document-footer">
        <div><LockKey weight="fill" /> Private by default</div>
        <nav>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/security">Security</Link>
        </nav>
        <span>© 2026 Taliqor</span>
      </footer>
    </div>
  );
}
