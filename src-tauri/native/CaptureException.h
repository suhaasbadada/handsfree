#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN
// Only capture adapter operations cross this boundary, never a global handler.
NSError * _Nullable HFCaptureBoundary(void (NS_NOESCAPE ^operation)(void));
NSError * _Nullable HFAudioEngineCreate(AVAudioEngine * _Nullable * _Nonnull engine);
NSError * _Nullable HFAudioPlayerCreate(AVAudioPlayerNode * _Nullable * _Nonnull player);
NSError * _Nullable HFCaptureBindInput(AVAudioEngine *engine, AudioDeviceID device, AVAudioInputNode * _Nullable * _Nonnull input);
NSError * _Nullable HFCaptureInputDevice(AVAudioInputNode *input, AudioDeviceID *device);
NSError * _Nullable HFCaptureFormat(AVAudioInputNode *input, AVAudioFormat * _Nullable * _Nonnull format);
NSError * _Nullable HFCaptureOutputFormat(AVAudioInputNode *input, AVAudioFormat * _Nullable * _Nonnull format);
NSError * _Nullable HFCaptureInstall(AVAudioInputNode *input, AVAudioFormat *format, AVAudioNodeTapBlock tap);
NSError * _Nullable HFCapturePrepare(AVAudioEngine *engine);
NSError * _Nullable HFCaptureStart(AVAudioEngine *engine);
NSError * _Nullable HFCaptureStop(AVAudioEngine *engine);
NSError * _Nullable HFCaptureRemove(AVAudioInputNode *input);
NSError * _Nullable HFCueConnect(AVAudioEngine *engine, AVAudioPlayerNode *player, AVAudioFormat *format);
NSError * _Nullable HFCuePlay(AVAudioPlayerNode *player, AVAudioPCMBuffer *buffer, void (^completion)(void));
NSError * _Nullable HFCueStop(AVAudioPlayerNode *player);
NSError * _Nullable HFCueVolume(AVAudioPlayerNode *player, float volume);
NSError * _Nullable HFCueOutputDevice(AVAudioEngine *engine, AudioDeviceID *device);
NSError * _Nullable HFCueOutputFormat(AVAudioEngine *engine, AVAudioFormat * _Nullable * _Nonnull format);
NS_ASSUME_NONNULL_END
