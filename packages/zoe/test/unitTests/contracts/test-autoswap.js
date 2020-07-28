import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from 'tape-promise/tape';
// eslint-disable-next-line import/no-extraneous-dependencies
import bundleSource from '@agoric/bundle-source';
import { E } from '@agoric/eventual-send';

import { makeZoe } from '../../../src/zoeService/zoe';
import { setup } from '../setupBasicMints';
import fakeVatAdmin from './fakeVatAdmin';

const contractRoot = `${__dirname}/../../../src/contracts/autoswap`;

test('autoSwap with valid offers', async t => {
  t.plan(19);
  try {
    const { moolaKit, simoleanKit, moola, simoleans, zoe } = setup();

    const makeAlice = async (moolaPayment, simoleanPayment) => {
      const moolaPurse = await E(moolaKit.issuer).makeEmptyPurse();
      const simoleanPurse = await E(simoleanKit.issuer).makeEmptyPurse();
      return {
        installCode: async () => {
          // pack the contract
          const bundle = await bundleSource(contractRoot);
          // install the contract
          const installationP = E(zoe).install(bundle);
          return installationP;
        },
        makeInstance: async installation => {
          const issuerKeywordRecord = harden({
            TokenA: moolaKit.issuer,
            TokenB: simoleanKit.issuer,
          });
          const adminP = zoe.makeInstance(installation, issuerKeywordRecord);
          return adminP;
        },
        offer: async admin => {
          const liquidityIssuer = await E(admin).getLiquidityIssuer();
          const liquidityAmountMath = await getLocalAmountMath(liquidityIssuer);
          const liquidity = liquidityAmountMath.make;

          // Alice adds liquidity
          // 10 moola = 5 simoleans at the time of the liquidity adding
          // aka 2 moola = 1 simolean
          const aliceProposal = harden({
            want: { Liquidity: liquidity(10) },
            give: { TokenA: moola(10), TokenB: simoleans(5) },
          });
          const alicePayments = {
            TokenA: moolaPayment,
            TokenB: simoleanPayment,
          };

          const addLiquidityInvite = E(admin).makeAddLiquidityInvite();
          const addLiquiditySeat = await zoe.offer(
            addLiquidityInvite,
            aliceProposal,
            alicePayments,
          );

          t.equals(
            await E(addLiquiditySeat).getOfferResult(),
            'Added liquidity.',
            `added liquidity message`,
          );

          const liquidityPayments = await aliceAddLiquidityPayoutP;
          const liquidityPayout = await liquidityPayments.Liquidity;

          t.deepEquals(
            await liquidityIssuer.getAmountOf(liquidityPayout),
            liquidity(10),
            `liquidity payout`,
          );
          t.deepEquals(
            publicAPI.getPoolAllocation(),
            {
              TokenA: moola(10),
              TokenB: simoleans(5),
              Liquidity: liquidity(0),
            },
            `pool allocation`,
          );

          // Alice creates an invite for autoswap and sends it to Bob
          const bobInvite = admin.makeSwapInvite();

          const firstInvitation = E(admin).getInvitation();

          const proposal = harden({
            give: { Asset: moola(3) },
            want: { Price: simoleans(7) },
            exit: { onDemand: null },
          });
          const payments = { Asset: moolaPayment };

          const seat = await zoe.offer(firstInvitation, proposal, payments);

          seat
            .getPayout('Asset')
            .then(moolaPurse.deposit)
            .then(amountDeposited =>
              t.deepEquals(
                amountDeposited,
                moola(0),
                `Alice didn't get any of what she put in`,
              ),
            );

          seat
            .getPayout('Price')
            .then(simoleanPurse.deposit)
            .then(amountDeposited =>
              t.deepEquals(
                amountDeposited,
                proposal.want.Price,
                `Alice got exactly what she wanted`,
              ),
            );

          // The result of making the first offer is an invite to swap by
          // providing the other goods.
          const invitationP = seat.getOfferResult();
          return invitationP;
        },
      };
    };

    const makeBob = (installation, simoleanPayment) => {
      return harden({
        offer: async untrustedInvitation => {
          const moolaPurse = moolaKit.issuer.makeEmptyPurse();
          const simoleanPurse = simoleanKit.issuer.makeEmptyPurse();

          const invitationIssuer = await E(zoe).getInvitationIssuer();

          // Bob is able to use the trusted invitationIssuer from Zoe to
          // transform an untrusted invitation that Alice also has access to, to
          // an
          const invitation = await invitationIssuer.claim(untrustedInvitation);

          const {
            value: [invitationValue],
          } = await invitationIssuer.getAmountOf(invitation);

          t.equals(
            invitationValue.installation,
            installation,
            'installation is atomicSwap',
          );
          t.deepEquals(
            invitationValue.asset,
            moola(3),
            `asset to be traded is 3 moola`,
          );
          t.deepEquals(
            invitationValue.price,
            simoleans(7),
            `price is 7 simoleans, so bob must give that`,
          );

          const proposal = harden({
            give: { Price: simoleans(7) },
            want: { Asset: moola(3) },
            exit: { onDemand: null },
          });
          const payments = { Price: simoleanPayment };

          const seat = await zoe.offer(invitation, proposal, payments);

          t.equals(
            await E(seat).getOfferResult(),
            'The offer has been accepted. Once the contract has been completed, please check your payout',
          );

          seat
            .getPayout('Asset')
            .then(moolaPurse.deposit)
            .then(amountDeposited =>
              t.deepEquals(
                amountDeposited,
                proposal.want.Asset,
                `Bob got what he wanted`,
              ),
            );

          seat
            .getPayout('Price')
            .then(simoleanPurse.deposit)
            .then(amountDeposited =>
              t.deepEquals(
                amountDeposited,
                simoleans(0),
                `Bob didn't get anything back`,
              ),
            );
        },
      });
    };

    // Let's assume that simoleans are worth 2x as much as moola
    const alice = await makeAlice(
      await E(moolaKit.mint).mintPayment(moola(10)),
      await E(simoleanKit.mint).mintPayment(simoleans(5)),
    );
    const bob = await makeBob(
      await E(moolaKit.mint.mintPayment(moola(3))),
      await E(simoleanKit.mint).mintPayment(simoleans(3)),
    );

    // Alice makes an instance and makes her offer.
    const installation = await alice.installCode();
    const admin = await alice.makeInstance(installation);
    const invitation = await alice.offer(admin);

    // Alice spreads the invitation far and wide with instructions
    // on how to use it and Bob decides he wants to be the
    // counter-party, without needing to trust Alice at all.

    await bob.offer(invitation);

    // Bob claims it
    const bobExclInvite = await invitationIssuer.claim(bobInvite);
    const bobInstanceHandle = await getInstanceHandle(bobExclInvite);
    const {
      publicAPI: bobAutoswap,
      installationHandle: bobInstallationId,
    } = zoe.getInstanceRecord(bobInstanceHandle);
    t.equals(bobInstallationId, installationHandle, `installationHandle`);

    // Bob looks up the price of 3 moola in simoleans
    const simoleanAmounts = bobAutoswap.getCurrentPrice(
      moola(3),
      simoleans(0).brand,
    );
    t.deepEquals(simoleanAmounts, simoleans(1), `currentPrice`);

    // Bob escrows

    const bobMoolaForSimProposal = harden({
      want: { Out: simoleans(1) },
      give: { In: moola(3) },
    });
    const bobMoolaForSimPayments = harden({ In: bobMoolaPayment });

    const { payout: bobPayoutP, outcome: offerOkP } = await zoe.offer(
      bobExclInvite,
      bobMoolaForSimProposal,
      bobMoolaForSimPayments,
    );

    // Bob swaps
    t.equal(await offerOkP, 'Swap successfully completed.', `swap message 1`);

    const bobPayout = await bobPayoutP;

    const bobMoolaPayout1 = await bobPayout.In;
    const bobSimoleanPayout1 = await bobPayout.Out;

    t.deepEqual(
      await moolaIssuer.getAmountOf(bobMoolaPayout1),
      moola(0),
      `bob moola`,
    );
    t.deepEqual(
      await simoleanIssuer.getAmountOf(bobSimoleanPayout1),
      simoleans(1),
      `bob simoleans`,
    );
    t.deepEquals(
      bobAutoswap.getPoolAllocation(),
      {
        TokenA: moola(13),
        TokenB: simoleans(4),
        Liquidity: liquidity(0),
      },
      `pool allocation`,
    );

    // Bob looks up the price of 3 simoleans
    const moolaAmounts = bobAutoswap.getCurrentPrice(
      simoleans(3),
      moola(0).brand,
    );
    t.deepEquals(moolaAmounts, moola(5), `price 2`);

    // Bob makes another offer and swaps
    const bobSecondInvite = bobAutoswap.makeSwapInvite();
    const bobSimsForMoolaProposal = harden({
      want: { Out: moola(5) },
      give: { In: simoleans(3) },
    });
    const simsForMoolaPayments = harden({ In: bobSimoleanPayment });

    const {
      payout: bobSimsForMoolaPayoutP,
      outcome: simsForMoolaOkP,
    } = await zoe.offer(
      bobSecondInvite,
      bobSimsForMoolaProposal,
      simsForMoolaPayments,
    );

    t.equal(
      await simsForMoolaOkP,
      'Swap successfully completed.',
      `swap message 2`,
    );

    const bobSimsForMoolaPayout = await bobSimsForMoolaPayoutP;
    const bobMoolaPayout2 = await bobSimsForMoolaPayout.Out;
    const bobSimoleanPayout2 = await bobSimsForMoolaPayout.In;

    t.deepEqual(await moolaIssuer.getAmountOf(bobMoolaPayout2), moola(5));
    t.deepEqual(
      await simoleanIssuer.getAmountOf(bobSimoleanPayout2),
      simoleans(0),
    );
    t.deepEqual(bobAutoswap.getPoolAllocation(), {
      TokenA: moola(8),
      TokenB: simoleans(7),
      Liquidity: liquidity(0),
    });

    // Alice removes her liquidity
    // She's not picky...
    const aliceSecondInvite = publicAPI.makeRemoveLiquidityInvite();
    const aliceRemoveLiquidityProposal = harden({
      give: { Liquidity: liquidity(10) },
      want: { TokenA: moola(0), TokenB: simoleans(0) },
    });

    const {
      payout: aliceRemoveLiquidityPayoutP,
      outcome: removeLiquidityResultP,
    } = await zoe.offer(
      aliceSecondInvite,
      aliceRemoveLiquidityProposal,
      harden({ Liquidity: liquidityPayout }),
    );

    t.equals(await removeLiquidityResultP, 'Liquidity successfully removed.');

    const aliceRemoveLiquidityPayout = await aliceRemoveLiquidityPayoutP;
    const aliceMoolaPayout = await aliceRemoveLiquidityPayout.TokenA;
    const aliceSimoleanPayout = await aliceRemoveLiquidityPayout.TokenB;
    const aliceLiquidityPayout = await aliceRemoveLiquidityPayout.Liquidity;

    t.deepEquals(await moolaIssuer.getAmountOf(aliceMoolaPayout), moola(8));
    t.deepEquals(
      await simoleanIssuer.getAmountOf(aliceSimoleanPayout),
      simoleans(7),
    );
    t.deepEquals(
      await liquidityIssuer.getAmountOf(aliceLiquidityPayout),
      liquidity(0),
    );
    t.deepEquals(publicAPI.getPoolAllocation(), {
      TokenA: moola(0),
      TokenB: simoleans(0),
      Liquidity: liquidity(10),
    });
  } catch (e) {
    t.assert(false, e);
    console.log(e);
  }
});

