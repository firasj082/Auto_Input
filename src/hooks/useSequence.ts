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
    const unlisteners: (() => void)[] = [];

    listen<boolean>("recording-state-changed", (event) => {
      setIsRecording(event.payload);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<boolean>("playback-state-changed", (event) => {
      setIsPlaying(event.payload);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<SequenceItem>("new-recorded-item", (event) => {
      setItems((prev) => [...prev, event.payload]);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen("trigger-playback", () => {
      // The backend fires this when the Start hotkey is pressed while Idle.
      // We respond by sending the current sequence to the playback engine.
      startPlaybackInternal();
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<[string, string]>("hotkey-configured", (event) => {
      const [target, keyName] = event.payload;
      setHotkeysState((prev) => {
        const updated = { ...prev, [target]: keyName };
        // Sync updated hotkeys to the hook layer
        invoke("update_hook_hotkeys", {
          recordKey: updated.recordToggle,
          startKey: updated.startSequence,
        }).catch(console.error);
        return updated;
      });
      setIsListening(null);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen("hotkey-cancelled", () => {
      setIsListening(null);
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
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
        setItems(profile.sequence.items);
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
    setItems(profile.sequence.items);
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
