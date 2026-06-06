'use strict';

/**
 * checkObjectStructure.js
 *
 * GitHub Actions script triggered by:
 *   - workflow_dispatch  (manual, PR number supplied via env PR_NUMBER)
 *   - pull_request_target (opened / synchronize / reopened)
 *   - issue_comment       (created / edited on a PR)
 *
 * What it does:
 *   1. Fetches the PR body and all PR comments.
 *   2. Collects all previous checkObjectStructure bot comments (identified by
 *      the sentinel marker <###checkObjectStructure comment###>).
 *   3. Scans every body for GitHub user-attachment *.json links.
 *   4. Determines the latest attachment and, for non-manual triggers, checks
 *      whether a checkObjectStructure comment already exists that is *newer*
 *      than that attachment.  If so the run is skipped (no duplicate work).
 *   5. Downloads the latest JSON file and logs its content.
 *   6. Runs the structure check and posts a new comment.
 *   7. Deletes all previously existing checkObjectStructure comments so only
 *      the freshly posted one remains.
 *   8. Attaches the label "must be fixed" to the PR when errors or warnings
 *      are detected.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const axios = require('axios');

const { addComment, addLabel, deleteComment, getAllComments, getGithub } = require('./common');
const { checkObjectStructure } = require('@iobroker/repochecker/lib/objectStructure');

// ─────────────────────────────────────────────────────────────────────────────
// Sentinel that identifies a comment written by this script.
// Must appear verbatim in the comment body.
// ─────────────────────────────────────────────────────────────────────────────
const COMMENT_SENTINEL = '<###checkObjectStructure comment###>';

// Label attached to the PR when the check reports any error or warning.
const LABEL_MUST_FIX = 'must be fixed';

// ── Error / warning explanation texts ────────────────────────────────────────
//
// Primary key : error / warning code as emitted by objectStructure.js
// Each entry has:
//   en  – detailed explanation in English (why it occurs, how to fix it)
//   de  – same information in German
//
// Formatting rules
//   • "Fix:" is written as "**Fix:**" and is preceded by two spaces + \n so
//     it always starts on a new line in rendered Markdown.
//   • "Lösung:" follows the same pattern.
//
const ERROR_EXPLANATIONS = {
    // ── E1xxx  State common-block validation ─────────────────────────────

    E1001: {
        en: 'The `common` property of a state object must be a plain JSON object `{}`.'
          + ' This error occurs when `common` is missing entirely, is set to `null`, is an array,'
          + ' or is a primitive value such as a string or number.\n\n'
          + '**Fix:** Make sure every state entry in your object dump has a `common` key whose value is a `{}` object.',
        de: 'Die `common`-Eigenschaft eines State-Objekts muss ein einfaches JSON-Objekt `{}` sein.'
          + ' Dieser Fehler tritt auf, wenn `common` vollständig fehlt, `null` ist, ein Array ist'
          + ' oder ein primitiver Wert wie eine Zeichenkette oder Zahl ist.\n\n'
          + '**Lösung:** Stelle sicher, dass jeder State-Eintrag im Objekt-Dump einen `common`-Schlüssel besitzt, dessen Wert ein `{}`-Objekt ist.',
    },

    E1002: {
        en: 'The `common` block contains one or more keys that are not defined in the ioBroker state schema.'
          + ' Unknown keys are not allowed because they may cause unexpected behaviour in the ioBroker runtime.\n\n'
          + '**Fix:** Remove the listed keys from `common`, or check the ioBroker documentation to see whether'
          + ' a similarly named key with the correct spelling exists.',
        de: 'Der `common`-Block enthält einen oder mehrere Schlüssel, die im ioBroker-State-Schema nicht definiert sind.'
          + ' Unbekannte Schlüssel sind nicht erlaubt, da sie im ioBroker-Runtime unerwartetes Verhalten verursachen können.\n\n'
          + '**Lösung:** Entferne die aufgelisteten Schlüssel aus `common`, oder prüfe in der ioBroker-Dokumentation,'
          + ' ob ein ähnlich benannter Schlüssel mit korrekter Schreibweise existiert.',
    },

    E1003: {
        en: 'A required key is missing from the `common` block of the state.'
          + ' The ioBroker state schema mandates certain keys (e.g. `type`, `role`, `read`, `write`, `name`)'
          + ' to be present on every state object.\n\n'
          + '**Fix:** Add the missing key with an appropriate value as documented in the ioBroker object schema.',
        de: 'Im `common`-Block des States fehlt ein erforderlicher Schlüssel.'
          + ' Das ioBroker-State-Schema schreibt vor, dass bestimmte Schlüssel (z. B. `type`, `role`, `read`, `write`, `name`)'
          + ' in jedem State-Objekt vorhanden sein müssen.\n\n'
          + '**Lösung:** Füge den fehlenden Schlüssel mit einem geeigneten Wert gemäß der ioBroker-Objektschema-Dokumentation hinzu.',
    },

    E1004: {
        en: 'A key in the `common` block has a value of the wrong JavaScript type.'
          + ' For example, `common.read` must be a boolean, not a string `"true"`.\n\n'
          + '**Fix:** Check the type requirement listed in the error message and adjust the value accordingly.',
        de: 'Ein Schlüssel im `common`-Block hat einen Wert des falschen JavaScript-Typs.'
          + ' Zum Beispiel muss `common.read` ein Boolean sein, nicht die Zeichenkette `"true"`.\n\n'
          + '**Lösung:** Prüfe die im Fehlertext genannte Typanforderung und passe den Wert entsprechend an.',
    },

    E1005: {
        en: 'A key that is only valid for specific values of `common.type` has been used with an incompatible type.'
          + ' Some `common` fields such as `common.min`, `common.max`, or `common.unit` are only meaningful'
          + ' for certain state types (e.g. `number`).\n\n'
          + '**Fix:** Either remove the key, or change `common.type` to one of the types listed in the error message.',
        de: 'Ein Schlüssel, der nur für bestimmte Werte von `common.type` gültig ist, wurde mit einem inkompatiblen Typ verwendet.'
          + ' Einige `common`-Felder wie `common.min`, `common.max` oder `common.unit` sind nur für bestimmte State-Typen (z. B. `number`) sinnvoll.\n\n'
          + '**Lösung:** Entferne entweder den Schlüssel oder ändere `common.type` auf einen der im Fehlertext aufgeführten Typen.',
    },

    E1006: {
        en: 'The value of a `common` key does not match the declared `common.type` of the state.'
          + ' For instance, if `common.type` is `"number"` then `common.def` (the default value) must also be a number.\n\n'
          + '**Fix:** Ensure that type-dependent values are consistent with `common.type`.',
        de: 'Der Wert eines `common`-Schlüssels stimmt nicht mit dem deklarierten `common.type` des States überein.'
          + ' Wenn `common.type` beispielsweise `"number"` ist, muss auch `common.def` (der Standardwert) eine Zahl sein.\n\n'
          + '**Lösung:** Stelle sicher, dass typabhängige Werte mit `common.type` übereinstimmen.',
    },

    E1007: {
        en: '`common.name` must be either a plain string or an i18n object whose values are all strings'
          + ' (e.g. `{ "en": "Temperature", "de": "Temperatur" }`).'
          + ' Passing a number, boolean, array, or nested object is not allowed.'
          + ' The same rule applies to `common.desc` and any other i18n-capable field.\n\n'
          + '**Fix:** Set the field to a string or to a flat object with language-code keys (e.g. `en`, `de`) and string values.'
          + ' Keys in the i18n object must not be unknown language codes, and every value must be a string.',
        de: '`common.name` muss entweder eine einfache Zeichenkette oder ein i18n-Objekt sein, dessen Werte allesamt Zeichenketten sind'
          + ' (z. B. `{ "en": "Temperature", "de": "Temperatur" }`).'
          + ' Eine Zahl, ein Boolean, ein Array oder ein verschachteltes Objekt ist nicht erlaubt.'
          + ' Dieselbe Regel gilt für `common.desc` und andere i18n-fähige Felder.\n\n'
          + '**Lösung:** Setze das Feld auf eine Zeichenkette oder auf ein flaches Objekt mit Sprachcode-Schlüsseln (z. B. `en`, `de`) und Zeichenkettenwerten.'
          + ' Schlüssel im i18n-Objekt dürfen keine unbekannten Sprachcodes sein, und jeder Wert muss eine Zeichenkette sein.',
    },

    E1008: {
        en: 'The value assigned to `common.role` is not listed in the ioBroker role catalogue.'
          + ' Roles must exactly match one of the predefined identifiers (e.g. `"switch"`, `"value.temperature"`).\n\n'
          + '**Fix:** Choose a valid role from the ioBroker documentation, or use a well-known prefix such as `"value."`'
          + ' if the checker supports prefix matching for that category.',
        de: 'Der in `common.role` angegebene Wert ist nicht im ioBroker-Rollenkatalog aufgeführt.'
          + ' Rollen müssen exakt einem der vordefinierten Bezeichner entsprechen (z. B. `"switch"`, `"value.temperature"`).\n\n'
          + '**Lösung:** Wähle eine gültige Rolle aus der ioBroker-Dokumentation, oder verwende ein bekanntes Präfix wie `"value."`,'
          + ' sofern der Prüfer für diese Kategorie Präfix-Matching unterstützt.',
    },

    E1009: {
        en: 'The chosen `common.role` does not support the `common.type` that has been declared for this state.'
          + ' Each role in ioBroker carries a list of compatible data types; assigning an incompatible type'
          + ' leads to incorrect behaviour in visualisations and automations.\n\n'
          + '**Fix:** Either change `common.type` to one of the types accepted by this role, or choose a different role'
          + ' that is designed for the desired data type.',
        de: 'Die gewählte `common.role` unterstützt den für diesen State deklarierten `common.type` nicht.'
          + ' Jede Rolle in ioBroker hat eine Liste kompatibler Datentypen; die Zuweisung eines inkompatiblen Typs'
          + ' führt zu falschem Verhalten in Visualisierungen und Automatisierungen.\n\n'
          + '**Lösung:** Ändere entweder `common.type` auf einen der von dieser Rolle akzeptierten Typen oder wähle eine andere Rolle,'
          + ' die für den gewünschten Datentyp ausgelegt ist.',
    },

    E1010: {
        en: 'The `common.read` flag does not match the value required by the assigned role.'
          + ' For example, a pure write-only role such as a command button requires `common.read = false`.\n\n'
          + '**Fix:** Set `common.read` to the value shown in the error message, or choose a role that matches'
          + ' the intended read/write semantics of your state.',
        de: 'Das Flag `common.read` stimmt nicht mit dem von der zugewiesenen Rolle geforderten Wert überein.'
          + ' Eine reine Schreibrolle wie eine Befehlstaste erfordert beispielsweise `common.read = false`.\n\n'
          + '**Lösung:** Setze `common.read` auf den im Fehlertext angezeigten Wert, oder wähle eine Rolle,'
          + ' die der beabsichtigten Lese-/Schreib-Semantik deines States entspricht.',
    },

    E1011: {
        en: 'The `common.write` flag does not match the value required by the assigned role.'
          + ' For example, a read-only sensor value requires `common.write = false`.\n\n'
          + '**Fix:** Set `common.write` to the value shown in the error message, or choose a role that matches'
          + ' the intended read/write semantics of your state.',
        de: 'Das Flag `common.write` stimmt nicht mit dem von der zugewiesenen Rolle geforderten Wert überein.'
          + ' Ein reiner Sensor-Lesewert erfordert beispielsweise `common.write = false`.\n\n'
          + '**Lösung:** Setze `common.write` auf den im Fehlertext angezeigten Wert, oder wähle eine Rolle,'
          + ' die der beabsichtigten Lese-/Schreib-Semantik deines States entspricht.',
    },

    // ── E2xxx  Hierarchy order validation ────────────────────────────────

    E2001: {
        en: 'An object hierarchy mixes hierarchy-typed objects (device, channel, folder) with non-hierarchy'
          + ' objects (e.g. state or meta) at the same nesting level.'
          + ' ioBroker requires that structural container objects form an unbroken chain before leaf states appear.\n\n'
          + '**Fix:** Ensure that every intermediate node in the id path is of a hierarchy type'
          + ' (device → channel → state), and that no state or meta object acts as a parent.',
        de: 'Eine Objekthierarchie mischt Objekte vom Hierarchietyp (device, channel, folder) mit Nicht-Hierarchieobjekten'
          + ' (z. B. state oder meta) auf derselben Verschachtelungsebene.'
          + ' ioBroker erfordert, dass strukturelle Container-Objekte eine ununterbrochene Kette bilden, bevor Leaf-States erscheinen.\n\n'
          + '**Lösung:** Stelle sicher, dass jeder Zwischenknoten im ID-Pfad einen Hierarchietyp hat'
          + ' (device → channel → state) und dass kein State- oder Meta-Objekt als Elternobjekt fungiert.',
    },

    E2002: {
        en: 'More than one `device` object appears along the same object id chain.'
          + ' ioBroker allows at most one device per hierarchy branch.\n\n'
          + '**Fix:** Restructure the hierarchy so that each branch contains only a single device'
          + ' and uses channels to sub-divide it further.',
        de: 'Entlang desselben Objekt-ID-Pfads tritt mehr als ein `device`-Objekt auf.'
          + ' ioBroker erlaubt höchstens ein Device pro Hierarchiezweig.\n\n'
          + '**Lösung:** Strukturiere die Hierarchie so um, dass jeder Zweig nur ein einziges Device enthält'
          + ' und Channels zur weiteren Unterteilung verwendet.',
    },

    E2003: {
        en: 'A `device` object appears after a `channel` object in the same hierarchy chain.'
          + ' The required order is: device → channel → state.\n\n'
          + '**Fix:** Move the device object so that it appears above (i.e. at a shorter id path than)'
          + ' any channel objects in the same branch.',
        de: 'Ein `device`-Objekt erscheint nach einem `channel`-Objekt im selben Hierarchiepfad.'
          + ' Die erforderliche Reihenfolge lautet: device → channel → state.\n\n'
          + '**Lösung:** Verschiebe das Device-Objekt so, dass es oberhalb (d. h. mit einem kürzeren ID-Pfad als)'
          + ' aller Channel-Objekte desselben Zweigs erscheint.',
    },

    E2004: {
        en: 'A `state` object has child objects beneath it in the id tree.'
          + ' States are leaf nodes and must not act as parents of other objects.\n\n'
          + '**Fix:** Convert the state into a channel or folder, or move the child objects'
          + ' to a parallel path that does not descend from a state.',
        de: 'Ein `state`-Objekt hat untergeordnete Objekte in der ID-Hierarchie.'
          + ' States sind Blattknoten und dürfen nicht als Elternobjekte anderer Objekte fungieren.\n\n'
          + '**Lösung:** Wandle den State in einen Channel oder Ordner um, oder verschiebe die untergeordneten Objekte'
          + ' auf einen parallelen Pfad, der nicht von einem State abstammt.',
    },

    // ── E3xxx  Object dump / root-level validation ────────────────────────

    E3001: {
        en: 'The uploaded file does not contain a plain JSON object at the root level.'
          + ' A valid ioBroker object dump must be a single `{}` object where every key is an object id'
          + ' and every value is the corresponding ioBroker object record.\n\n'
          + '**Fix:** Make sure your export produces a top-level JSON object and not an array, string, or other value.',
        de: 'Die hochgeladene Datei enthält auf der obersten Ebene kein einfaches JSON-Objekt.'
          + ' Ein gültiger ioBroker-Objekt-Dump muss ein einzelnes `{}`-Objekt sein, bei dem jeder Schlüssel eine Objekt-ID'
          + ' und jeder Wert der zugehörige ioBroker-Objektdatensatz ist.\n\n'
          + '**Lösung:** Stelle sicher, dass dein Export ein JSON-Objekt auf oberster Ebene erzeugt'
          + ' und kein Array, keine Zeichenkette oder einen anderen Wert.',
    },

    E3002: {
        en: 'A root-level entry in the object dump is invalid: either its value is not a plain object,'
          + ' or its `_id` field does not match the key under which it is stored.'
          + ' Every entry must satisfy `dump[id]._id === id`.\n\n'
          + '**Fix:** Check the export logic to ensure that each object is stored under its own `_id`'
          + ' and that the `_id` field is present and correct.',
        de: 'Ein Eintrag auf der obersten Ebene des Objekt-Dumps ist ungültig: Entweder ist sein Wert kein einfaches Objekt,'
          + ' oder sein `_id`-Feld stimmt nicht mit dem Schlüssel überein, unter dem es gespeichert ist.'
          + ' Jeder Eintrag muss `dump[id]._id === id` erfüllen.\n\n'
          + '**Lösung:** Prüfe die Export-Logik, um sicherzustellen, dass jedes Objekt unter seiner eigenen `_id`'
          + ' gespeichert ist und das `_id`-Feld vorhanden und korrekt ist.',
    },

    E3003: {
        en: 'Due to earlier structural errors (see E3002), the file cannot be interpreted as a valid'
          + ' ioBroker object dump and further processing was aborted.\n\n'
          + '**Fix:** Resolve all E3002 errors first, then re-upload the corrected file.',
        de: 'Aufgrund früherer Strukturfehler (siehe E3002) kann die Datei nicht als gültiger'
          + ' ioBroker-Objekt-Dump interpretiert werden, und die weitere Verarbeitung wurde abgebrochen.\n\n'
          + '**Lösung:** Behebe zunächst alle E3002-Fehler und lade dann die korrigierte Datei erneut hoch.',
    },

    E3004: {
        en: 'A required top-level key is missing from an ioBroker object record.'
          + ' Every object must contain the keys defined in the root object schema'
          + ' (typically `_id`, `type`, `common`, and `native`).\n\n'
          + '**Fix:** Add the missing key to the object, providing an appropriate value.',
        de: 'Ein erforderlicher Schlüssel fehlt auf der obersten Ebene eines ioBroker-Objektdatensatzes.'
          + ' Jedes Objekt muss die im Root-Objekt-Schema definierten Schlüssel enthalten'
          + ' (in der Regel `_id`, `type`, `common` und `native`).\n\n'
          + '**Lösung:** Füge den fehlenden Schlüssel mit einem geeigneten Wert zum Objekt hinzu.',
    },

    E3005: {
        en: 'A top-level key of an ioBroker object record has the wrong JavaScript type, or a key that is'
          + ' only valid for `state` objects is present on an object of a different type.'
          + ' For example, `native` must always be a plain object `{}`, `type` must be a string,'
          + ' and state-only keys such as `val` must not appear on channel or device objects.\n\n'
          + '**Fix:** Correct the value of the listed key so that its JavaScript type matches the schema expectation,'
          + ' or remove the key if it does not belong on this object type.',
        de: 'Ein Schlüssel auf der obersten Ebene eines ioBroker-Objektdatensatzes hat den falschen JavaScript-Typ,'
          + ' oder ein Schlüssel, der nur für `state`-Objekte gültig ist, ist auf einem Objekt eines anderen Typs vorhanden.'
          + ' Beispielsweise muss `native` immer ein einfaches Objekt `{}` sein, `type` eine Zeichenkette,'
          + ' und state-spezifische Schlüssel wie `val` dürfen nicht auf Channel- oder Device-Objekten erscheinen.\n\n'
          + '**Lösung:** Korrigiere den Wert des aufgeführten Schlüssels so, dass sein JavaScript-Typ der Schema-Erwartung entspricht,'
          + ' oder entferne den Schlüssel, falls er für diesen Objekttyp nicht vorgesehen ist.',
    },

    E3006: {
        en: 'An ioBroker object record contains one or more keys at the root level that are not part of'
          + ' the defined object schema. Extra root keys are not permitted.\n\n'
          + '**Fix:** Remove the listed keys from the object record. If you believe a key is legitimate,'
          + ' check whether it belongs inside `common` or `native` instead.',
        de: 'Ein ioBroker-Objektdatensatz enthält auf der obersten Ebene einen oder mehrere Schlüssel,'
          + ' die nicht Teil des definierten Objektschemas sind. Zusätzliche Root-Schlüssel sind nicht erlaubt.\n\n'
          + '**Lösung:** Entferne die aufgeführten Schlüssel aus dem Objektdatensatz. Falls du glaubst,'
          + ' dass ein Schlüssel berechtigt ist, prüfe, ob er stattdessen in `common` oder `native` gehört.',
    },

    E3007: {
        en: 'The `type` field of an ioBroker object is set to a value that is not in the list of allowed object types.'
          + ' Valid types include `state`, `channel`, `device`, `folder`, `enum`, `meta`, `host`, `adapter`, `instance`, etc.\n\n'
          + '**Fix:** Change `type` to one of the recognised values.',
        de: 'Das `type`-Feld eines ioBroker-Objekts ist auf einen Wert gesetzt, der nicht in der Liste der erlaubten Objekttypen steht.'
          + ' Gültige Typen sind u. a. `state`, `channel`, `device`, `folder`, `enum`, `meta`, `host`, `adapter`, `instance`.\n\n'
          + '**Lösung:** Ändere `type` auf einen der bekannten Werte.',
    },

    E3008: {
        en: 'The object id contains characters that are forbidden in ioBroker object ids.'
          + ' Allowed characters are letters (Unicode upper- and lowercase), digits, and the symbols `._-/ :!#$%&()+=@^{}|~`.'
          + ' The error message includes a suggested sanitised id.\n\n'
          + '**Fix:** Rename the object using only allowed characters.',
        de: 'Die Objekt-ID enthält Zeichen, die in ioBroker-Objekt-IDs nicht erlaubt sind.'
          + ' Erlaubte Zeichen sind Buchstaben (Unicode Groß- und Kleinschreibung), Ziffern und die Symbole `._-/ :!#$%&()+=@^{}|~`.'
          + ' Die Fehlermeldung enthält eine vorgeschlagene bereinigte ID.\n\n'
          + '**Lösung:** Benenne das Objekt um und verwende dabei nur erlaubte Zeichen.',
    },

    E3009: {
        en: 'An intermediate parent object is missing from the object dump.'
          + ' ioBroker requires that every segment of an object id path has a corresponding object in the dump.'
          + ' For example, if `adapter.0.device.channel.state` is present, then `adapter.0.device` and'
          + ' `adapter.0.device.channel` must also be present.\n\n'
          + '**Fix:** Add the missing intermediate objects with an appropriate type'
          + ' (`device`, `channel`, or `folder`) and the minimum required fields (`_id`, `type`, `common`, `native`).',
        de: 'Ein zwischengelagertes Elternobjekt fehlt im Objekt-Dump.'
          + ' ioBroker erfordert, dass jedes Segment eines Objekt-ID-Pfads ein entsprechendes Objekt im Dump besitzt.'
          + ' Wenn beispielsweise `adapter.0.device.channel.state` vorhanden ist, müssen auch `adapter.0.device` und'
          + ' `adapter.0.device.channel` vorhanden sein.\n\n'
          + '**Lösung:** Füge die fehlenden Zwischenobjekte mit einem geeigneten Typ'
          + ' (`device`, `channel` oder `folder`) und den mindestens erforderlichen Feldern (`_id`, `type`, `common`, `native`) hinzu.',
    },

    E3010: {
        en: 'A state object does not define `common.type`.'
          + ' Every state must explicitly declare its data type via `common.type`'
          + ' (one of `number`, `string`, `boolean`, `array`, `object`, `mixed`, `file`, `json`).\n\n'
          + '**Fix:** Add `common.type` with the correct value to the state\'s `common` block.',
        de: 'Ein State-Objekt definiert `common.type` nicht.'
          + ' Jeder State muss seinen Datentyp explizit über `common.type` deklarieren'
          + ' (einer von `number`, `string`, `boolean`, `array`, `object`, `mixed`, `file`, `json`).\n\n'
          + '**Lösung:** Füge `common.type` mit dem korrekten Wert zum `common`-Block des States hinzu.',
    },

    E3011: {
        en: 'The value of `common.type` is not one of the recognised ioBroker state data types.'
          + ' Valid values are: `number`, `string`, `boolean`, `array`, `object`, `mixed`, `file`, `json`.\n\n'
          + '**Fix:** Change `common.type` to one of these valid values.',
        de: 'Der Wert von `common.type` ist keiner der bekannten ioBroker-State-Datentypen.'
          + ' Gültige Werte sind: `number`, `string`, `boolean`, `array`, `object`, `mixed`, `file`, `json`.\n\n'
          + '**Lösung:** Ändere `common.type` auf einen dieser gültigen Werte.',
    },

    // ── W1xxx  i18n warnings ──────────────────────────────────────────────

    W1001: {
        en: 'An i18n object (e.g. `common.name` or `common.desc`) is missing one or more *recommended*'
          + ' language keys. The required languages `en` and `de` are already present, but ioBroker'
          + ' recommends also providing translations for: `ru`, `pt`, `nl`, `fr`, `it`, `es`, `pl`, `uk`, `zh-cn`.'
          + ' Missing translations fall back to the English value at runtime, so this is a warning rather than an error.\n\n'
          + '**Fix:** Add translations for the languages listed in the warning message.'
          + ' If providing all languages is not practical, at minimum ensure `en` and `de` are present.',
        de: 'Ein i18n-Objekt (z. B. `common.name` oder `common.desc`) enthält nicht alle *empfohlenen*'
          + ' Sprachschlüssel. Die Pflichtsprachen `en` und `de` sind vorhanden, ioBroker empfiehlt jedoch'
          + ' zusätzlich Übersetzungen für: `ru`, `pt`, `nl`, `fr`, `it`, `es`, `pl`, `uk`, `zh-cn`.'
          + ' Fehlende Übersetzungen fallen zur Laufzeit auf den englischen Wert zurück, daher handelt es sich um eine Warnung und nicht um einen Fehler.\n\n'
          + '**Lösung:** Füge Übersetzungen für die in der Warnmeldung aufgeführten Sprachen hinzu.'
          + ' Falls nicht alle Sprachen praktikabel sind, stelle mindestens sicher, dass `en` und `de` vorhanden sind.',
    },

    // ── W3xxx  Object id warnings ─────────────────────────────────────────

    W3001: {
        en: 'The object id contains characters outside the recommended set `[a-zA-Z0-9_,-]`.'
          + ' While these characters are not strictly forbidden, they can cause problems in certain'
          + ' ioBroker adapters, scripts, and visualisations that do not expect special characters in ids.\n\n'
          + '**Fix:** Consider renaming the object to use only alphanumeric characters, underscores, commas, and hyphens.',
        de: 'Die Objekt-ID enthält Zeichen außerhalb des empfohlenen Zeichensatzes `[a-zA-Z0-9_,-]`.'
          + ' Obwohl diese Zeichen nicht streng verboten sind, können sie in bestimmten'
          + ' ioBroker-Adaptern, Skripten und Visualisierungen Probleme verursachen,'
          + ' die keine Sonderzeichen in IDs erwarten.\n\n'
          + '**Lösung:** Erwäge, das Objekt umzubenennen und dabei nur alphanumerische Zeichen, Unterstriche, Kommas und Bindestriche zu verwenden.',
    },
};

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Returns true when `comment` was written by this script.
 * Detection is based on the presence of the sentinel string.
 *
 * @param {{ body: string }} comment
 */
