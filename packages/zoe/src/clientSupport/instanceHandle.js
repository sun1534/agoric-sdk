import { E } from '@agoric/eventual-send';

export const makeGetInstanceHandle = invitationIssuerP => inviteP =>
  E(invitationIssuerP)
    .getAmountOf(inviteP)
    .then(amount => {
      return amount.value[0].instanceHandle;
    });
