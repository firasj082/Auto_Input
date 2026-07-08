/**
 * Central state manager for the macro sequence editor.
 *
 * All mutations to sequence items flow through the functions exposed by this hook.
 * Components never mutate the items array directly.
 */

import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  MacroProfile,
  MacroSequence,
  SequenceItem,
  ManualItem,
  RecordedItem,
  RepeatConfig,
  HotkeysConfig,
} from "../types/sequence";

interface UseSequenceReturn {
  items: SequenceItem[];
  repeat: RepeatConfig;
  hotkeys: HotkeysConfig;
  isRecording: boolean;
  isPlaying: boolean;
  isListening: string | null;
  addItem: (item: SequenceItem) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<ManualItem> | Partial<RecordedItem>) => void;
  reorderItems: (fromIndex: number, toIndex: number) => void;
  setRepeat: (config: RepeatConfig) => void;
  setHotkeys: (config: HotkeysConfig) => void;
  startRecording: () => void;
  stopRecording: () => void;
  startPlayback: () => void;
  stopPlayback: () => void;
  listenForHotkey: (target: string) => void;
  cancelListenForHotkey: () => void;
  saveProfile: () => void;
  loadProfile: () => void;
  importProfile: (profile: MacroProfile) => void;
  getExportProfile: () => MacroProfile;
}


