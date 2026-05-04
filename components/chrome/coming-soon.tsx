export function ComingSoon({
  tab,
  description,
}: {
  tab: string;
  description?: string;
}) {
  return (
    <div className="mt-6 rounded-lg border border-border bg-surface p-16 text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised text-2xl">
        🛠
      </div>
      <h1 className="text-xl font-semibold">{tab}</h1>
      <p className="mt-2 text-sm text-text-muted">
        Coming soon — building this tab next.
      </p>
      {description && (
        <p className="mx-auto mt-3 max-w-md text-sm text-text-faint">
          {description}
        </p>
      )}
    </div>
  );
}
