#import "CaptureException.h"

NSError *HFCaptureBoundary(void (NS_NOESCAPE ^operation)(void)) {
    @try { operation(); return nil; }
    @catch (NSException *exception) {
        return [NSError errorWithDomain:@"HandsFree capture exception" code:1
            userInfo:@{NSLocalizedDescriptionKey: exception.reason ?: exception.name}];
    }
}
NSError *HFCaptureFormat(AVAudioInputNode *input, AVAudioFormat **format) {
    __block AVAudioFormat *current = nil;
    NSError *error = HFCaptureBoundary(^{ current = [input inputFormatForBus:0]; });
    *format = current;
    return error;
}
NSError *HFCaptureOutputFormat(AVAudioInputNode *input, AVAudioFormat **format) {
    __block AVAudioFormat *current = nil;
    NSError *error = HFCaptureBoundary(^{ current = [input outputFormatForBus:0]; });
    *format = current;
    return error;
}
NSError *HFCaptureInstall(AVAudioInputNode *input, AVAudioFormat *format, AVAudioNodeTapBlock tap) {
    // The unconnected input node cannot convert hardware to a cached output
    // format. Explicitly reconcile its output to the fresh post-cue hardware.
    return HFCaptureBoundary(^{ [input installTapOnBus:0 bufferSize:2048 format:format block:tap]; });
}
NSError *HFCapturePrepare(AVAudioEngine *engine) {
    return HFCaptureBoundary(^{ [engine prepare]; });
}
NSError *HFCaptureStart(AVAudioEngine *engine) {
    __block NSError *error = nil;
    NSError *exception = HFCaptureBoundary(^{
        if (![engine startAndReturnError:&error] && !error)
            error = [NSError errorWithDomain:@"HandsFree capture start" code:1 userInfo:nil];
    });
    return exception ?: error;
}
NSError *HFCaptureStop(AVAudioEngine *engine) {
    return HFCaptureBoundary(^{ [engine stop]; });
}
NSError *HFCaptureRemove(AVAudioInputNode *input) {
    return HFCaptureBoundary(^{ [input removeTapOnBus:0]; });
}
