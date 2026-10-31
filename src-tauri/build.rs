use std::{env, path::PathBuf, process::Command};
fn main() {
    println!("cargo:rerun-if-changed=native/Bridge.swift");
    println!("cargo:rerun-if-changed=native/PastePolicy.swift");
    println!("cargo:rerun-if-changed=native/AudioCapture.swift");
    let out = PathBuf::from(env::var("OUT_DIR").unwrap());
    let sdk = Command::new("xcrun")
        .args(["--show-sdk-path"])
        .output()
        .expect("macOS SDK required");
    let sdk = String::from_utf8(sdk.stdout).unwrap();
    // Prefer the actual SDK headers over stale headers in /usr/local/include.
    let status = Command::new("swiftc")
        .args([
            "-sdk",
            sdk.trim(),
            "-Xcc",
            &format!("-I{}/usr/include", sdk.trim()),
            "-swift-version",
            "5",
            "-O",
            "-emit-library",
            "-static",
            "-module-name",
            "HandsfreeNative",
            "-target",
            "arm64-apple-macosx14.0",
            "native/Bridge.swift",
            "native/PastePolicy.swift",
            "native/AudioCapture.swift",
            "-o",
        ])
        .arg(out.join("libHandsfreeNative.a"))
        .status()
        .expect("Swift compiler required (Xcode Command Line Tools)");
    assert!(status.success(), "Swift native bridge failed");
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-lib=static=HandsfreeNative");
    let swift = Command::new("xcrun")
        .args(["--find", "swiftc"])
        .output()
        .unwrap();
    let compiler = PathBuf::from(String::from_utf8(swift.stdout).unwrap().trim());
    let lib = compiler
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("lib/swift/macosx");
    println!("cargo:rustc-link-search=native={}", lib.display());
    println!("cargo:rustc-link-search=native=/usr/lib/swift");
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    // Rust links with -nodefaultlibs, while ggml's Objective-C Metal backend
    // uses Clang's @available support on newer SDKs. Supply that runtime.
    let runtime = Command::new("xcrun")
        .args(["clang", "--print-runtime-dir"])
        .output()
        .expect("Clang runtime required");
    assert!(runtime.status.success(), "Cannot locate Clang runtime");
    let runtime =
        PathBuf::from(String::from_utf8(runtime.stdout).unwrap().trim()).join("libclang_rt.osx.a");
    assert!(runtime.exists(), "Missing macOS Clang runtime");
    println!("cargo:rustc-link-arg={}", runtime.display());
    for framework in [
        "AppKit",
        "AVFoundation",
        "ApplicationServices",
        "CoreGraphics",
        "QuartzCore",
    ] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
    tauri_build::build()
}
