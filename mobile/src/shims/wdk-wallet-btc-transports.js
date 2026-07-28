// The WDK account supports caller-supplied clients. These placeholders keep
// unsupported Node socket clients out of the React Native bundle and fail
// closed if a future mobile call accidentally attempts to instantiate one.
class UnsupportedMobileTransport {
  constructor() {
    throw new Error('Use an externally supplied Bitcoin client on mobile');
  }
}

export const BlockbookClient = UnsupportedMobileTransport;
export const ElectrumTcp = UnsupportedMobileTransport;
export const ElectrumSsl = UnsupportedMobileTransport;
export const ElectrumTls = UnsupportedMobileTransport;
export const ElectrumWs = UnsupportedMobileTransport;
