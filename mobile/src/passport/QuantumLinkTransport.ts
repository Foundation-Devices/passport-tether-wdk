import PassportQuantumLink from '../../modules/quantumlink';
import {
  createRequestId,
  PASSPORT_BTC_ACCOUNT_PATH,
  PASSPORT_EVM_ACCOUNT_PATH,
  type PassportBtcTransport,
  type PassportEvmTransport,
  type PassportSignEvmTransactionRequest,
} from './protocol';

export class QuantumLinkTransport implements PassportEvmTransport, PassportBtcTransport {
  private pendingSigningRequestId: string | null = null;

  async getEvmAccount(path: typeof PASSPORT_EVM_ACCOUNT_PATH) {
    const response = await PassportQuantumLink.getEvmAccount(path, createRequestId());
    if (response.protocolVersion !== 1 || response.path !== path) {
      throw new Error('Passport returned an incompatible EVM account response');
    }
    return {
      address: response.address,
      publicKey: response.publicKey,
      path,
    };
  }

  async signEvmTransaction(request: PassportSignEvmTransactionRequest) {
    const { transaction } = request;
    if (this.pendingSigningRequestId) {
      throw new Error('Another Passport signing request is already pending');
    }
    this.pendingSigningRequestId = request.requestId;
    try {
      const response = await PassportQuantumLink.signEvmTransaction({
        requestId: request.requestId,
        path: request.path,
        chainId: transaction.chainId,
        nonce: transaction.nonce,
        from: transaction.from,
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
        gasLimit: transaction.gasLimit,
        maxFeePerGas: transaction.maxFeePerGas,
        maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
      });

      return {
        protocolVersion: response.protocolVersion,
        requestId: response.requestId,
        address: response.address,
        signedTransaction: response.signedTransaction,
      };
    } finally {
      this.pendingSigningRequestId = null;
    }
  }

  async getBtcAccount(path: typeof PASSPORT_BTC_ACCOUNT_PATH) {
    const response = await PassportQuantumLink.getBtcAccount(path, createRequestId());
    if (response.protocolVersion !== 1 || response.path !== path) {
      throw new Error('Passport returned an incompatible Bitcoin account response');
    }
    return {
      address: response.address,
      publicKey: response.publicKey,
      path,
    };
  }

  async signBtcPsbt(request: import('./protocol').PassportSignBtcPsbtRequest) {
    if (this.pendingSigningRequestId) {
      throw new Error('Another Passport signing request is already pending');
    }
    this.pendingSigningRequestId = request.requestId;
    try {
      return await PassportQuantumLink.signBtcPsbt({
        requestId: request.requestId,
        path: request.path,
        psbt: request.psbt,
      });
    } finally {
      this.pendingSigningRequestId = null;
    }
  }

  async cancelPending(): Promise<void> {
    const requestId = this.pendingSigningRequestId;
    if (!requestId) return;
    await PassportQuantumLink.cancel(requestId);
  }
}

export const quantumLinkTransport = new QuantumLinkTransport();
