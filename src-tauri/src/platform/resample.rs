//! Persistent, bounded, windowed-sinc low-pass conversion to 16 kHz.
//! 96–768 taps, Hann window, 90% Nyquist pass band. Never linearly decimate:
//! hardware input above 8 kHz must not alias into speech frequencies.
use std::collections::VecDeque;
pub struct Resampler {
    samples: VecDeque<f32>,
    base: i64,
    received: i64,
    next: u64,
    rate: u32,
    half: i64,
}
impl Resampler {
    pub fn new(rate: u32) -> Self {
        assert!((8_000..=384_000).contains(&rate));
        Self {
            samples: VecDeque::new(),
            base: 0,
            received: 0,
            next: 0,
            rate,
            // Keep at least the 48 kHz filter's time support at higher input
            // rates. Fixed source-rate taps lose stop-band rejection as the
            // decimation ratio grows. The accepted rate bounds cap this at
            // 768 taps/output sample and 768 retained input samples.
            half: 48 * rate.div_ceil(48_000) as i64,
        }
    }
    pub fn push(&mut self, mono: &[f32], finish: bool) -> Vec<f32> {
        self.samples
            .extend(mono.iter().map(|s| if s.is_finite() { *s } else { 0.0 }));
        self.received += mono.len() as i64;
        let mut output = Vec::new();
        let cutoff = (16_000.0 / self.rate as f64).min(1.0) * 0.90;
        loop {
            let position = self.next as f64 * self.rate as f64 / 16_000.0;
            let center = position.floor() as i64;
            if position >= self.received as f64 || (!finish && center + self.half >= self.received)
            {
                break;
            }
            let mut value = 0.0;
            let mut weight = 0.0;
            for index in center - self.half + 1..=center + self.half {
                let distance = index as f64 - position;
                let x = std::f64::consts::PI * distance * cutoff;
                let sinc = if x.abs() < 1e-12 { 1.0 } else { x.sin() / x };
                let window = 0.5 + 0.5 * (std::f64::consts::PI * distance / self.half as f64).cos();
                let w = cutoff * sinc * window;
                weight += w;
                if index >= self.base && index < self.received {
                    value += self.samples[(index - self.base) as usize] as f64 * w;
                }
            }
            output.push((value / weight) as f32);
            self.next += 1;
        }
        let keep = (self.next as f64 * self.rate as f64 / 16_000.0).floor() as i64 - self.half;
        while self.base < keep && !self.samples.is_empty() {
            self.samples.pop_front();
            self.base += 1;
        }
        output
    }
}
pub fn downmix(samples: &[f32], channels: usize) -> Vec<f32> {
    samples
        .chunks_exact(channels)
        .map(|frame| {
            frame
                .iter()
                .map(|s| if s.is_finite() { *s } else { 0.0 })
                .sum::<f32>()
                / channels as f32
        })
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_channels_and_nonfinite_input() {
        assert_eq!(downmix(&[1., 0., -1., 0., 1., 1., 1., 1.], 4), [0., 1.]);
        assert_eq!(downmix(&[f32::NAN, 1.], 2), [0.5]);
    }
    #[test]
    fn persistent_rate_duration_drain_and_bounded_history() {
        for rate in [44_100, 48_000, 96_000, 192_000, 384_000] {
            let mut resampler = Resampler::new(rate);
            let input: Vec<_> = (0..rate).map(|i| (i as f32 * 0.01).sin()).collect();
            let mut output = Vec::new();
            for chunk in input.chunks(137) {
                output.extend(resampler.push(chunk, false));
                assert!(resampler.samples.len() <= (2 * resampler.half + 2) as usize);
            }
            output.extend(resampler.push(&[], true));
            assert_eq!(output.len(), 16_000);
            assert!(resampler.push(&[], true).is_empty());
            let mut single = Resampler::new(rate);
            assert_eq!(output, single.push(&input, true));
        }
    }
    #[test]
    fn lowpass_rejects_aliases() {
        for rate in [44_100, 48_000, 96_000, 192_000, 384_000] {
            let rms = |frequency: f64| {
                let input: Vec<f32> = (0..rate / 10)
                    .map(|i| {
                        (i as f64 * std::f64::consts::TAU * frequency / rate as f64).sin() as f32
                    })
                    .collect();
                let out = Resampler::new(rate).push(&input, true);
                (out[200..1_400].iter().map(|s| s * s).sum::<f32>() / 1_200.0).sqrt()
            };
            let passband = rms(1_000.);
            assert!(passband > 0.69);
            let rejection_db = 20. * (rms(9_000.) / passband).log10();
            eprintln!("{rate} Hz input: 9 kHz alias/passband = {rejection_db:.1} dB");
            assert!(
                rejection_db < -45.,
                "{rate} Hz: 9 kHz alias rejection {rejection_db} dB"
            );
            // Check nearby frequencies too: a single fortuitous window null
            // must not conceal a weak stop band at high hardware rates.
            for frequency in [9_100., 9_500., 10_000., 12_000.] {
                let rejection_db = 20. * (rms(frequency) / passband).log10();
                assert!(
                    rejection_db < -45.,
                    "{rate} Hz: {frequency} Hz alias rejection {rejection_db} dB"
                );
            }
            assert!(rms(12_000.) < 0.002, "{rate} Hz: 12 kHz alias");
        }
    }
}
