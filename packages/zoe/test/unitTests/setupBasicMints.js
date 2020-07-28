import makeIssuerKit from '@agoric/ertp';
import { makeZoe } from '../../src/zoeService/zoe';
import fakeVatAdmin from './contracts/fakeVatAdmin';

const setup = () => {
  const zoe = makeZoe(fakeVatAdmin);
  const moolaKit = makeIssuerKit('moola');
  const simoleanKit = makeIssuerKit('simoleans');
  const bucksKit = makeIssuerKit('bucks');
  const allBundles = {
    moola: moolaKit,
    simoleans: simoleanKit,
    bucks: bucksKit,
  };
  const amountMaths = new Map();
  const brands = new Map();

  for (const k of Object.getOwnPropertyNames(allBundles)) {
    amountMaths.set(k, allBundles[k].amountMath);
    brands.set(k, allBundles[k].brand);
  }

  return harden({
    zoe,
    moolaKit,
    simoleanKit,
    bucksKit,
    moola: moolaKit.amountMath.make,
    simoleans: simoleanKit.amountMath.make,
    bucks: bucksKit.amountMath.make,
  });
};
harden(setup);
export { setup };
