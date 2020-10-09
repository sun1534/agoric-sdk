// @ts-check
import '../../exported';

import { assert, details } from '@agoric/assert';
import { E } from '@agoric/eventual-send';

// Eventually will be importable from '@agoric/zoe-contract-support'
import { makePromiseKit } from '@agoric/promise-kit';
import { assertProposalShape, natSafeMath } from '../contractSupport';

const { subtract, multiply, floorDivide } = natSafeMath;

/**
 * Constants for buy and sell positions.
 *
 * @type {{ BUY: 'buy', SELL: 'sell' }}
 */
const Position = {
  BUY: 'buy',
  SELL: 'sell',
};

const PERCENT_BASE = 100;
const inverse = percent => subtract(PERCENT_BASE, percent);

/**
 * This contract implements a fully collateralized call spread. This is a
 * combination of a bought call option and a sold call option at a higher strike
 * price. The contracts are sold in pairs, and the buyers of the two positions
 * together invest the entire amount that will be paid out.
 *
 * This option is settled financially. Neither party is expected to have
 * ownership of the underlying asset at the start, and neither expects to take
 * delivery at closing.
 *
 * zoe.startInstance() takes an issuerKeywordRecord that specifies the issuers
 * for the keywords Underlying, Strike, and Collateral. The payout uses
 * collateral. The price oracle quotes the value of the Underlying in the same
 * units as the Strike prices.
 *
 * creatorFacet has a method makeInvitationPair(), that takes terms
 * that specifies { expiration, underlyingAmount, priceAuthority, strikePrice1,
 *   strikePrice2, settlementAmount, buyPercent }.
 * ownerFacet.makeInvitationPair() returns two invitations, which can be
 * exercised for free, and is valuable for its payouts.
 *
 * @type {ContractStartFn}
 */
const start = zcf => {
  const terms = zcf.getTerms();
  const {
    maths: {
      // Underlying: underlyingMath,
      Collateral: collateralMath,
      Strike: strikeMath,
    },
  } = terms;

  assert(
    strikeMath.isGTE(terms.strikePrice2, terms.strikePrice1),
    `strikePrice2 must be greater than strikePrice1`,
  );

  const { zcfSeat: collateralSeat } = zcf.makeEmptySeatKit();
  // promises for option seats. The seats aren't reified until offer() is
  // called, but we want to set payouts when options mature, regardless
  const seatPromiseKits = {};
  seatPromiseKits[Position.BUY] = makePromiseKit();
  seatPromiseKits[Position.SELL] = makePromiseKit();

  function scheduleMaturity() {
    function reallocateToSeat(position, sharePercent) {
      seatPromiseKits[position].promise.then(
        seat => {
          const collateral = collateralSeat.getCurrentAllocation().Collateral;
          const collateralShare = floorDivide(
            multiply(collateral.value, sharePercent),
            PERCENT_BASE,
          );
          const seatPortion = collateralMath.make(collateralShare);
          const collateralRemainder = collateralMath.subtract(
            collateral,
            seatPortion,
          );
          zcf.reallocate(
            seat.stage({ Collateral: seatPortion }),
            collateralSeat.stage({ Collateral: collateralRemainder }),
          );
          seat.exit();
        },
        () => zcf.shutdown(),
      );
    }

    terms.priceAuthority
      .priceAtTime(terms.expiration, terms.underlyingAmount)
      .then(
        price => {
          // buyerShare is the value of the underlying at close of the strikePrice
          // percentage (base:100) computed from strikePrice
          // scale that will be used to calculate the portion of collateral
          // allocated to each party.
          let buyerShare;

          if (strikeMath.isGTE(terms.strikePrice1, price)) {
            buyerShare = 0;
          } else if (strikeMath.isGTE(price, terms.strikePrice2)) {
            buyerShare = 100;
          } else {
            const denominator = strikeMath.subtract(
              terms.strikePrice2,
              terms.strikePrice1,
            ).value;
            const numerator = strikeMath.subtract(price, terms.strikePrice1)
              .value;
            buyerShare = floorDivide(
              multiply(PERCENT_BASE, numerator),
              denominator,
            );
          }

          // either offer might be exercised late, so we pay the two seats
          // separately.
          const sellerShare = inverse(buyerShare);
          reallocateToSeat(Position.BUY, buyerShare, terms);
          reallocateToSeat(Position.SELL, sellerShare, terms);
        },
        () => zcf.shutdown(),
      );
  }

  function makeOptionInvitation(dir) {
    function makePayoutHandler() {
      return seat => seatPromiseKits[dir].resolve(seat);
    }

    // transfer collateral from depositSeat to collateralSeat, then return an
    // invitation for the payout.
    /** @type {OfferHandler} */
    const optionPosition = depositSeat => {
      assertProposalShape(depositSeat, {
        give: { Collateral: null },
        // TODO(cth): is this right? Do the option buyers 'want' an option/invitation?
        // want: { Spread: null },
        // exit: null,
      });

      const {
        give: { Collateral: newCollateral },
      } = depositSeat.getProposal();
      let oldCollateral = collateralSeat.getCurrentAllocation().Collateral;
      if (!oldCollateral) {
        oldCollateral = collateralMath.getEmpty();
      }

      const numerator =
        (dir === Position.BUY) ? terms.buyPercent : inverse(terms.buyPercent);
      const required = floorDivide(
        multiply(terms.settlementAmount.value, numerator),
        100,
      );

      assert(
        collateralMath.isEqual(newCollateral, collateralMath.make(required)),
        details`Collateral required: ${required}`,
      );

      const newTotal = collateralMath.add(newCollateral, oldCollateral);
      zcf.reallocate(
        depositSeat.stage({ Collateral: collateralMath.getEmpty() }),
        collateralSeat.stage({ Collateral: newTotal }),
      );
      depositSeat.exit();
      // TODO(cth): allocate the invitation to the seat rather than returning it.

      return zcf.makeInvitation(makePayoutHandler(), 'collect payout', terms);
    };

    return zcf.makeInvitation(optionPosition, `call spread ${dir}`, terms);
  }

  function makeInvitationPair() {
    const buyPercent = terms.buyPercent;
    assert(
      buyPercent >= 0 && buyPercent <= 100,
      'percentages must be between 0 and 100.',
    );

    const buyInvitation = makeOptionInvitation(Position.BUY);
    const sellInvitation = makeOptionInvitation(Position.SELL);
    scheduleMaturity();
    return { buyInvitation, sellInvitation };
  }

  const creatorFacet = harden({ makeInvitationPair });
  return harden({ creatorFacet });
};

harden(start);
export { start };

/**
 *  makeInvitePair(fraction, characteristics) ===> two invitations:
 *
 *  give: amount, want:
 * generate invitations for the options
 * construct inner invitations which will be paid out later
 *  collect the deposits, return the inner invitations.
 
 * set up a timer/price query and wait fro it   [scheduleMaturity]
 * pay out on timer firing
 
 * Start out with a comment saying we should leave a grace period for closing,
 *     but don't do anything about it.
 * Initial seat
 */

// const customProps = harden({
//   expirationDate: terms.exit.afterDeadline.deadline,
//   underlyingAssets: terms.give,
//   strikePrice1: seat.getProposal().want,
//   strikePrice2: seat.getProposal().want,
//   priceAuthority: seat.getInvitationDetails(),
// });
