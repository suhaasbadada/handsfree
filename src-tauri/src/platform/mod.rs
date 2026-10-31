//! Compile-time native backend selection. Callbacks are C ABI on both targets;
//! only macOS crosses a foreign-function boundary.
#[cfg(target_os = "macos")]
mod macos;
#[cfg(any(windows, test))]
mod resample;
#[cfg(target_os = "macos")]
pub use macos::*;
pub const REQUIRED_PERMISSIONS: i32 = if cfg!(windows) { 1 } else { 7 };
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::*;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
compile_error!("HandsFree supports macOS and the experimental Windows beta only");
