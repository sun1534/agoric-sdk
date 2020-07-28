import { E } from '@agoric/eventual-send';
import { assert, details } from '@agoric/assert';

import { isOfferSafe } from './offerSafety';

export const makeSeatAdmin = (zoeSeat, seatData, getAmountMath) => {
  // The proposal and notifier are not reassigned.
  const { proposal, notifier } = seatData;

  // The currentAllocation, exited, and stagedAllocation may be reassigned.
  let currentAllocation = harden(seatData.initialAllocation);
  let exited = false; // seat is "active"
  let stagedAllocation;

  const seat = harden({
    exit: () => {
      exited = true;
      E(zoeSeat).exit();
    },
    kickOut: (msg = 'Kicked out of seat') => {
      seat.exit();
      assert.fail(msg);
    },
    getNotifier: () => notifier,
    didExit: () => exited,
    getProposal: () => proposal,
    getCurrentAllocation: (keyword, brand) => {
      if (currentAllocation[keyword] !== undefined) {
        return currentAllocation[keyword];
      }
      return getAmountMath(brand).getEmpty();
    },
    isOfferSafe: newAllocation => {
      const reallocation = harden({
        ...currentAllocation,
        ...newAllocation,
      });

      return isOfferSafe(getAmountMath, proposal, reallocation);
    },
    stageAllocation: newAllocation => {
      // We can restage as many times as we like.

      // Check offer safety.
      const reallocation = harden({
        ...currentAllocation,
        ...newAllocation,
      });

      assert(
        isOfferSafe(getAmountMath, proposal, reallocation),
        details`The reallocation was not offer safe`,
      );
      stagedAllocation = reallocation;
    },
  });

  const seatAdmin = harden({
    getStagedAllocation: () => stagedAllocation,
    commitStagedAllocation: () => {
      currentAllocation = stagedAllocation;
      stagedAllocation = undefined;
      E(zoeSeat).updateAllocation(currentAllocation);
    },
    getSeat: () => seat,
  });

  return seatAdmin;
};
