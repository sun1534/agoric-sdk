import { E } from '@agoric/eventual-send';
import { assert } from '@agoric/assert';
import { produceNotifier } from '@agoric/notifier';
import { producePromise } from '@agoric/produce-promise';
import { makeStore as makeWeakStore } from '@agoric/weak-store';

import { cleanProposal } from './cleanProposal';
import { arrayToObj } from './objArrayConversion';

export const makeOfferFn = (
  getInstanceAdmin,
  getAmountMath,
  invitationIssuer,
) => {
  const brandToPurse = makeWeakStore('brand');

  const offer = async (
    invitation,
    uncleanProposal = harden({}),
    paymentKeywordRecord = harden({}),
  ) => {
    let instance;
    let invitationHandle;
    let proposalKeywords;
    let proposal;

    const depositPayments = invitationAmount => {
      assert(
        invitationAmount.value.length === 1,
        'Only one invitation can be redeemed at a time',
      );

      proposal = cleanProposal(getAmountMath, uncleanProposal);
      const { give = {}, want = {} } = proposal;
      const giveKeywords = Object.keys(give);
      const wantKeywords = Object.keys(want);
      proposalKeywords = harden([...giveKeywords, ...wantKeywords]);

      const paymentDepositedPs = proposalKeywords.map(keyword => {
        if (giveKeywords.includes(keyword)) {
          // We cannot trust the amount in the proposal, so we use our
          // cleaned proposal's amount that should be the same.
          const giveAmount = proposal.give[keyword];
          const { purse } = brandToPurse.get(giveAmount.brand);
          return E(purse).deposit(paymentKeywordRecord[keyword], giveAmount);
          // eslint-disable-next-line no-else-return
        } else {
          // payments outside the give: clause are ignored.
          return getAmountMath(proposal.want[keyword].brand).getEmpty();
        }
      });
      ({
        value: [{ instance, handle: invitationHandle }],
      } = invitationAmount);

      return Promise.all(paymentDepositedPs);
    };

    const makeSeatAndTellZcf = amountsArray => {
      const initialAllocation = arrayToObj(amountsArray, proposalKeywords);

      const payoutPromise = producePromise();
      const { notifier, updater } = produceNotifier();
      let currentAllocation = initialAllocation;

      const instanceAdmin = getInstanceAdmin(instance);

      const seatAdmin = harden({
        updateAllocation: replacementAllocation => {
          harden(replacementAllocation);
          // Merging happens in ZCF, so replacementAllocation can
          // replace the old allocation entirely.
          updater.updateState(replacementAllocation);
          currentAllocation = replacementAllocation;
        },
        exit: () => {
          updater.resolve(undefined);
          instanceAdmin.removeSeat(seatAdmin);

          /** @type {PaymentPKeywordRecord} */
          const payout = {};
          Object.entries(currentAllocation).forEach(
            ([keyword, payoutAmount]) => {
              const purse = brandToPurse.get(payoutAmount.brand);
              payout[keyword] = E(purse).withdraw(payoutAmount);
            },
          );
          harden(payout);
          payoutPromise.resolve(payout);
        },
      });

      const seatData = harden({ proposal, initialAllocation, notifier });

      const makeSeatForUser = ({ offerResultP, canExit, exitObj }) =>
        harden({
          readAllocation: async () => currentAllocation,
          readProposal: async () => proposal,
          getPayout: async () => payoutPromise.promise,
          getOfferResult: async () => offerResultP,
          exit: async () => {
            assert(canExit, `This seat cannot be exited.`);
            return E(exitObj).exit();
          },
        });

      return instanceAdmin
        .addSeat(invitationHandle, seatAdmin, seatData)
        .then(makeSeatForUser);
    };

    return invitationIssuer
      .burn(invitation)
      .then(depositPayments)
      .then(makeSeatAndTellZcf);
  };

  return offer;
};
