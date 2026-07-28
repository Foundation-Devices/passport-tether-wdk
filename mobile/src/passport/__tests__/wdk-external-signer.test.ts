import assert from 'node:assert/strict';
import { test } from 'node:test';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import { Transaction, Wallet, getAddress, keccak256 } from 'ethers';
import { PassportSignerEvm, PassportUnsupportedSigningError } from '../PassportSignerEvm';
import {
  PASSPORT_EVM_ACCOUNT_PATH,
  PassportPolicyError,
  SEPOLIA_CHAIN_ID,
  type PassportEvmTransport,
  type PassportSignEvmTransactionRequest,
} from '../protocol';

const TEST_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const RECIPIENT = '0x000000000000000000000000000000000000dEaD';
const TEST_TOKEN = '0x0000000000000000000000000000000000001000';

class MockPassportTransport implements PassportEvmTransport {
  readonly wallet = new Wallet(TEST_PRIVATE_KEY);
  lastRequest?: PassportSignEvmTransactionRequest;

  async getEvmAccount(path: typeof PASSPORT_EVM_ACCOUNT_PATH) {
    assert.equal(path, PASSPORT_EVM_ACCOUNT_PATH);
    return {
      address: this.wallet.address,
      publicKey: this.wallet.signingKey.publicKey,
      path,
    };
  }

  async signEvmTransaction(request: PassportSignEvmTransactionRequest) {
    this.lastRequest = request;
    const { transaction } = request;
    const signedTransaction = await this.wallet.signTransaction({
      chainId: transaction.chainId,
      nonce: transaction.nonce,
      to: transaction.to,
      data: transaction.data,
      value: BigInt(transaction.value),
      type: transaction.type,
      gasLimit: BigInt(transaction.gasLimit),
      maxFeePerGas: BigInt(transaction.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas),
      accessList: transaction.accessList,
    });

    return {
      protocolVersion: 1 as const,
      requestId: request.requestId,
      address: this.wallet.address,
      signedTransaction,
    };
  }
}

class MockSepoliaProvider {
  signedTransaction?: string;

