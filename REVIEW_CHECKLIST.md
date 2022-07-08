# Adapter Review Checklist

This file contains a checklist for adapter reviews

## run RE-CHECK!
* and check comments
* check repo commit that sorted in alphabetically

## Check Testing
* Travis or GitHub Actions are enbled
* package tests are executed
* adapter tests (integration) are executed and "green" (also really ok, scroll over test results)

## Check README.md
* Adapter is described roughly in english
* Changelog included
* License included
* If Sentry is used a note is included on top of Readme

## Check package.json
* notice adapter-core dep and check js.controller dep in io-package
* check that minimum engine version is specified in README contains any info on minimum nodejs version
* rough check/fly over

## Check io-package.json
* check js-controller dep
* check that news and names and such are included and translated
* check if materializeTab, supportsCustoms, ... is defined but not used
* native fields are defined - and match to index_m.html?
* password fields? encrypted? protectedNative/encryptedNative used?
* rough check/fly over rest

## Check directories and files
* widget exists - is real widget in? io-package correct for it?
* if www exists - content make sense?
* if docs exists - content make sense and linked in io-package?
* admin exists, content matches to io-package?

## Adapter Logic
* general check
* especially search for timeouts/intervals (also in lib files) and check that they are cleared in unload
* "schedule" not used for external communication; same for "scheduled adapzters". They need to take care of randomization of the schedule to avoind "peak load" on the queried website!
* only needed event handlers are used (stateChange/objectChange/message))
* verify that no strictObjectChecks: false is used unjustified
* check used object roles
* verify no setObject (ideally)
* onStateChange check ack handling
* check parallelism of object/state creations and set calls
* rough check on error handling to give advices
* if info.connection is used verify that channel and object is defined in io-package or code
* rough check/fly over rest
