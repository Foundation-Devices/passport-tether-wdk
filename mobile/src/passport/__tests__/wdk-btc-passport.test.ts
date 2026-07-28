import type { IBtcClient } from '@tetherto/wdk-wallet-btc';
import { networks, payments, Psbt, Transaction } from 'bitcoinjs-lib';
import { Buffer } from 'buffer';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPassportBtcSession } from '../PassportWalletServiceBtc';
import type { PassportBtcTransport, PassportSignBtcPsbtRequest } from '../protocol';

const PUBLIC_KEY = Buffer.from(
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  'hex'
);
const ADDRESS = payments.p2wpkh({ pubkey: PUBLIC_KEY, network: networks.testnet }).address!;
const RECIPIENT = payments.p2wpkh({
  pubkey: Buffer.from('02c6047f9441ed7d6d3045406e95c07cd85a8c778e4b8cef3ca7abac09b95c709e', 'hex'),
  network: networks.testnet,
}).address!;

class TestClient implements IBtcClient {
  broadcasted: string | null = null;

  async connect() {}
  async close() {}
  async reconnect() {}
  async getBalance() {
    return { confirmed: 100_000, unconfirmed: 0 };
  }
  async listUnspent() {
    return [
      {
        tx_hash: '00'.repeat(32),
        tx_pos: 0,
        value: 100_000,
        height: 1,
      },
    ];
  }
  async getHistory() {
    return [];
  }
  async getTransaction() {
    return '';
  }
  async estimateFee() {
    return 0.00001;
  }
  async broadcast(rawTransaction: string) {
    this.broadcasted = rawTransaction;
    return 'signed-btc-testnet-hash';
  }
}

class TestTransport implements PassportBtcTransport {
  request: PassportSignBtcPsbtRequest | null = null;

  async getBtcAccount() {
    return {
      address: ADDRESS,
      publicKey: PUBLIC_KEY.toString('hex'),
      path: "m/84'/1'/0'/0/0" as const,
    };
  }

  async signBtcPsbt(request: PassportSignBtcPsbtRequest) {
    this.request = request;
    const psbt = Psbt.fromBuffer(Buffer.from(request.psbt.slice(2), 'hex'), {
      network: networks.testnet,
    });
    const transaction = new Transaction();
    transaction.version = 2;
    psbt.txInputs.forEach((input) => {
      transaction.addInput(input.hash, input.index, input.sequence);
    });
    psbt.txOutputs.forEach((output) => {
      transaction.addOutput(output.script, output.value);
    });
    transaction.ins.forEach((_, index) => {
      transaction.setWitness(index, [Buffer.from([1]), PUBLIC_KEY]);
    });
    return {
      protocolVersion: 1 as const,
      requestId: request.requestId,
      address: ADDRESS,
      signedTransaction: transaction.toHex(),
    };
  }
}

test('WDK selects Bitcoin testnet UTXOs while Passport signs the resulting PSBT', async () => {
  const transport = new TestTransport();
  const client = new TestClient();
  const session = await createPassportBtcSession(transport, client);

  assert.equal(await session.getBalance(), 100_000n);
  const prepared = await session.prepareTransfer(RECIPIENT, 50_000n);
  const psbt = Psbt.fromBuffer(Buffer.from(prepared.psbt.slice(2), 'hex'), {
    network: networks.testnet,
  });
  assert.equal(psbt.txInputs.length, 1);
  assert.equal(psbt.txOutputs[0].address, RECIPIENT);
  assert.equal(psbt.txOutputs[0].value, 50_000n);
  assert.ok(prepared.feeSats > 0n);

  const result = await session.signAndBroadcast(prepared);
  assert.equal(result.hash, 'signed-btc-testnet-hash');
  assert.ok(transport.request);
  assert.ok(client.broadcasted);
  session.dispose();
});

test('rejects a Passport public key that does not derive the returned address', async () => {
  const transport = new TestTransport();
  transport.getBtcAccount = async () => ({
    address: RECIPIENT,
    publicKey: PUBLIC_KEY.toString('hex'),
    path: "m/84'/1'/0'/0/0" as const,
  });

  await assert.rejects(
    createPassportBtcSession(transport, new TestClient()),
    /invalid Bitcoin account material/
  );
});
