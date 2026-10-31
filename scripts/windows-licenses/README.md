# Windows upstream license supplements

Verbatim upstream files retrieved 2026-10-30, with revisions identified from the
locked registry crates' `.cargo_vcs_info.json`:

- `webview2-rs-LICENSE`: MIT text for `webview2-com` 0.39.1 and
  `webview2-com-sys` 0.39.1 at
  https://raw.githubusercontent.com/wravery/webview2-rs/edc2caf886175ccaebe86078c9cfe1ae2a187328/LICENSE
  and `webview2-com-macros` 0.8.1 at
  https://raw.githubusercontent.com/wravery/webview2-rs/dffa41a8a46d3f5565eefbff2de57d38d399f158/LICENSE
  (identical bytes).
- `dasp_sample-LICENSE-MIT`: the MIT option of `dasp_sample` 0.11.0's
  `MIT OR Apache-2.0` declaration, at
  https://raw.githubusercontent.com/rustaudio/sample/97c3bb9b2363c0b46ac1633858bf1054fd02a980/LICENSE-MIT

These workspace notices were omitted from the registry archives. Original
authors, manifests, inline notices, and complete hash-verified registry archives
are also preserved in the generated inventory/source archive. These supplements
do not relicense dependencies or certify attribution completeness. In particular,
the Rust wrappers' MIT license does not relicense Microsoft's WebView2 runtime
or loader binaries. Review Microsoft's WebView2 distribution terms before public
release; the runtime is obtained from Microsoft's bootstrapper, not bundled here.
