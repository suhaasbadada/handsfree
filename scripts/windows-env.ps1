# Dot-source before every native Windows build, including tests and clippy.
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -or [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
    throw 'Windows x64 with PowerShell 7 is required.'
}
$env:CARGO_BUILD_TARGET = 'x86_64-pc-windows-msvc'
# Cargo's encoded flags override RUSTFLAGS. Fail rather than silently lose flags
# or accidentally build a dynamically linked C++ runtime.
if ($env:CARGO_ENCODED_RUSTFLAGS) {
    throw 'CARGO_ENCODED_RUSTFLAGS is unsupported for this candidate build; use RUSTFLAGS instead.'
}
$flags = if ($env:RUSTFLAGS) { $env:RUSTFLAGS } else { $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS }
if ($flags -match '(?<![A-Za-z0-9_])-crt-static\b') {
    throw 'Conflicting -crt-static in Rust flags; a static CRT is required.'
}
if ($flags -notmatch '(?<![A-Za-z0-9_])\+crt-static\b') {
    $flags = "$flags -C target-feature=+crt-static".Trim()
}
$env:RUSTFLAGS = $flags
# whisper-rs-sys forwards CMAKE_* variables. Apply /MT to every CMake
# configuration (including RelWithDebInfo used by native test dependencies).
$env:CMAKE_POLICY_DEFAULT_CMP0091 = 'NEW'
$env:CMAKE_MSVC_RUNTIME_LIBRARY = 'MultiThreaded'
# whisper-rs-sys 0.15 forwards GGML_* environment variables to CMake.
# Do not optimize for the CI machine or require AVX/AVX2/AVX512 on testers' PCs.
foreach ($flag in @('NATIVE', 'SSE42', 'AVX', 'AVX2', 'AVX_VNNI', 'AVX512',
    'AVX512_VBMI', 'AVX512_VNNI', 'AVX512_BF16', 'BMI2', 'FMA', 'F16C',
    'AMX_TILE', 'AMX_INT8', 'AMX_BF16')) {
    [Environment]::SetEnvironmentVariable("GGML_$flag", 'OFF', 'Process')
}
if (-not $env:LIBCLANG_PATH) { $env:LIBCLANG_PATH = 'C:\Program Files\LLVM\bin' }
if (-not (Test-Path (Join-Path $env:LIBCLANG_PATH 'libclang.dll'))) {
    throw 'libclang.dll is required. Install LLVM and set LIBCLANG_PATH to its bin directory.'
}
