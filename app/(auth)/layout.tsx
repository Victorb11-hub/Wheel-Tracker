export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div
            className="h-7 w-7 rounded-sm"
            style={{ background: 'var(--color-credit-gradient)' }}
          />
          <span className="text-md font-semibold">Wheel Tracker</span>
        </div>
        {children}
      </div>
    </main>
  );
}
