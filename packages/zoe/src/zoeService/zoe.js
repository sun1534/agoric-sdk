// @ts-check
import makeIssuerKit from '@agoric/ertp';
import makeWeakStore from '@agoric/weak-store';

/**
 * Zoe uses ERTP, the Electronic Rights Transfer Protocol
 */
import '@agoric/ertp/exported';

import { makeIssuerTable } from '../issuerTable';
import { makeInstallFn } from './install';
import { makeMakeInstanceFn } from './makeInstance';
import { makeOfferFn } from './offer';

/**
 * Create an instance of Zoe.
 *
 * @param {Object} vatAdminSvc - The vatAdmin Service, which carries the power
 * to create a new vat.
 * @returns {ZoeService} The created Zoe service.
 */
function makeZoe(vatAdminSvc) {
  const invitationKit = makeIssuerKit('Zoe Invitation', 'set');

  // Zoe state shared among functions
  const issuerTable = makeIssuerTable();
  const installations = new Set();
  const instanceToInstanceAdmin = makeWeakStore('instance');

  const getAmountMath = brand => issuerTable.get(brand).amountMath;
  const hasInstallations = installations.has;
  const addInstallation = installations.add;
  const getInstanceAdmin = instanceToInstanceAdmin.get;
  const addInstance = instanceToInstanceAdmin.init;

  const getInvitationIssuer = async () => invitationKit.issuer;
  const install = makeInstallFn(addInstallation);
  const makeInstance = makeMakeInstanceFn(
    vatAdminSvc,
    issuerTable.getPromiseForIssuerRecord,
    invitationKit,
    hasInstallations,
    // eslint-disable-next-line no-use-before-define
    zoeService,
    addInstance,
  );
  const offer = makeOfferFn(
    getInstanceAdmin,
    getAmountMath,
    invitationKit.issuer,
  );

  /** @type {ZoeService} */
  const zoeService = harden({
    getInvitationIssuer,
    install,
    makeInstance,
    offer,
  });

  return zoeService;
}

export { makeZoe };
