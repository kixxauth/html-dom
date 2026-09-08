// Regenerates lib/character-reference-table.js from the WHATWG entities.json
// data file. Run with: node tools/generate-character-references.js <path-to-entities.json>
//
// This script is a build-time tool, not part of the published library. It
// never runs at install or import time, so it may use node: imports freely.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://html.spec.whatwg.org/entities.json';

const ROOT_DIRECTORY = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUTPUT_PATH = path.join(ROOT_DIRECTORY, 'lib', 'character-reference-table.js');

function main() {
    const entitiesPath = process.argv[2];

    if (!entitiesPath) {
        process.stderr.write('Usage: node tools/generate-character-references.js <path-to-entities.json>\n');
        process.exit(1);
    }

    const entities = JSON.parse(fs.readFileSync(entitiesPath, 'utf8'));
    const captureDate = new Date().toISOString().slice(0, 10);

    const names = Object.keys(entities).sort();

    const entryLines = names.map((name) => {
        // Strip the leading "&" so the table key matches how a decoder looks
        // up a reference name after it has already consumed the "&".
        const key = name.slice(1);
        const characters = entities[name].characters;
        return `    ${ JSON.stringify(key) }: ${ JSON.stringify(characters) },`;
    });

    const fileContent = `/**
 * @module character-reference-table
 *
 * Generated data. Do not edit by hand; regenerate with
 * tools/generate-character-references.js.
 *
 * Source: ${ SOURCE_URL }
 * Captured: ${ captureDate }
 */

/**
 * Maps an HTML character reference name, without its leading "&", to its
 * replacement string. Keys retain a trailing ";" when the source name has
 * one, matching entities.json's own keys.
 * @type {Readonly<Object<string, string>>}
 */
export const CHARACTER_REFERENCE_TABLE = Object.freeze(Object.assign(Object.create(null), {
${ entryLines.join('\n') }
}));
`;

    fs.writeFileSync(OUTPUT_PATH, fileContent);
    process.stdout.write(`Wrote ${ names.length } entries to ${ OUTPUT_PATH }\n`);
}

main();
