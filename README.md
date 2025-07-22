# action-setup-brew

GitHub Action to set up Homebrew on macOS runners or Linuxbrew on Linux runners, with intelligent caching of installed packages between runs.

Control of version is generally not supported, but there are some exceptions. Brew typically provides more up-to-date versions than the system package manager.

## Features

- ✅ **Cross-platform**: Works on macOS and Linux runners
- ✅ **Smart caching**: Automatically caches Homebrew installation and packages
- ✅ **Windows-safe**: Does nothing on Windows runners (no errors)
- ✅ **Package installation**: Optional package installation with `packages` input
- ✅ **Post-action caching**: Automatically saves cache after workflow completion

## Usage

### Basic Setup

```yaml
name: CI
on: push
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: maargenton/action-setup-brew@v1

      - name: Use Homebrew
        run: brew --version
```

### With Package Installation

```yaml
name: CI
on: push
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]  # Windows will be skipped
    steps:
      - uses: actions/checkout@v4
      - uses: maargenton/action-setup-brew@v1
        with:
          packages: |
            jq
            curl
            git

      - name: Check installed packages
        run: |
          jq --version
          curl --version
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `packages` | Space or newline separated list of packages to install | No | `''` |
| `cache-key-suffix` | Additional suffix for cache key customization | No | `''` |

## How It Works

1. **Platform Detection**: Automatically detects the runner platform
2. **Windows Skip**: Safely does nothing on Windows runners
3. **Cache Restoration**: Attempts to restore Homebrew installation from cache
4. **Homebrew Installation**: Installs Homebrew if not cached or not present
5. **Package Installation**: Installs specified packages (if any)
6. **Post-Action**: Automatically saves cache after workflow completion

## Cache Strategy

The action uses intelligent caching based on:
- Platform (macOS/Linux)
- Architecture (arm64/x64)
- Package list hash (if packages specified)
- Optional cache key suffix

Cache includes:
- Homebrew installation (`/opt/homebrew` or `/usr/local` on macOS, `/home/linuxbrew/.linuxbrew` on Linux)
- Installed packages (`Cellar`, `Caskroom`)
- Package metadata and locks

## Development

### Setup
```bash
npm install
```

### Build
```bash
npm run build
```

### Test
```bash
npm test
```

### Package for Release
```bash
npm run package
```

## License

MIT - see [LICENSE](LICENSE) file.
