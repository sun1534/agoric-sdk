// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';
import { E } from '@agoric/eventual-send';
import '../../../exported';
import { makePromiseKit } from '@agoric/promise-kit';
import buildManualTimer from '../../../tools/manualTimer';

import { setup } from '../setupBasicMints';
import { installationPFromSource } from '../installFromSource';
import { assertPayoutAmount } from '../../zoeTestHelpers';

const callSpread = `${__dirname}/../../../src/contracts/callSpread`;

function makeFakePriceAuthority(
  timer,
  underlyingAmountMath,
  strikeAmountMath,
  priceSchedule,
) {
  function priceFromSchedule(strikeTime) {
    let freshestPrice = 0;
    let freshestTime = -1;
    for (const tick of priceSchedule) {
      if (tick.time > freshestTime && tick.time <= strikeTime) {
        freshestTime = tick.time;
        freshestPrice = tick.price;
      }
    }
    return freshestPrice;
  }

  const priceAuthority = {
    getCurrentPrice: underlyingAmount => {
      const underlyingValue = underlyingAmountMath.getValue(underlyingAmount);
      return E(timer)
        .getCurrentTimestamp()
        .then(now => {
          const price = priceFromSchedule(now);
          return strikeAmountMath.make(price * underlyingValue);
        });
    },
    priceAtTime: (timeStamp, underlyingAmount) => {
      const { promise, resolve } = makePromiseKit();

      underlyingAmountMath.getValue(underlyingAmount);
      E(timer).setWakeup(
        timeStamp,
        harden({
          wake: () => {
            console.log(
              `TEST PrAuth  triggering resolution ${underlyingAmount.value}`,
            );
            return resolve(priceAuthority.getCurrentPrice(underlyingAmount));
          },
        }),
      );
      return promise;
    },
  };
  return priceAuthority;
}

// Underlying is in Simoleans. Collateral, strikePrice and Payout are in bucks.
// Value is in Moola. The price oracle takes an amount in Underlying, and
// gives the value in Moola.
test('callSpread below Strike1', async t => {
  const {
    moolaIssuer,
    simoleanIssuer,
    moola,
    simoleans,
    bucksIssuer,
    bucksMint,
    bucks,
    zoe,
    amountMaths,
  } = setup();
  const installation = await installationPFromSource(zoe, callSpread);
  const invitationIssuer = await E(zoe).getInvitationIssuer();

  // Alice will create an call spread contract, and give the invitations to Bob
  // and Carol. Bob and Carol will promptly deposit funds and schedule
  // collection of funds. The spread will then mature, and both will get paid.

  // Setup Bob
  const bobBucksPayment = bucksMint.mintPayment(bucks(105));
  const bobBucksPurse = bucksIssuer.makeEmptyPurse();
  // Setup Carol
  const carolBucksPayment = bucksMint.mintPayment(bucks(195));

  // Alice creates a callSpread instance
  const issuerKeywordRecord = harden({
    Underlying: simoleanIssuer,
    Collateral: bucksIssuer,
    Strike: moolaIssuer,
  });

  const manualTimer = buildManualTimer(console.log, 1);
  const priceAuthority = makeFakePriceAuthority(
    manualTimer,
    amountMaths.get('simoleans'),
    amountMaths.get('moola'),
    [
      { time: 0, price: 20 },
      { time: 1, price: 35 },
      { time: 3, price: 28 },
    ],
  );
  // underlying is 2 Simoleans, strike range is 30-50 (doubled)
  const terms = harden({
    expiration: 3,
    underlyingAmount: simoleans(2),
    priceAuthority,
    strikePrice1: moola(60),
    strikePrice2: moola(100),
    settlementAmount: bucks(300),
    buyPercent: 35,
  });
  const { creatorFacet } = await zoe.startInstance(
    installation,
    issuerKeywordRecord,
    terms,
  );

  const { buyInvitation, sellInvitation } = await E(
    creatorFacet,
  ).makeInvitationPair();

  const bobProposal = harden({
    // want: { Spread:  },
    give: { Collateral: bucks(105) },
  });
  const bobPayments = { Collateral: bobBucksPayment };
  const bobSeat = await zoe.offer(buyInvitation, bobProposal, bobPayments);
  const bobOption = await bobSeat.getOfferResult();
  t.truthy(invitationIssuer.isLive(bobOption));
  const bobOptionProposal = harden({
    want: { Collateral: bucks(0) },
  });
  const bobOptionSeat = await zoe.offer(bobOption, bobOptionProposal);
  bobOptionSeat.getPayout('Collateral').then(bobCollateral => {
    bobBucksPurse.deposit(bobCollateral, bucks(0));
    console.log(`TEST  bob payout`);
  });

  const carolProposal = harden({
    // want: { Spread:  },
    give: { Collateral: bucks(195) },
  });
  const carolPayments = { Collateral: carolBucksPayment };
  const carolSeat = await zoe.offer(
    sellInvitation,
    carolProposal,
    carolPayments,
  );
  const carolOption = await carolSeat.getOfferResult();
  t.truthy(invitationIssuer.isLive(carolOption));
  const carolOptionProposal = harden({
    want: { Collateral: bucks(0) },
  });
  const carolOptionSeat = await zoe.offer(carolOption, carolOptionProposal);
  carolOptionSeat.getPayout('Collateral').then(carolCollateral => {
    assertPayoutAmount(t, bucksIssuer, carolCollateral, bucks(300));
    console.log(`TEST carol payout`);
  });

  manualTimer.tick();
  manualTimer.tick();
});