function isOurComment(comment) {
    return typeof comment.body === 'string' && comment.body.includes(COMMENT_SENTINEL);
}

/**
 * Extract GitHub user-attachment links whose filename ends in .json.
 *
 * Only the canonical GitHub upload CDN URL is accepted:
 *   https://github.com/user-attachments/files/<numeric-id>/<name>.json
 *
 * Links to external websites, raw.githubusercontent.com, or any other
 * GitHub pages are intentionally ignored.
 *
 * @param  {string} text  Raw Markdown body.
 * @returns {{ filename: string, url: string }[]}  In document order, no duplicates.
 */
function extractJsonAttachments(text) {
    if (!text) return [];

    const UPLOAD_REGEX =
        /\[([^\]]*)\]\((https:\/\/github\.com\/user-attachments\/files\/\d+\/([^\s)]+\.json))\)/gi;

    const results = [];
    const seen    = new Set();
    let m;

    while ((m = UPLOAD_REGEX.exec(text)) !== null) {
        const url      = m[2];
        const filename = m[3];

        if (!seen.has(url)) {
            seen.add(url);
            results.push({ filename, url });
        }
    }

    return results;
}

/**
 * Download a file from `url` and save it to `destPath`.
 */
async function downloadFile(url, destPath) {
    const response = await axios({
        url,
        method:       'GET',
        responseType: 'arraybuffer',
        headers: {
            Authorization: process.env.OWN_GITHUB_TOKEN
                ? `token ${process.env.OWN_GITHUB_TOKEN}`
                : undefined,
            'user-agent': 'Action script',
        },
        maxRedirects: 10,
    });
    fs.writeFileSync(destPath, Buffer.from(response.data));
}

