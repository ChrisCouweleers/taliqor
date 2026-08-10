export function Mark({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "mark small" : "mark"}
      viewBox="0 0 52 40"
      aria-hidden="true"
    >
      <path d="M3 9h10c8 0 10 22 20 22h15M3 20h12c8 0 11-14 19-14h14M3 31h12c8 0 11-13 19-13h14" />
      <circle cx="3" cy="9" r="2.5" />
      <circle cx="3" cy="20" r="2.5" />
      <circle cx="3" cy="31" r="2.5" />
      <circle cx="49" cy="6" r="2.5" />
      <circle cx="49" cy="18" r="2.5" />
      <circle cx="49" cy="31" r="2.5" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo">
      <Mark small={compact} />
      <span>Taliqor</span>
    </div>
  );
}