// Underlying is in Simoleans. Collateral, strikePrice and Payout are in bucks.
// Value is in Moola.
test('callSpread above Strike2', async t => {
  const {
    moolaIssuer,
    simoleanIssuer,
    moola,
    simoleans,
    bucksIssuer,
    bucksMint,
    bucks,
    zoe,
    amountMaths,
  } = setup();
  const installation = await installationPFromSource(zoe, callSpread);
  const invitationIssuer = await E(zoe).getInvitationIssuer();

  // Alice will create an call spread contract, and give the invitations to Bob
  // and Carol. Bob and Carol will promptly deposit funds and schedule
  // collection of funds. The spread will then mature, and both will get paid.

  // Setup Bob
  const bobBucksPayment = bucksMint.mintPayment(bucks(105));
  const bobBucksPurse = bucksIssuer.makeEmptyPurse();
  // Setup Carol
  const carolBucksPayment = bucksMint.mintPayment(bucks(195));

  // Alice creates a callSpread instance
  const issuerKeywordRecord = harden({
    Underlying: simoleanIssuer,
    Collateral: bucksIssuer,
    Strike: moolaIssuer,
  });

  const manualTimer = buildManualTimer(console.log, 1);
  const priceAuthority = makeFakePriceAuthority(
    manualTimer,
    amountMaths.get('simoleans'),
    amountMaths.get('moola'),
    [
      { time: 0, price: 20 },
      { time: 3, price: 55 },
    ],
  );
  // underlying is 2 Simoleans, strike range is 30-50 (doubled)
  const terms = harden({
    expiration: 3,
    underlyingAmount: simoleans(2),
    priceAuthority,
    strikePrice1: moola(60),
    strikePrice2: moola(100),
    settlementAmount: bucks(300),
    buyPercent: 35,
  });
  const { creatorFacet } = await zoe.startInstance(
    installation,
    issuerKeywordRecord,
    terms,
  );

  const { buyInvitation, sellInvitation } = await E(
    creatorFacet,
  ).makeInvitationPair();

  const bobProposal = harden({
    // want: { Spread:  },
    give: { Collateral: bucks(105) },
  });
  const bobPayments = { Collateral: bobBucksPayment };
  const bobSeat = await zoe.offer(buyInvitation, bobProposal, bobPayments);
  const bobOption = await bobSeat.getOfferResult();
  t.truthy(invitationIssuer.isLive(bobOption));
  const bobOptionProposal = harden({
    want: { Collateral: bucks(0) },
  });
  const bobOptionSeat = await zoe.offer(bobOption, bobOptionProposal);
  bobOptionSeat.getPayout('Collateral').then(bobCollateral => {
    bobBucksPurse.deposit(bobCollateral, bucks(300));
  });

  const carolProposal = harden({
    give: { Collateral: bucks(195) },
  });
  const carolPayments = { Collateral: carolBucksPayment };
  const carolSeat = await zoe.offer(
    sellInvitation,
    carolProposal,
    carolPayments,
  );
  const carolOption = await carolSeat.getOfferResult();
  t.truthy(invitationIssuer.isLive(carolOption));
  const carolOptionProposal = harden({
    want: { Collateral: bucks(0) },
  });
  const carolOptionSeat = await zoe.offer(carolOption, carolOptionProposal);
  carolOptionSeat.getPayout('Collateral').then(carolCollateral => {
    assertPayoutAmount(t, bucksIssuer, carolCollateral, bucks(0));
  });

  manualTimer.tick();
  manualTimer.tick();
});

