#import "CaptureException.h"

NSError *HFCaptureBoundary(void (NS_NOESCAPE ^operation)(void)) {
    @try { operation(); return nil; }
    @catch (NSException *exception) {
        return [NSError errorWithDomain:@"HandsFree capture exception" code:1
            userInfo:nil]; // Never surface an exception reason containing device identity.
    }
}
NSError *HFAudioEngineCreate(AVAudioEngine **engine) {
    return HFCaptureBoundary(^{ *engine = [[AVAudioEngine alloc] init]; });
}
NSError *HFAudioPlayerCreate(AVAudioPlayerNode **player) {
    return HFCaptureBoundary(^{ *player = [[AVAudioPlayerNode alloc] init]; });
}
NSError *HFCaptureBindInput(AVAudioEngine *engine, AudioDeviceID device, AVAudioInputNode **input) {
    __block OSStatus status = noErr;
    NSError *exception = HFCaptureBoundary(^{
        *input = engine.inputNode;
        AudioUnit unit = (*input).audioUnit;
        status = unit ? AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global, 0, &device, sizeof(device)) : kAudio_ParamError;
    });
    return exception ?: (status == noErr ? nil : [NSError errorWithDomain:@"Input audio unit" code:status userInfo:nil]);
}
NSError *HFCaptureInputDevice(AVAudioInputNode *input, AudioDeviceID *device) {
    __block OSStatus status = noErr;
    NSError *exception = HFCaptureBoundary(^{
        AudioUnit unit = input.audioUnit;
        UInt32 size = sizeof(*device);
        status = unit ? AudioUnitGetProperty(unit, kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global, 0, device, &size) : kAudio_ParamError;
    });
    return exception ?: (status == noErr ? nil : [NSError errorWithDomain:@"Input audio unit" code:status userInfo:nil]);
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
NSError *HFCueConnect(AVAudioEngine *engine, AVAudioPlayerNode *player, AVAudioFormat *format) {
    return HFCaptureBoundary(^{
        [engine attachNode:player];
        [engine connect:player to:engine.mainMixerNode format:format];
    });
}
NSError *HFCuePlay(AVAudioPlayerNode *player, AVAudioPCMBuffer *buffer, void (^completion)(void)) {
    return HFCaptureBoundary(^{
        [player scheduleBuffer:buffer completionCallbackType:AVAudioPlayerNodeCompletionDataPlayedBack
            completionHandler:^(AVAudioPlayerNodeCompletionCallbackType type) { completion(); }];
        [player play];
    });
}
NSError *HFCueStop(AVAudioPlayerNode *player) {
    return HFCaptureBoundary(^{ [player stop]; });
}
NSError *HFCueVolume(AVAudioPlayerNode *player, float volume) {
    return HFCaptureBoundary(^{ player.volume = volume; });
}
NSError *HFCueOutputDevice(AVAudioEngine *engine, AudioDeviceID *device) {
    __block OSStatus status = noErr;
    NSError *exception = HFCaptureBoundary(^{
        AudioUnit unit = engine.outputNode.audioUnit;
        if (!unit) { status = kAudio_ParamError; return; }
        UInt32 size = sizeof(*device);
        status = AudioUnitGetProperty(unit, kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global, 0, device, &size);
    });
    return exception ?: (status == noErr ? nil : [NSError errorWithDomain:@"Output audio unit" code:status userInfo:nil]);
}
NSError *HFCueOutputFormat(AVAudioEngine *engine, AVAudioFormat **format) {
    __block AVAudioFormat *current = nil;
    NSError *error = HFCaptureBoundary(^{ current = [engine.outputNode outputFormatForBus:0]; });
    *format = current;
    return error;
}
