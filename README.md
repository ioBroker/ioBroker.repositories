# ioBroker.repositories

This is github project for storage of latest and stable repositories.

Write ```npm run update``` to just get new adapters from sources-dist.json into sources-dist-stable.json.
And write ```npm run update adapterName``` to write latest version of adapterName into sources-dist-stable.json

## Update of the version in stable
1. Be sure that the version is tested in forum by users or you fix the critical bug with that.
2. Delete the versionTime if exists

## Add a new adapter to the latest repository
1. Fork this repo and clone your fork
2. Run `npm i`
3. Run `npm run addToLatest -- --name <adapter-name> --type <adapter-type>`  
    (replace `<adapter-name>` with your adapter's name and `<adapter-type>` with the adapter type)
4. Push a commit with the changes to `sources-dist.json`
5. Create a PR

## Requirements for adapter to get added to the latest repository

*already required for latest repository*

1. Your github repository must have name "ioBroker.<adaptername>". **B** is capital in "ioBroker", but in the package.json the *name* must be low case, because npm does not allow upper case letters.
2. Do not use in the title the words "ioBroker" or "Adapter". It is clear anyway, that it is adapter for ioBroker.
3. *title* in io-package.json (common) is simple short name of adapter in english. *titleLang* is object that consist short names in many languages. *Lang* ist not german `Länge`, but english `LANGuages`.
4. Adapter needs to have a README.md with description, detail information and changelog. English is mandatory. Other languages are welcome. See [Example of README.md](#example-of-readme-md).

   **In README.md, there must be a link to the device or the manufacturer's website. Devices must have a photo. Services do not require a photo, but are still welcome.**
5. Adapter must have a predefined license.
6. Please remove www, widgets and docs directories (admin/tab_m.html, admin/custom_m.html) if not used.
7. Adapter needs to have at least Adapter basic testing (installing, running) using Travis-CI and Appveyor. More information in Forum from apollon77 (Just take from other adapters the samples)
8. Define one of the types in io-package.json. See details [here](#types)
9. Define one of the connection types (if applied) in io-package.json. See details [here](#connection-types)
10. All states must have according [valid roles](https://github.com/ioBroker/ioBroker/blob/master/doc/STATE_ROLES.md#state-roles) (and not just "state")
11. Include "author" in io-package.json and "authors" in io-package.json. See [here](#authors).
12. Adapter needs to be available as package on npm. See [How to publish on npm](#how-to-publish-on-npm)
13. iobroker organisation must be added as owner to npm package. [Why and how to do that.](#add-owner-to-packet)
14. Add your adapter into the list (first latest and after that into stable, when tested).
   Examples of entries you can find [here](#samples).
15. No new adapters will be accepted to repo without admin3 Configuration dialog. Admin2 dialog is optional!

*Note:* you can watch the video about it (only german) on [youtube](https://www.youtube.com/watch?v=7N8fsJcAdlE)
*Note:* There is a helper https://adapter-check.iobroker.in/ to check many points automatically. Just place your github adapter repo there, e.g `https://github.com/ioBroker/ioBroker.admin` and press enter or on the check button.

## Add a new adapter to the stable repository
1. Fork this repo and clone your fork
2. Run `npm i`
3. Run `npm run addToStable -- --name <adapter-name> --version <stable-version>`  
    (replace `<adapter-name>` with your adapter's name and `<stable-version>` with the version that should be added to the stable repo)
4. Push a commit with the changes to `sources-dist-stable.json`
5. Create a PR

### Requirements for adapter to get added to the stable repository

Additionally to all above listed points:

15. Forum thread with question to test the adapter.
16. Some feedback on [forum](http://forum.iobroker.net).
17. **Important** Discovery function! If device can be found automatically (USB, IP) it must be implemented in discovery adapter.

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
The io-package.json must have attribute type in common part.
An example can be seen [here](https://github.com/ioBroker/ioBroker.template/blob/1e48d01e69c9ad15c70ab8dced572a4d6882ae0d/io-package.json#L76):

- `alarm` - security of home, car, boat, ...
- `climate-control` - climate, heaters, air filters, water heaters, ...
- `communication` - deliver data for other services via RESTapi, websockets
- `date-and-time` - schedules, calendars, ...
- `energy` - energy metering
- `metering` - other, but energy metering (water, gas, oil, ...)
- `garden` - mower, springs, ...
- `general` - general purpose adapters, like admin, web, discovery, ...
- `geoposition` - geo-positioning. These adapters delivers or accepst the position of other objects or persons.
- `health` - heart pulse, blood pressure, body weight, ...
- `hardware` - different multi-purpose hardware, arduino, esp, bluetooth, ...
- `household` - vacuum-cleaner, kitchen devices, ...
- `infrastructure` - Network, printers, phones, NAS, ...
- `iot-systems` - Other comprehensive smarthome systems (software and hardware)
- `lighting` - light
- `logic` - rules, scripts, parsers, scenes, ...
- `messaging` - these adapters send and receive messages from message services: telegram, email, whatsapp, ...
- `misc-data` - export/import of some unsorted information, contacts, systeminfo, gazoline prises, share curses, currents (EUR=>USD), ...
- `multimedia` - TV, AV Receivers, TV play boxes, Android/apple TV boxes, multi-room music, IR controls, speech input/output, ...
- `network` - ping, network detectors, UPnP, ...
- `protocols` - Communication protocols: MQTT,
- `storage` - logging, data protocols, SQL/NoSQL DBs, file storage, ...
- `utility` - different help adapters. Like backup, export/import
- `vehicle` - cars 
- `visualization` - visualisation, like vis, material, mobile
- `visualization-icons` - icons for visualisation
- `visualization-widgets` - iobroker.vis widgets
- `weather` - weather info, air quality, environment statistics

You can see the types of existing adapters [here](http://download.iobroker.net/list.html#sortCol=type&sortDir=0) and try to find the similar one.

### Connection types
If your adapter control some device/car/house the adapter could be connected with with various methods:
 
- `guess` - The status of the device cannot be determined. ioBroker takes status based on last ioBroker command.
- `cloud polling` - The integration of this device takes place via the cloud and requires an active internet connection. Querying the status means that an update may be noticed later.
- `cloud-push` - The integration of this device takes place via the cloud and requires an active internet connection. ioBroker will be notified when a new status is available.
- `local polling` - Provides direct communication with the device. Querying the status means that an update may be noticed later.
- `local-push` - Offers direct communication with the device. ioBroker will be notified when a new status is available.

Define `connection-type` in `common` part of `io-package.json`.

#### Defined categories for non-repo adapters
* pilight -	 iot-systems
* samsung2016 -	multimedia
* scriptgui	- logic
* viessmann	- climate-control
* vuplus - multimedia

### Authors
Please define following attributes in package.json :
- https://github.com/ioBroker/ioBroker.template/blob/master/JavaScript/package.json#L5 (Only one author)
- https://github.com/ioBroker/ioBroker.template/blob/master/JavaScript/package.json#L9 (Many contributors)
- https://github.com/ioBroker/ioBroker.template/blob/master/JavaScript/io-package.json#L32 (Same here, but you can set many authors/contributors if desired)

### Samples
For **latest** (sources-dist.json):

```
  "admin": {
    "meta": "https://raw.githubusercontent.com/ioBroker/ioBroker.admin/master/io-package.json",
    "icon": "https://raw.githubusercontent.com/ioBroker/ioBroker.admin/master/admin/admin.png",
    "type": "general"
  },
```

For **stable** (sources-dist-stable.json):

```
  "admin": {
    "meta": "https://raw.githubusercontent.com/ioBroker/ioBroker.admin/master/io-package.json",
    "icon": "https://raw.githubusercontent.com/ioBroker/ioBroker.admin/master/admin/admin.png",
    "type": "general",
    "version": "2.0.7"
  },
```

*Note*: stable has always specific version.
