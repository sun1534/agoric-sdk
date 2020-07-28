// @ts-check

// This is the Zoe contract facet. Each time we make a new instance of a
// contract we will start by creating a new vat and running this code in it. In
// order to install this code in a vat, Zoe needs to import a bundle containing
// this code. We will eventually have an automated process, but for now, every
// time this file is edited, the bundle must be manually rebuilt with
// `yarn build-zcfBundle`.

import { assert, details, q } from '@agoric/assert';
import { E } from '@agoric/eventual-send';
import makeWeakStore from '@agoric/weak-store';

import { makeIssuerTable } from '../issuerTable';
import { assertKeywordName, getKeywords } from '../zoeService/cleanProposal';
import { areRightsConserved } from './rightsConservation';
import { evalContractBundle } from './evalContractCode';
import { makeSeatAdmin } from './seat';
import { makeExitObj } from './exit';

export function buildRootObject() {
  const executeContract = (
    bundle,
    zoeService,
    invitationIssuer,
    zoeInstanceAdmin,
    instanceData,
  ) => {
    const instanceRecord = {
      issuerKeywordRecord: instanceData.issuerKeywordRecord,
      brandKeywordRecord: instanceData.brandKeywordRecord,
      terms: instanceData.terms,
    };

    const issuerTable = makeIssuerTable();
    const getAmountMath = brand => issuerTable.get(brand).amountMath;

    const invitationHandleToHandler = makeWeakStore();
    const seatToSeatAdmin = makeWeakStore();

    const zcf = harden({
      reallocate: stagedSeats => {
        // We may want to handle this with static checking instead.
        // Discussion at: https://github.com/Agoric/agoric-sdk/issues/1017
        assert(
          stagedSeats.length >= 2,
          details`reallocating must be done over two or more seats`,
        );

        const seatAdmins = stagedSeats.map(seat => seatToSeatAdmin.get(seat));

        // Ensure that rights are conserved overall. Offer safety was
        // already checked when an allocation was staged for an individual seat.
        const flattened = arr => [].concat(...arr);
        const flattenAllocations = allocations =>
          flattened(allocations.map(allocation => Object.values(allocation)));

        const previousAllocations = seatAdmins.map(seatAdmin =>
          seatAdmin.getCurrentAllocation(),
        );
        const previousAmounts = flattenAllocations(previousAllocations);

        const newAllocations = seatAdmins.map(seatAdmin =>
          seatAdmin.getStagedAllocation(),
        );
        const newAmounts = flattenAllocations(newAllocations);

        assert(
          areRightsConserved(getAmountMath, previousAmounts, newAmounts),
          details`Rights are not conserved in the proposed reallocation`,
        );

        // Commit the staged allocations and inform Zoe of the newAllocation.
        seatAdmins.forEach(seatAdmin => seatAdmin.commitStagedAllocation());
      },
      saveIssuer: (issuerP, keyword) =>
        issuerTable.getPromiseForIssuerRecord(issuerP).then(issuerRecord => {
          assertKeywordName(keyword);
          assert(
            !getKeywords(instanceRecord.issuerKeywordRecord).includes(keyword),
            details`keyword ${keyword} must be unique`,
          );
          instanceRecord.issuerKeywordRecord = {
            ...instanceRecord.issuerKeywordRecord,
            [keyword]: issuerRecord.issuer,
          };
          instanceRecord.brandKeywordRecord = {
            ...instanceRecord.brandKeywordRecord,
            [keyword]: issuerRecord.brand,
          };
          E(zoeInstanceAdmin).saveIssuer(issuerP, keyword);
          return issuerRecord;
        }),
      makeInvitation: (offerHandler, description, customProperties) => {
        const invitationHandle = harden({});
        invitationHandleToHandler.init(invitationHandle, offerHandler);
        const invitationP = E(zoeInstanceAdmin).makeInvitation(
          invitationHandle,
          description,
          customProperties,
        );
        return invitationP;
      },
      // Shutdown the entire vat and give payouts
      shutdown: () => E(zoeInstanceAdmin).shutdown(),

      // The methods below are pure and have no side-effects //
      getZoeService: () => zoeService,
      getInvitationIssuer: () => invitationIssuer,
      getInstanceRecord: () => instanceRecord,
      getBrandForIssuer: issuer => issuerTable.brandFromIssuer(issuer),
      getAmountMath,
    });

    // To Zoe, we will return the invite and an object such that Zoe
    // can tell us about new seats.
    const addSeatObj = harden({
      addSeat: (invitationHandle, zoeSeat, seatData) => {
        const seatAdmin = makeSeatAdmin(zoeSeat, seatData, getAmountMath);
        const seat = seatAdmin.getSeat();
        seatToSeatAdmin.init(seat, seatAdmin);
        const offerHandler = invitationHandleToHandler.get(invitationHandle);
        const offerResultP = E(offerHandler)(seatAdmin.getSeat());
        const { canExit, exitObj } = makeExitObj(
          seatData.proposal,
          zoeSeat.exit,
        );
        return harden({ offerResultP, canExit, exitObj });
      },
    });

    // First, evaluate the contract code bundle.
    const contractCode = evalContractBundle(bundle);

    // Next, execute the contract code, passing in zcf and the terms
    /** @type {Promise<Invite>} */
    return E(contractCode)
      .execute(zcf, instanceRecord.terms)
      .then(({ adminFacet, publicFacet }) => {
        return harden({ adminFacet, publicFacet, addSeatObj });
      });
  };

  return harden({ executeContract });
}

harden(buildRootObject);
