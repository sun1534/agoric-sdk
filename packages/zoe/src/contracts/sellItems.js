/* eslint-disable no-use-before-define */
// @ts-check

import { assert, details } from '@agoric/assert';
import {
  assertKeywords,
  checkHook,
  assertNatMathHelpers,
  trade,
  defaultAcceptanceMsg,
} from '../contractSupport';

import '../types';

/**
 * Sell items in exchange for money. Items may be fungible or
 * non-fungible and multiple items may be bought at once. Money must
 * be fungible.
 *
 * The `pricePerItem` is to be set in the terms. It is expected that all items
 * are sold for the same uniform price.
 *
 * The initial offer should be { give: { Items: items } }, accompanied by
 * terms as described above.
 * Buyers use offers that match { want: { Items: items } give: { Money: m } }.
 * The items provided should match particular items that the seller still has
 * available to sell, and the money should be pricePerItem times the number of
 * items requested.
 *
 * @param {ContractFacet} zcf
 */
const execute = (zcf, { pricePerItem }) => {
  const allKeywords = ['Items', 'Money'];
  assertKeywords(harden(allKeywords));

  assertNatMathHelpers(pricePerItem.brand);
  let sellerSeat;

  const sell = seat => {
    sellerSeat = seat;
    return defaultAcceptanceMsg;
  };

  const buy = buyerSeat => {
    const sellerAllocation = sellerSeat.getCurrentAllocation();
    const buyerAllocation = buyerSeat.getCurrentAllocation();
    const currentItemsForSale = sellerAllocation.Items;
    const providedMoney = buyerAllocation.Money;

    const buyerProposal = buyerSeat.getProposal();
    const wantedItems = buyerProposal.want.Items;
    const numItemsWanted = wantedItems.value.length;
    const totalCostValue = pricePerItem.value * numItemsWanted;
    const moneyAmountMaths = zcf.getAmountMath(pricePerItem.brand);
    const itemsAmountMath = zcf.getAmountMath(wantedItems.brand);

    const totalCost = moneyAmountMaths.make(totalCostValue);

    // Check that the wanted items are still for sale.
    if (!itemsAmountMath.isGTE(currentItemsForSale, wantedItems)) {
      const rejectMsg = `Some of the wanted items were not available for sale`;
      throw buyerSeat.kickOut(rejectMsg);
    }

    // Check that the money provided to pay for the items is greater than the totalCost.
    if (!moneyAmountMaths.isGTE(providedMoney, totalCost)) {
      const rejectMsg = `More money (${totalCost}) is required to buy these items`;
      throw buyerSeat.kickOut(rejectMsg);
    }

    // Reallocate. We are able to trade by only defining the gains
    // (omitting the losses) because the keywords for both offers are
    // the same, so the gains for one offer are the losses for the
    // other.
    trade(
      { seat: sellerSeat, gains: { Money: providedMoney } },
      { seat: buyerSeat, gains: { Items: wantedItems } },
    );

    // Complete the buyer offer.
    buyerSeat.exit();
    return defaultAcceptanceMsg;
  };

  const buyExpected = harden({
    want: { Items: null },
    give: { Money: null },
  });

  zcf.initPublicAPI(
    harden({
      makeBuyerInvite: () => {
        const itemsAmount = sellerSeat.getCurrentAllocation().Items;
        const itemsAmountMath = zcf.getAmountMath(itemsAmount.brand);
        assert(
          sellerSeat && !itemsAmountMath.isEmpty(itemsAmount),
          details`no items are for sale`,
        );
        return zcf.makeInvitation(checkHook(buy, buyExpected), 'buyer');
      },
      getAvailableItems: () => {
        if (!sellerSeat) {
          throw new Error(`no items have been escrowed`);
        }
        return sellerSeat.getCurrentAllocation().Items;
      },
      getItemsIssuer: () => zcf.getInstanceRecord().issuerKeywordRecord.Items,
    }),
  );

  const admin = harden({
    makeInitialInvitation: () => zcf.makeInvitation(sell, 'seller'),
  });

  return admin;
};

harden(execute);
export { execute };
