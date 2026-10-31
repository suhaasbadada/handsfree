//! Clipboard ownership requires a responsive HWND even while UIA or delayed
//! rendering blocks the delivery worker. This thread does *only* window/message
//! work: no COM, clipboard transactions, app locks or potentially slow commands.
use std::{sync::mpsc, thread};
use windows::{
    core::{w, PCWSTR},
    Win32::{
        Foundation::*,
        System::Threading::{GetCurrentThreadId, INFINITE},
        UI::WindowsAndMessaging::*,
    },
};

pub struct ClipboardWindow {
    window: HWND,
    thread_id: u32,
    thread: Option<thread::JoinHandle<()>>,
}
impl ClipboardWindow {
    pub fn create() -> Option<Self> {
        let (ready, result) = mpsc::sync_channel(1);
        let thread = thread::spawn(move || unsafe {
            let window = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                w!("STATIC"),
                PCWSTR::null(),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                None,
                None,
            );
            let Ok(window) = window else {
                return;
            };
            // HWND is communicated as an address, not a Rust-owned object; all
            // creation, dispatch and destruction stay on this owner thread.
            if ready
                .send((window.0 as usize, GetCurrentThreadId()))
                .is_err()
            {
                let _ = DestroyWindow(window);
                return;
            }
            while pump_messages(32) {
                if MsgWaitForMultipleObjectsEx(None, INFINITE, QS_ALLINPUT, MWMO_INPUTAVAILABLE)
                    == WAIT_FAILED
                {
                    break;
                }
            }
            let _ = DestroyWindow(window);
        });
        // Receive the thread identity before publishing the guard, so every
        // successful creation has a wake-and-join teardown path.
        match result.recv() {
            Ok((window, thread_id)) => Some(Self {
                window: HWND(window as *mut _),
                thread_id,
                thread: Some(thread),
            }),
            Err(_) => {
                let _ = thread.join();
                None
            }
        }
    }
    pub fn handle(&self) -> HWND {
        self.window
    }
}
impl Drop for ClipboardWindow {
    fn drop(&mut self) {
        if let Some(thread) = self.thread.take() {
            unsafe {
                let _ = PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
            }
            let _ = thread.join();
        }
    }
}
unsafe fn pump_messages(limit: usize) -> bool {
    let mut message = MSG::default();
    for _ in 0..limit {
        // PeekMessage dispatches pending cross-thread SendMessage calls too,
        // including WM_DESTROYCLIPBOARD sent by another app's EmptyClipboard.
        if !PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
            break;
        }
        if message.message == WM_QUIT {
            return false;
        }
        let _ = TranslateMessage(&message);
        DispatchMessageW(&message);
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    #[test]
    fn clipboard_owner_responds_while_delivery_worker_is_blocked() {
        let (ready, result) = mpsc::sync_channel(1);
        let (release, blocked_command) = mpsc::channel();
        let (destroyed, teardown) = mpsc::sync_channel(1);
        // Represent a COM worker parked inside an arbitrarily slow command.
        let worker = thread::spawn(move || {
            let window = ClipboardWindow::create().expect("message-only owner window");
            ready.send(window.handle().0 as usize).unwrap();
            blocked_command.recv().unwrap();
            drop(window); // wake, destroy on owner thread, join before ack
            destroyed.send(()).unwrap();
        });
        let window = result.recv_timeout(Duration::from_secs(2)).unwrap();
        let mut reply = 0;
        // This is exactly the synchronous notification used when another app
        // empties an owned clipboard, without touching the machine's clipboard.
        let responsive = unsafe {
            SendMessageTimeoutW(
                HWND(window as *mut _),
                WM_DESTROYCLIPBOARD,
                WPARAM(0),
                LPARAM(0),
                SMTO_ABORTIFHUNG | SMTO_BLOCK,
                1_000,
                Some(&mut reply),
            )
            .0 != 0
        };
        release.send(()).unwrap();
        teardown.recv_timeout(Duration::from_secs(2)).unwrap();
        worker.join().unwrap();
        assert!(
            responsive,
            "clipboard owner must dispatch sent messages during blocked delivery work"
        );
    }
}
