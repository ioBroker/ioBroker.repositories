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
 *   2. Scans every text body for GitHub user-attachment links whose
 *      filename matches *.json.
 *      Only genuine GitHub file uploads are accepted:
 *        https://github.com/user-attachments/files/<id>/<name>.json
 *      Links to external websites or other GitHub pages are ignored.
 *   3. Logs every detected filename.
 *   4. If no matching attachment is found, exits silently (no PR comment).
 *   5. Downloads the *latest* (most recently attached) JSON file.
 *   6. Logs the full text content of the downloaded file.
 *   7. Passes the parsed content to @iobroker/repochecker's
 *      checkObjectStructure() and posts a formatted comment with the result.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const axios = require('axios');

const { addComment, getGithub } = require('./common');
const { checkObjectStructure }  = require('@iobroker/repochecker/lib/objectStructure');

// ── Error / warning explanation texts ─────────────────────────────────────
//
// Primary key: error / warning code as emitted by objectStructure.js
// Each entry has:
//   en  – detailed explanation in English (why it occurs, how to fix it)
//   de  – same information in German
//
const ERROR_EXPLANATIONS = {
    // ── E1xxx  State common-block validation ─────────────────────────────

    E1001: {
        en: 'The `common` property of a state object must be a plain JSON object `{}`. '
          + 'This error occurs when `common` is missing entirely, is set to `null`, is an array, '
          + 'or is a primitive value such as a string or number. '
          + 'Fix: make sure every state entry in your object dump has a `common` key whose value is a `{}` object.',
        de: 'Die `common`-Eigenschaft eines State-Objekts muss ein einfaches JSON-Objekt `{}` sein. '
          + 'Dieser Fehler tritt auf, wenn `common` vollständig fehlt, `null` ist, ein Array ist '
          + 'oder ein primitiver Wert wie eine Zeichenkette oder Zahl ist. '
          + 'Lösung: Stelle sicher, dass jeder State-Eintrag im Objekt-Dump einen `common`-Schlüssel besitzt, dessen Wert ein `{}`-Objekt ist.',
    },

    E1002: {
        en: 'The `common` block contains one or more keys that are not defined in the ioBroker state schema. '
          + 'Unknown keys are not allowed because they may cause unexpected behaviour in the ioBroker runtime. '
          + 'Fix: remove the listed keys from `common`, or check the ioBroker documentation to see whether '
          + 'a similarly named key with the correct spelling exists.',
        de: 'Der `common`-Block enthält einen oder mehrere Schlüssel, die im ioBroker-State-Schema nicht definiert sind. '
          + 'Unbekannte Schlüssel sind nicht erlaubt, da sie im ioBroker-Runtime unerwartetes Verhalten verursachen können. '
          + 'Lösung: Entferne die aufgelisteten Schlüssel aus `common`, oder prüfe in der ioBroker-Dokumentation, '
          + 'ob ein ähnlich benannter Schlüssel mit korrekter Schreibweise existiert.',
    },

    E1003: {
        en: 'A required key is missing from the `common` block of the state. '
          + 'The ioBroker state schema mandates certain keys (e.g. `type`, `role`, `read`, `write`, `name`) '
          + 'to be present on every state object. '
          + 'Fix: add the missing key with an appropriate value as documented in the ioBroker object schema.',
        de: 'Im `common`-Block des States fehlt ein erforderlicher Schlüssel. '
          + 'Das ioBroker-State-Schema schreibt vor, dass bestimmte Schlüssel (z. B. `type`, `role`, `read`, `write`, `name`) '
          + 'in jedem State-Objekt vorhanden sein müssen. '
          + 'Lösung: Füge den fehlenden Schlüssel mit einem geeigneten Wert gemäß der ioBroker-Objektschema-Dokumentation hinzu.',
    },

    E1004: {
        en: 'A key in the `common` block has a value of the wrong JavaScript type. '
          + 'For example, `common.read` must be a boolean, not a string `"true"`. '
          + 'Fix: check the type requirement listed in the error message and adjust the value accordingly.',
        de: 'Ein Schlüssel im `common`-Block hat einen Wert des falschen JavaScript-Typs. '
          + 'Zum Beispiel muss `common.read` ein Boolean sein, nicht die Zeichenkette `"true"`. '
          + 'Lösung: Prüfe die im Fehlertext genannte Typanforderung und passe den Wert entsprechend an.',
    },

    E1005: {
        en: 'A key that is only valid for specific values of `common.type` has been used with an incompatible type. '
          + 'Some `common` fields such as `common.min`, `common.max`, or `common.unit` are only meaningful '
          + 'for certain state types (e.g. `number`). '
          + 'Fix: either remove the key, or change `common.type` to one of the types listed in the error message.',
        de: 'Ein Schlüssel, der nur für bestimmte Werte von `common.type` gültig ist, wurde mit einem inkompatiblen Typ verwendet. '
          + 'Einige `common`-Felder wie `common.min`, `common.max` oder `common.unit` sind nur für bestimmte State-Typen (z. B. `number`) sinnvoll. '
          + 'Lösung: Entferne entweder den Schlüssel oder ändere `common.type` auf einen der im Fehlertext aufgeführten Typen.',
    },

    E1006: {
        en: 'The value of a `common` key does not match the declared `common.type` of the state. '
          + 'For instance, if `common.type` is `"number"` then `common.def` (the default value) must also be a number. '
          + 'Fix: ensure that type-dependent values are consistent with `common.type`.',
        de: 'Der Wert eines `common`-Schlüssels stimmt nicht mit dem deklarierten `common.type` des States überein. '
          + 'Wenn `common.type` beispielsweise `"number"` ist, muss auch `common.def` (der Standardwert) eine Zahl sein. '
          + 'Lösung: Stelle sicher, dass typabhängige Werte mit `common.type` übereinstimmen.',
    },

    E1007: {
        en: '`common.name` must be either a plain string or an i18n object whose values are all strings '
          + '(e.g. `{ "en": "Temperature", "de": "Temperatur" }`). '
          + 'Passing a number, boolean, array, or nested object is not allowed. '
          + 'Fix: set `common.name` to a string or to a flat object with language-code keys and string values.',
        de: '`common.name` muss entweder eine einfache Zeichenkette oder ein i18n-Objekt sein, dessen Werte allesamt Zeichenketten sind '
          + '(z. B. `{ "en": "Temperature", "de": "Temperatur" }`). '
          + 'Eine Zahl, ein Boolean, ein Array oder ein verschachteltes Objekt ist nicht erlaubt. '
          + 'Lösung: Setze `common.name` auf eine Zeichenkette oder auf ein flaches Objekt mit Sprachcode-Schlüsseln und Zeichenkettenwerten.',
    },

    E1008: {
        en: 'The value assigned to `common.role` is not listed in the ioBroker role catalogue. '
          + 'Roles must exactly match one of the predefined identifiers (e.g. `"switch"`, `"value.temperature"`). '
          + 'Fix: choose a valid role from the ioBroker documentation, or use a well-known prefix such as `"value."` '
          + 'if the checker supports prefix matching for that category.',
        de: 'Der in `common.role` angegebene Wert ist nicht im ioBroker-Rollenkatalog aufgeführt. '
          + 'Rollen müssen exakt einem der vordefinierten Bezeichner entsprechen (z. B. `"switch"`, `"value.temperature"`). '
          + 'Lösung: Wähle eine gültige Rolle aus der ioBroker-Dokumentation, oder verwende ein bekanntes Präfix wie `"value."`, '
          + 'sofern der Prüfer für diese Kategorie Präfix-Matching unterstützt.',
    },

    E1009: {
        en: 'The chosen `common.role` does not support the `common.type` that has been declared for this state. '
          + 'Each role in ioBroker carries a list of compatible data types; assigning an incompatible type '
          + 'leads to incorrect behaviour in visualisations and automations. '
          + 'Fix: either change `common.type` to one of the types accepted by this role, or choose a different role '
          + 'that is designed for the desired data type.',
        de: 'Die gewählte `common.role` unterstützt den für diesen State deklarierten `common.type` nicht. '
          + 'Jede Rolle in ioBroker hat eine Liste kompatibler Datentypen; die Zuweisung eines inkompatiblen Typs '
          + 'führt zu falschem Verhalten in Visualisierungen und Automatisierungen. '
          + 'Lösung: Ändere entweder `common.type` auf einen der von dieser Rolle akzeptierten Typen oder wähle eine andere Rolle, '
          + 'die für den gewünschten Datentyp ausgelegt ist.',
    },

    E1010: {
        en: 'The `common.read` flag does not match the value required by the assigned role. '
          + 'For example, a pure write-only role such as a command button requires `common.read = false`. '
          + 'Fix: set `common.read` to the value shown in the error message, or choose a role that matches '
          + 'the intended read/write semantics of your state.',
        de: 'Das Flag `common.read` stimmt nicht mit dem von der zugewiesenen Rolle geforderten Wert überein. '
          + 'Eine reine Schreibrolle wie eine Befehlstaste erfordert beispielsweise `common.read = false`. '
          + 'Lösung: Setze `common.read` auf den im Fehlertext angezeigten Wert, oder wähle eine Rolle, '
          + 'die der beabsichtigten Lese-/Schreib-Semantik deines States entspricht.',
    },

    E1011: {
        en: 'The `common.write` flag does not match the value required by the assigned role. '
          + 'For example, a read-only sensor value requires `common.write = false`. '
          + 'Fix: set `common.write` to the value shown in the error message, or choose a role that matches '
          + 'the intended read/write semantics of your state.',
        de: 'Das Flag `common.write` stimmt nicht mit dem von der zugewiesenen Rolle geforderten Wert überein. '
          + 'Ein reiner Sensor-Lesewert erfordert beispielsweise `common.write = false`. '
          + 'Lösung: Setze `common.write` auf den im Fehlertext angezeigten Wert, oder wähle eine Rolle, '
          + 'die der beabsichtigten Lese-/Schreib-Semantik deines States entspricht.',
    },

    // ── E2xxx  Hierarchy order validation ────────────────────────────────

    E2001: {
        en: 'An object hierarchy mixes hierarchy-typed objects (device, channel, folder) with non-hierarchy '
          + 'objects (e.g. state or meta) at the same nesting level. '
          + 'ioBroker requires that structural container objects form an unbroken chain before leaf states appear. '
          + 'Fix: ensure that every intermediate node in the id path is of a hierarchy type '
          + '(device → channel → state), and that no state or meta object acts as a parent.',
        de: 'Eine Objekthierarchie mischt Objekte vom Hierarchietyp (device, channel, folder) mit Nicht-Hierarchieobjekten '
          + '(z. B. state oder meta) auf derselben Verschachtelungsebene. '
          + 'ioBroker erfordert, dass strukturelle Container-Objekte eine ununterbrochene Kette bilden, bevor Leaf-States erscheinen. '
          + 'Lösung: Stelle sicher, dass jeder Zwischenknoten im ID-Pfad einen Hierarchietyp hat '
          + '(device → channel → state) und dass kein State- oder Meta-Objekt als Elternobjekt fungiert.',
    },

    E2002: {
        en: 'More than one `device` object appears along the same object id chain. '
          + 'ioBroker allows at most one device per hierarchy branch. '
          + 'Fix: restructure the hierarchy so that each branch contains only a single device '
          + 'and uses channels to sub-divide it further.',
        de: 'Entlang desselben Objekt-ID-Pfads tritt mehr als ein `device`-Objekt auf. '
          + 'ioBroker erlaubt höchstens ein Device pro Hierarchiezweig. '
          + 'Lösung: Strukturiere die Hierarchie so um, dass jeder Zweig nur ein einziges Device enthält '
          + 'und Channels zur weiteren Unterteilung verwendet.',
    },

    E2003: {
        en: 'A `device` object appears after a `channel` object in the same hierarchy chain. '
          + 'The required order is: device → channel → state. '
          + 'Fix: move the device object so that it appears above (i.e. at a shorter id path than) '
          + 'any channel objects in the same branch.',
        de: 'Ein `device`-Objekt erscheint nach einem `channel`-Objekt im selben Hierarchiepfad. '
          + 'Die erforderliche Reihenfolge lautet: device → channel → state. '
          + 'Lösung: Verschiebe das Device-Objekt so, dass es oberhalb (d. h. mit einem kürzeren ID-Pfad als) '
          + 'aller Channel-Objekte desselben Zweigs erscheint.',
    },

    E2004: {
        en: 'A `state` object has child objects beneath it in the id tree. '
          + 'States are leaf nodes and must not act as parents of other objects. '
          + 'Fix: convert the state into a channel or folder, or move the child objects '
          + 'to a parallel path that does not descend from a state.',
        de: 'Ein `state`-Objekt hat untergeordnete Objekte in der ID-Hierarchie. '
          + 'States sind Blattknoten und dürfen nicht als Elternobjekte anderer Objekte fungieren. '
          + 'Lösung: Wandle den State in einen Channel oder Ordner um, oder verschiebe die untergeordneten Objekte '
          + 'auf einen parallelen Pfad, der nicht von einem State abstammt.',
    },

    // ── E3xxx  Object dump / root-level validation ────────────────────────

    E3001: {
        en: 'The uploaded file does not contain a plain JSON object at the root level. '
          + 'A valid ioBroker object dump must be a single `{}` object where every key is an object id '
          + 'and every value is the corresponding ioBroker object record. '
          + 'Fix: make sure your export produces a top-level JSON object and not an array, string, or other value.',
        de: 'Die hochgeladene Datei enthält auf der obersten Ebene kein einfaches JSON-Objekt. '
          + 'Ein gültiger ioBroker-Objekt-Dump muss ein einzelnes `{}`-Objekt sein, bei dem jeder Schlüssel eine Objekt-ID '
          + 'und jeder Wert der zugehörige ioBroker-Objektdatensatz ist. '
          + 'Lösung: Stelle sicher, dass dein Export ein JSON-Objekt auf oberster Ebene erzeugt, '
          + 'und kein Array, keine Zeichenkette oder einen anderen Wert.',
    },

    E3002: {
        en: 'A root-level entry in the object dump is invalid: either its value is not a plain object, '
          + 'or its `_id` field does not match the key under which it is stored. '
          + 'Every entry must satisfy `dump[id]._id === id`. '
          + 'Fix: check the export logic to ensure that each object is stored under its own `_id` '
          + 'and that the `_id` field is present and correct.',
        de: 'Ein Eintrag auf der obersten Ebene des Objekt-Dumps ist ungültig: Entweder ist sein Wert kein einfaches Objekt, '
          + 'oder sein `_id`-Feld stimmt nicht mit dem Schlüssel überein, unter dem es gespeichert ist. '
          + 'Jeder Eintrag muss `dump[id]._id === id` erfüllen. '
          + 'Lösung: Prüfe die Export-Logik, um sicherzustellen, dass jedes Objekt unter seiner eigenen `_id` '
          + 'gespeichert ist und das `_id`-Feld vorhanden und korrekt ist.',
    },

    E3003: {
        en: 'Due to earlier structural errors (see E3002), the file cannot be interpreted as a valid '
          + 'ioBroker object dump and further processing was aborted. '
          + 'Fix: resolve all E3002 errors first, then re-upload the corrected file.',
        de: 'Aufgrund früherer Strukturfehler (siehe E3002) kann die Datei nicht als gültiger '
          + 'ioBroker-Objekt-Dump interpretiert werden, und die weitere Verarbeitung wurde abgebrochen. '
          + 'Lösung: Behebe zunächst alle E3002-Fehler und lade dann die korrigierte Datei erneut hoch.',
    },

    E3004: {
        en: 'A required top-level key is missing from an ioBroker object record. '
          + 'Every object must contain the keys defined in the root object schema '
          + '(typically `_id`, `type`, `common`, and `native`). '
          + 'Fix: add the missing key to the object, providing an appropriate value.',
        de: 'Ein erforderlicher Schlüssel fehlt auf der obersten Ebene eines ioBroker-Objektdatensatzes. '
          + 'Jedes Objekt muss die im Root-Objekt-Schema definierten Schlüssel enthalten '
          + '(in der Regel `_id`, `type`, `common` und `native`). '
          + 'Lösung: Füge den fehlenden Schlüssel mit einem geeigneten Wert zum Objekt hinzu.',
    },

    E3005: {
        en: 'A top-level key of an ioBroker object record has the wrong JavaScript type. '
          + 'For example, `native` must always be a plain object `{}` and `type` must be a string. '
          + 'Fix: correct the value of the listed key so that its JavaScript type matches the expectation.',
        de: 'Ein Schlüssel auf der obersten Ebene eines ioBroker-Objektdatensatzes hat den falschen JavaScript-Typ. '
          + 'Beispielsweise muss `native` immer ein einfaches Objekt `{}` und `type` eine Zeichenkette sein. '
          + 'Lösung: Korrigiere den Wert des aufgeführten Schlüssels so, dass sein JavaScript-Typ der Erwartung entspricht.',
    },

    E3006: {
        en: 'An ioBroker object record contains one or more keys at the root level that are not part of '
          + 'the defined object schema. Extra root keys are not permitted. '
          + 'Fix: remove the listed keys from the object record. If you believe a key is legitimate, '
          + 'check whether it belongs inside `common` or `native` instead.',
        de: 'Ein ioBroker-Objektdatensatz enthält auf der obersten Ebene einen oder mehrere Schlüssel, '
          + 'die nicht Teil des definierten Objektschemas sind. Zusätzliche Root-Schlüssel sind nicht erlaubt. '
          + 'Lösung: Entferne die aufgeführten Schlüssel aus dem Objektdatensatz. Falls du glaubst, '
          + 'dass ein Schlüssel berechtigt ist, prüfe, ob er stattdessen in `common` oder `native` gehört.',
    },

    E3007: {
        en: 'The `type` field of an ioBroker object is set to a value that is not in the list of allowed object types. '
          + 'Valid types include `state`, `channel`, `device`, `folder`, `enum`, `meta`, `host`, `adapter`, `instance`, etc. '
          + 'Fix: change `type` to one of the recognised values.',
        de: 'Das `type`-Feld eines ioBroker-Objekts ist auf einen Wert gesetzt, der nicht in der Liste der erlaubten Objekttypen steht. '
          + 'Gültige Typen sind u. a. `state`, `channel`, `device`, `folder`, `enum`, `meta`, `host`, `adapter`, `instance`. '
          + 'Lösung: Ändere `type` auf einen der bekannten Werte.',
    },

    E3008: {
        en: 'The object id contains characters that are forbidden in ioBroker object ids. '
          + 'Allowed characters are letters (Unicode upper- and lowercase), digits, and the symbols `._-/ :!#$%&()+=@^{}|~`. '
          + 'Fix: rename the object using only allowed characters. The error message includes a suggested sanitised id.',
        de: 'Die Objekt-ID enthält Zeichen, die in ioBroker-Objekt-IDs nicht erlaubt sind. '
          + 'Erlaubte Zeichen sind Buchstaben (Unicode Groß- und Kleinschreibung), Ziffern und die Symbole `._-/ :!#$%&()+=@^{}|~`. '
          + 'Lösung: Benenne das Objekt um und verwende dabei nur erlaubte Zeichen. '
          + 'Die Fehlermeldung enthält eine vorgeschlagene bereinigte ID.',
    },

    E3009: {
        en: 'An intermediate parent object is missing from the object dump. '
          + 'ioBroker requires that every segment of an object id path has a corresponding object in the dump. '
          + 'For example, if `adapter.0.device.channel.state` is present, then `adapter.0.device` and '
          + '`adapter.0.device.channel` must also be present. '
          + 'Fix: add the missing intermediate objects with an appropriate type '
          + '(`device`, `channel`, or `folder`) and the minimum required fields (`_id`, `type`, `common`, `native`).',
        de: 'Ein zwischengelagertes Elternobjekt fehlt im Objekt-Dump. '
          + 'ioBroker erfordert, dass jedes Segment eines Objekt-ID-Pfads ein entsprechendes Objekt im Dump besitzt. '
          + 'Wenn beispielsweise `adapter.0.device.channel.state` vorhanden ist, müssen auch `adapter.0.device` und '
          + '`adapter.0.device.channel` vorhanden sein. '
          + 'Lösung: Füge die fehlenden Zwischenobjekte mit einem geeigneten Typ '
          + '(`device`, `channel` oder `folder`) und den mindestens erforderlichen Feldern (`_id`, `type`, `common`, `native`) hinzu.',
    },

    E3010: {
        en: 'A state object does not define `common.type`. '
          + 'Every state must explicitly declare its data type via `common.type` '
          + '(one of `number`, `string`, `boolean`, `array`, `object`, `mixed`, `file`, `json`). '
          + 'Fix: add `common.type` with the correct value to the state\'s `common` block.',
        de: 'Ein State-Objekt definiert `common.type` nicht. '
          + 'Jeder State muss seinen Datentyp explizit über `common.type` deklarieren '
          + '(einer von `number`, `string`, `boolean`, `array`, `object`, `mixed`, `file`, `json`). '
          + 'Lösung: Füge `common.type` mit dem korrekten Wert zum `common`-Block des States hinzu.',
    },

    E3011: {
        en: 'The value of `common.type` is not one of the recognised ioBroker state data types. '
          + 'Valid values are: `number`, `string`, `boolean`, `array`, `object`, `mixed`, `file`, `json`. '
          + 'Fix: change `common.type` to one of these valid values.',
        de: 'Der Wert von `common.type` ist keiner der bekannten ioBroker-State-Datentypen. '
          + 'Gültige Werte sind: `number`, `string`, `boolean`, `array`, `object`, `mixed`, `file`, `json`. '
          + 'Lösung: Ändere `common.type` auf einen dieser gültigen Werte.',
    },

    // ── W3xxx  Warnings ───────────────────────────────────────────────────

    W3001: {
        en: 'The object id contains characters outside the recommended set `[a-zA-Z0-9_,-]`. '
          + 'While these characters are not strictly forbidden, they can cause problems in certain '
          + 'ioBroker adapters, scripts, and visualisations that do not expect special characters in ids. '
          + 'Fix: consider renaming the object to use only alphanumeric characters, underscores, commas, and hyphens.',
        de: 'Die Objekt-ID enthält Zeichen außerhalb des empfohlenen Zeichensatzes `[a-zA-Z0-9_,-]`. '
          + 'Obwohl diese Zeichen nicht streng verboten sind, können sie in bestimmten '
          + 'ioBroker-Adaptern, Skripten und Visualisierungen Probleme verursachen, '
          + 'die keine Sonderzeichen in IDs erwarten. '
          + 'Lösung: Erwäge, das Objekt umzubenennen und dabei nur alphanumerische Zeichen, Unterstriche, Kommas und Bindestriche zu verwenden.',
    },
};

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Extract GitHub user-attachment links whose filename ends in .json.
 *
 * GitHub renders uploaded file attachments in Markdown as:
 *   [filename.json](https://github.com/user-attachments/files/<id>/filename.json)
 *
 * Only this specific URL pattern is accepted.  Links to any external website,
 * raw.githubusercontent.com, or other GitHub pages are intentionally ignored.
 *
 * @param  {string} text - Raw Markdown body of a PR description or comment.
 * @returns {{ filename: string, url: string }[]}  In document order, no duplicates.
 */
function extractJsonAttachments(text) {
    if (!text) return [];

    // Matches Markdown links where the URL is a GitHub user-attachment upload
    // and the filename (last path segment) ends with .json.
    //
    // URL shape:  https://github.com/user-attachments/files/<numeric-id>/<name>.json
    //
    // The link label is intentionally unconstrained – GitHub uses the filename
    // as the label, but we rely on the URL for correctness.
    const UPLOAD_REGEX =
        /\[([^\]]*)\]\((https:\/\/github\.com\/user-attachments\/files\/\d+\/([^\s)]+\.json))\)/gi;

    const results = [];
    const seen    = new Set();
    let m;

    while ((m = UPLOAD_REGEX.exec(text)) !== null) {
        const url      = m[2];
        const filename = m[3]; // last path segment, e.g. "hannah.json"

        if (!seen.has(url)) {
            seen.add(url);
            results.push({ filename, url });
        }
    }

    return results;
}

