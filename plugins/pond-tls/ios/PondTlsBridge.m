#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PondTls, NSObject)
RCT_EXTERN_METHOD(configure:(NSArray *)entries resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(trustFailed:(NSString *)url resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
