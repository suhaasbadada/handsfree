//! One Win32 message-loop owner for hotkeys, Escape and the no-activate HUD.
use crate::control_tap::{is_right_control, ControlTap};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicI32, Ordering},
        mpsc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
use windows::core::BOOL;
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::{
    core::w,
    Win32::{
        Foundation::*,
        Graphics::Gdi::*,
        System::{LibraryLoader::GetModuleHandleW, Threading::GetCurrentThreadId},
        UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
    },
};
static CALLBACK: Mutex<Option<extern "C" fn(i32)>> = Mutex::new(None);
static TAP: Mutex<ControlTap> = Mutex::new(ControlTap::new());
static RIGHT_CONTROL: AtomicBool = AtomicBool::new(false);
static CLOCK: OnceLock<Instant> = OnceLock::new();
pub static REASON: AtomicI32 = AtomicI32::new(0);
pub static CAPTURING: AtomicBool = AtomicBool::new(false);
pub static PHASE: AtomicI32 = AtomicI32::new(0);
struct Owner {
    sender: mpsc::Sender<Command>,
    thread: u32,
}
enum Command {
    Probe(mpsc::SyncSender<bool>),
    Bind(i32, u32, mpsc::SyncSender<bool>),
    Capture(bool),
    Phase(i32),
    Quit,
}
static OWNER: OnceLock<Option<Owner>> = OnceLock::new();
fn dispatch(event: i32) {
    let callback = *CALLBACK.lock().unwrap();
    if let Some(callback) = callback {
        callback(event);
    }
}
fn owner() -> Option<&'static Owner> {
    OWNER
        .get_or_init(|| {
            let (sender, receiver) = mpsc::channel();
            let (ready, result) = mpsc::sync_channel(1);
            std::thread::spawn(move || unsafe {
                run(receiver, ready);
            });
            result
                .recv_timeout(Duration::from_secs(2))
                .ok()
                .filter(|id| *id != 0)
                .map(|thread| Owner { sender, thread })
        })
        .as_ref()
}
fn send(command: Command) -> bool {
    let Some(owner) = owner() else {
        REASON.store(103, Ordering::Release);
        return false;
    };
    if owner.sender.send(command).is_err() {
        return false;
    }
    unsafe { PostThreadMessageW(owner.thread, WM_APP, WPARAM(0), LPARAM(0)).is_ok() }
}
pub fn hook(callback: extern "C" fn(i32)) -> bool {
    *CALLBACK.lock().unwrap() = Some(callback);
    let (sender, receiver) = mpsc::sync_channel(1);
    if !send(Command::Probe(sender)) {
        REASON.store(103, Ordering::Release);
        return false;
    }
    match receiver.recv_timeout(Duration::from_secs(2)) {
        Ok(connected) => connected,
        Err(_) => {
            REASON.store(103, Ordering::Release);
            false
        }
    }
}
pub fn bind(code: i32, modifiers: u32) -> bool {
    let (sender, receiver) = mpsc::sync_channel(1);
    send(Command::Bind(code, modifiers, sender))
        && receiver
            .recv_timeout(Duration::from_secs(2))
            .unwrap_or(false)
}
pub fn capture(active: bool) {
    let _ = send(Command::Capture(active));
}
pub fn overlay(phase: i32) {
    let _ = send(Command::Phase(phase));
}
pub fn cleanup() {
    let _ = send(Command::Quit);
}
fn modifiers(mask: u32) -> HOT_KEY_MODIFIERS {
    MOD_NOREPEAT
        | HOT_KEY_MODIFIERS(
            ((mask & 1) * MOD_CONTROL.0)
                | (((mask >> 1) & 1) * MOD_ALT.0)
                | (((mask >> 2) & 1) * MOD_SHIFT.0)
                | (((mask >> 3) & 1) * MOD_WIN.0),
        )
}
unsafe extern "system" fn keyboard(code: i32, message: WPARAM, data: LPARAM) -> LRESULT {
    if code >= 0 {
        let key = &*(data.0 as *const KBDLLHOOKSTRUCT);
        let down = matches!(message.0 as u32, WM_KEYDOWN | WM_SYSKEYDOWN);
        let up = matches!(message.0 as u32, WM_KEYUP | WM_SYSKEYUP);
        let physical_right = is_right_control(
            key.vkCode,
            key.scanCode,
            key.flags & LLKHF_EXTENDED != KBDLLHOOKSTRUCT_FLAGS(0),
        );
        let injected =
            key.flags & (LLKHF_INJECTED | LLKHF_LOWER_IL_INJECTED) != KBDLLHOOKSTRUCT_FLAGS(0);
        let trigger = {
            let mut tap = TAP.lock().unwrap();
            if injected || !physical_right || !(down || up) {
                tap.interrupt();
                false
            } else {
                tap.key(
                    down,
                    CLOCK.get_or_init(Instant::now).elapsed().as_millis() as u64,
                    GetForegroundWindow().0 as usize,
                    RIGHT_CONTROL.load(Ordering::Acquire)
                        && !CAPTURING.load(Ordering::Acquire)
                        && !other_keys_held(),
                )
            }
        };
        if trigger {
            dispatch(7);
        }
    }
    if code >= 0
        && message.0 as u32 == WM_KEYDOWN
        && !CAPTURING.load(Ordering::Acquire)
        && super::ACTIVE.load(Ordering::Acquire)
    {
        let key = &*(data.0 as *const KBDLLHOOKSTRUCT);
        if key.vkCode == VK_ESCAPE.0 as u32
            && key.flags & LLKHF_INJECTED == KBDLLHOOKSTRUCT_FLAGS(0)
        {
            dispatch(4);
            return LRESULT(1);
        }
    }
    CallNextHookEx(None, code, message, data)
}
// Async state is sampled before the current hook event changes it. Exclude the
// generic Ctrl alias and the physical key itself, but NOT left Ctrl (AltGr).
unsafe fn other_keys_held() -> bool {
    (1..=254).any(|vk| {
        vk != VK_CONTROL.0 as i32 && vk != VK_RCONTROL.0 as i32 && GetAsyncKeyState(vk) < 0
    })
}
unsafe fn reset_tap() {
    TAP.lock()
        .unwrap()
        .reset(GetAsyncKeyState(VK_RCONTROL.0 as i32) < 0);
}
unsafe extern "system" fn mouse(code: i32, message: WPARAM, data: LPARAM) -> LRESULT {
    if code >= 0 && message.0 as u32 != WM_MOUSEMOVE {
        TAP.lock().unwrap().interrupt();
    }
    CallNextHookEx(None, code, message, data)
}
unsafe extern "system" fn foreground(
    _: HWINEVENTHOOK,
    _: u32,
    _: HWND,
    _: i32,
    _: i32,
    _: u32,
    _: u32,
) {
    TAP.lock().unwrap().interrupt();
}
#[derive(Clone, Copy)]
struct Hud {
    phase: i32,
    scale: f32,
    deadline: Option<Instant>,
    reduced: bool,
}
unsafe fn run(receiver: mpsc::Receiver<Command>, ready: mpsc::SyncSender<u32>) {
    let instance = GetModuleHandleW(None)
        .ok()
        .map(|module| HINSTANCE(module.0));
    let class = WNDCLASSW {
        lpfnWndProc: Some(window),
        hInstance: instance.unwrap_or_default(),
        lpszClassName: w!("HandsFreeDictationHUD"),
        hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
        ..Default::default()
    };
    if RegisterClassW(&class) == 0 {
        let _ = ready.send(0);
        return;
    }
    let mut animation = BOOL(1);
    let _ = SystemParametersInfoW(
        SPI_GETCLIENTAREAANIMATION,
        0,
        Some((&mut animation as *mut BOOL).cast()),
        SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
    );
    let mut hud = Box::new(Hud {
        phase: 0,
        scale: 1.,
        deadline: None,
        reduced: !animation.as_bool(),
    });
    let Ok(hwnd) = CreateWindowExW(
        WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST,
        w!("HandsFreeDictationHUD"),
        w!("HandsFree dictation"),
        WS_POPUP,
        0,
        0,
        150,
        44,
        None,
        None,
        instance,
        None,
    ) else {
        let _ = ready.send(0);
        return;
    };
    SetWindowLongPtrW(hwnd, GWLP_USERDATA, (&mut *hud as *mut Hud) as isize);
    let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard), instance, 0).ok();
    let mouse_hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse), instance, 0).ok();
    let focus_hook = SetWinEventHook(
        EVENT_SYSTEM_FOREGROUND,
        EVENT_SYSTEM_FOREGROUND,
        None,
        Some(foreground),
        0,
        0,
        WINEVENT_OUTOFCONTEXT,
    );
    let tap_hooks_ready = mouse_hook.is_some() && !focus_hook.is_invalid();
    let mut hooks_ready = hook.is_some() && tap_hooks_ready;
    RIGHT_CONTROL.store(hooks_ready, Ordering::Release);
    reset_tap();
    let mut binding = (VK_RCONTROL.0 as u32, 0);
    let mut registered = false;
    REASON.store(if !hooks_ready { 102 } else { 1 }, Ordering::Release);
    let _ = ready.send(GetCurrentThreadId());
    let mut message = MSG::default();
    'messages: while GetMessageW(&mut message, None, 0, 0).0 > 0 {
        if message.message == WM_HOTKEY && registered && !CAPTURING.load(Ordering::Acquire) {
            dispatch(7);
        }
        if message.message == WM_APP {
            for command in receiver.try_iter() {
                match command {
                    Command::Probe(reply) => {
                        let connected = hooks_ready
                            && (RIGHT_CONTROL.load(Ordering::Acquire)
                                || registered
                                || CAPTURING.load(Ordering::Acquire))
                            && REASON.load(Ordering::Acquire) == 1;
                        let _ = reply.send(connected);
                    }
                    Command::Bind(code, mask, reply) => {
                        if registered {
                            let _ = UnregisterHotKey(None, 1);
                        }
                        binding = (code as u32, mask);
                        reset_tap();
                        let right = binding == (VK_RCONTROL.0 as u32, 0);
                        hooks_ready = hook.is_some() && (!right || tap_hooks_ready);
                        RIGHT_CONTROL.store(right && hooks_ready, Ordering::Release);
                        // Binding validation runs even while shortcut capture is
                        // active; immediately unregister a successful probe.
                        registered =
                            !right && RegisterHotKey(None, 1, modifiers(mask), code as u32).is_ok();
                        let accepted = (right || registered) && hooks_ready;
                        REASON.store(
                            if !hooks_ready {
                                102
                            } else if right || registered {
                                1
                            } else {
                                101
                            },
                            Ordering::Release,
                        );
                        if CAPTURING.load(Ordering::Acquire) && registered {
                            let _ = UnregisterHotKey(None, 1);
                            registered = false;
                        }
                        let _ = reply.send(accepted);
                    }
                    Command::Capture(value) => {
                        reset_tap();
                        CAPTURING.store(value, Ordering::Release);
                        if registered {
                            let _ = UnregisterHotKey(None, 1);
                            registered = false;
                        }
                        if !value {
                            let right = binding == (VK_RCONTROL.0 as u32, 0);
                            registered = !right
                                && RegisterHotKey(None, 1, modifiers(binding.1), binding.0).is_ok();
                            REASON.store(
                                if !hooks_ready {
                                    102
                                } else if right || registered {
                                    1
                                } else {
                                    101
                                },
                                Ordering::Release,
                            );
                        }
                    }
                    Command::Phase(phase) => {
                        // Cancellation/automatic finish must not let a Ctrl
                        // pressed in the previous phase restart dictation.
                        if hud.phase != phase {
                            reset_tap();
                        }
                        hud.phase = phase;
                        PHASE.store(phase, Ordering::Release);
                        hud.deadline = if phase >= 3 {
                            Some(Instant::now() + Duration::from_secs(3))
                        } else {
                            None
                        };
                        let _ = KillTimer(Some(hwnd), 1);
                        if phase == 0 {
                            let _ = ShowWindow(hwnd, SW_HIDE);
                            continue;
                        }
                        let foreground = GetForegroundWindow();
                        hud.scale = (GetDpiForWindow(foreground).max(96) as f32 / 96.).max(1.);
                        let monitor = MonitorFromWindow(foreground, MONITOR_DEFAULTTONEAREST);
                        let mut info = MONITORINFO {
                            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                            ..Default::default()
                        };
                        if GetMonitorInfoW(monitor, &mut info).as_bool() {
                            let (width, height) = if phase == 2 { (54., 28.) } else { (150., 44.) };
                            let width = (width * hud.scale) as i32;
                            let height = (height * hud.scale) as i32;
                            let corner = (height as f32 * 0.8) as i32;
                            let region =
                                CreateRoundRectRgn(0, 0, width + 1, height + 1, corner, corner);
                            if SetWindowRgn(hwnd, Some(region), true) == 0 {
                                let _ = DeleteObject(region.into());
                            }
                            let _ = SetWindowPos(
                                hwnd,
                                Some(HWND_TOPMOST),
                                info.rcWork.left
                                    + (info.rcWork.right - info.rcWork.left - width) / 2,
                                info.rcWork.bottom - height - (28. * hud.scale) as i32,
                                width,
                                height,
                                SWP_NOACTIVATE | SWP_SHOWWINDOW,
                            );
                        }
                        let label = match phase {
                            1 => w!("HandsFree listening. Cancel or finish dictation."),
                            2 => w!("HandsFree processing. Click or Escape cancels."),
                            4 => w!("HandsFree could not hear speech."),
                            5 => w!("HandsFree transcript copied."),
                            _ => w!("HandsFree dictation needs attention."),
                        };
                        let _ = SetWindowTextW(hwnd, label);
                        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                        let _ = InvalidateRect(Some(hwnd), None, false);
                        SetTimer(Some(hwnd), 1, if hud.reduced { 200 } else { 33 }, None);
                    }
                    Command::Quit => break 'messages,
                }
            }
        }
        let _ = TranslateMessage(&message);
        DispatchMessageW(&message);
    }
    if registered {
        let _ = UnregisterHotKey(None, 1);
    }
    REASON.store(103, Ordering::Release);
    RIGHT_CONTROL.store(false, Ordering::Release);
    reset_tap();
    if !focus_hook.is_invalid() {
        let _ = UnhookWinEvent(focus_hook);
    }
    if let Some(hook) = mouse_hook {
        let _ = UnhookWindowsHookEx(hook);
    }
    if let Some(hook) = hook {
        let _ = UnhookWindowsHookEx(hook);
    }
    let _ = DestroyWindow(hwnd);
}
unsafe extern "system" fn window(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    let pointer = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut Hud;
    if message == WM_MOUSEACTIVATE {
        return LRESULT(MA_NOACTIVATE as isize);
    }
    if !pointer.is_null() {
        // Copy before Win32 calls: synchronous window-message reentrancy must
        // never alias a live &mut Hud. The owner thread serializes all writes.
        let mut hud = *pointer;
        match message {
            WM_LBUTTONUP if hud.phase == 2 => {
                dispatch(4);
                return LRESULT(0);
            }
            WM_LBUTTONUP if hud.phase == 1 => {
                let x = (lparam.0 as u16 as i16) as f32 / hud.scale;
                if x < 38. {
                    dispatch(4);
                } else if x > 112. {
                    dispatch(5);
                }
                return LRESULT(0);
            }
            WM_TIMER => {
                if hud
                    .deadline
                    .is_some_and(|deadline| Instant::now() >= deadline)
                {
                    hud.deadline = None;
                    hud.phase = 0;
                    *pointer = hud;
                    PHASE.store(0, Ordering::Release);
                    let _ = KillTimer(Some(hwnd), 1);
                    let _ = ShowWindow(hwnd, SW_HIDE);
                } else {
                    let _ = InvalidateRect(Some(hwnd), None, false);
                }
                return LRESULT(0);
            }
            WM_PAINT => {
                let mut paint = PAINTSTRUCT::default();
                let dc = BeginPaint(hwnd, &mut paint);
                let mut rect = RECT::default();
                let _ = GetClientRect(hwnd, &mut rect);
                let brush = CreateSolidBrush(COLORREF(0x00f3f6f7));
                FillRect(dc, &rect, brush);
                let _ = DeleteObject(brush.into());
                SetBkMode(dc, TRANSPARENT);
                SetTextColor(dc, COLORREF(0x004b4846));
                if hud.phase == 1 {
                    let s = hud.scale;
                    let mut left = RECT {
                        left: (12. * s) as i32,
                        top: (12. * s) as i32,
                        right: (30. * s) as i32,
                        bottom: (32. * s) as i32,
                    };
                    let mut right = RECT {
                        left: (120. * s) as i32,
                        top: (12. * s) as i32,
                        right: (140. * s) as i32,
                        bottom: (32. * s) as i32,
                    };
                    DrawTextW(
                        dc,
                        &mut ['×' as u16],
                        &mut left,
                        DT_CENTER | DT_SINGLELINE | DT_VCENTER,
                    );
                    DrawTextW(
                        dc,
                        &mut ['✓' as u16],
                        &mut right,
                        DT_CENTER | DT_SINGLELINE | DT_VCENTER,
                    );
                    let power = if hud.reduced {
                        0.
                    } else {
                        f32::from_bits(super::POWER.load(Ordering::Relaxed)).clamp(0., 1.)
                    };
                    let brush = CreateSolidBrush(COLORREF(0x00515de0));
                    for index in 0..7 {
                        // Every bar derives from the measured input RMS, not a
                        // synthetic sine/clock animation. Silence stays flat.
                        let h = (2.
                            + (power * 100.).min(23.) * (1. - ((index as f32 - 3.).abs() / 6.)))
                            * s;
                        let bar = RECT {
                            left: ((48. + index as f32 * 8.) * s) as i32,
                            right: ((51. + index as f32 * 8.) * s) as i32,
                            top: ((44. * s - h) / 2.) as i32,
                            bottom: ((44. * s + h) / 2.) as i32,
                        };
                        FillRect(dc, &bar, brush);
                    }
                    let _ = DeleteObject(brush.into());
                } else {
                    let text = match hud.phase {
                        2 => "× …",
                        4 => "No speech",
                        5 => "Copied",
                        _ => "Check settings",
                    };
                    let mut text: Vec<u16> = text.encode_utf16().collect();
                    DrawTextW(
                        dc,
                        &mut text,
                        &mut rect,
                        DT_CENTER | DT_SINGLELINE | DT_VCENTER,
                    );
                }
                let _ = EndPaint(hwnd, &paint);
                return LRESULT(0);
            }
            _ => {}
        }
    }
    DefWindowProcW(hwnd, message, wparam, lparam)
}
