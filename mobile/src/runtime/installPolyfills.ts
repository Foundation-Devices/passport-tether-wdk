import { Buffer } from 'buffer';

type SecureRandom = <T extends ArrayBufferView>(values: T) => T;

function loadNativeSecureRandom(): SecureRandom {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('expo-crypto') as { getRandomValues: SecureRandom }).getRandomValues;
}

/**
 * Install Node-compatible primitives required by dependencies before the
 * React Native application graph is evaluated by Hermes.
 */
export function installRuntimePolyfills(secureRandom?: SecureRandom): void {
  globalThis.Buffer = Buffer;

  const runtime = globalThis as unknown as {
    crypto?: { getRandomValues?: SecureRandom };
  };
  if (runtime.crypto?.getRandomValues) return;

  // Load the native module only when Hermes does not already provide Web
  // Crypto. There is deliberately no Math.random fallback for wallet IDs.
  const getRandomValues = secureRandom ?? loadNativeSecureRandom();
  const crypto = runtime.crypto ?? {};
  crypto.getRandomValues = getRandomValues;
  Object.defineProperty(runtime, 'crypto', {
    configurable: true,
    enumerable: true,
    value: crypto,
    writable: true,
  });
}
