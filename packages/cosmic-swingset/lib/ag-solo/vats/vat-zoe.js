/* global harden */

import { makeZoe } from '@agoric/zoe';

export function buildRootObject(vatPowers) {
  return harden({
    buildZoe: adminVat => makeZoe(adminVat, {}, vatPowers),
  });
}
