import { URDecoder } from '@ngraveio/bc-ur';
import { getAddress } from 'ethers';

export type PairingScanResult =
  | { complete: false; progress: number }
  | { complete: true; xidBase64: string };

type PairingConnector = (deviceAddress: string) => Promise<void>;
type PairingDelay = (milliseconds: number) => Promise<void>;

const wait: PairingDelay = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/**
 * Recover a transient BLE loss while the camera remains on Passport Prime's animated
 * identity step. Passport Prime returns to its static QR whenever BLE disconnects, so a
 * successful retry makes both devices converge on step 2 again.
 */
export async function recoverPairingConnection(
  connect: PairingConnector,
  deviceAddress: string,
  retryDelays = [250, 750, 1_500],
  delay: PairingDelay = wait
): Promise<void> {
  let lastError: unknown = new Error('Passport Prime disconnected');
  for (const retryDelay of retryDelays) {
    await delay(retryDelay);
    try {
      await connect(deviceAddress);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function parsePassportPairingQr(value: string): string | null {
  const match = value.match(/[?&]p=([0-9a-fA-F:]{12,17})(?:&|$)/);
  if (!match) return null;
  const compact = match[1].replaceAll(':', '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(compact)) return null;
  return compact.match(/.{2}/g)?.join(':') ?? null;
}

export class PassportXidDecoder {
  private decoder = new URDecoder();

  receive(value: string): PairingScanResult {
    if (!value.toLowerCase().startsWith('ur:envelope/')) {
      return { complete: false, progress: 0 };
    }
    this.decoder.receivePart(value);
    if (this.decoder.isError()) {
      throw new Error(this.decoder.resultError() || 'Invalid Passport identity QR');
    }
    if (!this.decoder.isComplete()) {
      return {
        complete: false,
        progress: Math.max(0.01, Math.min(0.99, this.decoder.getProgress())),
      };
    }
    if (!this.decoder.isSuccess()) {
      throw new Error('Could not reconstruct the Passport identity');
    }
    return {
      complete: true,
      xidBase64: this.decoder.resultUR().cbor.toString('base64'),
    };
  }

  reset(): void {
    this.decoder = new URDecoder();
  }
}

export function parseEvmAddressQr(value: string): string | null {
  const raw = value.trim();
  const candidate = raw.toLowerCase().startsWith('ethereum:')
    ? raw.slice('ethereum:'.length).split(/[?@/]/, 1)[0]
    : raw;
  try {
    return getAddress(candidate);
  } catch {
    return null;
  }
}