/**
 * Build the bilingual explanation section appended after the issue tables.
 * Only codes that were actually detected AND have an entry in ERROR_EXPLANATIONS
 * are included.  Each code appears once even if reported multiple times.
 *
 * @param {{ code: string }[]} issues  Combined errors + warnings array.
 * @returns {string}  Markdown, or empty string when nothing to explain.
 */
function buildExplanationSection(issues) {
    if (issues.length === 0) return '';

    const seen  = new Set();
    const codes = [];
    for (const { code } of issues) {
        if (!seen.has(code) && ERROR_EXPLANATIONS[code]) {
            seen.add(code);
            codes.push(code);
        }
    }

    if (codes.length === 0) return '';

    const lines = [];

    // ── English ───────────────────────────────────────────────────────────
    lines.push('---');
    lines.push('');
    lines.push('### 🇬🇧 Explanation of detected issues');
    lines.push('');
    for (const code of codes) {
        lines.push(`#### \`${code}\``);
        lines.push('');
        lines.push(ERROR_EXPLANATIONS[code].en);
        lines.push('');
    }

    // ── German ────────────────────────────────────────────────────────────
    lines.push('---');
    lines.push('');
    lines.push('### 🇩🇪 Erklärung der erkannten Probleme');
    lines.push('');
    for (const code of codes) {
        lines.push(`#### \`${code}\``);
        lines.push('');
        lines.push(ERROR_EXPLANATIONS[code].de);
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Build the full Markdown body for the PR comment.
 */
function formatComment(result, filename) {
    const lines = [];

    // Sentinel – must stay on its own line so isOurComment() finds it reliably.
    lines.push(COMMENT_SENTINEL);
    lines.push('');
    lines.push('> This is an automatic check of the object structures provided by the attached file.');
    lines.push('>');
    lines.push('>This comment contains information in English and German. / Dieser Kommentar enthält Informationen auf Englisch und Deutsch.');
    lines.push('>The German translation is provided below. / Die deutsche Übersetzung ist weiter unten zu finden.');
    lines.push('');
    lines.push(`## 🔍 Object Structure Check – \`${filename}\``);
    lines.push('');
    lines.push(`**Adapter:** \`${result.adapter}\`  |  **Objects checked:** ${result.objectCount}`);
    lines.push('');

    if (result.errors.length === 0 && result.warnings.length === 0) {
        lines.push('✅ **No errors or warnings found. Great job!**');
        return lines.join('\n');
    }

    if (result.errors.length > 0) {
        lines.push(`### ❌ Errors (${result.errors.length})`);
        lines.push('');
        lines.push('| Code | Message |');
        lines.push('|------|---------|');
        for (const { code, message } of result.errors) {
            lines.push(`| \`${code}\` | ${message.replace(/\|/g, '\\|')} |`);
        }
        lines.push('');
    }

    if (result.warnings.length > 0) {
        lines.push(`### ⚠️ Warnings (${result.warnings.length})`);
        lines.push('');
        lines.push('| Code | Message |');
        lines.push('|------|---------|');
        for (const { code, message } of result.warnings) {
            lines.push(`| \`${code}\` | ${message.replace(/\|/g, '\\|')} |`);
        }
        lines.push('');
    }

    const explanations = buildExplanationSection([...result.errors, ...result.warnings]);
    if (explanations) {
        lines.push(explanations);
    }

    return lines.join('\n');
}

/**
 * Derive the adapter name from the JSON filename.
 */
function adapterNameFromFilename(filename) {
    return filename
        .replace(/\.objects\.json$/i, '')
        .replace(/\.json$/i, '')
        .replace(/^iobroker\./i, '');
}

// ── main ──────────────────────────────────────────────────────────────────

async function doIt() {
    const prNumber  = parseInt(process.env.PR_NUMBER, 10);
    const isManual  = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';

    if (!prNumber || isNaN(prNumber)) {
        throw new Error('PR_NUMBER environment variable is missing or not a valid integer.');
    }

    let isRecheck = false;
    if (process.env.GITHUB_EVENT_PATH) {
        const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        console.log(`EVENT ${JSON.stringify(event, null, 2)}`);
        isRecheck = (event.action === 'created' && event.comment && event.comment.body && event.comment.body.trim() === 'RE-CHECK!');
    }

    console.log(`\n=== checkObjectStructure – PR #${prNumber} (trigger: ${process.env.GITHUB_EVENT_NAME}, re-check: ${isRecheck}) ===\n`);

    // ── 1. Fetch PR body + all comments ───────────────────────────────────
    const pr = await getGithub(
        `https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/${prNumber}`,
    );

    const commentsRaw = await getAllComments(prNumber);

    // ── 2. Identify existing checkObjectStructure comments ────────────────
    //       Collect them now; we delete them *after* the new comment is posted
    //       so the PR is never left without a result during the transition.
    const ourComments = commentsRaw.filter(isOurComment);
    console.log(`Found ${ourComments.length} existing checkObjectStructure comment(s).`);

    // Timestamp of the newest existing checkObjectStructure comment (0 = none).
    const latestOurCommentTs = ourComments.length > 0
        ? Math.max(...ourComments.map(c => new Date(c.created_at).getTime()))
        : 0;

    // ── 3. Collect all *.json attachments across PR body + comments ───────
    //       Skip our own bot comments when scanning (they never contain user files).
    const allAttachments = [];

    for (const att of extractJsonAttachments(pr.body || '')) {
        allAttachments.push({ ...att, timestamp: new Date(pr.created_at).getTime() });
    }

    for (const comment of commentsRaw) {
        if (isOurComment(comment)) continue; // ignore bot comments
        for (const att of extractJsonAttachments(comment.body || '')) {
            allAttachments.push({ ...att, timestamp: new Date(comment.created_at).getTime() });
        }
    }

    // ── 4. Log detected files ─────────────────────────────────────────────
    if (allAttachments.length === 0) {
        console.log('No GitHub user-attachment *.json files found in PR body or comments. Nothing to do.');
        return 'no-attachments';
    }

    console.log(`Detected ${allAttachments.length} JSON attachment(s):`);
    for (const att of allAttachments) {
        console.log(`  • ${att.filename}  [${new Date(att.timestamp).toISOString()}]  ${att.url}`);
    }

    // ── 5. Pick the latest attachment ─────────────────────────────────────
    allAttachments.sort((a, b) => b.timestamp - a.timestamp);
    const latest = allAttachments[0];
    console.log(`\nLatest attachment: ${latest.filename}  [${new Date(latest.timestamp).toISOString()}]`);

    // ── 6. Skip if already checked and not a manual run ───────────────────
    //       "Already checked" means a bot comment exists that is *newer* than
    //       the latest attachment, i.e. it was posted in response to that file.
    if (!isRecheck && !isManual && latestOurCommentTs > latest.timestamp) {
        console.log(
            `A checkObjectStructure comment (${new Date(latestOurCommentTs).toISOString()}) already exists ` +
            `for this attachment (${new Date(latest.timestamp).toISOString()}). Skipping non-manual run.`,
        );
        return 'already-checked';
    }

    if (isManual) {
        console.log('Manual trigger – skipping "already checked" guard and forcing a fresh check.');
    }

    if (isRecheck) {
        console.log('RE-CHECK requested – skipping "already checked" guard and forcing a fresh check.');
    }

    // ── 7. Download ───────────────────────────────────────────────────────
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'checkObjectStructure-'));
    const tmpFile = path.join(tmpDir, latest.filename);

    console.log(`\nDownloading to: ${tmpFile}`);
    await downloadFile(latest.url, tmpFile);
    console.log('Download complete.');

    // ── 8. Read, log, parse ───────────────────────────────────────────────
    let raw;
    try {
        raw = fs.readFileSync(tmpFile, 'utf8');
    } catch (e) {
        throw new Error(`Failed to read ${latest.filename}: ${e.message}`);
    }

    console.log(`\n──── Downloaded file content: ${latest.filename} ────`);
    console.log(raw);
    console.log('──── End of file content ────\n');

    let objects;
    try {
        objects = JSON.parse(raw);
    } catch (e) {
        throw new Error(`Failed to parse ${latest.filename} as JSON: ${e.message}`);
    }

    // ── 9. Run the structure check ────────────────────────────────────────
    const adapter = adapterNameFromFilename(latest.filename);
    console.log(`Running checkObjectStructure for adapter: "${adapter}"`);

    const result = checkObjectStructure(objects, adapter);

    console.log(`\nResult – errors: ${result.errors.length}, warnings: ${result.warnings.length}`);
    if (result.errors.length > 0) {
        console.log('\nErrors:');
        for (const e of result.errors) console.log(`  [${e.code}] ${e.message}`);
    }
    if (result.warnings.length > 0) {
        console.log('\nWarnings:');
        for (const w of result.warnings) console.log(`  [${w.code}] ${w.message}`);
    }

    // ── 10. Attach "must be fixed" label when issues are detected ─────────
    const hasIssues = result.errors.length > 0 || result.warnings.length > 0;
    if (hasIssues) {
        console.log(`\nAttaching label "${LABEL_MUST_FIX}" to PR #${prNumber}...`);
        try {
            await addLabel(prNumber, [LABEL_MUST_FIX]);
            console.log('Label attached.');
        } catch (e) {
            // Non-fatal: label may not exist in the repository yet; log and continue.
            console.warn(`Failed to attach label "${LABEL_MUST_FIX}": ${e.message || e}`);
            console.warn('Create the label in the repository settings if it does not exist yet.');
        }
    }

    // ── 11. Post new comment ──────────────────────────────────────────────
    const commentBody = formatComment(result, latest.filename);
    await addComment(prNumber, commentBody);
    console.log('\nNew comment posted successfully.');

    // ── 12. Delete all previous checkObjectStructure comments ────────────
    //        Done *after* posting so there is never a gap without a result.
    if (ourComments.length > 0) {
        console.log(`\nDeleting ${ourComments.length} previous checkObjectStructure comment(s)...`);
        for (const c of ourComments) {
            try {
                await deleteComment(prNumber, c.id);
                console.log(`  Deleted comment ${c.id}.`);
            } catch (e) {
                // Log but do not fail the whole run if a deletion doesn't succeed.
                console.warn(`  Failed to delete comment ${c.id}: ${e.message || e}`);
            }
        }
    }

    // ── 13. Cleanup ───────────────────────────────────────────────────────
    try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
        // non-fatal
    }

    return 'done';
}

console.log(`OWN_GITHUB_TOKEN length: ${(process.env.OWN_GITHUB_TOKEN || '').length}`);
console.log(`PR_NUMBER: ${process.env.PR_NUMBER}`);
console.log(`GITHUB_EVENT_NAME: ${process.env.GITHUB_EVENT_NAME}`);

doIt()
    .then(result => {
        console.log(`\nResult: ${result}`);
        process.exit(0);
    })
    .catch(e => {
        console.error(`\nFatal error: ${e.message || e}`);
        process.exit(1);
    });
