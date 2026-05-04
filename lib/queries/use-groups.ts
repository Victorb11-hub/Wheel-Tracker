'use client';

import { useMutation } from '@tanstack/react-query';
import { useDataClient } from './providers';
import { useInvalidateState } from './use-state';
import type { AutoGroupPlan } from '../wheel/auto-group';

export function useApplyAutoGroup() {
  const dataClient = useDataClient();
  const invalidate = useInvalidateState();

  return useMutation({
    mutationFn: async (plan: AutoGroupPlan) => {
      // Sequential, fail-fast. The MockDataClient itself doesn't yet model a
      // multi-statement transaction across these top-level helpers; if a real
      // failure happens mid-loop we'll surface it. For Supabase later, this
      // becomes a single RPC.
      for (const g of plan.toDelete) {
        await dataClient.deleteGroup(g.id);
      }
      for (const g of plan.toCreate) {
        await dataClient.createGroup(g.name, g.trade_ids);
      }
    },
    onSettled: () => invalidate(),
  });
}

export function useCreateGroup() {
  const dataClient = useDataClient();
  const invalidate = useInvalidateState();

  return useMutation({
    mutationFn: async ({
      name,
      tradeIds,
    }: {
      name: string;
      tradeIds: string[];
    }) => dataClient.createGroup(name, tradeIds),
    onSettled: () => invalidate(),
  });
}

export function useRenameGroup() {
  const dataClient = useDataClient();
  const invalidate = useInvalidateState();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      dataClient.renameGroup(id, name),
    onSettled: () => invalidate(),
  });
}

export function useDeleteGroup() {
  const dataClient = useDataClient();
  const invalidate = useInvalidateState();

  return useMutation({
    mutationFn: async (id: string) => dataClient.deleteGroup(id),
    onSettled: () => invalidate(),
  });
}

export function useSetGroupTradeIds() {
  const dataClient = useDataClient();
  const invalidate = useInvalidateState();

  return useMutation({
    mutationFn: async ({
      id,
      tradeIds,
    }: {
      id: string;
      tradeIds: string[];
    }) => dataClient.setGroupTradeIds(id, tradeIds),
    onSettled: () => invalidate(),
  });
}
