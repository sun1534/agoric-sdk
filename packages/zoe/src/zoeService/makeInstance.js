import { assert, details } from '@agoric/assert';
import { E } from '@agoric/eventual-send';

import zcfContractBundle from '../../bundles/bundle-contractFacet';
import { arrayToObj } from './objArrayConversion';
import { cleanKeywords } from './cleanProposal';

export const makeMakeInstanceFn = (
  vatAdminSvc,
  getPromiseForIssuerRecord,
  invitationKit,
  hasInstallation,
  zoeService,
  addInstance,
) => {
  // Unpack the invitationKit.
  const {
    issuer: invitationIssuer,
    mint: invitationMint,
    amountMath: invitationAmountMath,
  } = invitationKit;

  const makeInstance = async (
    installation,
    uncleanIssuerKeywordRecord = harden({}),
    terms = harden({}),
  ) => {
    assert(
      hasInstallation(installation),
      details`${installation} was not a valid installation`,
    );

    const keywords = cleanKeywords(uncleanIssuerKeywordRecord);

    const issuerPs = keywords.map(
      keyword => uncleanIssuerKeywordRecord[keyword],
    );

    const makeInvitation = (
      instance,
      invitationHandle,
      description,
      customProperties = {},
    ) => {
      assert.typeof(
        description,
        'string',
        details`invitations must have a description string: ${description}`,
      );
      const invitationAmount = invitationAmountMath.make(
        harden([
          {
            ...customProperties,
            description,
            handle: invitationHandle,
            instance,
            installation,
          },
        ]),
      );
      return invitationMint.mintPayment(invitationAmount);
    };

    const addIssuerAndBrand = (keyword, issuer, brand) => {};

    const shutdown = () => {};

    const zoeInstanceAdminForZcf = instance => {
      return harden({
        makeInvitation: (invitationHandle, description, customProperties) =>
          makeInvitation(
            instance,
            invitationHandle,
            description,
            customProperties,
          ),
        // checks of keyword done on zcf side
        saveIssuer: (issuerP, keyword) =>
          getPromiseForIssuerRecord(issuerP).then(({ issuer, brand }) =>
            addIssuerAndBrand(keyword, issuer, brand),
          ),
        shutdown,
      });
    };

    const makeInstanceAdmin = issuerRecords => {
      const seatAdmins = new Set();
      const issuers = issuerRecords.map(record => record.issuer);
      let issuerKeywordRecord = arrayToObj(issuers, keywords);
      const brands = issuerRecords.map(record => record.brand);
      let brandKeywordRecord = arrayToObj(brands, keywords);
      let zcfForZoe;
      let addSeatObj;
      let publicFacet;

      instance = harden({
        getIssuerKeywordRecord: () => issuerKeywordRecord,
        getBrandKeywordRecord: () => brandKeywordRecord,
        getInstallation: () => installation,
        getTerms: () => terms,
      });

      instanceAdmin = harden({
        addIssuerAndBrand: (keyword, issuer, brand) => {
          issuerKeywordRecord = {
            ...issuerKeywordRecord,
            [keyword]: issuer,
          };
          brandKeywordRecord = {
            ...brandKeywordRecord,
            [keyword]: brand,
          };
        },
        addSeatAdmin: async (invitationHandle, seatAdmin, seatData) => {
          seatAdmins.add(seatAdmin);
          return zcfForZoe.addSeat(invitationHandle, seatAdmin, seatData);
        },
        removeSeatAdmin: seatAdmin => seatAdmins.delete(seatAdmin),
        getInstance: () => instance,

        exitAllSeats: () => {
          seatAdmins.entries().forEach(seatAdmin => seatAdmin.exit());
        },
        shutdown: () => adminNode.terminate(),
        saveAddSeatObj: obj => {
          addSeatObj = obj;
        },
        addPublicFacet: publicAPI => {
          publicFacet = publicAPI;
        },
      });

      addInstance(instance, instanceAdmin);
    };

    const callExecuteContract = ({ root: zcfRoot, adminNode }) => {
      const bundle = installation.getBundle();

      E(adminNode)
        .done()
        .then(
          () => instanceAdmin.exitSeats(),
          () => instanceAdmin.exitSeats(),
        );

      return E(zcfRoot).executeContract({
        bundle,
        zoeService,
        zoeInstanceAdmin: zoeInstanceAdminForZcf,
        instanceData,
        invitationIssuer,
      });
    };

    const finishContractInstall = ({ adminFacet, publicFacet, addSeatObj }) => {
      instanceAdmin.saveAddSeatObj(addSeatObj);
      instanceAdmin.addPublicFacet(publicFacet);
      const admin = {
        ...adminFacet,
        getInstance: () => instance,
      };
      return admin;
    };

    const getPromiseForIssuerRecords = issuers =>
      Promise.all(issuers.map(getPromiseForIssuerRecord));

    // The issuers may not have been seen before, so we must wait for the
    // issuer records to be available synchronously
    return getPromiseForIssuerRecords(issuerPs)
      .then(makeInstance)
      .then(_ => E(vatAdminSvc).createVat(zcfContractBundle))
      .then(callExecuteContract)
      .then(finishContractInstall);
  };
  return makeInstance;
};
