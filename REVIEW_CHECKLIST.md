# Adapter Review Checklist
This file contains a checklist for adapter reviews

## run RE-CHECK!
* and check comments
* check repo commit that sorted in alphabetically

## Check Testing
* GitHub Actions are enabled
* package tests are executed
* adapter tests (integration) are executed and "green" (also really ok, scroll over test results)

## Check README.md
* Adapter is described roughly in english
* Changelog included
* License included
* If Sentry is used, a note is included on top of Readme

## Check package.json
* notice `adapter-core` dependency and check `js.controller` dependency in `io-package.json`
* check that minimum engine version is specified in `README.md` contains any info on minimum `node.js` version
* rough check/fly over

## Check io-package.json
* check `js-controller` dependency
* check that news and names and such are included and translated
* check if `materializeTab`, `supportsCustoms`, ... is defined but not used
* native fields are defined - and match to `index_m.html`?
* password fields? encrypted? `protectedNative/encryptedNative` used?
* rough check/fly over rest
  * check that `port` attribute called really as `port` in code. The same is for all web settings:
  - `bind` - IPv4 or IPv6 bind address. `bind` cannot be used for description of other devices. Only for own server.
  - `v6bind` - explicit IPv6 bind address, 
  - `secure` - if HTTPS used, 
  - `certPrivate` - name of private certificate, 
  - `certPublic` - name of public certificate, 
  - `certChained` - name of chained certificate,
  - `leEnabled` - (deprecated) - if usage of letsencrypt enabled,
  - `leUpdate` - (deprecated) - if letsencrypt certificate should be updated,
  - `leCheckPort` - (deprecated) - port for letsencrypt check, 
  - `leCollection` - collection name of letsencrypt certificates from acme adapter. Could be `true` to use all collections, `false` - to disable letsencrypt certificates, or specific collection name. 

## Check directories and files
* widget exists - is real widget in? `io-package.json` correct for it?
* if `www` exists - content make sense?
* if `docs` exists - content make sense and linked in `io-package.json`?
* admin exists, content matches to `io-package.json`?

## Adapter Logic
* general check
* especially search for timeouts/intervals (also in lib files) and check that they are cleared in unload
* "schedule" not used for external communication; same for "scheduled adapters". They need to take care of randomization of the schedule to avoid "peak load" on the queried website!
* only needed event handlers are used (`stateChange/objectChange/message/unload`))
* verify that no `strictObjectChecks`: false is used unjustified
* check used object roles
* verify no `setObject` (ideally)
* `onStateChange` check ack handling
* check parallelism of object/state creations and set calls
* rough check on error handling to give advices
* if `info.connection` is used verify that channel and object is defined in io-package or code
* rough check/fly over rest
