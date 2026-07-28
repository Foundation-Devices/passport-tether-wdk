import * as core from '../../node_modules/@bitcoinerlab/descriptors/node_modules/@bitcoinerlab/descriptors-core/dist/index.js';
import { createBitcoinjsLib } from '../../node_modules/@bitcoinerlab/descriptors/node_modules/@bitcoinerlab/descriptors-core/dist/bitcoinjs.js';

// Mirrors the upstream non-Ledger DescriptorsFactory compatibility wrapper.
export function DescriptorsFactory(eccOrBitcoinLib) {
  const isBitcoinLib =
    eccOrBitcoinLib &&
    typeof eccOrBitcoinLib === 'object' &&
    'payments' in eccOrBitcoinLib &&
    'script' in eccOrBitcoinLib;
  return core.DescriptorsFactory(
    isBitcoinLib ? eccOrBitcoinLib : createBitcoinjsLib(eccOrBitcoinLib)
  );
}
