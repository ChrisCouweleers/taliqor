import Link from "next/link";
import {
  ArrowRight,
  Bank,
  Check,
  CheckCircle,
  Clock,
  FileCsv,
  Lightning,
  LockKey,
  ShieldCheck,
  Stack,
  TrendUp,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import { Logo, Mark } from "./logo";

const transactions = [
  {
    name: "Atlas & Co.",
    ref: "ORD-10482",
    amount: "$12,450.00",
    state: "Matched",
  },
  {
    name: "Northstar Labs",
    ref: "ORD-10481",
    amount: "$8,920.00",
    state: "Matched",
  },
  {
    name: "Verity Partners",
    ref: "ORD-10479",
    amount: "$4,280.00",
    state: "Matched",
  },
  { name: "Finbridge", ref: "ORD-10476", amount: "$6,715.00", state: "Review" },
];

export function Homepage() {
  return (
    <div className="marketing">
      <nav className="marketing-nav" aria-label="Main navigation">
        <Link className="marketing-logo" href="/">
          <Logo />
        </Link>
        <div className="nav-links">
          <a href="#product">Product</a>
          <a href="#workflow">How it works</a>
          <a href="#security">Security</a>
        </div>
        <div className="nav-actions">
          <Link className="login-link" href="/login">
            Log in
          </Link>
          <Link className="nav-cta" href="/signup">
            Start for free <ArrowRight />
          </Link>
        </div>
      </nav>

      <main className="marketing-main">
        <section className="hero" id="product">
          <div className="hero-copy">
            <span className="eyebrow">
              <span /> Revenue operations, finally in sync
            </span>
            <h1>
              Every payment.
              <br />
              <em>Perfectly reconciled.</em>
            </h1>
            <p>
              Taliqor connects your payment processors, banks, and ledgers—then
              automatically matches every transaction and surfaces what needs
              your attention.
            </p>
            <div className="hero-actions">
              <Link className="hero-primary" href="/signup">
                Start reconciling free <ArrowRight />
              </Link>
              <a className="hero-secondary" href="#workflow">
                <span className="play">
                  <span />
                </span>{" "}
                See how it works
              </a>
            </div>
            <div className="hero-proof">
              <div className="avatars">
                <span>AM</span>
                <span>JN</span>
                <span>SK</span>
                <span>+</span>
              </div>
              <div>
                <strong>Built with finance teams</strong>
                <span>for the way revenue actually moves</span>
              </div>
            </div>
            <div className="homepage-security-badges" aria-label="Taliqor security protections">
              <span><LockKey weight="fill" /> Private by default</span>
              <span><ShieldCheck weight="fill" /> Verified login</span>
              <span><CheckCircle weight="fill" /> Organization isolated</span>
            </div>
          </div>

          <div
            className="hero-visual"
            aria-label="Taliqor reconciliation dashboard preview"
          >
            <div className="glow glow-one" />
            <div className="glow glow-two" />
            <div className="product-window">
              <div className="window-top">
                <div className="mini-logo">
                  <Mark small />
                  <strong>Taliqor</strong>
                </div>
                <div className="window-search">Search anything...</div>
                <span className="window-avatar">DM</span>
              </div>
              <div className="window-body">
                <aside className="preview-nav">
                  <span className="selected">
                    <TrendUp />
                    Overview
                  </span>
                  <span>
                    <Stack />
                    Reconciliations
                  </span>
                  <span>
                    <FileCsv />
                    Transactions
                  </span>
                  <span>
                    <Warning />
                    Exceptions <b>3</b>
                  </span>
                </aside>
                <div className="preview-main">
                  <div className="preview-heading">
                    <div>
                      <small>OVERVIEW</small>
                      <h3>Revenue clarity</h3>
                    </div>
                    <button>+ New reconciliation</button>
                  </div>
                  <div className="preview-metrics">
                    <div>
                      <span>Processed</span>
                      <strong>$2.84M</strong>
                      <small>
                        <TrendUp /> 12.4% this month
                      </small>
                    </div>
                    <div>
                      <span>Reconciled</span>
                      <strong>98.7%</strong>
                      <small>
                        <CheckCircle weight="fill" /> Healthy
                      </small>
                    </div>
                    <div>
                      <span>Exceptions</span>
                      <strong>3</strong>
                      <small className="amber">
                        <Warning weight="fill" /> Needs review
                      </small>
                    </div>
                  </div>
                  <div className="preview-table">
                    <div className="preview-table-title">
                      <div>
                        <strong>Recent reconciliation</strong>
                        <small>Today, across all sources</small>
                      </div>
                      <span>
                        View all <ArrowRight />
                      </span>
                    </div>
                    {transactions.map((transaction) => (
                      <div className="preview-row" key={transaction.ref}>
                        <span className="merchant-dot">
                          {transaction.name[0]}
                        </span>
                        <div>
                          <strong>{transaction.name}</strong>
                          <small>{transaction.ref}</small>
                        </div>
                        <em>{transaction.amount}</em>
                        <span
                          className={
                            transaction.state === "Review"
                              ? "preview-state review"
                              : "preview-state"
                          }
                        >
                          {transaction.state === "Matched" && <Check />}
                          {transaction.state}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="floating-card match-card">
              <span>
                <CheckCircle weight="fill" />
              </span>
              <div>
                <strong>Transaction matched</strong>
                <small>Confidence score</small>
              </div>
              <em>99.8%</em>
            </div>
            <div className="floating-card sync-card">
              <span>
                <Lightning weight="fill" />
              </span>
              <div>
                <strong>Live sync complete</strong>
                <small>2,418 records · just now</small>
              </div>
            </div>
          </div>
        </section>

        <section className="trust-strip">
          <p>ONE VIEW ACROSS YOUR ENTIRE REVENUE STACK</p>
          <div className="logos">
            <span>
              <i className="stripe-mark">S</i> stripe
            </span>
            <span>
              <i className="qb-mark">qb</i> quickbooks
            </span>
            <span>
              <i className="square-mark">■</i> Square
            </span>
            <span>
              <i className="xero-mark">X</i> XERO
            </span>
            <span>
              <i className="bank-mark">
                <Bank weight="fill" />
              </i>{" "}
              Your bank
            </span>
          </div>
        </section>

        <section className="workflow" id="workflow">
          <div className="section-intro">
            <span className="eyebrow">
              <span /> Built for certainty
            </span>
            <h2>
              Close the gaps.
              <br />
              Then close the books.
            </h2>
            <p>
              Replace brittle spreadsheets and manual spot-checks with one
              continuous reconciliation workflow.
            </p>
          </div>
          <div className="workflow-grid">
            <article className="workflow-card connect-card">
              <div className="card-copy">
                <span className="step">01</span>
                <h3>Connect every source</h3>
                <p>
                  Bring processors, banks, and ledgers into one reliable data
                  layer. CSV and Excel files work today.
                </p>
              </div>
              <div className="connect-visual">
                <span className="source-pill stripe-pill">S</span>
                <span className="source-pill bank-pill">
                  <Bank weight="fill" />
                </span>
                <span className="source-pill qb-pill">qb</span>
                <div className="flow-lines">
                  <i />
                  <i />
                  <i />
                </div>
                <span className="center-mark">
                  <Mark />
                </span>
              </div>
            </article>
            <article className="workflow-card match-workflow">
              <div className="card-copy">
                <span className="step">02</span>
                <h3>Match with confidence</h3>
                <p>
                  Rules and intelligent scoring pair transactions—even when
                  dates, references, or amounts vary.
                </p>
              </div>
              <div className="score-visual">
                <div className="score-ring">
                  <strong>99.8%</strong>
                  <span>confidence</span>
                </div>
                <ul>
                  <li>
                    <Check />
                    Reference matched
                  </li>
                  <li>
                    <Check />
                    Amount exact
                  </li>
                  <li>
                    <Check />
                    Date within range
                  </li>
                </ul>
              </div>
            </article>
            <article className="workflow-card resolve-card">
              <div className="card-copy">
                <span className="step">03</span>
                <h3>Resolve what matters</h3>
                <p>
                  See every variance with the context your team needs to
                  investigate and move on.
                </p>
              </div>
              <div className="exception-visual">
                <div className="exception-top">
                  <span>
                    <Warning weight="fill" />
                  </span>
                  <div>
                    <strong>Amount variance</strong>
                    <small>ORD-10476 · Finbridge</small>
                  </div>
                  <em>Review</em>
                </div>
                <div className="variance">
                  <span>
                    <small>Bank</small>
                    <strong>$6,750.00</strong>
                  </span>
                  <i>≠</i>
                  <span>
                    <small>Ledger</small>
                    <strong>$6,715.00</strong>
                  </span>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="security-cta" id="security">
          <div className="security-copy">
            <div className="trust-signal" aria-hidden="true">
              <i />
              <i />
              <i />
              <span>
                <ShieldCheck weight="duotone" />
              </span>
              <b>
                <Check weight="bold" />
              </b>
              <b>
                <Check weight="bold" />
              </b>
              <b>
                <Check weight="bold" />
              </b>
            </div>
            <div>
              <span className="eyebrow light">
                <span />
                Designed for financial data
              </span>
              <h2>
                Clarity you can trust.
                <br />
                Controls you can prove.
              </h2>
              <p>
                Private file storage, organization-isolated access, verified
                email login, and encryption at rest and in transit are part of
                the foundation—not an afterthought.
              </p>
              <div className="security-points">
                <span>
                  <Check />
                  Private source-file storage
                </span>
                <span>
                  <Check />
                  Six-digit login verification
                </span>
                <span>
                  <Check />
                  Defensive upload validation
                </span>
              </div>
              <Link className="security-learn-link" href="/security">
                See how Taliqor protects your data <ArrowRight />
              </Link>
            </div>
          </div>
          <div className="cta-card" id="contact">
            <span>READY WHEN YOU ARE</span>
            <h3>
              Make your next close
              <br />
              your cleanest one yet.
            </h3>
            <p>
              Create your free workspace and reconcile your first two
              spreadsheets.
            </p>
            <Link href="/signup">
              Create free workspace <ArrowRight />
            </Link>
            <small>
              <Clock /> Takes less than two minutes
            </small>
          </div>
        </section>
      </main>

      <footer className="site-footer" aria-label="Site footer">
        <div className="footer-brand">
          <Link href="/" aria-label="Taliqor home"><Logo /></Link>
          <p>Revenue reconciliation and financial close clarity for modern finance teams.</p>
        </div>
        <div className="footer-column">
          <strong>Product</strong>
          <a href="#product">Overview</a>
          <a href="#workflow">How it works</a>
          <Link href="/security">Security</Link>
        </div>
        <div className="footer-column">
          <strong>Account</strong>
          <Link href="/signup">Create workspace</Link>
          <Link href="/login">Log in</Link>
        </div>
        <div className="footer-column">
          <strong>Legal</strong>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms of use</Link>
          <Link href="/security">Security</Link>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Taliqor. All rights reserved.</span>
          <span>Open beta · Free workspace</span>
        </div>
      </footer>
    </div>
  );
}
