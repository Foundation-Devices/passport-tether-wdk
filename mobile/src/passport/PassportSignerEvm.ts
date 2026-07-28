import type { Authorization, AuthorizationRequest, TypedData } from '@tetherto/wdk-wallet-evm';
import type { UnsignedEvmTransaction } from '@tetherto/wdk-wallet-evm/signers';
import type { KeyPair } from '@tetherto/wdk-wallet';
import { getAddress, getBytes, Transaction } from 'ethers';
import {
  canonicalizeEvmTransaction,
  createRequestId,
  PASSPORT_EVM_ACCOUNT_PATH,
  type PassportEvmAccount,
  type PassportEvmTransport,
  WDK_RELATIVE_ACCOUNT_PATH,
} from './protocol';

export class PassportUnsupportedSigningError extends Error {
  constructor(operation: string) {
    super(`${operation} is not enabled for this Passport proof of concept`);
    this.name = 'PassportUnsupportedSigningError';
  }
}

export class PassportSignerEvm {
  private disposed = false;

  private constructor(
    private readonly transport: PassportEvmTransport,
    private readonly account?: PassportEvmAccount
  ) {}

  static root(transport: PassportEvmTransport): PassportSignerEvm {
    return new PassportSignerEvm(transport);
  }

  get isDerivable(): boolean {
    return this.account === undefined;
  }

  get index(): number | undefined {
    return this.account ? 0 : undefined;
  }

  get path(): string | undefined {
    return this.account?.path;
  }

  get address(): string | undefined {
    return this.account?.address;
  }

  get keyPair(): KeyPair {
    return {
      publicKey: this.account ? getBytes(this.account.publicKey) : new Uint8Array(),
      privateKey: null,
    };
  }

  async derive(relativePath: string): Promise<PassportSignerEvm> {
    this.assertAvailable();
    if (!this.isDerivable) {
      throw new PassportUnsupportedSigningError('Child key derivation');
    }
    if (relativePath !== WDK_RELATIVE_ACCOUNT_PATH) {
      throw new PassportUnsupportedSigningError(`Derivation path ${relativePath}`);
    }

    const account = await this.transport.getEvmAccount(PASSPORT_EVM_ACCOUNT_PATH);
    if (account.path !== PASSPORT_EVM_ACCOUNT_PATH) {
      throw new Error('Passport returned an unexpected derivation path');
    }

    return new PassportSignerEvm(this.transport, {
      ...account,
      address: getAddress(account.address),
    });
  }

  async getAddress(): Promise<string> {
    this.assertAvailable();
    if (this.account) {
      return this.account.address;
    }

    const account = await this.transport.getEvmAccount(PASSPORT_EVM_ACCOUNT_PATH);
    return getAddress(account.address);
  }

  async signTransaction(unsignedTransaction: UnsignedEvmTransaction): Promise<string> {
    this.assertAvailable();
    if (!this.account) {
      throw new Error('A derived Passport signer is required to sign a transaction');
    }

    const requestId = createRequestId();
    const response = await this.transport.signEvmTransaction({
      protocolVersion: 1,
      requestId,
      path: PASSPORT_EVM_ACCOUNT_PATH,
      transaction: canonicalizeEvmTransaction(unsignedTransaction, this.account.address),
    });

    if (response.protocolVersion !== 1 || response.requestId !== requestId) {
      throw new Error('Passport returned a mismatched signing response');
    }
    if (getAddress(response.address) !== getAddress(this.account.address)) {
      throw new Error('Passport signed with an unexpected account');
    }

    const signed = Transaction.from(response.signedTransaction);
    const expected = canonicalizeEvmTransaction(unsignedTransaction, this.account.address);
    if (
      signed.type !== 2 ||
      signed.chainId !== BigInt(expected.chainId) ||
      signed.nonce !== expected.nonce ||
      signed.from === null ||
      getAddress(signed.from) !== getAddress(expected.from) ||
      signed.to === null ||
      getAddress(signed.to) !== getAddress(expected.to) ||
      signed.data.toLowerCase() !== expected.data.toLowerCase() ||
      signed.value !== BigInt(expected.value) ||
      signed.gasLimit !== BigInt(expected.gasLimit) ||
      signed.maxFeePerGas !== BigInt(expected.maxFeePerGas) ||
      signed.maxPriorityFeePerGas !== BigInt(expected.maxPriorityFeePerGas) ||
      (signed.accessList?.length ?? 0) !== 0
    ) {
      throw new Error('Passport returned a signed transaction that does not match the request');
    }

    return response.signedTransaction;
  }

  async sign(_message: string): Promise<string> {
    throw new PassportUnsupportedSigningError('Message signing');
  }

  async signTypedData(_typedData: TypedData): Promise<string> {
    throw new PassportUnsupportedSigningError('EIP-712 signing');
  }

  async signAuthorization(_authorization: AuthorizationRequest): Promise<Authorization> {
    throw new PassportUnsupportedSigningError('EIP-7702 authorization signing');
  }

  dispose(): void {
    this.disposed = true;
  }

  private assertAvailable(): void {
    if (this.disposed) {
      throw new Error('Passport signer has been disposed');
    }
  }
}
