import { E } from '@agoric/eventual-send';
import { evalContractBundle } from '../../../src/zoeContractFacet/evalContractCode';

export default harden({
  createVat: bundle => {
    return harden({
      root: E(evalContractBundle(bundle)).buildRootObject(),
    });
  },
});
