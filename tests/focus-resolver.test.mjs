import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bridge = readFileSync(new URL('../src-tauri/native/Bridge.swift', import.meta.url), 'utf8');
test('focus adapter is read-only, PID-checked and shared by snapshot and all paste validations', () => {
  assert.doesNotMatch(bridge, /AXUIElementSetAttributeValue|AXManualAccessibility|AXEnhancedUserInterface/);
  const focus = bridge.slice(bridge.indexOf('private func focused('), bridge.indexOf('private func attribute('));
  assert.match(focus, /guard pid > 0, pid != ProcessInfo.processInfo.processIdentifier/);
  assert.match(focus, /CFGetTypeID\(value\) == AXUIElementGetTypeID\(\)/);
  assert.match(focus, /AXUIElementGetPid\(element, &owner\)/);
  assert.match(focus, /guard owner == pid/);
  assert.match(bridge, /target = focused\(targetPID, stage: "start"\)/);
  assert.match(bridge, /let now = focused\(targetPID, stage: "current"\)/);
  assert.match(bridge, /guard CFEqual\(original, now\)/);
  assert.match(bridge, /return fieldStatus\(now\)/);
  const paste = bridge.slice(bridge.indexOf('@_cdecl("hf_paste")'), bridge.indexOf('func schedulePasteRestore'));
  assert.equal((paste.match(/validateTarget\(\)/g) || []).length, 3);
  const clear = bridge.slice(bridge.indexOf('private func clearTarget()'), bridge.indexOf('private func observeTargetFocus()'));
  assert.doesNotMatch(clear, /focusDiagnostics/);
  const diagnostic = bridge.slice(bridge.indexOf('@_cdecl("hf_focus_diagnostic")'), bridge.indexOf('private func focused('));
  assert.doesNotMatch(diagnostic, /AXUIElement|AXIsProcessTrusted|NSWorkspace/);
});
