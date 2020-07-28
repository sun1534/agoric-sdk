// @ts-check

// Eventually will be importable from '@agoric/zoe-contract-support'
import {
  swap,
  assertKeywords,
  checkProposalKeywords,
} from '../contractSupport';

/**
 * Trade one item for another.
 *
 * The initial offer is { give: { Asset: A }, want: { Price: B } }.
 * The outcome from the first offer is an invitation for the second party,
 * who should offer { give: { Price: B }, want: { Asset: A } }, with a want
 * amount no greater than the original's give, and a give amount at least as
 * large as the original's want.
 *
 * @typedef {import('../zoe').ContractFacet} ContractFacet
 * @param {ContractFacet} zcf
 */
const execute = (zcf, _terms) => {
  assertKeywords(zcf, harden(['Asset', 'Price']));

  const makeMatchingInvite = firstSeat => {
    const { want, give } = firstSeat.getProposal();

    const secondSeatOfferHandler = secondSeat => swap(firstSeat, secondSeat);

    const secondSeatInvite = zcf.makeInvitation(
      secondSeatOfferHandler,
      'matchOffer',
      harden({
        customProperties: {
          asset: give.Asset,
          price: want.Price,
        },
      }),
    );
    return secondSeatInvite;
  };

  const firstProposalExpected = harden({
    give: { Asset: null },
    want: { Price: null },
  });

  const adminFacet = harden({
    makeFirstSeatInvite: () =>
      zcf.makeInvitation(
        checkProposalKeywords(makeMatchingInvite, firstProposalExpected),
        'firstOffer',
      ),
  });

  const publicFacet = harden({});

  return { adminFacet, publicFacet };
};

harden(execute);
export { execute };
