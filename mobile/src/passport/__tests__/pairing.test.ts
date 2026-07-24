import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer as BufferPolyfill } from 'buffer';
import { UR, UREncoder } from '@ngraveio/bc-ur';
import { installRuntimePolyfills } from '../../runtime/installPolyfills';
import {
  parseEvmAddressQr,
  parsePassportPairingQr,
  PassportXidDecoder,
  recoverPairingConnection,
} from '../pairing';

test('normalizes the Passport static pairing QR address', () => {
  assert.equal(
    parsePassportPairingQr('https://qr.foundation.xyz/?p=AABBCCDDEEFF&c=0&o=1&n=Passport%20Prime'),
    'AA:BB:CC:DD:EE:FF'
  );
  assert.equal(
    parsePassportPairingQr('https://qr.foundation.xyz/?c=0&p=aa:bb:cc:dd:ee:ff'),
    'AA:BB:CC:DD:EE:FF'
  );
});

test('extracts plain and EIP-681 recipient addresses', () => {
  const address = '0x000000000000000000000000000000000000dEaD';
  assert.equal(parseEvmAddressQr(address), address);
  assert.equal(parseEvmAddressQr(`ethereum:${address}@11155111?value=1`), address);
  assert.equal(parseEvmAddressQr('not-an-address'), null);
});

test('rejects unrelated or malformed pairing QR data', () => {
  assert.equal(parsePassportPairingQr('ethereum:0xdeadbeef'), null);
  assert.equal(parsePassportPairingQr('https://qr.foundation.xyz/?p=AABB'), null);
  assert.equal(parsePassportPairingQr('https://example.com/?p=AABBCCDDEEFG'), null);
});

test('recovers a transient BLE loss during two-step pairing', async () => {
  const attempts: string[] = [];
  const delays: number[] = [];
  await recoverPairingConnection(
    async (address) => {
      attempts.push(address);
      if (attempts.length < 3) throw new Error('transient disconnect');
    },
    'AA:BB:CC:DD:EE:FF',
    [100, 200, 300],
    async (milliseconds) => {
      delays.push(milliseconds);
    }
  );

  assert.deepEqual(attempts, ['AA:BB:CC:DD:EE:FF', 'AA:BB:CC:DD:EE:FF', 'AA:BB:CC:DD:EE:FF']);
  assert.deepEqual(delays, [100, 200, 300]);
});

test('reports the final BLE recovery failure', async () => {
  let attempts = 0;
  await assert.rejects(
    recoverPairingConnection(
      async () => {
        attempts += 1;
        throw new Error(`disconnect ${attempts}`);
      },
      'AA:BB:CC:DD:EE:FF',
      [0, 0],
      async () => undefined
    ),
    /disconnect 2/
  );
  assert.equal(attempts, 2);
});

test('installs Buffer and secure random before wallet code loads in Hermes', () => {
  const originalBuffer = globalThis.Buffer;
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    globalThis.Buffer = undefined as unknown as typeof Buffer;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    installRuntimePolyfills((values) => {
      new Uint8Array(values.buffer, values.byteOffset, values.byteLength).fill(0xa5);
      return values;
    });

    const encoded = UREncoder.encodeSinglePart(
      new UR(BufferPolyfill.from([0x01, 0x02, 0x03]), 'envelope')
    );
    const decoder = new PassportXidDecoder();

    assert.deepEqual(decoder.receive(encoded), {
      complete: true,
      xidBase64: 'AQID',
    });
    const random = new Uint8Array(4);
    globalThis.crypto.getRandomValues(random);
    assert.deepEqual([...random], [0xa5, 0xa5, 0xa5, 0xa5]);
  } finally {
    globalThis.Buffer = originalBuffer;
    if (originalCrypto) {
      Object.defineProperty(globalThis, 'crypto', originalCrypto);
    } else {
      delete (globalThis as { crypto?: Crypto }).crypto;
    }
  }
});
