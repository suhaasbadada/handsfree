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
        case 1: return HFCaptureInstall(fake, ^(AVAudioPCMBuffer *buffer, AVAudioTime *time) {});
        case 2: return HFCapturePrepare(fake);
        case 3: return HFCaptureStart(fake);
        case 4: return HFCaptureStop(fake);
        default: return HFCaptureRemove(fake);
    }
}
