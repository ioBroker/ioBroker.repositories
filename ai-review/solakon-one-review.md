# Adapter Review Report

- Adapter: **ioBroker.solakon-one** (https://github.com/berto-1974/ioBroker.solakon-one)
- Checklist: **Review Checklist V2.0** (`ai-review/adapterReview.txt`)

## Successful checks

- [x] 🟢 README is primarily in English and a separate German README exists.
  - References: `README.md:1`, `README.de.md:1`

- [x] 🟢 Sensitive fields from `protectedNative`/`encryptedNative` are not present and thus not logged.
  - References: `io-package.json:118-123`

- [x] 🟢 State IDs are English and object IDs are statically defined (no external dynamic ID construction found).
  - References: `main.js:31-34`, `main.js:1490-1494`

- [x] 🟢 State/channel names and adapter description are provided via multilingual i18n objects.
  - References: `io-package.json:53-64`, `main.js:34-46`, `main.js:1520-1624`

- [x] 🟢 `onStateChange` correctly ignores acknowledged states (`ack === true`).
  - References: `main.js:1484-1488`

- [x] 🟢 No `onObjectChange` handler usage detected.
  - References: `main.js:1398-1401`

- [x] 🟢 Poll interval is bounded to reasonable values and safely below Node.js timer maximum.
  - References: `main.js:1431-1432`, `admin/jsonConfig.json:49-55`

- [x] 🟢 No cloud service polling detected (local Modbus TCP only), so cloud-randomization checks are not applicable.
  - References: `main.js:1416`, `lib/modbus.js:5-6`

## Checks needing action

- [ ] 🔴 README contains installation guidance via direct GitHub URL / “Install from URL”, which is not allowed by checklist.
  - References: `README.md:27-28`

- [ ] 🔴 Log messages are not in English (German log output in runtime code).
  - References: `main.js:1412`, `main.js:1434`, `main.js:1473`, `lib/modbus.js:64`, `lib/modbus.js:78`

- [ ] 🔴 User-facing admin text is partially German-only because translation is explicitly disabled.
  - References: `admin/jsonConfig.json:7`, `admin/jsonConfig.json:15-17`

- [ ] 🔴 Enumerated state texts are German-only (no i18n/English fallback for `common.states` labels).
  - References: `lib/registers.js:379-381`, `lib/registers.js:391-392`, `lib/registers.js:398-402`, `main.js:1680`, `main.js:1382`

- [ ] 🔴 Polling loop uses `setInterval` without overlap protection; long polls can cause concurrent executions.
  - References: `main.js:1432`, `main.js:1456-1479`
