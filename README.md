# ioBroker.repositories
===================

This is github project for storage of latest and stable repositories.

Write ```npm run update``` to just get new adapters from sources-dist.json into sources-dist-stable.json.
And write ```npm run update adapterName``` to write latest version of adapterName into sources-dist-stable.json

## Update of the version in stable
1. Be sure that the version is tested in forum by users or you fix the critical bug with that.
2. Delete the versionTime or update it to the current time

## Requirements for adapter to get added to the repository

*already required for latest repository*

1. Adapter needs to be available as package on npm. See [How to publish on npm](#how-to-publish-on-npm)
2. iobroker organisation must be added as owner to npm package. [Why and how to do that.](#add-owner-to-packet)
3. Adapter needs to have a README.md with description, detail information and changelog. English is mandatory. Other languages are welcome. See [Example of README.md](#example-of-readme-md)
4. Adapter must have a predefined license.
5. Adapter needs to have at least Adapter basic testing (installing, running) using Travis-CI and Appveyor. More information in Forum from apollon77 (Just take from other adapters the samples)
6. Define one of the types in io-package.json
7. Include "author" in io-package.json and "authors" in io-package.json
8. Add your adapter into the list (first latest and after that into stable, when tested). 
   Examples of entries you can find [here](#samples).
   *Note*: don't forget to add attribute *published* to **both** repositories.
9. Your github repository must have name "ioBroker.<adaptername>". **B** is capital in "ioBroker", but in the package.json the *name* must be low case, because npm does not allow upper case letters.
10. *title* in io-package.json (common) is simple short name of adapter in english. *titleLang* is object that consist short names in many languages. *Lang* ist not german Länge, but english LANGuages.
11. Do not use in the title the words "ioBroker" or "Adapter". It is clear anyway, that it is adapter for ioBroker. 
12. **new!** No new adapters will be accepted to repo without admin3 Configuration dialog. Admin2 dialog is optional!

### Requirements for adapter to get added to the stable repository

* Forum thread with question to test the adapter.
* Some feedback on [forum](http://forum.iobroker.net) .

## How-to
### How to publish on npm

https://docs.npmjs.com/getting-started/publishing-npm-packages

### Add owner to packet
We are really happy, that other developers are contributing to ioBroker. But some of them with the time lost the enthusiasms and stop support and maintain the adapter.

There is no problem with github repository. We can just fork it and maintain it in our organisation, but the situation with **npm** is different.

If some name is blocked (e.g. iobroker.rpi) we cannot publish the changed adapter under the same name, we must change the name to e.g. iobroker.rpi2.

Than we must change the ioBroker repositories and the user must install the new adapter and migrate the old settings and objects into new adapter.

This is not suitable.

Because of that we ask you to give ioBroker organisation publish rights to update the npm package. We will use it only in emergency or if author do not react to our requests.

To add the ioBroker organisation to npm packet, you must write following, after the packet is published:

```npm access grant read-write iobroker:developers iobroker.<adaptername>```

If the command does not work just add bluefox as owner.

```npm owner add bluefox iobroker.<adaptername>```

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
The io-package.json must have attribute type in common part. Like here https://github.com/ioBroker/ioBroker.template/blob/master/io-package.json#L43 (Line can be changed with the time. Please report if this link do not point to according line any more):

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
Please define following attributes in package.json :
- https://github.com/ioBroker/ioBroker.template/blob/master/package.json#L5 (Only one author)
- https://github.com/ioBroker/ioBroker.template/blob/master/package.json#L9 (Many contributors)
- https://github.com/ioBroker/ioBroker.template/blob/master/io-package.json#L32 (Same here, but you can set many authors/contributors if desired)

### Samples
For **latest** (sources-dist.json):

```
  "admin": {
    "meta": "https://raw.githubusercontent.com/ioBroker/ioBroker.admin/master/io-package.json",
    "icon": "https://raw.githubusercontent.com/ioBroker/ioBroker.admin/master/admin/admin.png",
    "published": "2017-04-10T17:10:21.690Z",
    "type": "general"
  },
```

For **stable** (sources-dist-stable.json):

```
  "admin": {
    "meta": "https://raw.githubusercontent.com/ioBroker/ioBroker.admin/master/io-package.json",
    "icon": "https://raw.githubusercontent.com/ioBroker/ioBroker.admin/master/admin/admin.png",
    "version": "2.0.7",
    "published": "2017-04-10T17:10:21.690Z",
    "type": "general"
  },
```

*Note*: stable has always specific version.
