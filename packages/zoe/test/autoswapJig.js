import { E } from '@agoric/eventual-send';
import { makeLocalAmountMath } from '@agoric/ertp';
import { natSafeMath } from '../src/contractSupport';

import { assertOfferResult, assertPayoutAmount } from './zoeTestHelpers';

const { add, subtract, multiply, floorDivide } = natSafeMath;

// A test Harness that simplifies tests of autoswap and multipoolAutoswap. The
// main component is the Trader, which can be instructed to make various offers
// to the contracts, and will validate pre- and post-conditions, instructed by
// a description of the expected previous state, the details of the offer and
// the expected results. This leaves the tests with the responsibility to
// clearly specify what changes should be expected. Helper methods calculate the
// changes expected with various successful requests, so the test code only
// needs additional detail when the expected outcome varies from common cases.

const makeScaleFn = (xPre, xPost) => value => {
  const deltaX = xPost > xPre ? subtract(xPost, xPre) : subtract(xPre, xPost);
  return floorDivide(multiply(deltaX, value), xPre);
};

// deltaY = alpha * gamma * yPre / ( 1 + alpha * gamma )
// gamma is (10000 - fee) / 10000
// alpha is deltaX / xPre
// reducing to a single division:
//    deltaY = deltaX * gammaNum * yPre / (xPre * gammaDen + deltaX * gammaNum)
export const outputFromInputPrice = (xPre, yPre, deltaX, fee) => {
  const gammaNumerator = 10000 - fee;
  return floorDivide(
    multiply(multiply(deltaX, yPre), gammaNumerator),
    add(multiply(xPre, 10000), multiply(deltaX, gammaNumerator)),
  );
};

// deltaX = beta * xPre / ( (1 - beta) * gamma )
// gamma is (10000 - fee) / 10000
// beta is deltaY / yPre
// reducing to a single division:
//    deltaX = deltaY * xPre * 10000 / (yPre - deltaY ) * gammaNum)
export const priceFromTargetOutput = (deltaY, yPre, xPre, fee) => {
  const gammaNumerator = 10000 - fee;
  return floorDivide(
    multiply(multiply(deltaY, xPre), 10000),
    multiply(subtract(yPre, deltaY), gammaNumerator),
  );
};

// calculation of next state for a successful addLiquidity offer. Doesn't apply
// to initial liquidity.
export const scaleForAddLiquidity = (poolState, deposits, exactRatio) => {
  const { c: cDeposit, s: sDeposit } = deposits;

  const poolCentralPost = add(poolState.c, cDeposit);
  const scaleByAlpha = makeScaleFn(poolState.c, poolCentralPost);
  // The test declares when it expects an exact ratio
  const deltaS = exactRatio
    ? scaleByAlpha(poolState.s)
    : add(1, scaleByAlpha(poolState.s));
  const poolSecondaryPost = add(poolState.s, deltaS);
  const liquidityPost = add(poolState.l, scaleByAlpha(poolState.l));

  return {
    c: poolCentralPost,
    s: poolSecondaryPost,
    l: liquidityPost,
    k: multiply(poolCentralPost, poolSecondaryPost),
    payoutL: subtract(liquidityPost, poolState.l),
    payoutC: 0,
    payoutS: subtract(sDeposit, deltaS),
  };
};

// The state of the pool at the start of a transaction. The values of central,
// and secondary pools, the liquidity outstanding, and K (the product of c and
// s). K may turn out to always be redundant, but it was helpful in clarifying
// which operations change K.
export const updatePoolState = (oldState, newState) => ({
  ...oldState,
  c: newState.c,
  s: newState.s,
  l: newState.l,
  k: newState.k,
});

