// @ts-check

import { produceNotifier } from '@agoric/notifier';
import {
  rejectOffer,
  checkIfProposal,
  swap,
  satisfies,
  getActiveOffers,
  assertKeywords,
  defaultAcceptanceMsg,
} from '../contractSupport';

/**
 * SimpleExchange is an exchange with a simple matching algorithm, which allows
 * an unlimited number of parties to create new orders or accept existing
 * orders. The notifier allows callers to find the current list of orders.
 *
 * The SimpleExchange uses Asset and Price as its keywords. The contract treats
 * the two keywords symmetrically. New offers can be created and existing offers
 * can be accepted in either direction.
 *
 * { give: { 'Asset', simoleans(5) }, want: { 'Price', quatloos(3) } }
 * { give: { 'Price', quatloos(8) }, want: { 'Asset', simoleans(3) } }
 *
 * The Asset is treated as an exact amount to be exchanged, while the
 * Price is a limit that may be improved on. This simple exchange does
 * not partially fill orders.
 *
 * The invitation returned on installation of the contract is the same as what
 * is returned by calling `publicAPI.makeInvite().
 *
 * @typedef {import('../zoe').ContractFacet} ContractFacet
 * @param {ContractFacet} zcf
 */
const execute = (zcf, terms) => {
  let sellSeats = [];
  let buySeats = [];
  // eslint-disable-next-line no-use-before-define
  const { notifier, updater } = produceNotifier(getBookOrders());
  assertKeywords(harden(['Asset', 'Price']));

  const describeSeat = seat => {
    const proposal = seat.getProposal();
    return harden({
      want: proposal.want,
      give: proposal.give,
    });
  };

  const describeSeats = seats => {
    const result = [];
    seats.forEach(seat => {
      if (!seat.didExit()) {
        result.push(describeSeat(seat));
      }
    });
  };

  const getBookOrders = () =>
    harden({
      buys: describeSeats(buySeats),
      sells: describeSeats(sellSeats),
    });

  // Tell the notifier that there has been a change to the book orders
  const bookOrdersChanged = () => updater.updateState(getBookOrders());

  // If there's an existing offer that this offer is a match for, make the trade
  // and return the handle for the matched offer. If not, return undefined, so
  // the caller can know to add the new offer to the book.
  function swapIfCanTrade(seats, newSeat) {
    for (const existingSeat of seats) {
      const satisfiedBy = (xSeat, ySeat) =>
        satisfies(xSeat, ySeat.getCurrentAllocation());
      if (
        satisfiedBy(existingSeat, newSeat) &&
        satisfiedBy(newSeat, existingSeat)
      ) {
        swap(existingSeat, newSeat);
        // return seat to remove
        return existingSeat;
      }
    }
    return undefined;
  }

  // try to swap offerHandle with one of the counterOffers. If it works, remove
  // the matching offer and return the remaining counterOffers. If there's no
  // matching offer, add the offerHandle to the coOffers, and return the
  // unmodified counterOfffers
  function swapIfCanTradeAndUpdateBook(counterOffers, coOffers, tradeSeat) {
    const matchSeat = swapIfCanTrade(counterOffers, tradeSeat);
    if (matchSeat) {
      // remove the matched offer.
      counterOffers = counterOffers.filter(value => value !== matchSeat);
    } else {
      // Save the order in the book
      coOffers.push(tradeSeat);
    }

    return counterOffers;
  }

  const makeTrade = tradeSeat => {
    const buyAssetForPrice = harden({
      give: { Price: null },
      want: { Asset: null },
    });
    const sellAssetForPrice = harden({
      give: { Asset: null },
      want: { Price: null },
    });
    if (checkIfProposal(tradeSeat, sellAssetForPrice)) {
      buySeats = swapIfCanTradeAndUpdateBook(buySeats, sellSeats, tradeSeat);
      /* eslint-disable no-else-return */
    } else if (checkIfProposal(tradeSeat, buyAssetForPrice)) {
      sellSeats = swapIfCanTradeAndUpdateBook(sellSeats, buySeats, tradeSeat);
    } else {
      // Eject because the offer must be invalid
      throw tradeSeat.kickOut();
    }
    bookOrdersChanged();
    return defaultAcceptanceMsg;
  };

  zcf.initPublicAPI(
    harden({
      makeInvite: () => zcf.makeInvitation(makeTrade, 'exchange'),
      getNotifier: () => notifier,
    }),
  );

  const admin = harden({});
  return admin;
};

harden(execute);
export { execute };
