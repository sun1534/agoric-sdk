import { makeZoe } from '../../..';

export function buildRootObject(_vatPowers) {
  return harden({
    buildZoe: vatAdminSvc => makeZoe(vatAdminSvc),
  });
}
