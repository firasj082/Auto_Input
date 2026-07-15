//! Keycode translation utility.
//!
//! Provides two-way translation between Win32 virtual key codes (VK) and
//! human-readable strings (e.g. "Space", "F6", "A") for settings storage and UI display.

/// Returns the human-readable name of a virtual key code.
///
/// If the keycode is not mapped to a specific name, returns it formatted as "VK_{code}".
///
/// # Thread Safety
/// This function is pure and thread-safe. It does not block.
pub fn vk_to_string(vk: u32) -> String {
    match vk {
        0x01 => "MouseLeft".to_string(),
        0x02 => "MouseRight".to_string(),
        0x04 => "MouseMiddle".to_string(),
        0x08 => "Backspace".to_string(),
        0x09 => "Tab".to_string(),
        0x0C => "Clear".to_string(),
        0x0D => "Enter".to_string(),
        0x10 => "Shift".to_string(),
        0x11 => "Control".to_string(),
        0x12 => "Alt".to_string(),
        0x13 => "Pause".to_string(),
        0x14 => "CapsLock".to_string(),
        0x1B => "Escape".to_string(),
        0x20 => "Space".to_string(),
        0x21 => "PageUp".to_string(),
        0x22 => "PageDown".to_string(),
        0x23 => "End".to_string(),
        0x24 => "Home".to_string(),
        0x25 => "Left".to_string(),
        0x26 => "Up".to_string(),
        0x27 => "Right".to_string(),
        0x28 => "Down".to_string(),
        0x2D => "Insert".to_string(),
        0x2E => "Delete".to_string(),
        // Digits 0-9
        0x30..=0x39 => (((vk - 0x30) as u8 + b'0') as char).to_string(),
        // Letters A-Z
        0x41..=0x5A => (((vk - 0x41) as u8 + b'A') as char).to_string(),
        // Numpad
        0x60 => "Num0".to_string(),
        0x61 => "Num1".to_string(),
        0x62 => "Num2".to_string(),
        0x63 => "Num3".to_string(),
        0x64 => "Num4".to_string(),
        0x65 => "Num5".to_string(),
        0x66 => "Num6".to_string(),
        0x67 => "Num7".to_string(),
        0x68 => "Num8".to_string(),
        0x69 => "Num9".to_string(),
        0x6A => "NumMultiply".to_string(),
        0x6B => "NumAdd".to_string(),
        0x6C => "Separator".to_string(),
        0x6D => "NumSubtract".to_string(),
        0x6E => "NumDecimal".to_string(),
        0x6F => "NumDivide".to_string(),
        // F keys
        0x70..=0x87 => format!("F{}", vk - 0x70 + 1),
        0x90 => "NumLock".to_string(),
        0x91 => "ScrollLock".to_string(),
        0xA0 => "LShift".to_string(),
        0xA1 => "RShift".to_string(),
        0xA2 => "LControl".to_string(),
        0xA3 => "RControl".to_string(),
        0xA4 => "LAlt".to_string(),
        0xA5 => "RAlt".to_string(),
        0x5B => "LWin".to_string(),
        0x5C => "RWin".to_string(),
        0x5D => "Apps".to_string(),
        0x2C => "PrintScreen".to_string(),
        0x5F => "Sleep".to_string(),
        _ => format!("VK_{}", vk),
    }
}

/// Returns the virtual key code (VK) for a human-readable key name.
///
/// If the string is formatted as "VK_{code}", parses the number.
/// Returns `None` if the name is unrecognized or invalid.
///
/// # Thread Safety
/// This function is pure and thread-safe. It does not block.
pub fn string_to_vk(name: &str) -> Option<u32> {
    let lower = name.to_lowercase();
    match lower.as_str() {
        "mouseleft" => Some(0x01),
        "mouseright" => Some(0x02),
        "mousemiddle" => Some(0x04),
        "backspace" => Some(0x08),
        "tab" => Some(0x09),
        "clear" => Some(0x0C),
        "enter" => Some(0x0D),
        "shift" => Some(0x10),
        "control" => Some(0x11),
        "alt" => Some(0x12),
        "pause" => Some(0x13),
        "capslock" => Some(0x14),
        "escape" => Some(0x1B),
        "space" => Some(0x20),
        "pageup" => Some(0x21),
        "pagedown" => Some(0x22),
        "end" => Some(0x23),
        "home" => Some(0x24),
        "left" => Some(0x25),
        "up" => Some(0x26),
        "right" => Some(0x27),
        "down" => Some(0x28),
        "insert" => Some(0x2D),
        "delete" => Some(0x2E),
        "num0" => Some(0x60),
        "num1" => Some(0x61),
        "num2" => Some(0x62),
        "num3" => Some(0x63),
        "num4" => Some(0x64),
        "num5" => Some(0x65),
        "num6" => Some(0x66),
        "num7" => Some(0x67),
        "num8" => Some(0x68),
        "num9" => Some(0x69),
        "nummultiply" => Some(0x6A),
        "numadd" => Some(0x6B),
        "separator" => Some(0x6C),
        "numsubtract" => Some(0x6D),
        "numdecimal" => Some(0x6E),
        "numdivide" => Some(0x6F),
        "numlock" => Some(0x90),
        "scrolllock" => Some(0x91),
        "lshift" => Some(0xA0),
        "rshift" => Some(0xA1),
        "lcontrol" => Some(0xA2),
        "rcontrol" => Some(0xA3),
        "lalt" => Some(0xA4),
        "ralt" => Some(0xA5),
        "lwin" => Some(0x5B),
        "rwin" => Some(0x5C),
        "apps" => Some(0x5D),
        "printscreen" => Some(0x2C),
        "sleep" => Some(0x5F),
        _ => {
            // Check if single character digit/letter
            if name.len() == 1 {
                let c = name.chars().next().unwrap().to_ascii_uppercase();
                if c.is_ascii_digit() {
                    return Some((c as u32 - '0' as u32) + 0x30);
                } else if c.is_ascii_alphabetic() {
                    return Some((c as u32 - 'A' as u32) + 0x41);
                }
            }
            // Check if F-key
            if lower.starts_with('f') {
                if let Ok(num) = lower[1..].parse::<u32>() {
                    if (1..=24).contains(&num) {
                        return Some(0x70 + num - 1);
                    }
                }
            }
            // Check if VK_{code}
            if lower.starts_with("vk_") {
                if let Ok(num) = lower[3..].parse::<u32>() {
                    return Some(num);
                }
            }
            None
        }
    }
}

pub fn vk_to_string_with_case(vk: u32, is_uppercase: bool) -> String {
    let s = vk_to_string(vk);
    if s.len() == 1 {
        let c = s.chars().next().unwrap();
        if c.is_ascii_alphabetic() {
            if is_uppercase {
                return c.to_ascii_uppercase().to_string();
            } else {
                return c.to_ascii_lowercase().to_string();
            }
        }
    }
    s
}

