/* global __dirname */
const { withMainApplication, withAndroidManifest, withDangerousMod, withAppBuildGradle } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

module.exports = function withPondTls(config) {
  config = require('./with-pond-tls-ios')(config);
  config = withMainApplication(config, (mod) => {
    let source = mod.modResults.contents;
    if (!source.includes('io.jarida.pondtls.PondTls.install()')) {
      source = source.replace('super.onCreate()', 'super.onCreate()\n    io.jarida.pondtls.PondTls.install()');
    }
    if (!source.includes('add(io.jarida.pondtls.PondTlsPackage())')) {
      source = source.replace('PackageList(this).packages.apply {', 'PackageList(this).packages.apply {\n          add(io.jarida.pondtls.PondTlsPackage())');
    }
    if (!source.includes('io.jarida.pondtls.PondTls.install()') || !source.includes('add(io.jarida.pondtls.PondTlsPackage())')) {
      throw new Error('Pond TLS requires the Kotlin React Native application template');
    }
    mod.modResults.contents = source;
    return mod;
  });
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application[0].$;
    app['android:usesCleartextTraffic'] = 'false';
    app['android:networkSecurityConfig'] = '@xml/pond_network_security';
    return mod;
  });
  config = withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('// Pond TLS test dependencies')) {
      mod.modResults.contents += `
// Pond TLS test dependencies
dependencies {
  testImplementation 'junit:junit:4.13.2'
  testImplementation 'com.squareup.okhttp3:mockwebserver:4.12.0'
  testImplementation 'com.squareup.okhttp3:okhttp-tls:4.12.0'
}
`;
    }
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const root = path.join(mod.modRequest.platformProjectRoot, 'app/src');
    const java = path.join(root, 'main/java/io/jarida/pondtls');
    fs.mkdirSync(java, { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'pond-tls/PondTls.kt'), path.join(java, 'PondTls.kt'));
    const tests = path.join(root, 'test/java/io/jarida/pondtls');
    fs.mkdirSync(tests, { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'pond-tls/PondTlsTest.kt'), path.join(tests, 'PondTlsTest.kt'));
    for (const variant of ['main', 'debug', 'debugOptimized']) {
      const dir = path.join(root, variant, 'res/xml');
      fs.mkdirSync(dir, { recursive: true });
      const local = variant === 'main' ? '' : '<domain-config cleartextTrafficPermitted="true"><domain>localhost</domain><domain>127.0.0.1</domain><domain>::1</domain></domain-config>';
      fs.writeFileSync(path.join(dir, 'pond_network_security.xml'), `<?xml version="1.0" encoding="utf-8"?><network-security-config><base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system" /></trust-anchors></base-config>${local}</network-security-config>\n`);
      if (variant !== 'main') {
        const manifest = path.join(root, variant, 'AndroidManifest.xml');
        if (fs.existsSync(manifest)) fs.writeFileSync(manifest, fs.readFileSync(manifest, 'utf8').replace(/android:usesCleartextTraffic="true"/g, 'android:usesCleartextTraffic="false"'));
      }
    }
    return mod;
  }]);
};
