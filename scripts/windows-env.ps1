# Dot-source before every native Windows build, including tests and clippy.
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -or [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
    throw 'Windows x64 with PowerShell 7 is required.'
}
$env:CARGO_BUILD_TARGET = 'x86_64-pc-windows-msvc'
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
