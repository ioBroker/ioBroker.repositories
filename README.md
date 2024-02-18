# ioBroker.repositories

This is GitHub project for storage of latest and stable repositories.

![last refresh beta](https://img.shields.io/badge/dynamic/json?color=green&label=last%20refresh%20%28beta%29&query=%24.date&url=https%3A%2F%2Frepo.iobroker.live%2Fsources-dist-latest-hash.json) ![last refresh stable](https://img.shields.io/badge/dynamic/json?color=green&label=last%20refresh%20%28stable%29&query=%24.date&url=https%3A%2F%2Frepo.iobroker.live%2Fsources-dist-hash.json)

## Update of the version in stable
1. Be sure that the version is tested in forum by users, or you fix the critical bug with that.
2. Delete the `versionTime`, if exists

## Add a new adapter to the latest repository
1. Fork this repo and clone your fork
2. Run `npm i`
3. Run `npm run addToLatest -- --name <adapter-name> --type <adapter-type>`  
    (replace `<adapter-name>` with your adapter's name (without 'iobroker.' prefix) and `<adapter-type>` with the adapter type)
4. Push a commit with the changes to `sources-dist.json`
5. Create a PR

## Add a new adapter to the latest repository (web frontend)
1. Go to [iobroker.dev](https://www.iobroker.dev/)
2. Log in with GitHub
3. Open the new adapter
4. Click on manage
5. Click on action "ADD TO LATEST"

## Requirements for adapter to get added to the latest repository
*Already required for the latest repository*

1. Your GitHub repository must have the name - `ioBroker.<adaptername>`. **B** is capital in "ioBroker", but in the `package.json` the *name* must be low case, because npm does not allow upper case letters. Your repository must have "topics". Add these with `Manage topics`.
2. Do not use in the title the words `ioBroker` or `Adapter`. It is clear anyway that this adapter is for ioBroker.
3. `title` in `io-package.json` (`common`) is simple short name of adapter in english. `titleLang` is object that consists short names in many languages. `Lang` ist not german `Länge`, but english `LANGuages`.
4. Adapter needs to have a `README.md` with description, detail information and changelog. English is mandatory. Other languages are welcome. See [Example of README.md](#example-of-readme-md).

   **In `README.md`, there must be a link to the device or the manufacturer's website. Devices must have a photo. Services do not require a photo, but are still welcome.**
5. Adapter must have a predefined license.
6. Please remove `www`, `widgets` and `docs` directories (`admin/tab_m.html`, `admin/custom_m.html`) if not used.
7. Adapter needs to have at least Adapter basic testing (installing, running) using GitHub actions. More information in Forum from `apollon77` (Just take from other adapters the samples)
8. Define one of the types in `io-package.json`. See details [here](#types)
9. Define one of the connection types (if applied) in `io-package.json`. See details [here](#connection-types)
10. All states must have the according [valid roles](https://github.com/ioBroker/ioBroker/blob/master/doc/STATE_ROLES.md#state-roles) (and not just "state")
11. Include `author` in `io-package.json` and `authors` in `io-package.json`. See [here](#authors).
12. Adapter needs to be available as package on `npmjs.com`. See [How to publish on npm](#how-to-publish-on-npm)
13. `iobroker` organisation must be added as an owner to `npm` package. [Why and how to do that.](#add-owner-to-packet)
14. Add your adapter into the list (first latest and after that into stable, when tested).
   Examples of entries you can find [here](#samples).
15. No new adapters will be accepted to repo without `admin3` Configuration dialog. `Admin2` dialog is optional!
16. Port attribute must have name `port`. 
17. Check and follow the coding best practices listed [below](#development-and-coding-best-practices).

*Note:* you can watch the video about it (only german) on [YouTube](https://www.youtube.com/watch?v=7N8fsJcAdlE)
*Note:* There is a helper https://adapter-check.iobroker.in/ to check many points automatically. Just place your GitHub adapter repo there, e.g. `https://github.com/ioBroker/ioBroker.admin` and press enter or on the check button.

## Development and Coding best practices
* Best use the adapter creator (https://github.com/ioBroker/create-adapter) or get a fresh relevant version from the Template Repository (https://github.com/ioBroker/ioBroker.template) to start coding to always get the latest basic version and also updates. You should not always copy basic files from former adapters!
* Do not copy a `package.json` or `io-package.json` after an installation because some fields might have been added on installation! e.g. io-package with common.installedFrom eds to be removed
* **Use the Adapter Checker and fix all issues shown there: https://adapter-check.iobroker.in/**
* Respect Object and state definitions, types and roles Values not defined here should not be used. Discussions about missing roles or types are welcome:
  * https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/objectsschema.md#object-types
  * https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
* Only commit `.vscode`, `.idea` or other IDE files/helper directories to GitHub if there is a need to. This is to prevent the other user's settings from interfering with yours or make PRs more complex because of this.
* If you do not need `stateChange/objectChange/message` please do not implement it
* if you need to store passwords, please encrypt them. This can be done by just configuration:
  * Add an array with the relevant config field names in `io-package.json` in `encryptedNative`. Additionally, please also protect the access to this field by also providing `protectedNative` (see e.g. https://github.com/TA2k/ioBroker.psa/blob/master/io-package.json#L81-L82)
  * Additionally, you need to provide a dependency to `js-controller >= 3.0.0` and `admin >= 4.0.9` (Admin needs to be a `globalDependency`, see https://github.com/TA2k/ioBroker.psa/blob/master/io-package.json#L75-L80 and https://github.com/TA2k/ioBroker.psa/blob/master/io-package.json#L70-L74)
  * That's it. Encryption before storing the fields and decryption before adapter is executed is done automatically.
  * If you have an older implementation that uses encrypt/decrypt functions in `index(_m).html` and in `main.js` you can just convert to this by removing the extra encrypt/decrypt usages in all places and do the above.
* add all editable fields from `index_m.html` to `io-package.json` `native` with their default values
* **You need to make sure to clean up ALL resources in `unload`. Clear all Timers, Intervals, close serial ports and servers and end everything. Else this will break the compact mode** (or also see next point!)
* Use `adapter.setTimeout/setInterval` and corresponding clear Methods to create timers and intervals that are automatically cleaned up when the adapter gets unloaded and make sure to not start new timers/intervals after adapter is stopped already. This can help in many cases and is near to a drop-in replacement for Timers from `Node.js` (but it is NOT an object, so the methods on Timer objects will not work!)
* **Please test in compact mode!** Especially starting, running, stopping adapter and verify that nothing runs any longer and no logs are triggered and also a new start works.
* Be careful with `setObject` because it overwrites the object and (especially in `js-controller < 2.2`) custom settings like history may be removed by this! Use `setObjectNotExists` or read the object to detect if it exists and use `extendObject` to update.
* get familiar with the `ack` concept of ioBroker. Adapters normally set all "final" values with `ack=true` and these are mostly ignored in `onStateChange` handlers. `ack=false` are commands that normally are handled by Adapters.
* Do not use `process.exit()` because this breaks compact mode. Use `adapter.terminate()` if the method is available.
* If you consider using a scheduling library in conjunction with external/cloud services, then consider the potential consequences! If your adapter becomes successful, then all users will do their calls to the external service in the exact same second. This can become a DOS stile "attack" to that server with bad consequences. Additionally, to that using a Scheduling library just to implement intervals is overkill :-) setInterval/setTimeout should be completely sufficient AND has a good side effect that requests are not done all at the same second, but start when the adapter starts.
* When using Intervals together with external communication, think about timeout and error cases - an interval triggers the next call also if the last has not finished. So requests might pile up and you DOS the external API. A better practice might be to use `setTimeout` and set at the end of one call for the next call
* If you use connections to other systems (Websockets, MQTT, TCP, Serial or other) please also implement the `info.connection` state (directly create objects by including in io-package) and set the connection value accordingly. Using this enables Admin to differentiate the status between green (ok, running), yellow (basically running but not connected) and red (not running).
* Consider and understand the asynchronous nature of JavaScript and make sure to know what will happen in parallel and what makes more sense to be sequential! It is ok to use `callbacks` or `Promises/async/await` - the later makes it easier to understand and control how your code really flows.
* Consider using ESLint or other JavaScript code and type checker to see errors in your code before releasing a new version.
* **Please activate adapter testing with at least package- and integration-tests on GitHub Actions**
* The adapter testing using GitHub Actions is not for us - it is for you! Please check it after pushing changes to GitHub and before telling it to users or publish an NPM package. If testing is "red" you should check the testing log to see what is broken.
* If you like to increase testing, you can start implementing adapter specific tests that always run when you push changes to GitHub.
* You can/should use https://translator.iobroker.in/ to auto translate all relevant texts into all needed languages by providing the english text
* If an adapter instance wants to generate an object structure, it should use objects from the type device, channel or folder to define sub-structures and provide objects of type state only on the last "level". Different levels can be separated by a ".". An object of the type "state" should never have more objects below it. The allowed fields for the relevant object types are documented in https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/objectsschema.md#core-concept
* If an adapter opens a port or bind socket to some IP-address, the attributes must be called `port` and `bind` (`v6bind` for IPv6).
* If an adapter connects to some IP-address, the IP attribute may be not called `bind` (use `ip` for that).

## Add a new adapter to the stable repository
1. Fork this repo and clone your fork
2. Run `npm i`
3. Run `npm run addToStable -- --name <adapter-name> --version <stable-version>`  
    (replace `<adapter-name>` with your adapter's name and `<stable-version>` with the version that should be added to the stable repo)
4. Push a commit with the changes to `sources-dist-stable.json`
5. Create a PR

### Requirements for adapter to get added to the stable repository

Additionally, to all above listed points:

1. The adapter must have been added to the latest repository previously.
2. Forum thread with question to test the adapter.
3. Some feedback on [forum](http://forum.iobroker.net).
4. **Important** Discovery function! If a device can be found automatically (USB, IP) it should be implemented in discovery adapter after (Discovery PR will be merged after stable acceptance).

## Common Rules and Requirements for Commercial Adapters Requiring a License
ioBroker GmbH sponsors all infrastructure and services necessary for the smooth functioning of the ioBroker world. This encompasses the repository, central components, and platforms such as the Forum. While the usage of open-source "non-commercial" adapters is entirely free, the scenario changes when adapters necessitate a purchase.

For an optimal experience, it is recommended to procure licenses through the official ioBroker Website. The ioBroker GmbH facilitates license management and provides secure components for seamless integration into the adapter. In return for this service, a standard share of 30% of revenues is remitted to ioBroker GmbH. For further information or inquiries, please reach out to info@iobroker.net.

In cases where purchases are managed by the developer directly, and the adapter is intended for inclusion in the repository, a service fee of typically 15% of the revenue is applicable. For details and negotiations regarding this arrangement, please also contact info@iobroker.net.

## How-to
### How to publish on npm

https://docs.npmjs.com/getting-started/publishing-npm-packages

### Add an owner to a packet
We are really happy that other developers are contributing to ioBroker. But some of them with the time lost the enthusiasm and stopped support and maintaining the adapter.

There is no problem with GitHub repository. We can just fork it and maintain it in our organisation, but the situation with `npm` is different.

If some name is blocked (e.g., `iobroker.rpi`) we cannot publish the changed adapter under the same name, we must change the name to e.g., iobroker.rpi2.

Then we must change the ioBroker repositories, and the user must install the new adapter and migrate the old settings and objects into new adapter.

This is not suitable.

Because of that, we ask you to give ioBroker organisation publish rights to update the npm package. We will use it only in emergency, or if the author does not react to our requests.

To add the ioBroker organisation to npm packet, you must write the following after the packet is published:

`npm access grant read-write iobroker:developers iobroker.<adaptername>`

If the command does not work, just add `bluefox` as an owner.

`npm owner add bluefox iobroker.<adaptername>`

Attention: bluefox must accept the invite. This might last a day or two. So please be patient until the invite has been accepted. If invite expires, please retry (send a second invite).

### Example of README.md

https://github.com/ioBroker/ioBroker.admin/blob/master/README.md

Much better is to write documentation separately for every language like here:

https://github.com/ioBroker/ioBroker.admin/blob/master/io-package.json#L171

and the files are here https://github.com/ioBroker/ioBroker.admin/tree/master/docs

And make the link in your readme file to these files, like here: https://github.com/ioBroker/ioBroker.javascript/blob/master/README.md

### Licenses
The following licenses are used now in ioBroker project:

* `MIT` (used for most of the adapters and core)
* `Apache 2.0`
* `CC-BY`
* `OFL-1.1`
* `EPL`
* `LGPL`
* `GPLv3`
* `GPLv2`
* `CC-BY-NC`
* `CC-BY-NC-SA`

You can choose the suitable license here: https://ufal.github.io/public-license-selector/

Of course, you can add your own licenses, even WTFPL.

You must, of course, take in count the licenses of components that are used in your adapter. E.g., if you use the main packet under GPLv2 license, you cannot make CC-BY-NC from that.

### Testing
The Adapter Creator will create all needed files and deps for the testing, see also https://github.com/ioBroker/ioBroker.example/tree/master/JavaScript/test .  Tests are then run by GitHub Action (also pre-generated)
    
### Types
The `io-package.json` must have an attribute type in common part.
An example can be seen [here](https://github.com/ioBroker/ioBroker.template/blob/1e48d01e69c9ad15c70ab8dced572a4d6882ae0d/io-package.json#L76):

- `alarm` - security of home, car, boat, ...
- `climate-control` - climate, heaters, air filters, water heaters, ...
- `communication` - deliver data for other services via RESTapi, websockets
- `date-and-time` - schedules, calendars, ...
- `energy` - energy metering
- `metering` - other, but energy metering (water, gas, oil, ...)
- `garden` - mower, springs, ...
- `general` - general purpose adapters, like admin, web, discovery, ...
- `geoposition` - geo-positioning. These adapters deliver or accept the position of other objects or persons.
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
- `visualization-icons` - icons for visualization
- `visualization-widgets` - iobroker.vis widgets
- `weather` - weather info, air quality, environment statistics

You can see the types of existing adapters [here](http://download.iobroker.net/list.html#sortCol=type&sortDir=0) and try to find the similar one.

### Connection types
If your adapter controls some device/car/house the adapter could be connected with various methods and receive data via different protocols.

Define `connectionType` in `common` part of `io-package.json` as:
- `local` - if the communication with device does not require cloud access.
- `cloud` - if the communication is via cloud.

Define `dataSource` in `common` as:
- `poll` - Querying the status means that an update may be noticed later.
- `push` - ioBroker will be notified when a new status is available.
- `assumption` - The status of the device cannot be determined. ioBroker takes status based on last ioBroker command.

#### Defined categories for non-repo adapters
* `pilight` -	 iot-systems
* `samsung2016` -	multimedia
* `viessmann`	- climate-control
* `vuplus` - multimedia

### Authors
Please define the following attributes in `package.json` :
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

*Note*: stable always has a specific version.

## Automatic pull request checker
On every pull request to the repository, the GitHub Action will be triggered (see [check.yml](.github/workflows/check.yml) ). It will check the following things:
- Detect which adapters are changed by analysing the diff of changed files (See `detectAffectedAdapter` in [lib/check.js](lib/check.js))
- Run an adapter checker from `@iobroker/repochecker` for each changed adapter.
- Add the comments to PR with the results of the checks.

## Issues to move the latest version of adapter to stable
Every night the GitHub Action will be triggered at 3:15 (see [stable.yml](.github/workflows/stable.yml) ). It will check the following things:
- If the latest version is good enough for stable and will create an issue if yes (See [lib/readyForStable.js](lib/readyForStable.js))

## How is the repository build? 
The repository is build executing `npm run build`. However, this is currently only done on a dedicated server running on AWS.
However, before build the repository is pulled and thus uses the code from the repository. Hence, modifications how the repo is 
built should be made against this repository. 