test('callSpread specify want', async t => {
  const {
    moolaIssuer,
    simoleanIssuer,
    moola,
    simoleans,
    bucksIssuer,
    bucksMint,
    bucks,
    zoe,
    amountMaths,
  } = setup();
  const installation = await installationPFromSource(zoe, callSpread);
  const invitationIssuer = await E(zoe).getInvitationIssuer();

  // Alice will create an call spread contract, and give the invitations to Bob
  // and Carol. Bob and Carol will promptly deposit funds and schedule
  // collection of funds. The spread will then mature, and both will get paid.

  // Setup Bob
  const bobBucksPayment = bucksMint.mintPayment(bucks(105));
  const bobBucksPurse = bucksIssuer.makeEmptyPurse();
  // Setup Carol
  const carolBucksPayment = bucksMint.mintPayment(bucks(195));

  // Alice creates a callSpread instance
  const issuerKeywordRecord = harden({
    Underlying: simoleanIssuer,
    Collateral: bucksIssuer,
    Strike: moolaIssuer,
    Spread: invitationIssuer,
  });

  const manualTimer = buildManualTimer(console.log, 1);
  const priceAuthority = makeFakePriceAuthority(
    manualTimer,
    amountMaths.get('simoleans'),
    amountMaths.get('moola'),
    [
      { time: 0, price: 20 },
      { time: 3, price: 55 },
    ],
  );
  // underlying is 2 Simoleans, strike range is 30-50 (doubled)
  const terms = harden({
    expiration: 3,
    underlyingAmount: simoleans(2),
    priceAuthority,
    strikePrice1: moola(60),
    strikePrice2: moola(100),
    settlementAmount: bucks(300),
    buyPercent: 35,
  });
  const { creatorFacet } = await zoe.startInstance(
    installation,
    issuerKeywordRecord,
    terms,
  );

  const { buyInvitation, sellInvitation } = await E(
    creatorFacet,
  ).makeInvitationPair();
  const emptyInvitation = invitationIssuer.makeEmptyPurse().getCurrentAmount();

  const bobProposal = harden({
    want: { Spread: emptyInvitation },
    give: { Collateral: bucks(105) },
  });
  const bobPayments = { Collateral: bobBucksPayment };
  const bobSeat = await zoe.offer(buyInvitation, bobProposal, bobPayments);
  const bobOption = await bobSeat.getOfferResult();
  t.truthy(invitationIssuer.isLive(bobOption));
  const bobOptionProposal = harden({
    want: { Collateral: bucks(0) },
  });
  const bobOptionSeat = await zoe.offer(bobOption, bobOptionProposal);
  bobOptionSeat.getPayout('Collateral').then(bobCollateral => {
    bobBucksPurse.deposit(bobCollateral, bucks(300));
  });

  const carolProposal = harden({
    give: { Collateral: bucks(195) },
  });
  const carolPayments = { Collateral: carolBucksPayment };
  const carolSeat = await zoe.offer(
    sellInvitation,
    carolProposal,
    carolPayments,
  );
  const carolOption = await carolSeat.getOfferResult();
  t.truthy(invitationIssuer.isLive(carolOption));
  const carolOptionProposal = harden({
    want: { Collateral: bucks(0) },
  });
  const carolOptionSeat = await zoe.offer(carolOption, carolOptionProposal);
  carolOptionSeat.getPayout('Collateral').then(carolCollateral => {
    assertPayoutAmount(t, bucksIssuer, carolCollateral, bucks(0));
  });

  manualTimer.tick();
  manualTimer.tick();
});