export function useSequence(): UseSequenceReturn {
  const [items, setItems] = useState<SequenceItem[]>([]);
  const [repeat, setRepeatState] = useState<RepeatConfig>({ mode: "count", count: 1 });
  const [hotkeys, setHotkeysState] = useState<HotkeysConfig>({
    recordToggle: "F9",
    startSequence: "F10",
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState<string | null>(null);

  // Load the saved profile on mount
  useEffect(() => {
    loadProfile();
  }, []);

  // Listen for backend events
  useEffect(() => {
    let active = true;
    const unlisteners: (() => void)[] = [];

    const setupListeners = async () => {
      try {
        const u1 = await listen<boolean>("recording-state-changed", (event) => {
          if (!active) return;
          setIsRecording(event.payload);
        });
        unlisteners.push(u1);

        const u2 = await listen<boolean>("playback-state-changed", (event) => {
          if (!active) return;
          setIsPlaying(event.payload);
        });
        unlisteners.push(u2);

        const u3 = await listen<SequenceItem>("new-recorded-item", (event) => {
          if (!active) return;
          setItems((prev) => [...prev, event.payload]);
        });
        unlisteners.push(u3);

        const u4 = await listen("trigger-playback", () => {
          if (!active) return;
          startPlaybackInternal();
        });
        unlisteners.push(u4);

        const u5 = await listen<[string, string]>("hotkey-configured", (event) => {
          if (!active) return;
          const [target, keyName] = event.payload;
          setHotkeysState((prev) => {
            const updated = { ...prev, [target]: keyName };
            invoke("update_hook_hotkeys", {
              recordKey: updated.recordToggle,
              startKey: updated.startSequence,
            }).catch(console.error);
            return updated;
          });
          setIsListening(null);
        });
        unlisteners.push(u5);

        const u6 = await listen("hotkey-cancelled", () => {
          if (!active) return;
          setIsListening(null);
        });
        unlisteners.push(u6);

        // If we unmounted before they finished resolving, clean them up
        if (!active) {
          unlisteners.forEach((fn) => fn());
        }
      } catch (err) {
        console.error("Failed to setup Tauri listeners:", err);
      }
    };

    setupListeners();

    return () => {
      active = false;
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  const addItem = useCallback((item: SequenceItem) => {
    setItems((prev) => [...prev, item]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateItem = useCallback(
    (id: string, updates: Partial<ManualItem> | Partial<RecordedItem>) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          return { ...item, ...updates } as SequenceItem;
        })
      );
    },
    []
  );

  const reorderItems = useCallback((fromIndex: number, toIndex: number) => {
    setItems((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return copy;
    });
  }, []);

  const setRepeat = useCallback((config: RepeatConfig) => {
    setRepeatState(config);
  }, []);

  const setHotkeys = useCallback((config: HotkeysConfig) => {
    setHotkeysState(config);
    invoke("update_hook_hotkeys", {
      recordKey: config.recordToggle,
      startKey: config.startSequence,
    }).catch(console.error);
  }, []);

  const startRecording = useCallback(() => {
    invoke("start_recording").catch(console.error);
  }, []);

  const stopRecording = useCallback(() => {
    invoke("stop_recording").catch(console.error);
  }, []);

  // Internal version that reads current state via ref-like closure
  const startPlaybackInternal = useCallback(() => {
    // We need the latest items and repeat, so we read from state setters
    setItems((currentItems) => {
      setRepeatState((currentRepeat) => {
        const sequence: MacroSequence = {
          repeat: currentRepeat,
          items: currentItems,
        };
        invoke("start_macro_playback", { sequence }).catch(console.error);
        setIsPlaying(true);
        return currentRepeat;
      });
      return currentItems;
    });
  }, []);

  const startPlayback = useCallback(() => {
    startPlaybackInternal();
  }, [startPlaybackInternal]);

  const stopPlayback = useCallback(() => {
    invoke("stop_macro_playback").catch(console.error);
  }, []);

  const listenForHotkey = useCallback((target: string) => {
    setIsListening(target);
    invoke("listen_for_hotkey", { target }).catch(console.error);
  }, []);

  const cancelListenForHotkey = useCallback(() => {
    setIsListening(null);
    invoke("cancel_listen_for_hotkey").catch(console.error);
  }, []);

  const saveProfile = useCallback(() => {
    setItems((currentItems) => {
      setRepeatState((currentRepeat) => {
        setHotkeysState((currentHotkeys) => {
          const profile: MacroProfile = {
            version: 1,
            appId: "macro-app",
            hotkeys: currentHotkeys,
            sequence: { repeat: currentRepeat, items: currentItems },
          };
          invoke("save_macro_profile", { profile }).catch(console.error);
          return currentHotkeys;
        });
        return currentRepeat;
      });
      return currentItems;
    });
  }, []);

  const loadProfile = useCallback(() => {
    invoke<MacroProfile>("load_macro_profile")
      .then((profile) => {
        // Filter out any corrupted empty recorded action sets
        const cleanItems = (profile.sequence?.items || []).filter((item) => {
          if (item.type === "recorded") {
            return item.events && item.events.length > 0;
          }
          return true;
        });
        setItems(cleanItems);
        setRepeatState(profile.sequence.repeat);
        setHotkeysState(profile.hotkeys);
        invoke("update_hook_hotkeys", {
          recordKey: profile.hotkeys.recordToggle,
          startKey: profile.hotkeys.startSequence,
        }).catch(console.error);
      })
      .catch(console.error);
  }, []);

  const importProfile = useCallback((profile: MacroProfile) => {
    // Filter out any corrupted empty recorded action sets
    const cleanItems = (profile.sequence?.items || []).filter((item) => {
      if (item.type === "recorded") {
        return item.events && item.events.length > 0;
      }
      return true;
    });
    setItems(cleanItems);
    setRepeatState(profile.sequence.repeat);
    setHotkeysState(profile.hotkeys);
    invoke("update_hook_hotkeys", {
      recordKey: profile.hotkeys.recordToggle,
      startKey: profile.hotkeys.startSequence,
    }).catch(console.error);
  }, []);

  const getExportProfile = useCallback((): MacroProfile => {
    return {
      version: 1,
      appId: "macro-app",
      hotkeys,
      sequence: { repeat, items },
    };
  }, [hotkeys, repeat, items]);

  return {
    items,
    repeat,
    hotkeys,
    isRecording,
    isPlaying,
    isListening,
    addItem,
    removeItem,
    updateItem,
    reorderItems,
    setRepeat,
    setHotkeys,
    startRecording,
    stopRecording,
    startPlayback,
    stopPlayback,
    listenForHotkey,
    cancelListenForHotkey,
    saveProfile,
    loadProfile,
    importProfile,
    getExportProfile,
  };
}
