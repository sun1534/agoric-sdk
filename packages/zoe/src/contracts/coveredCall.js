// @ts-check

// Eventually will be importable from '@agoric/zoe-contract-support'
import { swap, assertKeywords, checkHook } from '../contractSupport';

/**
 * In a covered call, a digital asset's owner sells a call
 * option. A call option is the right to buy the digital asset at a
 * pre-determined price, called the strike price. The call option has an expiry
 * date, when the contract will be cancelled.
 *
 * In this contract, the expiry date is the deadline when
 * the offer escrowing the underlying assets is cancelled.
 * Therefore, the proposal for the underlying assets must have an
 * exit record with the key "afterDeadline".
 *
 * The invite received by the covered call creator is the call option. It has
 * this additional information in the invite's value:
 * { expirationDate, timerAuthority, underlyingAsset, strikePrice }
 *
 * The initial proposal should be:
 * {
 *   give: { UnderlyingAsset: assetAmount },
 *   want: { StrikePrice: priceAmount  },
 *   exit: { afterDeadline: { deadline: time, timer: timer } },
 * }
 * The result of the initial offer is { payout, outcome }, where payout will
 * eventually resolve to the strikePrice, and outcome is an assayable invitation
 * to buy the underlying asset. Since the contract provides assurance that the
 * underlying asset is available on the specified terms, the invite itself can
 * be traded as a valuable good.
 *
 * @typedef {import('../zoe').ContractFacet} ContractFacet
 * @param {ContractFacet} zcf
 */
const execute = (zcf, _terms) => {
  const rejectMsg = `The covered call option is expired.`;
  assertKeywords(harden(['UnderlyingAsset', 'StrikePrice']));

  const writeOption = sellerSeat => {
    const { want, give, exit } = sellerSeat.getProposal();

    const exerciseOption = buyerSeat => swap(sellerSeat, buyerSeat, rejectMsg);

    const exerciseOptionExpected = harden({
      give: { StrikePrice: null },
      want: { UnderlyingAsset: null },
    });

    return zcf.makeInvitation(
      checkHook(exerciseOption, exerciseOptionExpected),
      'exerciseOption',
      harden({
        customProperties: {
          expirationDate: exit.afterDeadline.deadline,
          timerAuthority: exit.afterDeadline.timer,
          underlyingAsset: give.UnderlyingAsset,
          strikePrice: want.StrikePrice,
        },
      }),
    );
  };

  const writeOptionExpected = harden({
    give: { UnderlyingAsset: null },
    want: { StrikePrice: null },
    exit: { afterDeadline: null },
  });

  const admin = harden({
    makeWriteOptionInvite: () =>
      zcf.makeInvitation(
        checkHook(writeOption, writeOptionExpected),
        'makeCallOption',
      ),
  });

  return admin;
};

harden(execute);
export { execute };
