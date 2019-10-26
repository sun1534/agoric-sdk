import harden from '@agoric/harden';
import Nat from '@agoric/nat';

import { makeMint } from '../../mint';

export const makeContract = harden((zoe, terms) => {
  // Liquidity tokens are a basic fungible token. We need to be able
  // to instantiate a new zoe with 3 starting assays: two for
  // the underlying rights to be swapped, and this liquidityAssay. So
  // we will make the liquidityAssay now and return it to the user
  // along with the `makeAutoSwap` function.
  const liquidityMint = makeMint('liquidity');
  const liquidityAssay = liquidityMint.getAssay();
  let poolOfferHandle;

  const assays = [...terms.assays, liquidityAssay];
  let liqTokenSupply = 0;

  const ejectPlayer = (
    offerHandle,
    message = `The offer was invalid. Please check your refund.`,
  ) => {
    zoe.complete(harden([offerHandle]));
    return Promise.reject(new Error(`${message}`));
  };

  /**
   * These operations should be used for calculations with the
   * extents of basic fungible tokens.
   */
  const operations = harden({
    add: (x, y) => Nat(x + y),
    subtract: (x, y) => Nat(x - y),
    multiply: (x, y) => Nat(x * y),
    divide: (x, y) => Nat(Math.floor(x / y)),
  });
  const { add, subtract, multiply, divide } = operations;

  // Vector addition of two extent arrays
  const vectorWith = (extentOpsArray, leftExtents, rightExtents) =>
    leftExtents.map((leftQ, i) =>
      extentOpsArray[i].with(leftQ, rightExtents[i]),
    );

  // Vector subtraction of two extent arrays
  const vectorWithout = (extentOpsArray, leftExtents, rightExtents) =>
    leftExtents.map((leftQ, i) =>
      extentOpsArray[i].without(leftQ, rightExtents[i]),
    );

  const isValidOfferAddingLiquidity = newPayoutRules =>
    ['offerExactly', 'offerExactly', 'wantAtLeast'].every(
      (kind, i) => kind === newPayoutRules[i].kind,
    );

  const isValidOfferRemovingLiquidity = newPayoutRules =>
    ['wantAtLeast', 'wantAtLeast', 'offerExactly'].every(
      (kind, i) => kind === newPayoutRules[i].kind,
    );

  const isValidOfferSwappingOfferFirst = newPayoutRules =>
    ['offerExactly', 'wantAtLeast', 'wantAtLeast'].every(
      (kind, i) => kind === newPayoutRules[i].kind,
    );

  const isValidOfferSwappingWantFirst = newPayoutRules =>
    ['wantAtLeast', 'offerExactly', 'wantAtLeast'].every(
      (kind, i) => kind === newPayoutRules[i].kind,
    );

  const addLiquidity = async escrowReceipt => {
    const extentOpsArray = zoe.getExtentOpsArray();
    const { offerHandle, offerRules } = await zoe.burnEscrowReceipt(
      escrowReceipt,
    );
    const { payoutRules } = offerRules;

    // Create an empty offer to represent the extents of the
    // liquidity pool.
    if (poolOfferHandle === undefined) {
      poolOfferHandle = zoe.escrowEmptyOffer();
    }

    const successMessage = 'Added liquidity.';
    const rejectMessage = 'The offer to add liquidity was invalid.';

    if (!isValidOfferAddingLiquidity(payoutRules)) {
      return ejectPlayer(offerHandle, rejectMessage);
    }

    const [oldPoolExtents, playerExtents] = zoe.getExtentsFor(
      harden([poolOfferHandle, offerHandle]),
    );

    // Calculate how many liquidity tokens we should be minting.
    // Calculations are based on the extents represented by index 0.
    // If the current supply is zero, start off by just taking the
    // extent at index 0 and using it as the extent for the
    // liquidity token.
    const liquidityQOut =
      liqTokenSupply > 0
        ? divide(multiply(playerExtents[0], liqTokenSupply), oldPoolExtents[0])
        : playerExtents[0];

    // Calculate the new pool extents by adding together the old
    // extents plus the liquidity that was just added
    const newPoolExtents = vectorWith(
      extentOpsArray,
      oldPoolExtents,
      playerExtents,
    );

    // Set the liquidity token extent in the array of extents that
    // will be turned into payments sent back to the user.
    const newPlayerExtents = zoe.makeEmptyExtents();
    newPlayerExtents[2] = liquidityQOut;

    // Now we need to mint the liquidity tokens and make sure that the
    // `zoe` knows about them. We will need to create an offer
    // that escrows the liquidity tokens, and then drop the result.
    const newPurse = liquidityMint.mint(liquidityQOut);
    const newPayment = newPurse.withdrawAll();
    liqTokenSupply += liquidityQOut;

    const kinds = ['wantAtLeast', 'wantAtLeast', 'offerExactly'];
    const extents = [
      extentOpsArray[0].empty(),
      extentOpsArray[1].empty(),
      liquidityQOut,
    ];
    const exitRule = {
      kind: 'noExit',
    };
    const liquidityOfferRules = zoe.makeOfferRules(kinds, extents, exitRule);
    const liquidityOfferHandle = await zoe.escrowOffer(
      liquidityOfferRules,
      harden([undefined, undefined, newPayment]),
    );
    // Reallocate, giving the liquidity tokens to the user, adding the
    // user's liquidity to the pool, and setting the liquidity offer
    // extents to empty.
    zoe.reallocate(
      harden([offerHandle, poolOfferHandle, liquidityOfferHandle]),
      harden([newPlayerExtents, newPoolExtents, zoe.makeEmptyExtents()]),
    );
    // The newly created liquidityOffer is temporary and is dropped
    zoe.complete(harden([liquidityOfferHandle, offerHandle]));
    return `${successMessage}`;
  };

  const removeLiquidity = async escrowReceipt => {
    const {
      offerHandle,
      offerRules: { payoutRules },
    } = await zoe.burnEscrowReceipt(escrowReceipt);
    const extentOpsArray = zoe.getExtentOpsArray();
    const successMessage = 'Liquidity successfully removed.';
    const rejectMessage = 'The offer to remove liquidity was invalid';

    if (!isValidOfferRemovingLiquidity(payoutRules)) {
      return ejectPlayer(offerHandle, rejectMessage);
    }
    const offerHandles = harden([poolOfferHandle, offerHandle]);
    const [poolExtents, playerExtents] = zoe.getExtentsFor(offerHandles);
    const liquidityTokenIn = playerExtents[2];

    const newPlayerExtents = poolExtents.map(poolQ =>
      divide(multiply(liquidityTokenIn, poolQ), liqTokenSupply),
    );

    const newPoolExtents = vectorWith(
      extentOpsArray,
      vectorWithout(extentOpsArray, poolExtents, newPlayerExtents),
      [0, 0, liquidityTokenIn],
    );

    liqTokenSupply -= liquidityTokenIn;

    zoe.reallocate(
      harden([offerHandle, poolOfferHandle]),
      harden([newPlayerExtents, newPoolExtents]),
    );
    zoe.complete(harden([offerHandle]));
    return `${successMessage}`;
  };

  /**
   * `calculateSwap` contains the logic for calculating how many tokens
   * should be given back to the user in exchange for what they sent in.
   * It also calculates the fee as well as the new extents of the
   * assets in the pool. `calculateSwapMath` is reused in several different
   * places, including to check whether an offer is valid, getting the
   * current price for an asset on user request, and to do the actual
   * reallocation after an offer has been made. The `Q` in variable
   * names stands for extent.
   * @param  {number} tokenInPoolQ - the extent in the liquidity pool
   * of the kind of token that was sent in.
   * @param  {number} tokenOutPoolQ - the extent in the liquidity pool
   * of the other kind of token, the kind that will be sent out.
   * @param  {number} tokenInQ - the extent that was sent in to be
   * exchanged
   * @param  {number} feeInTenthOfPercent=3 - the fee taken in tenths of
   * a percent. The default is 0.3%. The fee is taken in terms of token
   * A, which is the kind that was sent in.
   */
  const calculateSwap = (
    tokenInPoolQ,
    tokenOutPoolQ,
    tokenInQ,
    feeInTenthOfPercent = 3,
  ) => {
    const feeTokenInQ = multiply(divide(tokenInQ, 1000), feeInTenthOfPercent);
    const invariant = multiply(tokenInPoolQ, tokenOutPoolQ);
    const newTokenInPoolQ = add(tokenInPoolQ, tokenInQ);
    const newTokenOutPoolQ = divide(
      invariant,
      subtract(newTokenInPoolQ, feeTokenInQ),
    );
    const tokenOutQ = subtract(tokenOutPoolQ, newTokenOutPoolQ);

    // Note: We add the fee to the pool extent, but could do something
    // different.
    return {
      tokenOutQ,
      // Since the fee is already added to the pool, this property
      // should only be used to report on fees and test.
      feeQ: feeTokenInQ,
      newTokenInPoolQ: add(newTokenInPoolQ, feeTokenInQ),
      newTokenOutPoolQ,
    };
  };

  const makeAssetDesc = (extentOps, label, allegedExtent) => {
    extentOps.insistKind(allegedExtent);
    return harden({
      label,
      extent: allegedExtent,
    });
  };

  const assetDescsToExtentsArray = (extentOps, assetDescs) =>
    assetDescs.map((assetDesc, i) =>
      assetDesc === undefined ? extentOps[i].empty() : assetDesc.extent,
    );

  /**
   * `getPrice` calculates the result of a trade, given a certain assetDesc
   * of tokens in.
   */
  const getPrice = assetDescIn => {
    const [poolExtents] = zoe.getExtentsFor(harden([poolOfferHandle]));
    const extentOpsArray = zoe.getExtentOpsArray();
    const [tokenAPoolQ, tokenBPoolQ] = poolExtents;
    const labels = zoe.getLabels();
    const [tokenAInQ, tokenBInQ] = assetDescsToExtentsArray(
      extentOpsArray,
      assetDescIn,
    );

    // offer tokenA, want tokenB
    if (tokenAInQ > 0 && tokenBInQ === 0) {
      const { tokenOutQ } = calculateSwap(tokenAPoolQ, tokenBPoolQ, tokenAInQ);
      return makeAssetDesc(extentOpsArray[1], labels[1], tokenOutQ);
    }

    // want tokenA, offer tokenB
    if (tokenAInQ === 0 && tokenBInQ > 0) {
      const { tokenOutQ } = calculateSwap(tokenBPoolQ, tokenAPoolQ, tokenBInQ);
      return makeAssetDesc(extentOpsArray[0], labels[0], tokenOutQ);
    }

    throw new Error(`The asset descriptions were invalid`);
  };

  const makeOffer = async escrowReceipt => {
    const {
      offerHandle,
      offerRules: { payoutRules },
    } = await zoe.burnEscrowReceipt(escrowReceipt);
    const successMessage = 'Swap successfully completed.';
    const rejectMessage = 'The offer to swap was invalid.';

    const [poolExtents, playerExtents] = zoe.getExtentsFor(
      harden([poolOfferHandle, offerHandle]),
    );
    const [tokenAPoolQ, tokenBPoolQ] = poolExtents;

    // offer token A, want token B
    if (isValidOfferSwappingOfferFirst(payoutRules)) {
      const [tokenInQ, wantAtLeastQ] = playerExtents;
      const { tokenOutQ, newTokenInPoolQ, newTokenOutPoolQ } = calculateSwap(
        tokenAPoolQ,
        tokenBPoolQ,
        tokenInQ,
      );
      if (tokenOutQ < wantAtLeastQ) {
        return ejectPlayer(offerHandle, rejectMessage);
      }

      const newPoolExtents = [
        newTokenInPoolQ,
        newTokenOutPoolQ,
        poolExtents[2],
      ];
      const newPlayerExtents = [0, tokenOutQ, 0];

      zoe.reallocate(
        harden([offerHandle, poolOfferHandle]),
        harden([newPlayerExtents, newPoolExtents]),
      );
      zoe.complete(harden([offerHandle]));
      return `${successMessage}`;
    }

    // want token A, offer token B
    if (isValidOfferSwappingWantFirst(payoutRules)) {
      const [wantAtLeastQ, tokenInQ] = playerExtents;
      const { tokenOutQ, newTokenInPoolQ, newTokenOutPoolQ } = calculateSwap(
        tokenBPoolQ,
        tokenAPoolQ,
        tokenInQ,
      );
      if (tokenOutQ < wantAtLeastQ) {
        return ejectPlayer(offerHandle, rejectMessage);
      }

      const newPoolExtents = [
        newTokenOutPoolQ,
        newTokenInPoolQ,
        poolExtents[2],
      ];
      const newPlayerExtents = [tokenOutQ, 0, 0];

      zoe.reallocate(
        harden([offerHandle, poolOfferHandle]),
        harden([newPlayerExtents, newPoolExtents]),
      );
      zoe.complete(harden([offerHandle]));
      return `${successMessage}`;
    }

    // Offer must be invalid
    return ejectPlayer(offerHandle, rejectMessage);
  };

  // The API exposed to the user
  const autoswap = harden({
    addLiquidity,
    removeLiquidity,
    getPrice,
    makeOffer,
    getLiquidityAssay: () => liquidityAssay,
    getPoolExtents: () => zoe.getExtentsFor(harden([poolOfferHandle]))[0],
  });
  return harden({
    instance: autoswap,
    assays,
  });
});