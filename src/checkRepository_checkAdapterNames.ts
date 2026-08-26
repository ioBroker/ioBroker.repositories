import { getRepositoryEntries, loadRepository, logAdapterStart, logCheck } from './checkRepository_common';
import type { LogOptions, Repository } from './types';

export const reservedAdapterNames = ['config', 'system', 'alias', 'design', 'all', 'self'];

export function findReservedAdapterNames(repository: Repository, options: LogOptions = {}): string[] {
    const failures: string[] = [];

    for (const [name] of getRepositoryEntries(repository)) {
        logAdapterStart(name, options);

        const normalizedName = name.replace(/^iobroker\./i, '');
        const isReserved = reservedAdapterNames.includes(normalizedName);
        logCheck(name, 'reservedName', { normalizedName }, !isReserved, options);

        if (isReserved) {
            failures.push(name);
        }
    }

    return failures;
}

function run(): void {
    const latest = loadRepository('sources-dist.json');
    const failures = findReservedAdapterNames(latest);

    if (failures.length) {
        console.error(`Reserved adapter names found: ${failures.join(', ')}`);
        process.exit(1);
    }

    console.log('sources-dist.json: no reserved adapter names found.');
}

if (require.main === module) {
    run();
}
