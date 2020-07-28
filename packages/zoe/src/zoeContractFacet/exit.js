import { assert, details, q } from '@agoric/assert';
import { E } from '@agoric/eventual-send';

export const makeExitObj = (proposal, zcfExitFn) => {
  const [exitKind] = Object.getOwnPropertyNames(proposal.exit);

  let canExit = false;
  /** @type {ExitObj | undefined} */
  let exitObj;

  if (exitKind === 'afterDeadline') {
    // Automatically exit the seat after deadline.
    E(proposal.exit.afterDeadline.timer).setWakeup(
      proposal.exit.afterDeadline.deadline,
      harden({
        wake: zcfExitFn,
      }),
    );
  } else if (exitKind === 'onDemand') {
    // Allow the user to exit their seat on demand. Note: we must wrap
    // it in an object to send it back to Zoe because our marshalling layer
    // only allows two kinds of objects: records (no methods and only
    // data) and presences (local proxies for objects that may have
    // methods).
    exitObj = {
      exit: zcfExitFn,
    };
    canExit = true;
  } else {
    // if exitKind is 'waived' the user has no ability to exit their seat
    // on demand
    assert(
      exitKind === 'waived',
      details`exit kind was not recognized: ${q(exitKind)}`,
    );
  }
  return { exitObj, canExit };
};
