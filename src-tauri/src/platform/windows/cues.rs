use std::{
    io::Cursor,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use windows::{core::PCWSTR, Win32::Media::Audio::*};
#[derive(Clone, Copy)]
pub struct Profile {
    enabled: bool,
    volume: f32,
    style: i32,
}
static PROFILE: Mutex<Profile> = Mutex::new(Profile {
    enabled: false,
    volume: 0.5,
    style: 0,
});
static SESSION: Mutex<Profile> = Mutex::new(Profile {
    enabled: false,
    volume: 0.5,
    style: 0,
});
static PLAYING: AtomicBool = AtomicBool::new(false);
pub fn snapshot() -> Profile {
    *PROFILE.lock().unwrap()
}
pub fn session(profile: Profile) {
    *SESSION.lock().unwrap() = profile;
}
pub fn enabled(value: bool) {
    PROFILE.lock().unwrap().enabled = value;
}
pub fn volume(value: f32) {
    if value.is_finite() {
        PROFILE.lock().unwrap().volume = value.clamp(0., 1.);
    }
}
pub fn style(value: i32) {
    PROFILE.lock().unwrap().style = value;
}
fn wav(profile: Profile, end: bool) -> Option<Vec<u8>> {
    let bytes = match (profile.style == 1, end) {
        (false, false) => {
            include_bytes!("../../../native/assets/sounds/clean-start.wav").as_slice()
        }
        (false, true) => include_bytes!("../../../native/assets/sounds/clean-end.wav").as_slice(),
        (true, false) => include_bytes!("../../../native/assets/sounds/warm-start.wav").as_slice(),
        (true, true) => include_bytes!("../../../native/assets/sounds/warm-end.wav").as_slice(),
    };
    let mut reader = hound::WavReader::new(Cursor::new(bytes)).ok()?;
    let mut buffer = Cursor::new(Vec::new());
    {
        let mut writer = hound::WavWriter::new(&mut buffer, reader.spec()).ok()?;
        for sample in reader.samples::<i16>() {
            writer
                .write_sample((sample.ok()? as f32 * profile.volume) as i16)
                .ok()?;
        }
        writer.finalize().ok()?;
    }
    Some(buffer.into_inner())
}
fn play(profile: Profile, end: bool) -> bool {
    if !profile.enabled || profile.volume == 0. {
        return true;
    }
    let Some(bytes) = wav(profile, end) else {
        return false;
    };
    // Synchronous memory playback keeps the PCM alive, on this sound worker only.
    unsafe {
        PlaySoundW(
            PCWSTR(bytes.as_ptr().cast()),
            None,
            SND_MEMORY | SND_SYNC | SND_NODEFAULT,
        )
        .as_bool()
    }
}
pub fn start(profile: Profile, epoch: u64, allowed: extern "C" fn(u64) -> bool) -> bool {
    cancel();
    while PLAYING.load(Ordering::Acquire) {
        std::thread::sleep(Duration::from_millis(5));
    }
    if !allowed(epoch) {
        return false;
    }
    PLAYING.store(true, Ordering::Release);
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        if allowed(epoch) {
            let _ = play(profile, false);
        }
        PLAYING.store(false, Ordering::Release);
        let _ = sender.send(());
    });
    loop {
        match receiver.recv_timeout(Duration::from_millis(10)) {
            Ok(()) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return false,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                if !allowed(epoch) {
                    cancel();
                    return false;
                }
            }
        }
    }
    // A quiet start keeps the same cue-to-microphone gap as macOS.
    for _ in 0..18 {
        if !allowed(epoch) {
            return false;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    allowed(epoch)
}
pub fn finish(epoch: u64, allowed: extern "C" fn(u64) -> bool) {
    let profile = *SESSION.lock().unwrap();
    if !allowed(epoch) || PLAYING.swap(true, Ordering::AcqRel) {
        return;
    }
    std::thread::spawn(move || {
        if allowed(epoch) {
            let _ = play(profile, true);
        }
        PLAYING.store(false, Ordering::Release);
    });
}
pub fn preview() -> bool {
    if super::ACTIVE.load(Ordering::Acquire) || PLAYING.swap(true, Ordering::AcqRel) {
        return false;
    }
    let mut profile = snapshot();
    // Preview is explicit even when automatic recording cues are disabled,
    // and previews the same selected end cue as macOS.
    profile.enabled = true;
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let result = play(profile, true);
        PLAYING.store(false, Ordering::Release);
        let _ = sender.send(result);
    });
    receiver.recv().unwrap_or(false)
}
pub fn cancel() {
    unsafe {
        let _ = PlaySoundW(PCWSTR::null(), None, SND_SYNC);
    }
}
