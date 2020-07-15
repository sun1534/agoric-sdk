/* global harden */
// @ts-check

import { assert, details, q } from '@agoric/assert';
import { assertKeywordName, getKeywords } from './cleanProposal';
import { isOfferSafe } from './offerSafety';
import { areRightsConserved } from './rightsConservation';
import { makeTables } from './state';
import { filterObj, filterFillAmounts } from './objArrayConversion';

/**
 * @typedef {Object} ContractFacet
 * The Zoe interface specific to a contract instance.
 * The Zoe Contract Facet is an API object used by running contract instances to
 * access the Zoe state for that instance. The Zoe Contract Facet is accessed
 * synchronously from within the contract, and usually is referred to in code as
 * zcf.
 * @property {Reallocate} reallocate Propose a reallocation of extents per offer
 * @property {Complete} complete Complete an offer
 * @property {MakeInvitation} makeInvitation
 * @property {AddNewIssuer} addNewIssuer
 * @property {InitPublicAPI} initPublicAPI
 * @property {() => ZoeService} getZoeService
 * @property {() => Issuer} getInviteIssuer
 * @property {(offerHandles: OfferHandle[]) => { active: OfferStatus[], inactive: OfferStatus[] }} getOfferStatuses
 * @property {(offerHandle: OfferHandle) => boolean} isOfferActive
 * @property {(offerHandles: OfferHandle[]) => OfferRecord[]} getOffers
 * @property {(offerHandle: OfferHandle) => OfferRecord} getOffer
 * @property {(offerHandle: OfferHandle, brandKeywordRecord?: BrandKeywordRecord) => Allocation} getCurrentAllocation
 * @property {(offerHandles: OfferHandle[], brandKeywordRecords?: BrandKeywordRecord[]) => Allocation[]} getCurrentAllocations
 * @property {() => InstanceRecord} getInstanceRecord
 * @property {(issuer: Issuer) => Brand} getBrandForIssuer
 * @property {(brand: Brand) => AmountMath} getAmountMath
 *
 * @callback Reallocate
 * The contract can propose a reallocation of extents across offers
 * by providing two parallel arrays: offerHandles and newAllocations.
 * Each element of newAllocations is an AmountKeywordRecord whose
 * amount should replace the old amount for that keyword for the
 * corresponding offer.
 *
 * The reallocation will only succeed if the reallocation 1) conserves
 * rights (the amounts specified have the same total value as the
 * current total amount), and 2) is 'offer-safe' for all parties involved.
 *
 * The reallocation is partial, meaning that it applies only to the
 * amount associated with the offerHandles that are passed in. By
 * induction, if rights conservation and offer safety hold before,
 * they will hold after a safe reallocation, even though we only
 * re-validate for the offers whose allocations will change. Since
 * rights are conserved for the change, overall rights will be unchanged,
 * and a reallocation can only effect offer safety for offers whose
 * allocations change.
 *
 * zcf.reallocate will throw an error if any of the
 * newAllocations do not have a value for all the
 * keywords in sparseKeywords. An error will also be thrown if
 * any newAllocations have keywords that are not in
 * sparseKeywords.
 *
 * @param  {OfferHandle[]} offerHandles An array of offerHandles
 * @param  {AmountKeywordRecord[]} newAllocations An
 * array of amountKeywordRecords  - objects with keyword keys
 * and amount values, with one keywordRecord per offerHandle.
 * @returns {undefined}
 *
 * @callback Complete
 * The contract can "complete" an offer to remove it from the
 * ongoing contract and resolve the player's payouts (either
 * winnings or refunds). Because Zoe only allows for
 * reallocations that conserve rights and are 'offer-safe', we
 * don't need to do those checks at this step and can assume
 * that the invariants hold.
 * @param  {OfferHandle[]} offerHandles - an array of offerHandles
 * @returns {void}
 *
 * @callback MakeInvitation
 * Make a credible Zoe invite for a particular smart contract
 * indicated by the unique `instanceHandle`. The other
 * information in the extent of this invite is decided by the
 * governing contract and should include whatever information is
 * necessary for a potential buyer of the invite to know what
 * they are getting. Note: if information can be derived in
 * queries based on other information, we choose to omit it. For
 * instance, `installationHandle` can be derived from
 * `instanceHandle` and is omitted even though it is useful.
 * @param {OfferHook} offerHook - a function that will be handed the
 * offerHandle at the right time, and returns a contract-specific
 * OfferOutcome which will be put in the OfferResultRecord.
 * @param {string} inviteDesc
 * @param {MakeInvitationOptions} [options]
 * @returns {Invite}
 *
 * @typedef MakeInvitationOptions
 * @property {CustomProperties} [customProperties] - an object of
 * information to include in the extent, as defined by the smart
 * contract
 *
 * @callback OfferHook
 * This function will be called with the OfferHandle when the offer
 * is prepared. It should return a contract-specific "OfferOutcome"
 * value that will be put in the OfferResultRecord.
 * @param {OfferHandle} offerHandle
 * @returns {OfferOutcome}
 *
 *
 * @callback AddNewIssuer
 * Informs Zoe about an issuer and returns a promise for acknowledging
 * when the issuer is added and ready.
 * @param {Promise<Issuer>|Issuer} issuerP Promise for issuer
 * @param {Keyword} keyword Keyword for added issuer
 * @returns {Promise<IssuerRecord>} Issuer is added and ready
 *
 * @callback InitPublicAPI
 * Initialize the publicAPI for the contract instance, as stored by Zoe in
 * the instanceRecord.
 * @param {Object} publicAPI - an object whose methods are the API
 * available to anyone who knows the instanceHandle
 * @returns {void}
 */