// Underlying is in Simoleans. Collateral, strikePrice and Payout are in bucks.
// Value is in Moola.
test('callSpread between strikes', async t => {
  const {
    moolaIssuer,
    simoleanIssuer,
    moola,
    simoleans,
    bucksIssuer,
    bucksMint,
    bucks,
    zoe,
    amountMaths,
  } = setup();
  const installation = await installationPFromSource(zoe, callSpread);
  const invitationIssuer = await E(zoe).getInvitationIssuer();

  // Alice will create an call spread contract, and give the invitations to Bob
  // and Carol. Bob and Carol will promptly deposit funds and schedule
  // collection of funds. The spread will then mature, and both will get paid.

  // Setup Bob
  const bobBucksPayment = bucksMint.mintPayment(bucks(105));
  const bobBucksPurse = bucksIssuer.makeEmptyPurse();
  // Setup Carol
  const carolBucksPayment = bucksMint.mintPayment(bucks(195));

  // Alice creates a callSpread instance
  const issuerKeywordRecord = harden({
    Underlying: simoleanIssuer,
    Collateral: bucksIssuer,
    Strike: moolaIssuer,
  });

  const manualTimer = buildManualTimer(console.log, 1);
  const priceAuthority = makeFakePriceAuthority(
    manualTimer,
    amountMaths.get('simoleans'),
    amountMaths.get('moola'),
    [
      { time: 0, price: 20 },
      { time: 3, price: 45 },
    ],
  );
  // underlying is 2 Simoleans, strike range is 30-50 (doubled)
  const terms = harden({
    expiration: 3,
    underlyingAmount: simoleans(2),
    priceAuthority,
    strikePrice1: moola(60),
    strikePrice2: moola(100),
    settlementAmount: bucks(300),
    buyPercent: 35,
  });
  const { creatorFacet } = await zoe.startInstance(
    installation,
    issuerKeywordRecord,
    terms,
  );

  const { buyInvitation, sellInvitation } = await E(
    creatorFacet,
  ).makeInvitationPair();

  const bobProposal = harden({
    // want: { Spread:  },
    give: { Collateral: bucks(105) },
  });
  const bobPayments = { Collateral: bobBucksPayment };
  const bobSeat = await zoe.offer(buyInvitation, bobProposal, bobPayments);
  const bobOption = await bobSeat.getOfferResult();
  t.truthy(invitationIssuer.isLive(bobOption));
  const bobOptionProposal = harden({
    want: { Collateral: bucks(0) },
  });
  const bobOptionSeat = await zoe.offer(bobOption, bobOptionProposal);
  bobOptionSeat.getPayout('Collateral').then(bobCollateral => {
    bobBucksPurse.deposit(bobCollateral, bucks(225));
  });

  const carolProposal = harden({
    give: { Collateral: bucks(195) },
  });
  const carolPayments = { Collateral: carolBucksPayment };
  const carolSeat = await zoe.offer(
    sellInvitation,
    carolProposal,
    carolPayments,
  );
  const carolOption = await carolSeat.getOfferResult();
  t.truthy(invitationIssuer.isLive(carolOption));
  const carolOptionProposal = harden({
    want: { Collateral: bucks(75) },
  });
  const carolOptionSeat = await zoe.offer(carolOption, carolOptionProposal);
  carolOptionSeat.getPayout('Collateral').then(carolCollateral => {
    assertPayoutAmount(t, bucksIssuer, carolCollateral, bucks(0));
  });

  manualTimer.tick();
  manualTimer.tick();
});

// Underlying is in Simoleans. Collateral, strikePrice and Payout are in bucks.
// Value is in Moola. The price oracle takes an amount in Underlying, and
// gives the value in Moola.
test('callSpread insufficient collateral', async t => {
  const {
    moolaIssuer,
    simoleanIssuer,
    moola,
    simoleans,
    bucksIssuer,
    bucksMint,
    bucks,
    zoe,
    amountMaths,
  } = setup();
  const installation = await installationPFromSource(zoe, callSpread);

  // Alice will create an call spread contract, and give the invitations to Bob
  // and Carol. Bob and Carol will promptly deposit funds and schedule
  // collection of funds. The spread will then mature, and both will get paid.

  // Setup Bob
  const bobBucksPayment = bucksMint.mintPayment(bucks(10));

  // Alice creates an callSpread instance
  const issuerKeywordRecord = harden({
    Underlying: simoleanIssuer,
    Collateral: bucksIssuer,
    Strike: moolaIssuer,
  });

  const manualTimer = buildManualTimer(console.log, 1);
  const priceAuthority = makeFakePriceAuthority(
    manualTimer,
    amountMaths.get('simoleans'),
    amountMaths.get('moola'),
    [
      { time: 0, price: 20 },
      { time: 1, price: 35 },
      { time: 3, price: 28 },
    ],
  );
  const terms = harden({
    expiration: 3,
    underlyingAmount: simoleans(50),
    priceAuthority,
    strikePrice1: moola(30),
    strikePrice2: moola(50),
    settlementAmount: bucks(300),
    buyPercent: 35,
  });
  const { creatorFacet } = await zoe.startInstance(
    installation,
    issuerKeywordRecord,
    terms,
  );

  const { buyInvitation } = await E(creatorFacet).makeInvitationPair();

  const bobProposal = harden({
    // want: { Spread:  },
    give: { Collateral: bucks(10) },
  });
  const bobPayments = { Collateral: bobBucksPayment };
  const bobSeat = await zoe.offer(buyInvitation, bobProposal, bobPayments);

  await t.throwsAsync(() => E(bobSeat).getOfferResult(), {
    message: 'Collateral required: (a number)\nSee console for error data.',
  });

  // Bob gets his deposit back
  assertPayoutAmount(
    t,
    bucksIssuer,
    await bobSeat.getPayout('Collateral'),
    bucks(10),
  );
});
