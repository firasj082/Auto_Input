export interface KeyOption {
  name: string;
  category: string;
}

export const KEY_LIST: KeyOption[] = [
  // Mouse
  { name: "MouseLeft", category: "Mouse" },
  { name: "MouseRight", category: "Mouse" },
  { name: "MouseMiddle", category: "Mouse" },

  // Letters
  ...["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"].map(l => ({ name: l, category: "Letter" })),

  // Numbers
  ...["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map(n => ({ name: n, category: "Number" })),

  // Function
  ...Array.from({ length: 24 }, (_, i) => ({ name: `F${i + 1}`, category: "Function" })),

  // Navigation
  { name: "Space", category: "Navigation" },
  { name: "Enter", category: "Navigation" },
  { name: "Tab", category: "Navigation" },
  { name: "Backspace", category: "Navigation" },
  { name: "Escape", category: "Navigation" },
  { name: "PageUp", category: "Navigation" },
  { name: "PageDown", category: "Navigation" },
  { name: "End", category: "Navigation" },
  { name: "Home", category: "Navigation" },
  { name: "Left", category: "Navigation" },
  { name: "Up", category: "Navigation" },
  { name: "Right", category: "Navigation" },
  { name: "Down", category: "Navigation" },
  { name: "Insert", category: "Navigation" },
  { name: "Delete", category: "Navigation" },

  // Modifiers
  { name: "Shift", category: "Modifier" },
  { name: "Control", category: "Modifier" },
  { name: "Alt", category: "Modifier" },
  { name: "LShift", category: "Modifier" },
  { name: "RShift", category: "Modifier" },
  { name: "LControl", category: "Modifier" },
  { name: "RControl", category: "Modifier" },
  { name: "LAlt", category: "Modifier" },
  { name: "RAlt", category: "Modifier" },
  { name: "LWin", category: "Modifier" },
  { name: "RWin", category: "Modifier" },

  // Other
  { name: "CapsLock", category: "Other" },
  { name: "NumLock", category: "Other" },
  { name: "ScrollLock", category: "Other" },
  { name: "Pause", category: "Other" },
  { name: "Clear", category: "Other" }
];
