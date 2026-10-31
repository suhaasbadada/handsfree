//! Conservative UI Automation identity + owned clipboard transaction.
//! SendInput is global: a final foreground/focus check cannot atomically bind it
//! to an editor. Never retry a partially submitted shortcut.
use super::clipboard_window::ClipboardWindow;
use std::{
    ffi::CStr,
    sync::{mpsc, OnceLock},
    time::{Duration, Instant},
};
use windows::{
    core::Interface,
    Win32::{
        Foundation::*,
        System::{Com::*, DataExchange::*, Memory::*, Ole::*, Variant::*},
        UI::{Accessibility::*, Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
    },
};
type Allowed = extern "C" fn(u64) -> bool;
enum Command {
    Capture(mpsc::SyncSender<()>),
    Discard(mpsc::SyncSender<()>),
    Paste(String, u64, Allowed, mpsc::SyncSender<i32>),
    Copy(String, Option<(u64, Allowed)>, mpsc::SyncSender<i32>),
    Quit(mpsc::SyncSender<()>),
}
static OWNER: OnceLock<Option<mpsc::Sender<Command>>> = OnceLock::new();
#[derive(Clone, Debug, PartialEq)]
struct Identity {
    window: usize,
    process: u32,
    runtime: Vec<i32>,
}
struct Target {
    identity: Identity,
}
struct Restore {
    formats: Vec<(u32, Vec<u8>)>,
    sequence: u32,
    generation: u64,
    deadline: Instant,
}
struct State {
    automation: Option<IUIAutomation>,
    window: HWND,
    target: Result<Target, i32>,
    pending: Option<Restore>,
    generation: u64,
}
fn owner() -> Option<&'static mpsc::Sender<Command>> {
    OWNER
        .get_or_init(|| {
            let (sender, receiver) = mpsc::channel();
            let (ready, result) = mpsc::sync_channel(1);
            std::thread::spawn(move || unsafe {
                run(receiver, ready);
            });
            if result.recv_timeout(Duration::from_secs(2)).ok() == Some(true) {
                Some(sender)
            } else {
                None
            }
        })
        .as_ref()
}
pub fn capture() {
    if let Some(owner) = owner() {
        let (sender, receiver) = mpsc::sync_channel(1);
        if owner.send(Command::Capture(sender)).is_ok() {
            let _ = receiver.recv();
        }
    }
}
pub fn discard() {
    if let Some(owner) = owner() {
        let (sender, receiver) = mpsc::sync_channel(1);
        if owner.send(Command::Discard(sender)).is_ok() {
            let _ = receiver.recv();
        }
    }
}
pub unsafe fn paste(text: *const std::ffi::c_char, epoch: u64, allowed: Allowed) -> i32 {
    if text.is_null() {
        return -1;
    }
    let Some(owner) = owner() else {
        return 1;
    };
    let text = CStr::from_ptr(text).to_string_lossy().into_owned();
    let (sender, receiver) = mpsc::sync_channel(1);
    if owner
        .send(Command::Paste(text, epoch, allowed, sender))
        .is_err()
    {
        return 1;
    }
    receiver.recv().unwrap_or(1)
}
pub unsafe fn copy(text: *const std::ffi::c_char, guard: Option<(u64, Allowed)>) -> i32 {
    if text.is_null() {
        return -1;
    }
    let Some(owner) = owner() else {
        return 10;
    };
    let text = CStr::from_ptr(text).to_string_lossy().into_owned();
    let (sender, receiver) = mpsc::sync_channel(1);
    if owner.send(Command::Copy(text, guard, sender)).is_err() {
        return 10;
    }
    receiver.recv().unwrap_or(10)
}
pub fn cleanup() {
    if let Some(owner) = OWNER.get().and_then(Option::as_ref) {
        let (sender, receiver) = mpsc::sync_channel(1);
        if owner.send(Command::Quit(sender)).is_ok() {
            let _ = receiver.recv_timeout(Duration::from_secs(2));
        }
    }
}
unsafe fn runtime_id(element: &IUIAutomationElement) -> Result<Vec<i32>, i32> {
    let array = element.GetRuntimeId().map_err(|_| 3)?;
    if array.is_null() {
        return Err(3);
    }
    let result = (|| {
        if SafeArrayGetDim(array) != 1 || SafeArrayGetElemsize(array) != 4 {
            return Err(3);
        }
        let low = SafeArrayGetLBound(array, 1).map_err(|_| 3)?;
        let high = SafeArrayGetUBound(array, 1).map_err(|_| 3)?;
        if high < low || high as i64 - low as i64 > 127 {
            return Err(3);
        }
        (low..=high)
            .map(|index| {
                let mut value = 0i32;
                SafeArrayGetElement(array, &index, (&mut value as *mut i32).cast())
                    .map_err(|_| 3)?;
                Ok(value)
            })
            .collect()
    })();
    let _ = SafeArrayDestroy(array);
    result
}
unsafe fn editable(element: &IUIAutomationElement) -> Result<(), i32> {
    if element.CurrentIsPassword().map_err(|_| 8)?.as_bool() {
        return Err(7);
    }
    if !element.CurrentIsEnabled().map_err(|_| 8)?.as_bool() {
        return Err(9);
    }
    if let Ok(value) = element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
    {
        if value.CurrentIsReadOnly().map_err(|_| 8)?.as_bool() {
            return Err(9);
        }
        return Ok(());
    }
    // TextPattern alone also exists on read-only documents. Require Edit
    // control type and an explicitly false IsReadOnly attribute, not an empty,
    // mixed or unsupported attribute that happens to coerce to false.
    if element.CurrentControlType().map_err(|_| 8)? == UIA_EditControlTypeId {
        let text = element
            .GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId)
            .map_err(|_| 8)?;
        let readonly = text
            .DocumentRange()
            .map_err(|_| 8)?
            .GetAttributeValue(UIA_IsReadOnlyAttributeId)
            .map_err(|_| 8)?;
        if readonly.vt() != VT_BOOL {
            return Err(8);
        }
        return if bool::try_from(&readonly).map_err(|_| 8)? {
            Err(9)
        } else {
            Ok(())
        };
    }
    Err(8)
}
unsafe fn identity(automation: &IUIAutomation) -> Result<Identity, i32> {
    let window = GetForegroundWindow();
    if window.0.is_null() {
        return Err(2);
    }
    let mut process = 0;
    GetWindowThreadProcessId(window, Some(&mut process));
    if process == std::process::id() {
        return Err(15);
    }
    let element = automation.GetFocusedElement().map_err(|_| 3)?;
    if !element.CurrentHasKeyboardFocus().map_err(|_| 3)?.as_bool() {
        return Err(3);
    }
    if element.CurrentProcessId().map_err(|_| 3)? as u32 != process {
        return Err(6);
    }
    editable(&element)?;
    let runtime = runtime_id(&element)?;
    // UIA is out-of-process and can take time. Recheck foreground afterwards.
    let mut now_process = 0;
    let now = GetForegroundWindow();
    GetWindowThreadProcessId(now, Some(&mut now_process));
    if now != window || now_process != process {
        return Err(4);
    }
    Ok(Identity {
        window: window.0 as usize,
        process,
        runtime,
    })
}
fn matches(original: &Identity, current: Result<Identity, i32>) -> Result<(), i32> {
    let current = current?;
    if current.window != original.window || current.process != original.process {
        return Err(4);
    }
    if current.runtime != original.runtime {
        return Err(6);
    }
    Ok(())
}
fn checkpoint(
    allowed: impl Fn() -> bool,
    validate: impl FnOnce() -> Result<(), i32>,
) -> Result<(), i32> {
    if !allowed() {
        return Err(16);
    }
    validate()?;
    // UIA can make cross-process COM calls: cancellation received during that
    // work must win before the clipboard or global input is published.
    if !allowed() {
        return Err(16);
    }
    Ok(())
}
struct Clipboard;
impl Clipboard {
    unsafe fn open(window: HWND) -> Result<Self, i32> {
        OpenClipboard(Some(window)).map_err(|_| 10)?;
        Ok(Self)
    }
}
impl Drop for Clipboard {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseClipboard();
        }
    }
}
unsafe fn snapshot() -> Result<Vec<(u32, Vec<u8>)>, i32> {
    let mut formats = Vec::new();
    let mut format = 0;
    loop {
        SetLastError(WIN32_ERROR(0));
        format = EnumClipboardFormats(format);
        if format == 0 {
            if GetLastError().0 != 0 {
                return Err(10);
            }
            break;
        }
        // No fake preservation of images, owner-display, private or registered
        // formats. They trigger intentional transcript-copy fallback instead.
        if ![1, 7, 13, 16].contains(&format) {
            return Err(10);
        }
        let handle = GetClipboardData(format).map_err(|_| 10)?;
        let global = HGLOBAL(handle.0);
        let size = GlobalSize(global);
        if size == 0 || size > 16 * 1024 * 1024 {
            return Err(10);
        }
        let pointer = GlobalLock(global);
        if pointer.is_null() {
            return Err(10);
        }
        let bytes = std::slice::from_raw_parts(pointer.cast::<u8>(), size).to_vec();
        let _ = GlobalUnlock(global);
        formats.push((format, bytes));
    }
    Ok(formats)
}
unsafe fn publish(format: u32, bytes: &[u8]) -> Result<(), i32> {
    let handle = GlobalAlloc(GMEM_MOVEABLE, bytes.len()).map_err(|_| 10)?;
    let pointer = GlobalLock(handle);
    if pointer.is_null() {
        let _ = GlobalFree(Some(handle));
        return Err(10);
    }
    std::ptr::copy_nonoverlapping(bytes.as_ptr(), pointer.cast(), bytes.len());
    let _ = GlobalUnlock(handle);
    if SetClipboardData(format, Some(HANDLE(handle.0))).is_err() {
        let _ = GlobalFree(Some(handle));
        return Err(10);
    }
    Ok(())
}
fn unicode(text: &str) -> Vec<u8> {
    text.encode_utf16()
        .chain(Some(0))
        .flat_map(u16::to_le_bytes)
        .collect()
}
impl State {
    unsafe fn restore(&mut self) {
        let Some(pending) = self.pending.take() else {
            return;
        };
        if pending.generation != self.generation
            || GetClipboardSequenceNumber() != pending.sequence
            || GetClipboardOwner().ok() != Some(self.window)
        {
            return;
        }
        let Ok(_clipboard) = Clipboard::open(self.window) else {
            return;
        };
        if GetClipboardSequenceNumber() != pending.sequence
            || GetClipboardOwner().ok() != Some(self.window)
        {
            return;
        }
        if EmptyClipboard().is_err() {
            return;
        }
        for (format, bytes) in pending.formats {
            let _ = publish(format, &bytes);
        }
    }
    unsafe fn validate(&self) -> Result<(), i32> {
        let target = self.target.as_ref().map_err(|code| *code)?;
        matches(
            &target.identity,
            identity(self.automation.as_ref().ok_or(1)?),
        )
    }
    unsafe fn paste(&mut self, text: &str, epoch: u64, allowed: Allowed) -> i32 {
        self.restore();
        let result = (|| -> Result<(), i32> {
            if !allowed(epoch) {
                return Err(16);
            }
            checkpoint(|| allowed(epoch), || self.validate())?;
            let clipboard = Clipboard::open(self.window)?;
            let sequence = GetClipboardSequenceNumber();
            let owner = GetClipboardOwner().ok();
            let formats = snapshot()?;
            // Rendering can call the clipboard owner. A changed sequence or
            // target invalidates the transaction before publishing any text.
            if GetClipboardSequenceNumber() != sequence || GetClipboardOwner().ok() != owner {
                return Err(10);
            }
            checkpoint(|| allowed(epoch), || self.validate())?;
            if !allowed(epoch) {
                return Err(16);
            }
            EmptyClipboard().map_err(|_| 10)?;
            if publish(13, &unicode(text)).is_err() {
                for (format, bytes) in formats {
                    let _ = publish(format, &bytes);
                }
                return Err(10);
            }
            self.pending = Some(Restore {
                formats,
                sequence: GetClipboardSequenceNumber(),
                generation: self.generation,
                deadline: Instant::now() + Duration::from_millis(800),
            });
            drop(clipboard);
            checkpoint(|| allowed(epoch), || self.validate())?;
            if !allowed(epoch) {
                return Err(16);
            }
            // Do not combine our paste with physically held modifiers.
            if [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN]
                .iter()
                .any(|key| GetAsyncKeyState(key.0 as i32) < 0)
            {
                return Err(11);
            }
            let events = [
                key(VK_CONTROL, false),
                key(VK_V, false),
                key(VK_V, true),
                key(VK_CONTROL, true),
            ];
            // Last cancellation boundary immediately before global submission.
            if !allowed(epoch) {
                return Err(16);
            }
            let count = SendInput(&events, std::mem::size_of::<INPUT>() as i32);
            match submission(count) {
                0 => Ok(()),
                17 => {
                    let releases = [key(VK_V, true), key(VK_CONTROL, true)];
                    let _ = SendInput(&releases, std::mem::size_of::<INPUT>() as i32);
                    Err(17)
                }
                code => Err(code),
            }
        })();
        let code = result.err().unwrap_or(0);
        if code != 0 && code != 17 {
            self.restore();
        }
        self.target = Err(2);
        code
    }
    unsafe fn copy(&mut self, text: &str, guard: Option<(u64, Allowed)>) -> i32 {
        // Explicit fallback supersedes pending restoration. Restore the old
        // transaction first; leave the intentionally copied transcript intact.
        self.restore();
        self.generation = self.generation.wrapping_add(1);
        let allowed = || guard.is_none_or(|(epoch, callback)| callback(epoch));
        if !allowed() {
            return 16;
        }
        let Ok(_clipboard) = Clipboard::open(self.window) else {
            return 10;
        };
        if !allowed() {
            return 16;
        }
        if EmptyClipboard().is_err() {
            return 10;
        }
        publish(13, &unicode(text)).err().unwrap_or(0)
    }
}
fn submission(count: u32) -> i32 {
    match count {
        4 => 0,
        0 => 11,
        _ => 17,
    }
}
fn key(vk: VIRTUAL_KEY, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                dwFlags: if up {
                    KEYEVENTF_KEYUP
                } else {
                    KEYBD_EVENT_FLAGS(0)
                },
                ..Default::default()
            },
        },
    }
}
unsafe fn run(receiver: mpsc::Receiver<Command>, ready: mpsc::SyncSender<bool>) {
    if CoInitializeEx(None, COINIT_MULTITHREADED).is_err() {
        let _ = ready.send(false);
        return;
    }
    let automation: Option<IUIAutomation> =
        CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER).ok();
    if let Some(automation) = automation.as_ref() {
        if let Ok(options) = automation.cast::<IUIAutomation2>() {
            let _ = options.SetConnectionTimeout(500);
            let _ = options.SetTransactionTimeout(1_000);
        }
    }
    // Ownership notifications must remain responsive even during a slow COM
    // request or clipboard render. Never put these operations on the HWND pump.
    let Some(window) = ClipboardWindow::create() else {
        let _ = ready.send(false);
        drop(automation);
        CoUninitialize();
        return;
    };
    let mut state = State {
        automation,
        window: window.handle(),
        target: Err(2),
        pending: None,
        generation: 0,
    };
    let _ = ready.send(true);
    let mut quit_reply = None;
    loop {
        if state
            .pending
            .as_ref()
            .is_some_and(|pending| Instant::now() >= pending.deadline)
        {
            state.restore();
        }
        match receiver.recv_timeout(Duration::from_millis(25)) {
            Ok(Command::Capture(reply)) => {
                state.restore();
                state.generation = state.generation.wrapping_add(1);
                state.target = state
                    .automation
                    .as_ref()
                    .ok_or(1)
                    .and_then(|automation| identity(automation))
                    .map(|identity| Target { identity })
                    .map_err(|code| match code {
                        7 => 12,
                        8 => 13,
                        9 => 14,
                        _ => code,
                    });
                let _ = reply.send(());
            }
            Ok(Command::Discard(reply)) => {
                state.restore();
                state.generation = state.generation.wrapping_add(1);
                state.target = Err(2);
                let _ = reply.send(());
            }
            Ok(Command::Paste(text, epoch, allowed, reply)) => {
                let code = state.paste(&text, epoch, allowed);
                let _ = reply.send(code);
            }
            Ok(Command::Copy(text, guard, reply)) => {
                let code = state.copy(&text, guard);
                let _ = reply.send(code);
            }
            Ok(Command::Quit(reply)) => {
                quit_reply = Some(reply);
                break;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(_) => {
                state.restore();
                break;
            }
        }
    }
    state.restore();
    // Release UIA while its COM apartment still exists, and keep the owner
    // pumping until all owned restoration has completed. Ack only after teardown.
    drop(state);
    drop(window);
    CoUninitialize();
    if let Some(reply) = quit_reply {
        let _ = reply.send(());
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identity_requires_window_process_and_runtime() {
        let identity = Identity {
            window: 7,
            process: 9,
            runtime: vec![1, 2, 3],
        };
        assert_eq!(matches(&identity, Ok(identity.clone())), Ok(()));
        for changed in [
            Identity {
                window: 8,
                ..identity.clone()
            },
            Identity {
                process: 10,
                ..identity.clone()
            },
            Identity {
                runtime: vec![1, 2, 4],
                ..identity.clone()
            },
        ] {
            assert!(matches(&identity, Ok(changed)).is_err());
        }
        assert_eq!(matches(&identity, Err(7)), Err(7));
    }
    #[test]
    fn partial_submission_never_becomes_safe_fallback() {
        assert_eq!(submission(0), 11);
        assert_eq!(submission(4), 0);
        for count in 1..4 {
            assert_eq!(submission(count), 17);
            assert!(!crate::logic::should_copy_fallback(
                "dictation",
                submission(count)
            ));
        }
    }
    #[test]
    fn cancel_during_focus_security_validation_wins_before_publication() {
        let allowed = std::cell::Cell::new(true);
        assert_eq!(
            checkpoint(
                || allowed.get(),
                || {
                    allowed.set(false);
                    Ok(())
                }
            ),
            Err(16)
        );
        assert_eq!(
            checkpoint(|| false, || panic!("cancelled work must not inspect focus")),
            Err(16)
        );
        for refusal in [4, 6, 7, 8, 9] {
            assert_eq!(checkpoint(|| true, || Err(refusal)), Err(refusal));
        }
    }
}
