// Standalone test binary to debug WH_KEYBOARD_LL hooks.
// Run with: cargo run --bin test_hook

use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, SetWindowsHookExW, UnhookWindowsHookEx,
    KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
};

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let data = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        let vk = data.vkCode;
        let down = wparam.0 as u32 == WM_KEYDOWN as u32 || wparam.0 as u32 == WM_SYSKEYDOWN as u32;
        println!("[TEST HOOK] Key Event: VK=0x{:X}, Down={}", vk, down);
        
        if vk == 0x1B && down {
            println!("[TEST HOOK] Escape pressed. Exiting...");
            windows::Win32::UI::WindowsAndMessaging::PostQuitMessage(0);
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

fn main() {
    println!("Starting hook test. Press keys. Press ESCAPE to exit.");
    unsafe {
        let khook = SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(keyboard_proc),
            None,
            0,
        );

        match khook {
            Ok(hook) => {
                println!("Hook installed successfully! Entering message pump...");
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                    // Pump
                }
                println!("Exiting message pump...");
                let _ = UnhookWindowsHookEx(hook);
                println!("Hook uninstalled. Done.");
            }
            Err(e) => {
                println!("Failed to install hook: {:?}", e);
            }
        }
    }
}
