'use client';

import { useMutation } from '@tanstack/react-query';
import { useDataClient } from './providers';
import { useInvalidateState } from './use-state';
import { planAssign } from '../wheel/assign';
import { planCalledAway } from '../wheel/called-away';
import { planClose } from '../wheel/close';
import { planSellCoveredCall } from '../wheel/covered-call';
import { planRoll } from '../wheel/roll';
import type {
  AssignInput,
  CalledAwayInput,
  CloseInput,
  PlannerCtx,
  RollInput,
  SellCoveredCallInput,
  WheelState,
} from '../wheel/plan';

// Wheel-planner mutation hooks. Each hook reads a fresh state snapshot,
// invokes the appropriate planner, and applies the resulting Plan
// transactionally via dataClient.applyPlan. Invalidate-only revalidation.
//
// Insert ids use a random suffix matching MockDataClient's pattern so the
// generated trade rows aren't mistaken for seed-loaded ones. Same shape
// works for Supabase later (server can re-stamp ids if needed).
function makePlannerCtx(): PlannerCtx {
  return {
    newId: () => `t-${Math.random().toString(36).slice(2, 10)}`,
  };
}

export function useCloseTrade() {
  const dataClient = useDataClient();
  const invalidate = useInvalidateState();

  return useMutation({
    mutationFn: async (input: CloseInput) => {
      const full = await dataClient.getState();
      const state: WheelState = {
        trades: full.trades,
        stocks: full.stocks,
        groups: full.groups,
      };
      const plan = planClose(input, state, makePlannerCtx());
      await dataClient.applyPlan(plan);
    },
    onSettled: () => invalidate(),
  });
}

export function useSellCoveredCall() {
  const dataClient = useDataClient();
  const invalidate = useInvalidateState();

  return useMutation({
    mutationFn: async (input: SellCoveredCallInput) => {
      const full = await dataClient.getState();
      const state: WheelState = {
        trades: full.trades,
        stocks: full.stocks,
        groups: full.groups,
      };
      const plan = planSellCoveredCall(input, state, makePlannerCtx());
      await dataClient.applyPlan(plan);
    },
    onSettled: () => invalidate(),
  });
}

export function useRollTrade() {
  const dataClient = useDataClient();
  const invalidate = useInvalidateState();

  return useMutation({
    mutationFn: async (input: RollInput) => {
      const full = await dataClient.getState();
      const state: WheelState = {
        trades: full.trades,
        stocks: full.stocks,
        groups: full.groups,
      };
      const plan = planRoll(input, state, makePlannerCtx());
      await dataClient.applyPlan(plan);
    },
    onSettled: () => invalidate(),
  });
}

export function useAssignTrade() {
  const dataClient = useDataClient();
  const invalidate = useInvalidateState();

  return useMutation({
    mutationFn: async (input: AssignInput) => {
      const full = await dataClient.getState();
      const state: WheelState = {
        trades: full.trades,
        stocks: full.stocks,
        groups: full.groups,
      };
      // planAssign generates two ids (stock + assignment-row). makePlannerCtx
      // uses 't-' prefix for both — collisions are essentially impossible
      // given the random suffix, and the data layer's plan dispatcher checks
      // for id duplicates and rolls back if hit.
      const plan = planAssign(input, state, makePlannerCtx());
      await dataClient.applyPlan(plan);
    },
    onSettled: () => invalidate(),
  });
}

export function useCalledAway() {
  const dataClient = useDataClient();
  const invalidate = useInvalidateState();

  return useMutation({
    mutationFn: async (input: CalledAwayInput) => {
      const full = await dataClient.getState();
      const state: WheelState = {
        trades: full.trades,
        stocks: full.stocks,
        groups: full.groups,
      };
      const plan = planCalledAway(input, state, makePlannerCtx());
      await dataClient.applyPlan(plan);
    },
    onSettled: () => invalidate(),
  });
}
