#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN
// Only capture adapter operations cross this boundary, never a global handler.
NSError * _Nullable HFCaptureBoundary(void (NS_NOESCAPE ^operation)(void));
NSError * _Nullable HFCaptureFormat(AVAudioInputNode *input, AVAudioFormat * _Nullable * _Nonnull format);
NSError * _Nullable HFCaptureInstall(AVAudioInputNode *input, AVAudioNodeTapBlock tap);
NSError * _Nullable HFCapturePrepare(AVAudioEngine *engine);
NSError * _Nullable HFCaptureStart(AVAudioEngine *engine);
NSError * _Nullable HFCaptureStop(AVAudioEngine *engine);
NSError * _Nullable HFCaptureRemove(AVAudioInputNode *input);
NS_ASSUME_NONNULL_END