export const makeTrader = async (purses, zoe, publicFacet, centralIssuer) => {
  const purseMap = new Map();
  for (const p of purses) {
    purseMap.set(p.getAllegedBrand(), p);
  }

  const withdrawPayment = amount => {
    return purseMap.get(amount.brand).withdraw(amount);
  };

  // autoswap ignores issuer, multipoolAutoswap needs to know which pool
  const getLiquidity = issuer =>
    E(publicFacet).getLiquiditySupply(issuer.getBrand());
  const getPoolAllocation = issuer =>
    E(publicFacet).getPoolAllocation(issuer.getBrand());

  const trader = harden({
    offerAndTrade: async (outAmount, inAmount, swapIn) => {
      const proposal = harden({
        want: { Out: outAmount },
        give: { In: inAmount },
      });
      const payment = harden({ In: withdrawPayment(inAmount) });
      const invitation = swapIn
        ? E(publicFacet).makeSwapInInvitation()
        : E(publicFacet).makeSwapOutInvitation();
      const seat = await zoe.offer(invitation, proposal, payment);
      return seat;
    },

    tradeAndCheck: async (
      t,
      swapIn,
      prePoolState,
      tradeDetails,
      expected,
      { Secondary: secondaryIssuer },
    ) => {
      const { make: central } = await makeLocalAmountMath(centralIssuer);
      const { make: secondary } = await makeLocalAmountMath(secondaryIssuer);
      // just check that the trade went through, and the results are as stated.
      // The test will declare fees, refunds, and figure out when the trade
      // gets less than requested

      // c: central, s: secondary, l: liquidity
      const { c: cPoolPre, s: sPoolPre, l: lPre, k: kPre } = prePoolState;
      const { inAmount, outAmount } = tradeDetails;
      const {
        c: cPost,
        s: sPost,
        l: lPost,
        k: kPost,
        in: inExpected,
        out: outExpected,
      } = expected;

      const poolPre = await getPoolAllocation(secondaryIssuer);
      t.deepEqual(central(cPoolPre), poolPre.Central, `central before swap`);
      t.deepEqual(secondary(sPoolPre), poolPre.Secondary, `s before swap`);
      t.is(
        lPre,
        await getLiquidity(secondaryIssuer),
        'liquidity pool before trade',
      );
      t.is(kPre, sPoolPre * cPoolPre);

      const seat = await trader.offerAndTrade(outAmount, inAmount, swapIn);
      assertOfferResult(t, seat, 'Swap successfully completed.');
      const [inIssuer, inMath, outIssuer, out] =
        inAmount.brand === centralIssuer.getBrand()
          ? [centralIssuer, central, secondaryIssuer, secondary]
          : [secondaryIssuer, secondary, centralIssuer, central];
      const { In: refund, Out: payout } = await seat.getPayouts();
      assertPayoutAmount(t, outIssuer, payout, out(outExpected), 'trade out');
      assertPayoutAmount(t, inIssuer, refund, inMath(inExpected), 'trade in');

      const poolPost = await getPoolAllocation(secondaryIssuer);
      t.deepEqual(central(cPost), poolPost.Central, `central after swap`);
      t.deepEqual(secondary(sPost), poolPost.Secondary, `s after swap`);
      t.is(kPost, sPost * cPost);

      await seat.getOfferResult();
      t.is(lPost, await getLiquidity(secondaryIssuer), 'liquidity after');
    },

    // This check only handles success. Failing calls should do something else.
    addLiquidityAndCheck: async (
      t,
      priorPoolState,
      details,
      expected,
      { Liquidity: liquidityIssuer, Secondary: secondaryIssuer },
    ) => {
      const { make: central } = await makeLocalAmountMath(centralIssuer);
      const { make: secondary } = await makeLocalAmountMath(secondaryIssuer);
      const { make: liquidity } = await makeLocalAmountMath(liquidityIssuer);
      // just check that it went through, and the results are as stated.
      // The test will declare fees, refunds, and figure out when the trade
      // gets less than requested
      const { c: cPre, s: sPre, l: lPre, k: kPre } = priorPoolState;
      const { cAmount, sAmount, lAmount = liquidity(0) } = details;
      const {
        c: cPost,
        s: sPost,
        l: lPost,
        k: kPost,
        payoutL,
        payoutC,
        payoutS,
      } = expected;
      t.truthy(payoutC === 0 || payoutS === 0, 'only refund one side');
      const scaleByAlpha = makeScaleFn(cPre, cPost);

      const poolPre = await getPoolAllocation(secondaryIssuer);
      t.deepEqual(central(cPre), poolPre.Central, `central before add liq`);
      t.deepEqual(secondary(sPre), poolPre.Secondary, `s before add liq`);
      t.is(
        lPre,
        await getLiquidity(secondaryIssuer),
        'liquidity pool before add',
      );
      t.is(kPre, sPre * cPre);

      const proposal = harden({
        give: { Central: cAmount, Secondary: sAmount },
        want: { Liquidity: lAmount },
      });
      const payment = harden({
        Central: withdrawPayment(cAmount),
        Secondary: withdrawPayment(sAmount),
      });

      const seat = await zoe.offer(
        E(publicFacet).makeAddLiquidityInvitation(),
        proposal,
        payment,
      );
      assertOfferResult(t, seat, 'Added liquidity.');

      const {
        Central: cPayout,
        Secondary: sPayout,
        Liquidity: lPayout,
      } = await seat.getPayouts();
      assertPayoutAmount(t, centralIssuer, cPayout, central(payoutC), '+c');
      assertPayoutAmount(t, secondaryIssuer, sPayout, secondary(payoutS), '+s');
      assertPayoutAmount(t, liquidityIssuer, lPayout, liquidity(payoutL), '+l');

      const poolPost = await getPoolAllocation(secondaryIssuer);
      t.deepEqual(central(cPost), poolPost.Central, `central after add liq`);
      t.deepEqual(secondary(sPost), poolPost.Secondary, `s after add liq`);
      t.is(lPost, await getLiquidity(secondaryIssuer), 'liquidity pool after');
      t.is(kPost, sPost * cPost, 'expected value of K after addLiquidity');
      t.is(lPost, add(lPre, scaleByAlpha(lPre)), 'liquidity scales');
      const productC = multiply(cPre, scaleByAlpha(sPre));

      const productS = multiply(sPre, cAmount.value);
      const exact = productC === productS;
      if (exact) {
        t.is(cPost, add(cPre, scaleByAlpha(cPre)), 'central post add');
        t.is(sPost, add(sPre, scaleByAlpha(sPre)), 'secondary post add');
      } else {
        t.is(cPost, add(cPre, cAmount.value), 'central post add');
        t.is(sPost, add(1, add(sPre, scaleByAlpha(sPre))), 's post add');
      }
    },

    initLiquidityAndCheck: async (
      t,
      priorPoolState,
      details,
      expected,
      { Liquidity: liquidityIssuer, Secondary: secondaryIssuer },
    ) => {
      const { make: central } = await makeLocalAmountMath(centralIssuer);
      const { make: secondary } = await makeLocalAmountMath(secondaryIssuer);
      const { make: liquidity } = await makeLocalAmountMath(liquidityIssuer);

      // just check that it went through, and the results are as stated.
      // The test will declare fees, refunds, and figure out when the trade
      // gets less than requested
      const { c: cPre, s: sPre, l: lPre, k: kPre } = priorPoolState;
      const { cAmount, sAmount, lAmount = liquidity(0) } = details;
      const {
        c: cPost,
        s: sPost,
        l: lPost,
        k: kPost,
        payoutL,
        payoutC,
        payoutS,
      } = expected;
      t.truthy(payoutC === 0 || payoutS === 0, 'only refund one side');
      const poolPre = await getPoolAllocation(secondaryIssuer);
      t.deepEqual({}, poolPre, `central before liquidity`);
      t.is(0, await getLiquidity(secondaryIssuer), 'liquidity pool pre init');
      t.is(kPre, sPre * cPre);
      t.is(lPre, await getLiquidity(secondaryIssuer), 'liquidity pre init');

      const proposal = harden({
        give: { Central: cAmount, Secondary: sAmount },
        want: { Liquidity: lAmount },
      });
      const payment = harden({
        Central: withdrawPayment(cAmount),
        Secondary: withdrawPayment(sAmount),
      });

      const seat = await zoe.offer(
        await E(publicFacet).makeAddLiquidityInvitation(),
        proposal,
        payment,
      );
      assertOfferResult(t, seat, 'Added liquidity.');
      const {
        Central: cPayout,
        Secondary: sPayout,
        Liquidity: lPayout,
      } = await seat.getPayouts();
      assertPayoutAmount(t, centralIssuer, cPayout, central(payoutC), 'init c');
      const secondaryAmt = secondary(payoutS);
      assertPayoutAmount(t, secondaryIssuer, sPayout, secondaryAmt, 'init s');
      const liquidityAmt = liquidity(payoutL);
      assertPayoutAmount(t, liquidityIssuer, lPayout, liquidityAmt, 'init l');

      const poolPost = await getPoolAllocation(secondaryIssuer);
      t.deepEqual(central(cPost), poolPost.Central, `central after init`);
      t.deepEqual(secondary(sPost), poolPost.Secondary, `s after liquidity`);
      t.is(lPost, await getLiquidity(secondaryIssuer), 'liq pool after init');
      t.truthy(lPost >= lAmount.value, 'liquidity want was honored');
      t.is(kPost, sPost * cPost, 'expected value of K after init');
      t.is(lPost, lAmount.value, 'liquidity scales (init)');
      t.is(cPost, cAmount.value);
      t.is(sPost, sAmount.value);
    },
  });
  return trader;
};
