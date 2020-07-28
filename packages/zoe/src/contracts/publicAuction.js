// @ts-check

import Nat from '@agoric/nat';

// Eventually will be importable from '@agoric/zoe-contract-support'
import {
  defaultAcceptanceMsg,
  rejectOffer, satisfies, assertKeywords, checkHook,
  secondPriceLogic,
  closeAuction,
} from '../contractSupport';

/**
 * An auction contract in which the seller offers an Asset for sale, and states
 * a minimum price. A pre-announced number of bidders compete to offer the best
 * price. When the appropriate number of bids have been received, the second
 * price rule is followed, so the highest bidder pays the amount bid by the
 * second highest bidder.
 *
 * makeInstance() specifies the issuers and terms ({ numBidsAllowed }) specify
 * the number of bids required. An invitation for the seller is returned. The
 * seller's offer should look like
 * { give: { Asset: asset }, want: { Ask: minimumBidAmount } }
 * The asset can be non-fungible, but the Ask amount should be of a fungible
 * brand.
 * The bidder invitations are available from publicAPI.makeInvites(n). Each
 * bidder can submit an offer: { give: { Bid: null } want: { Asset: null } }.
 *
 * publicAPI also has methods to find out what's being auctioned
 * (getAuctionedAssetsAmounts()), or the minimum bid (getMinimumBid()).
 *
 * @typedef {import('../zoe').ContractFacet} ContractFacet
 * @param {ContractFacet} zcf
 */
const execute = (zcf, { numBidsAllowed = 3 }) => {
  numBidsAllowed = Nat(numBidsAllowed);

  let sellerSeat;
  let minimumBid;
  let auctionedAssets;
  const allBidderSeats = [];

  // seller will use 'Asset' and 'Ask'. buyer will use 'Asset' and 'Bid'
  assertKeywords(harden(['Asset', 'Ask']));

  const bid = bidderSeat => {
    // Check that the item is still up for auction
    if (sellerSeat.didExit()) {
      const rejectMsg = `The item up for auction is not available or the auction has completed`;
      throw bidderSeat.kickOut(rejectMsg);
    }
    if (allBidderSeats.length >= numBidsAllowed) {
      throw bidderSeat.kickOut(`No further bids allowed.`);
    }
    const sellerSatisfied = satisfies(sellerSeat, {
      Ask: bidderSeat.getCurrentAllocation().Bid,
      Asset: zcf.getAmountMath(auctionedAssets.brand).getEmpty(),
    });
    const bidderSatisfied = satisfies(bidderSeat, {
      Asset: sellerSeat.getCurrentAllocation().Asset,
      Bid: zcf.getAmountMath(minimumBid.brand).getEmpty(),
    });
    if (!(sellerSatisfied && bidderSatisfied)) {
      const rejectMsg = `Bid was under minimum bid or for the wrong assets`;
      throw bidderSeat.kickOut(rejectMsg);
    }

    // Save valid bid and try to close.
    allBidderSeats.push(bidderSeat);
    if (allBidderSeats.length >= numBidsAllowed) {
      closeAuction(zcf, {
        auctionLogicFn: secondPriceLogic,
        sellerSeat,
        allBidderSeats,
      });
    }
    return defaultAcceptanceMsg;
  };

  const bidExpected = harden({
    give: { Bid: null },
    want: { Asset: null },
  });

  const makeBidderInvite = () =>
    zcf.makeInvitation(
      checkHook(bid, bidExpected),
      'bid',
      harden({
        customProperties: {
          auctionedAssets,
          minimumBid,
        },
      }),
    );

  const sell = seat => {
    if (auctionedAssets) {
      throw seat.kickOut(`assets already present`);
    }
    // Save the seat
    sellerSeat = seat;
    const proposal = sellerSeat.getProposal();
    auctionedAssets = proposal.give.Asset;
    minimumBid = proposal.want.Ask;
    return defaultAcceptanceMsg;
  };

  const sellExpected = harden({
    give: { Asset: null },
    want: { Ask: null },
  });

  const makeSellerInvite = () =>
    zcf.makeInvitation(checkHook(sell, sellExpected), 'sellAssets');

  zcf.initPublicAPI(
    harden({
      makeInvites: numInvites => {
        if (auctionedAssets === undefined) {
          throw new Error(`No assets are up for auction.`);
        }
        const invites = [];
        for (let i = 0; i < numInvites; i += 1) {
          invites.push(makeBidderInvite());
        }
        return invites;
      },
      getAuctionedAssetsAmounts: () => auctionedAssets,
      getMinimumBid: () => minimumBid,
    }),
  );

  const admin = harden({
    makeSellerInvite,
  });

  return admin;
};

harden(execute);
export { execute };
