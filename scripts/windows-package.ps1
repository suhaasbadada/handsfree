# Produces a candidate only: no signing, installation, app launch, or publishing.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. "$PSScriptRoot/windows-env.ps1"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed ($LASTEXITCODE)." }
}
$output = Join-Path $root 'release/windows-x64'
$notices = Join-Path $root 'src-tauri/target/windows-notices'
if ((Test-Path $output) -or (Test-Path $notices)) {
    throw 'Candidate output exists. Preserve or move release/windows-x64 and src-tauri/target/windows-notices before rebuilding.'
}
# This path must match the configured target; never pick an old host build.
$bundle = Join-Path $root 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis'
if (Test-Path $bundle) { throw 'NSIS output already exists; preserve or move it before rebuilding.' }
$snapshot = Join-Path $root 'src-tauri/target/windows-source-state.json'
if (Test-Path $snapshot) { throw 'Source snapshot exists; preserve or move src-tauri/target/windows-source-state.json before rebuilding.' }
$sourceManifestHash = Invoke-Checked python @('scripts/windows-source-state.py', 'snapshot', '--state', $snapshot)
$sourceCommit = & git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify clean source commit.' }
Invoke-Checked cargo @('fmt', '--manifest-path', 'src-tauri/Cargo.toml', '--', '--check')
# tauri-build also loads the Windows overlay during cargo test; resources must
# exist before any compilation, not only before the final bundle command.
Invoke-Checked cargo @('fetch', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', '--target', $env:CARGO_BUILD_TARGET)
New-Item -ItemType Directory -Path $notices | Out-Null
Invoke-Checked python @('scripts/release-notices.py', $notices, '--target', $env:CARGO_BUILD_TARGET)
Copy-Item 'LICENSE' $notices
Invoke-Checked cargo @('test', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', '--target', $env:CARGO_BUILD_TARGET)
Invoke-Checked cargo @('clippy', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', '--target', $env:CARGO_BUILD_TARGET, '--all-targets', '--', '-D', 'warnings')
# The CLI rewrites even inactive target dependencies to match the Windows config.
# Preserve evidence on unknown changes; restore only its validated Mac-only edit,
# including when the build itself fails. Never broadly reset the worktree.
$buildFailure = $null
try {
    Invoke-Checked npm @('run', 'tauri', 'build', '--', '--target', $env:CARGO_BUILD_TARGET, '--config', 'src-tauri/tauri.windows.conf.json', '--bundles', 'nsis')
} catch { $buildFailure = $_ }
$normalization = Invoke-Checked python @('scripts/windows-source-state.py', 'restore', '--state', $snapshot)
if ($null -ne $buildFailure) { throw $buildFailure }
$dependencyReport = Join-Path $root 'src-tauri/target/windows-app-dependencies.json'
# Inspect the actual native app, not the NSIS wrapper. Reject candidates before
# copying any artifacts if a direct/delay DLL import needs an unbundled runtime.
Invoke-Checked python @('scripts/windows-pe-imports.py', 'src-tauri/target/x86_64-pc-windows-msvc/release/handsfree.exe', '--output', $dependencyReport)
$installers = @(Get-ChildItem $bundle -Filter '*.exe' -File)
if ($installers.Count -ne 1) { throw 'Expected exactly one newly built NSIS installer.' }
# Structural check only; this does not establish successful installation or runtime behavior.
Invoke-Checked 7z @('t', $installers[0].FullName)
$listing = & 7z l $installers[0].FullName
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect NSIS installer.' }
foreach ($required in @('THIRD_PARTY_SOURCES.tar.gz', 'inventory.json', 'COPYRIGHT-library.html', 'LICENSE')) {
    if (-not ($listing -match [regex]::Escape($required))) { throw "Installer is missing $required." }
}
New-Item -ItemType Directory -Path $output | Out-Null
$name = 'HandsFree-0.1.1-windows-x64-setup.exe'
Copy-Item $installers[0].FullName (Join-Path $output $name)
Copy-Item "$notices/*" $output -Recurse
Copy-Item $dependencyReport (Join-Path $output 'APP-DEPENDENCIES.json')
$commit = & git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify source commit.' }
$dirty = & git status --porcelain --untracked-files=normal
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify worktree state.' }
if ($dirty -or $commit -ne $sourceCommit) { throw 'Source changed after validation; candidate rejected.' }
$rust = & rustc --version --verbose
$node = & node --version
$run = if ($env:GITHUB_ACTIONS -eq 'true') { "https://github.com/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID" } else { 'local build' }
@"
HandsFree experimental Windows candidate (NOT runtime verified)
Source commit: $commit
Worktree dirty: $([bool]$dirty)
Source Cargo.toml SHA256 (original bytes, restored): $sourceManifestHash
Build normalization: $normalization
Target: $env:CARGO_BUILD_TARGET
Rust flags: $env:RUSTFLAGS
CMake MSVC runtime: $env:CMAKE_MSVC_RUNTIME_LIBRARY
CMake CMP0091: $env:CMAKE_POLICY_DEFAULT_CMP0091
PE dependency gate: passed; AMD64 PE32+; direct/delay OS-only imports (APP-DEPENDENCIES.json)
Build: $run
UTC: $([DateTime]::UtcNow.ToString('o'))
Node: $node
Rust: $($rust -join "`n")
CPU: GGML_NATIVE/SSE42/AVX/AVX2/AVX512/BMI2/FMA/F16C/AMX disabled; baseline x64.
Unsigned. No Authenticode identity, automatic release, or updater.
No speech model, recording, local app state, or signing material included.
Automated checks are not a microphone, shortcut, paste, or installer acceptance test.
"@ | Set-Content (Join-Path $output 'PROVENANCE.txt') -Encoding utf8NoBOM
$checksums = Get-ChildItem $output -File -Recurse | Sort-Object FullName | ForEach-Object {
    $relative = [System.IO.Path]::GetRelativePath($output, $_.FullName).Replace('\', '/')
    "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())  $relative"
}
$checksums | Set-Content (Join-Path $output 'SHA256SUMS') -Encoding utf8NoBOM
Write-Host "Candidate ready in $output. Complete docs/WINDOWS.md acceptance checks before distribution."
