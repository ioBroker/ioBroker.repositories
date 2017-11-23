# ioBroker.repositories
===================

This is github project for storage of latest and stable repositories.

Write ```npm run update``` to just get new adapters from sources-dist.json into sources-dist-stable.json.
And write ```npm run update adapterName``` to write latest version of adapterName into sources-dist-stable.json

## Requirements for adapter to get added to the repository

*already required for latest repository*

* Adapter needs to be available as package on npm
* Adapter needs to have a README.md with description, detail information and changelog. English is mandatory. Other languages are welcome.
* Adapter must have a predefined license.
* Adapter needs to have at least Adapter basic testing (installing, running) using Travis-CI and Appveyor. More information in Forum from apollon77 (Just take from other adapters the samples)
* Define one of the types in io-package.json
* Include "author" in io-package.json and "authors" in io-package.json

### Requirements for adapter to get added to the stable repository

* Forum thread with question to test the adapter.
* Some feedback on [forum](http://forum.iobroker.net) .

## How-to
### How to publish on npm

https://docs.npmjs.com/getting-started/publishing-npm-packages

### Example of README.md

https://github.com/ioBroker/ioBroker.admin/blob/master/README.md

Much better is to write documentation separately for every language like here:

https://github.com/ioBroker/ioBroker.admin/blob/master/io-package.json#L171

and the files are here https://github.com/ioBroker/ioBroker.admin/tree/master/docs

And make the link in your readme file to this files, like here: https://github.com/ioBroker/ioBroker.javascript/blob/master/README.md

### Licenses
Following licenses are used now in ioBroker project:

* MIT (used for most of adapters and core)
* Apache 2.0
* CC-BY
* OFL-1.1
* EPL
* LGPL
* GPLv3
* GPLv2
* CC-BY-NC
* CC-BY-NC-SA

You can choose the suitable license here: https://ufal.github.io/public-license-selector/

Of course you can add your own licenses, even WTFPL.

You must of course take in count the licenses of components, that used in your adapter. E.g. if you use main packet under GPLv2 license, you cannot make CC-BY-NC from that.

### Testing
See how testing is implemented on ioBroker.template:
 - https://github.com/ioBroker/ioBroker.template/tree/master/test
 - https://github.com/ioBroker/ioBroker.template/blob/master/package.json#L39
 - Activate tests on travis-ci.org: https://github.com/mbonaci/mbo-storm/wiki/Integrate-Travis-CI-with-your-GitHub-repo
 - Activate appveyor (for windows) if applicable: https://www.appveyor.com/

You can find some help in this [PDF](http://forum.iobroker.net/download/file.php?id=11259) (Only german) See **Adapter Testing** Section.

### Types
The io-package.json must have attribute type in common part. Like here https://github.com/ioBroker/ioBroker.template/blob/master/io-package.json#L43 (Line can be changed with the time. Please report if this link do not point to according line any more)
    - general
    - hardware
    - lighting
    - energy
    - multimedia
    - household
    - iot-systems
    - communication
    - climate-control
    - weather
    - geoposition
    - messaging
    - infrastructure
    - date-and-time
    - visualization
    - utility
    - storage
    - visualization-icons
    - logic
    - garden
    - protocols
    - network
    - alarm
    - misc-data
    - visualization-widgets

#### Defined categories for non-repo adapters
* pilight	IoT-systems
* samsung2016	multimedia
* scriptgui	logic
* viessmann	climate-control
* vuplus	multimedia

### Authors
Please define in package.json following attributes:
- https://github.com/ioBroker/ioBroker.template/blob/master/package.json#L5 (Only one author)
- https://github.com/ioBroker/ioBroker.template/blob/master/package.json#L9 (Many contributors)
- https://github.com/ioBroker/ioBroker.template/blob/master/io-package.json#L32 (Same here, but you can set many authors/contributors if desired)
