"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const checkRepository_common_1 = require("./checkRepository_common");
const fileName = process.argv[2];
if (!fileName) {
    console.error('Missing file argument. Usage: node build/checkRepository_checkJsonFormatting.js <file>');
    process.exit(1);
}
const jsonPath = node_path_1.default.normalize(node_path_1.default.join(__dirname, `../${fileName}`));
const text = node_fs_1.default.readFileSync(jsonPath, 'utf8');
let parsed;
try {
    parsed = JSON.parse(text);
    (0, checkRepository_common_1.logCheck)(fileName, 'jsonParse', {}, true);
}
catch (e) {
    (0, checkRepository_common_1.logCheck)(fileName, 'jsonParse', { error: e.message }, false);
    console.error(`${fileName}: invalid JSON - ${e.message}`);
    process.exit(1);
}
let hasError = false;
const hasNoTabs = !text.includes('\t');
(0, checkRepository_common_1.logCheck)(fileName, 'noTabs', {}, hasNoTabs);
if (!hasNoTabs) {
    console.error(`${fileName}: formatting error - tabs are not allowed`);
    hasError = true;
}
const normalizedText = text.replace(/\r\n/g, '\n');
const expected = JSON.stringify(parsed, null, 2);
const canonicalFormatting = normalizedText === expected || normalizedText === `${expected}\n`;
(0, checkRepository_common_1.logCheck)(fileName, 'canonicalFormatting', {}, canonicalFormatting);
if (!canonicalFormatting) {
    console.error(`${fileName}: formatting error - expected canonical JSON format with 2-space indentation and double quotes`);
    hasError = true;
}
if (hasError) {
    process.exit(1);
}
console.log(`${fileName}: JSON and formatting checks passed.`);
