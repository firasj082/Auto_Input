fn main() {
    // Only apply custom manifest attributes when building for windows
    if std::env::var("CARGO_CFG_TARGET_OS").map(|v| v == "windows").unwrap_or(false) {
        let mut windows = tauri_build::WindowsAttributes::new();
        windows = windows.app_manifest(include_str!("manifest.xml"));
        let attrs = tauri_build::Attributes::new().windows_attributes(windows);
        tauri_build::try_build(attrs).expect("failed to run tauri-build with custom manifest");
    } else {
        tauri_build::build();
    }
}