test('autoSwap - test fee', async t => {
  t.plan(9);
  try {
    const {
      moolaIssuer,
      simoleanIssuer,
      moolaMint,
      simoleanMint,
      moola,
      simoleans,
    } = setup();
    const zoe = makeZoe(fakeVatAdmin);
    const invitationIssuer = zoe.getInvitationIssuer();
    const getInstanceHandle = makeGetInstanceHandle(invitationIssuer);

    // Setup Alice
    const aliceMoolaPayment = moolaMint.mintPayment(moola(10000));
    const aliceSimoleanPayment = simoleanMint.mintPayment(simoleans(10000));

    // Setup Bob
    const bobMoolaPayment = moolaMint.mintPayment(moola(1000));

    // Alice creates an autoswap instance

    // Pack the contract.
    const bundle = await bundleSource(autoswapRoot);

    const installationHandle = await zoe.install(bundle);
    const issuerKeywordRecord = harden({
      TokenA: moolaIssuer,
      TokenB: simoleanIssuer,
    });
    const {
      invite: aliceAddLiquidityInvite,
      instanceRecord: { publicAPI },
    } = await zoe.makeInstance(installationHandle, issuerKeywordRecord);
    const liquidityIssuer = publicAPI.getLiquidityIssuer();
    const liquidity = liquidityIssuer.getAmountMath().make;

    // Alice adds liquidity
    const aliceProposal = harden({
      give: {
        TokenA: moola(10000),
        TokenB: simoleans(10000),
      },
      want: { Liquidity: liquidity(0) },
    });
    const alicePayments = harden({
      TokenA: aliceMoolaPayment,
      TokenB: aliceSimoleanPayment,
    });

    const {
      payout: aliceAddLiquidityPayoutP,
      outcome: liquidityOkP,
    } = await zoe.offer(aliceAddLiquidityInvite, aliceProposal, alicePayments);

    t.equals(await liquidityOkP, 'Added liquidity.');

    const liquidityPayments = await aliceAddLiquidityPayoutP;
    const liquidityPayout = await liquidityPayments.Liquidity;

    t.deepEquals(
      await liquidityIssuer.getAmountOf(liquidityPayout),
      liquidity(10000),
    );
    t.deepEquals(publicAPI.getPoolAllocation(), {
      TokenA: moola(10000),
      TokenB: simoleans(10000),
      Liquidity: liquidity(0),
    });

    // Alice creates an invite for autoswap and sends it to Bob
    const bobInvite = publicAPI.makeSwapInvite();

    // Bob claims it
    const bobExclInvite = await invitationIssuer.claim(bobInvite);
    const bobInstanceHandle = await getInstanceHandle(bobExclInvite);
    const {
      publicAPI: bobAutoswap,
      installationHandle: bobInstallationId,
    } = zoe.getInstanceRecord(bobInstanceHandle);
    t.equals(bobInstallationId, installationHandle);

    // Bob looks up the price of 1000 moola in simoleans
    const simoleanAmounts = bobAutoswap.getCurrentPrice(
      moola(1000),
      simoleans(0).brand,
    );
    t.deepEquals(simoleanAmounts, simoleans(906), `simoleans out`);

    // Bob escrows
    const bobMoolaForSimProposal = harden({
      give: { In: moola(1000) },
      want: { Out: simoleans(0) },
    });
    const bobMoolaForSimPayments = harden({ In: bobMoolaPayment });

    // Bob swaps
    const { payout: bobPayoutP, outcome: offerOkP } = await zoe.offer(
      bobExclInvite,
      bobMoolaForSimProposal,
      bobMoolaForSimPayments,
    );

    t.equal(await offerOkP, 'Swap successfully completed.');

    const bobPayout = await bobPayoutP;
    const bobMoolaPayout = await bobPayout.In;
    const bobSimoleanPayout = await bobPayout.Out;

    t.deepEqual(await moolaIssuer.getAmountOf(bobMoolaPayout), moola(0));
    t.deepEqual(
      await simoleanIssuer.getAmountOf(bobSimoleanPayout),
      simoleans(906),
    );
    t.deepEquals(bobAutoswap.getPoolAllocation(), {
      TokenA: moola(11000),
      TokenB: simoleans(9094),
      Liquidity: liquidity(0),
    });
  } catch (e) {
    t.assert(false, e);
    console.log(e);
  }
});
