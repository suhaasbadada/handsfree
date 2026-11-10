use std::{env, path::PathBuf, process::Command};
fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        build_macos();
    }
    build_tauri()
}
fn build_tauri() {
    // tauri-build 2.7 checks only the common `tauri` dependency, ignoring
    // Cargo's target feature union. Its build-time ACL/resource generation
    // doesn't use macOSPrivateApi; suppress that *check* on macOS only.
    // generate_context! still reads the unchanged real config and uses the
    // actual target-specific feature. Never enable private Mac APIs on Windows.
    let original = env::var_os("TAURI_CONFIG");
    let manifest: toml::Value =
        toml::from_str(&std::fs::read_to_string("Cargo.toml").expect("Cargo manifest"))
            .expect("valid Cargo manifest");
    let common_has_private_api = manifest
        .get("dependencies")
        .and_then(|dependencies| dependencies.get("tauri"))
        .and_then(|tauri| tauri.get("features"))
        .and_then(toml::Value::as_array)
        .is_some_and(|features| {
            features
                .iter()
                .any(|feature| feature.as_str() == Some("macos-private-api"))
        });
    // The Tauri CLI currently normalizes this feature into the common table.
    // Direct Cargo checks retain the correct, target-only declaration instead.
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") && !common_has_private_api {
        let mut config: serde_json::Value = original
            .as_ref()
            .map(|value| {
                serde_json::from_str(&value.to_string_lossy()).expect("valid TAURI_CONFIG")
            })
            .unwrap_or_else(|| serde_json::json!({}));
        config["app"]["macOSPrivateApi"] = false.into();
        env::set_var("TAURI_CONFIG", config.to_string());
    }
    tauri_build::build();
    if let Some(value) = original {
        env::set_var("TAURI_CONFIG", value);
    } else {
        env::remove_var("TAURI_CONFIG");
    }
}
fn build_macos() {
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
        "ServiceManagement",
    ] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
}
