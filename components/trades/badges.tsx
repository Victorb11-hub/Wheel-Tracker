import { cn } from '@/lib/utils';

const base =
  'inline-flex items-center rounded-sm border px-2 py-[2px] text-xs font-semibold uppercase tracking-wider';

export function ActionBadge({
  action,
}: {
  action: 'sell' | 'buy' | 'assignment' | 'called-away';
}) {
  if (action === 'sell') {
    return <span className={cn(base, 'border-transparent bg-credit-bg text-credit')}>Sell</span>;
  }
  if (action === 'buy') {
    return <span className={cn(base, 'border-transparent bg-debit-bg text-debit')}>Buy</span>;
  }
  if (action === 'assignment') {
    return (
      <span className={cn(base, 'border-assignment bg-assignment-bg text-assignment')}>
        Assigned
      </span>
    );
  }
  return (
    <span className={cn(base, 'border-assignment bg-assignment-bg text-assignment')}>
      Called Away
    </span>
  );
}

export function TypeBadge({ type }: { type: 'put' | 'call' | 'stock' }) {
  if (type === 'put') {
    return <span className={cn(base, 'border-debit bg-debit-bg text-debit')}>Put</span>;
  }
  if (type === 'call') {
    return <span className={cn(base, 'border-credit bg-credit-bg text-credit')}>Call</span>;
  }
  return (
    <span className={cn(base, 'border-assignment bg-assignment-bg text-assignment')}>Stock</span>
  );
}

export function StatusBadge({
  status,
}: {
  status: 'open' | 'closed' | 'assigned';
}) {
  if (status === 'open') {
    return <span className={cn(base, 'border-credit bg-transparent text-credit')}>Open</span>;
  }
  if (status === 'assigned') {
    return (
      <span className={cn(base, 'border-assignment bg-assignment-bg text-assignment')}>
        Assigned
      </span>
    );
  }
  return <span className={cn(base, 'border-text-muted bg-transparent text-text-muted')}>Closed</span>;
}

export function RolledBadge() {
  return <span className={cn(base, 'border-roll bg-roll-bg text-roll')}>Rolled</span>;
}