/**
 * @typedef {import('./rightsConservation').areRightsConserved} areRightsConserved
 */

/**
 * Create the contract facet.
 *
 * @param {InstanceHandle} instanceHandle The instance for which to create the facet
 * @returns {ContractFacet} The returned facet
 */
const makeContractFacet = instanceHandle => {
  const { offerTable, issuerTable, instanceTable } = makeTables();

  const getAmountMathForBrand = brand => issuerTable.get(brand).amountMath;

  const assertOffersHaveInstanceHandle = (
    offerHandles,
    expectedInstanceHandle,
  ) => {
    offerHandles.forEach(offerHandle => {
      assert(
        offerTable.get(offerHandle).instanceHandle === expectedInstanceHandle,
        details`contract instances can only access their own associated offers`,
      );
    });
  };

  const removePurse = issuerRecord =>
    filterObj(issuerRecord, ['issuer', 'brand', 'amountMath']);

  const removeAmountsAndNotifier = offerRecord =>
    filterObj(offerRecord, ['handle', 'instanceHandle', 'proposal']);

  const doGetCurrentAllocation = (offerHandle, brandKeywordRecord) => {
    const { currentAllocation } = offerTable.get(offerHandle);
    if (brandKeywordRecord === undefined) {
      return currentAllocation;
    }
    const amountMathKeywordRecord = {};
    Object.getOwnPropertyNames(brandKeywordRecord).forEach(keyword => {
      const brand = brandKeywordRecord[keyword];
      amountMathKeywordRecord[keyword] = issuerTable.get(brand).amountMath;
    });
    return filterFillAmounts(currentAllocation, amountMathKeywordRecord);
  };

  const doGetCurrentAllocations = (offerHandles, brandKeywordRecords) => {
    if (brandKeywordRecords === undefined) {
      return offerHandles.map(offerHandle =>
        doGetCurrentAllocation(offerHandle),
      );
    }
    return offerHandles.map((offerHandle, i) =>
      doGetCurrentAllocation(offerHandle, brandKeywordRecords[i]),
    );
  };

  /**
   * @type {ContractFacet}
   */
  const contractFacet = harden({
    reallocate: (offerHandles, newAllocations) => {
      assertOffersHaveInstanceHandle(offerHandles, instanceHandle);
      // We may want to handle this with static checking instead.
      // Discussion at: https://github.com/Agoric/agoric-sdk/issues/1017
      assert(
        offerHandles.length >= 2,
        details`reallocating must be done over two or more offers`,
      );
      assert(
        offerHandles.length === newAllocations.length,
        details`There must be as many offerHandles as entries in newAllocations`,
      );

      // 1) Ensure 'offer safety' for each offer separately.
      const makeOfferSafeReallocation = (offerHandle, newAllocation) => {
        const { proposal, currentAllocation } = offerTable.get(offerHandle);
        const reallocation = harden({
          ...currentAllocation,
          ...newAllocation,
        });

        assert(
          isOfferSafe(getAmountMathForBrand, proposal, reallocation),
          details`The reallocation was not offer safe`,
        );
        return reallocation;
      };

      // Make the reallocation and test for offer safety by comparing the
      // reallocation to the original proposal.
      const reallocations = offerHandles.map((offerHandle, i) =>
        makeOfferSafeReallocation(offerHandle, newAllocations[i]),
      );

      // 2. Ensure that rights are conserved overall.
      const flattened = arr => [].concat(...arr);
      const flattenAllocations = allocations =>
        flattened(allocations.map(allocation => Object.values(allocation)));

      const currentAllocations = offerTable
        .getOffers(offerHandles)
        .map(({ currentAllocation }) => currentAllocation);
      const previousAmounts = flattenAllocations(currentAllocations);
      const newAmounts = flattenAllocations(reallocations);

      assert(
        areRightsConserved(
          getAmountMathForBrand,
          previousAmounts,
          newAmounts,
        ),
        details`Rights are not conserved in the proposed reallocation`,
      );

      // 3. Save the reallocations.
      offerTable.updateAmounts(offerHandles, reallocations);
    },

    complete: offerHandles => {
      assertOffersHaveInstanceHandle(offerHandles, instanceHandle);
      return completeOffers(instanceHandle, offerHandles);
    },

    addNewIssuer: (issuerP, keyword) =>
      issuerTable.getPromiseForIssuerRecord(issuerP).then(issuerRecord => {
        assertKeywordName(keyword);
        const { issuerKeywordRecord, brandKeywordRecord } = instanceTable.get(
          instanceHandle,
        );
        assert(
          !getKeywords(issuerKeywordRecord).includes(keyword),
          details`keyword ${keyword} must be unique`,
        );
        const newIssuerKeywordRecord = {
          ...issuerKeywordRecord,
          [keyword]: issuerRecord.issuer,
        };
        const newBrandKeywordRecord = {
          ...brandKeywordRecord,
          [keyword]: issuerRecord.brand,
        };
        instanceTable.update(instanceHandle, {
          issuerKeywordRecord: newIssuerKeywordRecord,
          brandKeywordRecord: newBrandKeywordRecord,
        });
        return removePurse(issuerRecord);
      }),

    initPublicAPI: publicAPI => {
      const { publicAPI: oldPublicAPI } = instanceTable.get(instanceHandle);
      assert(
        oldPublicAPI === undefined,
        details`the publicAPI has already been initialized`,
      );
      instanceTable.update(instanceHandle, { publicAPI });
    },

    // eslint-disable-next-line no-use-before-define
    getZoeService: () => zoeService,

    // The methods below are pure and have no side-effects //
    getInviteIssuer: () => inviteIssuer,

    getOfferNotifier: offerHandle => offerTable.get(offerHandle).notifier,
    getOfferStatuses: offerHandles => {
      const { active, inactive } = offerTable.getOfferStatuses(offerHandles);
      assertOffersHaveInstanceHandle(active, instanceHandle);
      return harden({ active, inactive });
    },
    isOfferActive: offerHandle => {
      const isActive = offerTable.isOfferActive(offerHandle);
      // if offer isn't present, we do not want to throw.
      if (isActive) {
        assertOffersHaveInstanceHandle(harden([offerHandle]), instanceHandle);
      }
      return isActive;
    },
    getOffers: offerHandles => {
      assertOffersHaveInstanceHandle(offerHandles, instanceHandle);
      return offerTable.getOffers(offerHandles).map(removeAmountsAndNotifier);
    },
    getOffer: offerHandle => {
      assertOffersHaveInstanceHandle(harden([offerHandle]), instanceHandle);
      return removeAmountsAndNotifier(offerTable.get(offerHandle));
    },
    getCurrentAllocation: (offerHandle, brandKeywordRecord) => {
      assertOffersHaveInstanceHandle(harden([offerHandle]), instanceHandle);
      return doGetCurrentAllocation(offerHandle, brandKeywordRecord);
    },
    getCurrentAllocations: (offerHandles, brandKeywordRecords) => {
      assertOffersHaveInstanceHandle(offerHandles, instanceHandle);
      return doGetCurrentAllocations(offerHandles, brandKeywordRecords);
    },
    getInstanceRecord: () => instanceTable.get(instanceHandle),
    getBrandForIssuer: issuer => issuerTable.brandFromIssuer(issuer),
    getAmountMath: getAmountMathForBrand,
  });
  return contractFacet;
};

export { makeContractFacet };
