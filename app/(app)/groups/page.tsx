'use client';

import { AutoGroupButton } from '@/components/groups/auto-group-button';
import { GroupCard } from '@/components/groups/group-card';
import { Button } from '@/components/ui/button';
import { computeGroupStats } from '@/lib/group-stats';
import { getClosedGroups } from '@/lib/closed-groups';
import { useFullState } from '@/lib/queries/use-state';
import { useApplyAutoGroup } from '@/lib/queries/use-groups';

export default function ClosedGroupsPage() {
  const { data: state, isLoading } = useFullState();
  const applyAutoGroup = useApplyAutoGroup();

  if (isLoading || !state) {
    return (
      <div className="mt-6 rounded-lg border border-border bg-surface p-12 text-center text-sm text-text-muted">
        Loading…
      </div>
    );
  }

  const closedGroups = getClosedGroups(state.groups, state.trades);
  const stats = closedGroups.map((g) => computeGroupStats(g, state.trades));
  const totalNet = stats.reduce((sum, s) => sum + s.netPL, 0);

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Closed Groups</h2>
          <p className="text-sm text-text-muted">
            {closedGroups.length} closed group
            {closedGroups.length === 1 ? '' : 's'} · net{' '}
            <span className={totalNet >= 0 ? 'text-credit' : 'text-debit'}>
              {totalNet >= 0 ? '+' : ''}${Math.round(totalNet).toLocaleString()}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <AutoGroupButton
            trades={state.trades}
            groups={state.groups}
            onConfirm={(plan) => applyAutoGroup.mutate(plan)}
          />
          <Button variant="secondary" disabled>Create New Group</Button>
          <Button variant="secondary" disabled>Manage Groups</Button>
        </div>
      </div>

      {applyAutoGroup.isError && (
        <div className="rounded-md border border-debit bg-debit-bg p-3 text-sm text-debit">
          Auto-Group failed: {(applyAutoGroup.error as Error).message}
        </div>
      )}
      {applyAutoGroup.isPending && (
        <div className="rounded-md border border-roll bg-roll-bg p-3 text-sm text-roll">
          Rebuilding groups…
        </div>
      )}

      {closedGroups.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <p className="text-sm text-text-muted">
            No closed groups yet. Click <strong>Auto-Group by Trade Ref #</strong> to
            build groups from your closed trades.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {stats.map((s) => (
            <GroupCard key={s.group.id} stats={s} />
          ))}
        </div>
      )}
    </div>
  );
}