/**
 * Download a file from `url` and save it to `destPath`.
 * Follows redirects (axios does this automatically).
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
 * Build the detailed explanation section for a set of issues (errors or warnings).
 *
 * Only issues whose code has an entry in ERROR_EXPLANATIONS are included.
 * Duplicate codes produce only one explanation paragraph (the first occurrence).
 * Issues are grouped: first a summary table, then per-code explanation paragraphs
 * in English and German.
 *
 * @param {{ code: string, message: string }[]} issues
 * @param {'error'|'warning'} severity
 * @returns {string}  Markdown text, or empty string when nothing to explain.
 */
function buildExplanationSection(issues) {
    if (issues.length === 0) return '';

    // Collect unique codes that have explanations, preserving first-seen order.
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

    // ── English section ──────────────────────────────────────────────────
    lines.push('---');
    lines.push('');
    lines.push('### 🇬🇧 Explanation of detected issues');
    lines.push('');

    for (const code of codes) {
        const { en } = ERROR_EXPLANATIONS[code];
        lines.push(`#### \`${code}\``);
        lines.push('');
        lines.push(en);
        lines.push('');
    }

    // ── German section ───────────────────────────────────────────────────
    lines.push('---');
    lines.push('');
    lines.push('### 🇩🇪 Erklärung der erkannten Probleme');
    lines.push('');

    for (const code of codes) {
        const { de } = ERROR_EXPLANATIONS[code];
        lines.push(`#### \`${code}\``);
        lines.push('');
        lines.push(de);
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Format the CheckResult from checkObjectStructure() into a Markdown comment.
 * Appended after the summary table: one English and one German explanation
 * paragraph for every unique error/warning code that was actually detected.
 */
function formatComment(result, filename) {
    const lines = [];

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

    // Append bilingual explanation paragraphs for all detected codes
    const allIssues = [...result.errors, ...result.warnings];
    const explanations = buildExplanationSection(allIssues);
    if (explanations) {
        lines.push(explanations);
    }

    return lines.join('\n');
}

/**
 * Derive the adapter name from the JSON filename.
 * Convention: the file is usually named like  adapterName.objects.json
 * or adapterName.json, so we strip known suffixes and return what remains.
 */
function adapterNameFromFilename(filename) {
    return filename
        .replace(/\.objects\.json$/i, '')
        .replace(/\.json$/i, '')
        .replace(/^iobroker\./i, '');
}

// ── main ──────────────────────────────────────────────────────────────────

async function doIt() {
    const prNumber = parseInt(process.env.PR_NUMBER, 10);
    if (!prNumber || isNaN(prNumber)) {
        throw new Error('PR_NUMBER environment variable is missing or not a valid integer.');
    }

    console.log(`\n=== checkObjectStructure – PR #${prNumber} ===\n`);

    // 1. Fetch PR body + all comments
    const pr = await getGithub(
        `https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/${prNumber}`,
    );

    const commentsRaw = await getGithub(
        `https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prNumber}/comments?per_page=100`,
    );

    // 2. Build an ordered list of { filename, url, timestamp }
    //    PR body gets the PR's own created_at timestamp.
    const allAttachments = [];

    const bodyAttachments = extractJsonAttachments(pr.body || '');
    for (const att of bodyAttachments) {
        allAttachments.push({ ...att, timestamp: new Date(pr.created_at).getTime() });
    }

    for (const comment of commentsRaw) {
        const commentAttachments = extractJsonAttachments(comment.body || '');
        for (const att of commentAttachments) {
            allAttachments.push({ ...att, timestamp: new Date(comment.created_at).getTime() });
        }
    }

    // 3. Log every detected filename
    if (allAttachments.length === 0) {
        console.log('No GitHub user-attachment *.json files found in PR body or comments. Nothing to do.');
        return 'no-attachments';
    }

    console.log(`Detected ${allAttachments.length} JSON attachment(s):`);
    for (const att of allAttachments) {
        const ts = new Date(att.timestamp).toISOString();
        console.log(`  • ${att.filename}  [${ts}]  ${att.url}`);
    }

    // 4. Pick the latest attachment (highest timestamp = most recently posted)
    allAttachments.sort((a, b) => b.timestamp - a.timestamp);
    const latest = allAttachments[0];
    console.log(`\nProcessing latest attachment: ${latest.filename}`);

    // 5. Download to a temp directory
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'checkObjectStructure-'));
    const tmpFile = path.join(tmpDir, latest.filename);

    console.log(`Downloading to: ${tmpFile}`);
    await downloadFile(latest.url, tmpFile);
    console.log('Download complete.');

    // 6. Read the raw file text and log it so it is visible in the Actions run log
    let raw;
    try {
        raw = fs.readFileSync(tmpFile, 'utf8');
    } catch (e) {
        throw new Error(`Failed to read ${latest.filename}: ${e.message}`);
    }

    console.log(`\n──── Downloaded file content: ${latest.filename} ────`);
    console.log(raw);
    console.log('──── End of file content ────\n');

    // 7. Parse the JSON
    let objects;
    try {
        objects = JSON.parse(raw);
    } catch (e) {
        throw new Error(`Failed to parse ${latest.filename} as JSON: ${e.message}`);
    }

    // 8. Run the structure check
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

    // 9. Post a formatted comment to the PR
    const commentBody = formatComment(result, latest.filename);
    await addComment(prNumber, commentBody);
    console.log('\nComment posted successfully.');

    // 10. Cleanup temp directory
    try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
        // non-fatal
    }

    return 'done';
}

console.log(`OWN_GITHUB_TOKEN length: ${(process.env.OWN_GITHUB_TOKEN || '').length}`);
console.log(`PR_NUMBER: ${process.env.PR_NUMBER}`);

doIt()
    .then(result => {
        console.log(`\nResult: ${result}`);
        process.exit(0);
    })
    .catch(e => {
        console.error(`\nFatal error: ${e.message || e}`);
        process.exit(1);
    });
