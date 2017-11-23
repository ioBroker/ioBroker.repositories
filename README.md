iobroker.repositories
===================

This is github project for storage of latest and stable repositories.

Write ```npm run update``` to just get new adapters from sources-dist.json into sources-dist-stable.json.
And write ```npm run update adapterName``` to write latest version of adapterName into sources-dist-stable.json

## Requirements for adapter to get added to the repository (already needed for latest repository)
* Adapter needs to be available as package on npm
* Adapter needs to have a README.md with description, detail informations and changelog
* Adapter needs to have at least Adapter basic testing (installing, running) using Travis-CI and Appveyor. More infos in Forum from apollon77


## Defined categories for non-repo adapters

* pilight	IoT-systems
* samsung2016	multimedia
* scriptgui	logic
* viessmann	climate-control
* vuplus	multimedia
