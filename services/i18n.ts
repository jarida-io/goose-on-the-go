/** Bundled connection messages: no translation service or network dependency. */
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false },
  resources: { en: { translation: {
    connection: {
      changePond: 'Scan a local QR code to change the paired Pond.',
      local: 'Connected locally', remote: 'Connected remotely', reconnecting: 'Reconnecting to your Pond',
      disconnected: 'Pond is unavailable. Check its connection and your VPN.',
      unpaired: 'Pair with your Pond at home', upgrade: 'Scan a new QR code at home to enable secure connections.',
      trust: 'Could not verify this Pond. Check its fingerprint on the Pond before pairing again.',
      unsupported: 'Secure Pond connections require an Android or iOS development or release build.',
    },
    pairing: {
      lan: 'Connect to the same home network as your Pond to pair.',
      invalid: 'Scan a current HTTPS pairing QR code from your Pond.',
      fingerprint: 'Pond public-key fingerprint', fingerprintHint: 'sha256/... shown on your Pond',
      failed: 'Could not pair securely with this Pond.',
      saving: 'Could not save this pairing. Your previous Pond is still selected.',
      address: 'HTTPS Pond address', code: 'Pairing code',
    },
  } } },
});
export default i18n;
