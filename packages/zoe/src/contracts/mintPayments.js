/* eslint-disable no-use-before-define */
// @ts-check

import makeIssuerKit from '@agoric/ertp';
import { makeZoeHelpers } from '../contractSupport';

/**
 * This is a very simple contract that creates a new issuer and mints payments
 * from it, in order to give an example of how that can be done.  This contract
 * sends new tokens to anyone who requests them.
 *
 * Offer safety is not enforced here: the expectation is that most contracts
 * that want to do something similar would use the ability to mint new payments
 * internally rather than sharing that ability widely as this one does.
 *
 * makeInstance returns an invitation that, when exercised, provides 1000 of the
 * new tokens. publicAPI.makeInvite() returns an invitation that accepts an
 * empty offer and provides 1000 tokens.
 *
 * @typedef {import('../zoe').ContractFacet} ContractFacet
 * @param {ContractFacet} zcf
 */
const execute = (zcf, _terms) => {
  // Create the internal token mint for a fungible digital asset
  const { issuer, mint, amountMath } = zcf.makeIssuerKit({
    allegedName: 'tokens',
    keyword: 'Token',
  });
  const mintPayment = seat => {
    // We will send everyone who makes an offer 1000 tokens
    const tokens1000 = amountMath.make(1000);
    mint.allocate(seat, { Token: tokens1000 });
    seat.exit();
    // Since the user is getting the payout through Zoe, we can
    // return anything here. Let's return some helpful instructions.
    return 'Offer completed. You should receive a payment from Zoe';
  };

  const publicFacet = harden({
    // provide a way for anyone who knows the instance of
    // the contract to make their own invite.
    makeInvite: () => zcf.makeInvitation(mintPayment, 'mint a payment'),
    // make the token issuer public. Note that only the mint can
    // make new digital assets. The issuer is ok to make public.
    getTokenIssuer: () => issuer,
  });

  return harden({ adminFacet: {}, publicFacet });
};

harden(execute);
export { execute };
