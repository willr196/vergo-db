# Mobile app-link association files

The canonical public mobile-link domain is `https://vergoltd.com/app`.

Before a production build is released, publish both files in this directory:

- `apple-app-site-association`, containing the real Apple Team ID and bundle ID
  `com.vergoevents.app`.
- `assetlinks.json`, containing the SHA-256 fingerprint of the production
  Android signing certificate and package `com.vergoevents.app`.

Do not publish placeholder identifiers: iOS and Android will reject the
association, and links will fall back to the browser. These values must come
from the Apple Developer and Google Play signing configuration.
