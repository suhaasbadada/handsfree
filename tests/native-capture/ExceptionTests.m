#import "ExceptionTests.h"
static void failCapture(void) {
    @throw [NSException exceptionWithName:@"com.apple.coreaudio.avfaudio"
        reason:@"Failed to create tap due to format mismatch" userInfo:nil];
}
NSError *HFTestCaptureException(void) {
    return HFCaptureBoundary(^{ failCapture(); });
}

// A selector-compatible NSObject, NOT an AVAudioEngine/AVAudioNode. Exercise
// the actual production adapters without initializing any audio hardware.
@interface HFCaptureThrowingAdapter : NSObject
@end
@implementation HFCaptureThrowingAdapter
- (AVAudioFormat *)inputFormatForBus:(AVAudioNodeBus)bus { failCapture(); return nil; }
- (AVAudioFormat *)outputFormatForBus:(AVAudioNodeBus)bus { failCapture(); return nil; }
- (void)installTapOnBus:(AVAudioNodeBus)bus bufferSize:(AVAudioFrameCount)size
                format:(AVAudioFormat *)format block:(AVAudioNodeTapBlock)tap { failCapture(); }
- (void)prepare { failCapture(); }
- (BOOL)startAndReturnError:(NSError **)error { failCapture(); return NO; }
- (void)stop { failCapture(); }
- (void)removeTapOnBus:(AVAudioNodeBus)bus { failCapture(); }
@end
NSError *HFTestCaptureAdapter(int operation) {
    id fake = [HFCaptureThrowingAdapter new];
    AVAudioFormat *format = nil;
    switch (operation) {
        case 0: return HFCaptureFormat(fake, &format);
        case 1: return HFCaptureInstall(fake, [[AVAudioFormat alloc] initStandardFormatWithSampleRate:24000 channels:1], ^(AVAudioPCMBuffer *buffer, AVAudioTime *time) {});
        case 2: return HFCapturePrepare(fake);
        case 3: return HFCaptureStart(fake);
        case 4: return HFCaptureStop(fake);
        case 5: return HFCaptureRemove(fake);
        default: return HFCaptureOutputFormat(fake, &format);
    }
}

@interface HFCaptureFormatAdapter : NSObject
@property AVAudioFormat *hardware;
@property AVAudioFormat *output;
@property AVAudioFormat *received;
@end
@implementation HFCaptureFormatAdapter
- (AVAudioFormat *)inputFormatForBus:(AVAudioNodeBus)bus { return self.hardware; }
- (AVAudioFormat *)outputFormatForBus:(AVAudioNodeBus)bus { return self.output; }
- (void)installTapOnBus:(AVAudioNodeBus)bus bufferSize:(AVAudioFrameCount)size
                format:(AVAudioFormat *)format block:(AVAudioNodeTapBlock)tap {
    self.received = format;
    if (format) self.output = format; // nil retains the cached node output
}
@end
BOOL HFTestCaptureExplicitFormat(AVAudioFormat *fresh, AVAudioFormat *cached) {
    HFCaptureFormatAdapter *fake = [HFCaptureFormatAdapter new];
    fake.hardware = fresh; fake.output = cached;
    [fake installTapOnBus:0 bufferSize:2048 format:nil block:^(AVAudioPCMBuffer *b, AVAudioTime *t) {}];
    if (fake.output != cached) return NO;
    AVAudioFormat *hardware = nil, *output = nil;
    if (HFCaptureFormat((id)fake, &hardware) || hardware != fresh) return NO;
    if (HFCaptureInstall((id)fake, hardware, ^(AVAudioPCMBuffer *b, AVAudioTime *t) {})) return NO;
    return !HFCaptureOutputFormat((id)fake, &output) && fake.received == fresh && output == fresh;
}
