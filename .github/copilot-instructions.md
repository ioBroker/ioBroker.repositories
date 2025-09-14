# GitHub Copilot Instructions for ioBroker.repositories

## Repository Overview

This repository manages the official adapter repositories for the ioBroker IoT platform. It maintains two main repository files:
- `sources-dist.json` - Latest (beta) repository with the newest adapter versions
- `sources-dist-stable.json` - Stable repository with tested and approved adapter versions

The repository serves as the central hub for:
- Adding new adapters to latest/stable repositories
- Managing adapter versions and metadata
- Automated quality checks and validation
- Building and distributing repository lists

## Project Structure

```
├── .github/                    # GitHub Actions workflows and templates
│   ├── workflows/             # Automated workflows for checking, building, validation
│   └── PULL_REQUEST_TEMPLATE/ # PR templates
├── lib/                       # Core functionality modules
│   ├── build.js              # Repository building and processing
│   ├── check.js              # Adapter validation and PR checking
│   ├── scripts.js            # Core scripts for repo management
│   └── tools.js              # Utility functions
├── test/                      # Test files
├── sources-dist.json          # Latest repository (beta adapters)
├── sources-dist-stable.json   # Stable repository (production adapters)
├── tasks.js                   # Build tasks runner
└── package.json              # Dependencies and scripts
```

## Development Setup

1. **Prerequisites**: Node.js ≥12
2. **Install dependencies**: `npm install`
3. **Available scripts**:
   - `npm test` - Run comprehensive adapter validation tests
   - `npm run check` - Check adapter changes in PRs
   - `npm run addToLatest -- --name <adapter> --type <type>` - Add adapter to latest
   - `npm run addToStable -- --name <adapter> --version <version>` - Add to stable
   - `npm run sort` - Sort repository entries alphabetically

## Code Style and Patterns

### ESLint Configuration
- **Indentation**: 4 spaces
- **Quotes**: Single quotes preferred, template literals allowed
- **Semicolons**: Required
- **Variables**: Use `const`/`let`, no `var`
- **ES Version**: ES2022

### Common Patterns
- **Error handling**: Callback-style with `(err, data)` pattern
- **Async operations**: Primarily callback-based, some Promise usage
- **File operations**: Synchronous `fs` operations for JSON files
- **HTTP requests**: Using `axios` library
- **Logging**: `console.log`/`console.error` for output

### Repository Entry Format
```javascript
{
  "adapter-name": {
    "meta": "https://raw.githubusercontent.com/owner/repo/master/io-package.json",
    "icon": "https://raw.githubusercontent.com/owner/repo/master/admin/icon.png",
    "type": "adapter-category",
    "version": "1.0.0",  // Only in stable repo
    "published": "2024-01-01T00:00:00.000Z"  // Only in stable repo
  }
}
```

## Key Components

### Main Scripts (`lib/scripts.js`)
- `addToLatest()` - Adds adapter to latest repository
- `addToStable()` - Adds adapter to stable repository  
- `sort()` - Sorts repository entries alphabetically
- `nodates()` - Removes versionTime attributes

### Validation (`lib/check.js`)
- Detects changed adapters in PRs
- Runs `@iobroker/repochecker` validation
- Posts validation results as PR comments
- Checks npm package existence and ownership

### Build System (`lib/build.js`)
- Processes repository JSON files
- Generates statistics and download counts
- Creates HTML lists and badge images
- Handles repository publishing

## Testing Framework

### Test Types
- **Repository validation**: Validates JSON structure and adapter entries
- **Adapter checking**: Uses `@iobroker/repochecker` for comprehensive validation
- **NPM validation**: Checks package existence and ioBroker ownership

### Running Tests
```bash
npm test              # Full test suite (takes 10+ minutes)
npm run check         # Quick PR validation
```

### Test Environment Variables
- `OWN_GITHUB_TOKEN` - GitHub token for API access
- `IOBBOT_GITHUB_TOKEN` - Bot token for automated operations

## GitHub Actions Workflows

### Pull Request Validation (`.github/workflows/check.yml`)
- **Trigger**: PR opened/edited/reopened, issue comments
- **Actions**: 
  - Detects changed adapters
  - Runs validation checks
  - Posts results as PR comments
- **Security**: Uses `pull_request_target` for secret access

### Other Workflows
- `checkNpm.yml` - Validates NPM packages
- `checkArchived.yml` - Checks for archived repositories  
- `setStableTag.yml` - Manages stable version tags
- `readyForStable.yml` - Identifies adapters ready for stable

## Adapter Requirements

### Latest Repository Requirements
- GitHub repo named `ioBroker.<adaptername>`
- Valid `io-package.json` with required fields
- README.md with documentation
- NPM package published
- `iobroker` organization as NPM owner
- Basic GitHub Actions testing
- Admin3 configuration dialog

### Stable Repository Requirements
- Already in latest repository
- Forum testing feedback
- Discovery implementation (if applicable)
- Version stability validation

## Common Tasks

### Adding New Adapter to Latest
```bash
npm run addToLatest -- --name myAdapter --type hardware
```

### Adding Adapter to Stable
```bash
npm run addToStable -- --name myAdapter --version 1.2.3
```

### Manual Validation
```bash
npm run check  # Validates current changes
```

### Repository Maintenance
```bash
npm run sort     # Sort entries alphabetically
npm run nodates  # Clean up version timestamps
```

## Troubleshooting

### Common Issues
1. **Test timeouts**: Adapter validation can take 15+ minutes
2. **GitHub API limits**: Use personal tokens for development
3. **NPM ownership**: Ensure `iobroker` org is package owner
4. **JSON formatting**: Use 2-space indentation for repository files

### Debugging Tips
- Check GitHub Actions logs for detailed error messages
- Use `npm run check` locally before pushing
- Validate JSON syntax with online tools
- Check adapter repo for required files and structure

## File Patterns to Preserve

### Repository JSON Files
- Always maintain alphabetical order
- Preserve exact formatting and indentation
- Include all required metadata fields
- Validate URLs are accessible

### GitHub Workflows
- Maintain security practices for `pull_request_target`
- Keep environment variables consistent
- Preserve error handling and logging

When making changes, always:
1. Run validation locally first
2. Follow existing code patterns
3. Update tests if adding new functionality
4. Maintain backward compatibility
5. Document breaking changes clearly