  async request({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> {
    switch (method) {
      case 'eth_chainId':
        return `0x${SEPOLIA_CHAIN_ID.toString(16)}`;
      case 'eth_blockNumber':
        return '0x1234';
      case 'eth_estimateGas':
        return '0x186a0';
      case 'eth_gasPrice':
        return '0x6fc23ac00';
      case 'eth_maxPriorityFeePerGas':
        return '0x3b9aca00';
      case 'eth_getTransactionCount':
        return '0x7';
      case 'eth_getBlockByNumber':
        return {
          hash: `0x${'11'.repeat(32)}`,
          parentHash: `0x${'22'.repeat(32)}`,
          number: '0x1234',
          timestamp: '0x65f00000',
          nonce: '0x0000000000000000',
          difficulty: '0x0',
          gasLimit: '0x1c9c380',
          gasUsed: '0x0',
          miner: '0x0000000000000000000000000000000000000000',
          extraData: '0x',
          transactions: [],
          baseFeePerGas: '0x6fc23ac00',
        };
      case 'eth_sendRawTransaction': {
        const [signedTransaction] = params as [string];
        this.signedTransaction = signedTransaction;
        return keccak256(signedTransaction);
      }
      default:
        throw new Error(`Unexpected JSON-RPC method: ${method}`);
    }
  }
}

test('WDK derives and signs through a Passport external signer without a seed', async () => {
  const transport = new MockPassportTransport();
  const rootSigner = PassportSignerEvm.root(transport);
  const manager = new WalletManagerEvm(rootSigner, { chainId: SEPOLIA_CHAIN_ID });
  const account = await manager.getAccount(0);

  assert.equal(manager.seed, undefined);
  assert.equal(await account.getAddress(), getAddress(transport.wallet.address));
  assert.equal(account.path, PASSPORT_EVM_ACCOUNT_PATH);
  assert.equal(account.keyPair.privateKey, null);

  const signedTransaction = await account.signTransaction({
    chainId: SEPOLIA_CHAIN_ID,
    nonce: 7,
    to: RECIPIENT,
    data: '0x',
    value: 123n,
    type: 2,
    gasLimit: 21_000n,
    maxFeePerGas: 20_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  });

  const parsed = Transaction.from(signedTransaction);
  assert.equal(parsed.from, getAddress(transport.wallet.address));
  assert.equal(parsed.chainId, BigInt(SEPOLIA_CHAIN_ID));
  assert.equal(parsed.to, getAddress(RECIPIENT));
  assert.equal(parsed.value, 123n);
  assert.equal(transport.lastRequest?.transaction.from, getAddress(transport.wallet.address));
  assert.equal(transport.lastRequest?.transaction.maxFeePerGas, '20000000000');

  manager.dispose();
});

test('WDK quotes, constructs, remotely signs, and broadcasts an ERC-20 transfer', async () => {
  const transport = new MockPassportTransport();
  const provider = new MockSepoliaProvider();
  const manager = new WalletManagerEvm(PassportSignerEvm.root(transport), {
    chainId: SEPOLIA_CHAIN_ID,
    provider,
  });
  const account = await manager.getAccount(0);

  const quote = await account.quoteTransfer({
    token: TEST_TOKEN,
    recipient: RECIPIENT,
    amount: 1_000_000n,
  });
  assert.equal(quote.fee, 6_100_000_000_000_000n);

  const result = await account.transfer({
    token: TEST_TOKEN,
    recipient: RECIPIENT,
    amount: 1_000_000n,
  });

  assert.equal(result.hash, keccak256(provider.signedTransaction!));
  assert.equal(Transaction.from(provider.signedTransaction!).from, transport.wallet.address);
  assert.equal(transport.lastRequest?.transaction.to, getAddress(TEST_TOKEN));
  assert.match(transport.lastRequest?.transaction.data ?? '', /^0xa9059cbb/);
  manager.dispose();
});

test('Passport signer rejects unsupported chains before transport', async () => {
  const transport = new MockPassportTransport();
  const signer = await PassportSignerEvm.root(transport).derive("0'/0/0");

  await assert.rejects(
    signer.signTransaction({
      chainId: 1,
      nonce: 0,
      from: transport.wallet.address,
      to: RECIPIENT,
      data: '0x',
      value: 0n,
      type: 2,
      gasLimit: 21_000n,
      maxFeePerGas: 20_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    }),
    PassportPolicyError
  );
  assert.equal(transport.lastRequest, undefined);
});

test('Passport signer rejects a valid signature over different transaction fields', async () => {
  const transport = new MockPassportTransport();
  const originalSign = transport.signEvmTransaction.bind(transport);
  transport.signEvmTransaction = async (request) => {
    const response = await originalSign(request);
    response.signedTransaction = await transport.wallet.signTransaction({
      chainId: request.transaction.chainId,
      nonce: request.transaction.nonce,
      to: TEST_TOKEN,
      value: BigInt(request.transaction.value),
      type: 2,
      gasLimit: BigInt(request.transaction.gasLimit),
      maxFeePerGas: BigInt(request.transaction.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(request.transaction.maxPriorityFeePerGas),
    });
    return response;
  };
  const signer = await PassportSignerEvm.root(transport).derive("0'/0/0");

  await assert.rejects(
    signer.signTransaction({
      chainId: SEPOLIA_CHAIN_ID,
      nonce: 0,
      from: transport.wallet.address,
      to: RECIPIENT,
      data: '0x',
      value: 1n,
      type: 2,
      gasLimit: 21_000n,
      maxFeePerGas: 20_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    }),
    /does not match the request/
  );
});

test('Passport signer rejects unsafe nonces before transport', async () => {
  const transport = new MockPassportTransport();
  const signer = await PassportSignerEvm.root(transport).derive("0'/0/0");

  await assert.rejects(
    signer.signTransaction({
      chainId: SEPOLIA_CHAIN_ID,
      nonce: Number.MAX_SAFE_INTEGER + 1,
      from: transport.wallet.address,
      to: RECIPIENT,
      data: '0x',
      value: 0n,
      type: 2,
      gasLimit: 21_000n,
      maxFeePerGas: 20_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    }),
    PassportPolicyError
  );
  assert.equal(transport.lastRequest, undefined);
});

test('message and typed-data signing fail closed', async () => {
  const transport = new MockPassportTransport();
  const signer = await PassportSignerEvm.root(transport).derive("0'/0/0");

  await assert.rejects(signer.sign('hello'), PassportUnsupportedSigningError);
  await assert.rejects(
    signer.signTypedData({ domain: {}, types: {}, message: {} }),
    PassportUnsupportedSigningError
  );
});
