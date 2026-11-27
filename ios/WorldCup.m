#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <GameController/GameController.h>
#import <QuartzCore/QuartzCore.h>

@interface CupController : UIViewController <WKNavigationDelegate>
@property(nonatomic,strong) WKWebView *game;
@property(nonatomic,strong) GCController *pad;
@property(nonatomic,strong) CADisplayLink *displayLink;
@property(nonatomic,copy) NSDictionary *lastState;
@property(nonatomic) BOOL axesChanged;
@property(nonatomic) BOOL documentReady;
@end

@implementation CupController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = UIColor.blackColor;
    WKWebViewConfiguration *config = [WKWebViewConfiguration new];
    config.allowsInlineMediaPlayback = YES;
    config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;
    self.game = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:config];
    self.game.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    self.game.navigationDelegate = self;
    self.game.opaque = NO;
    self.game.backgroundColor = UIColor.blackColor;
    self.game.scrollView.backgroundColor = UIColor.blackColor;
    self.game.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
    self.game.scrollView.scrollEnabled = NO;
    self.game.scrollView.bounces = NO;
    self.game.allowsLinkPreview = NO;
    [self.view addSubview:self.game];
    NSNotificationCenter *nc = NSNotificationCenter.defaultCenter;
    [nc addObserver:self selector:@selector(controllerListChanged:) name:GCControllerDidConnectNotification object:nil];
    [nc addObserver:self selector:@selector(controllerListChanged:) name:GCControllerDidDisconnectNotification object:nil];
    [nc addObserver:self selector:@selector(controllerListChanged:) name:UIApplicationDidBecomeActiveNotification object:nil];
    self.displayLink = [CADisplayLink displayLinkWithTarget:self selector:@selector(flushAxes:)];
    self.displayLink.preferredFramesPerSecond = 60;
    [self.displayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
    self.displayLink.paused = YES;
    [self controllerListChanged:nil];
    [self loadGame];
}

- (void)loadGame {
    NSURL *folder = [NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"www" isDirectory:YES];
    [self.game loadFileURL:[folder URLByAppendingPathComponent:@"index.html"] allowingReadAccessToURL:folder];
}

- (BOOL)prefersStatusBarHidden { return YES; }
- (BOOL)prefersHomeIndicatorAutoHidden { return YES; }
- (UIRectEdge)preferredScreenEdgesDeferringSystemGestures { return UIRectEdgeAll; }
- (UIInterfaceOrientationMask)supportedInterfaceOrientations { return UIInterfaceOrientationMaskLandscape; }

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    self.documentReady = YES;
    self.lastState = nil;
    [self sendControllerState];
}
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView {
    self.documentReady = NO;
    [self loadGame];
}

- (void)controllerListChanged:(NSNotification *)notification {
    GCController *chosen = nil;
    for (GCController *candidate in GCController.controllers) {
        if (candidate.extendedGamepad && (chosen == nil || candidate == self.pad)) chosen = candidate;
    }
    if (chosen == self.pad && notification && ![notification.name isEqual:UIApplicationDidBecomeActiveNotification]) return;
    self.pad.physicalInputProfile.valueDidChangeHandler = nil;
    self.pad = chosen;
    self.lastState = nil;
    self.axesChanged = NO;
    self.displayLink.paused = YES;
    if (chosen) {
        chosen.handlerQueue = dispatch_get_main_queue();
        __weak CupController *weakSelf = self;
        chosen.physicalInputProfile.valueDidChangeHandler = ^(GCPhysicalInputProfile *profile, GCControllerElement *element) {
            CupController *screen = weakSelf;
            if (!screen) return;
            // Deliver button edges immediately even when press and release occur between rendered frames.
            if ([element isKindOfClass:GCControllerButtonInput.class]) {
                [screen sendControllerState];
            } else {
                screen.axesChanged = YES;
                screen.displayLink.paused = NO;
            }
        };
    }
    [self sendControllerState];
}

- (void)flushAxes:(CADisplayLink *)link {
    self.displayLink.paused = YES;
    if (!self.axesChanged) return;
    self.axesChanged = NO;
    [self sendControllerState];
}

- (NSDictionary *)controllerState {
    GCExtendedGamepad *g = self.pad.extendedGamepad;
    if (!g) return @{@"connected":@NO};
    GCControllerButtonInput *standard[] = {
        g.buttonA,g.buttonB,g.buttonX,g.buttonY,g.leftShoulder,g.rightShoulder,g.leftTrigger,g.rightTrigger,
        g.buttonOptions,g.buttonMenu,g.leftThumbstickButton,g.rightThumbstickButton,
        g.dpad.up,g.dpad.down,g.dpad.left,g.dpad.right,g.buttonHome
    };
    NSMutableArray *values = [NSMutableArray arrayWithCapacity:17];
    NSMutableSet *seen = [NSMutableSet setWithCapacity:17];
    for (NSUInteger i=0; i<17; ++i) {
        GCControllerButtonInput *button = standard[i];
        [values addObject:@(button.value)];
        if (button) [seen addObject:button];
    }
    NSMutableDictionary *extras = NSMutableDictionary.new;
    NSDictionary *allButtons = self.pad.physicalInputProfile.buttons;
    for (NSString *key in allButtons) {
        GCControllerButtonInput *button = allButtons[key];
        if (![seen containsObject:button]) extras[key] = @(button.value);
    }
    NSArray *axes = @[@(g.leftThumbstick.xAxis.value), @(-g.leftThumbstick.yAxis.value),
                      @(g.rightThumbstick.xAxis.value), @(-g.rightThumbstick.yAxis.value)];
    return @{@"connected":@YES, @"id":self.pad.vendorName ?: @"Game Controller",
             @"axes":axes, @"buttons":values, @"extras":extras};
}

- (void)sendControllerState {
    if (!self.documentReady) return;
    NSDictionary *snapshot = [self controllerState];
    if ([snapshot isEqual:self.lastState]) return;
    self.lastState = snapshot;
    // Arguments cross the WebKit boundary as data, including manufacturer-provided button names.
    [self.game callAsyncJavaScript:@"window._wcNativePad=s; if(window.WC && WC.nativePad) WC.nativePad(s);"
                          arguments:@{@"s":snapshot} inFrame:nil inContentWorld:WKContentWorld.pageWorld
                  completionHandler:nil];
}
@end

@interface CupScene : UIResponder <UIWindowSceneDelegate>
@property(nonatomic,strong) UIWindow *window;
@end
@implementation CupScene
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
    self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
    self.window.rootViewController = [CupController new];
    [self.window makeKeyAndVisible];
}
@end

@interface CupApp : UIResponder <UIApplicationDelegate>
@end
@implementation CupApp
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
    application.idleTimerDisabled = YES;
    return YES;
}
@end

int main(int argc, char **argv) {
    @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(CupApp.class)); }
}
