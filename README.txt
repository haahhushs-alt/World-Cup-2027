World Cup 2027｜iPad 离线足球游戏
目标设备：2021 iPad Pro，横屏。IPA 没有签名，需自行签名后安装。
game/ 包含离线比赛、原创球员模型、球场、UI 和卡面。ios/ 包含 WKWebView 宿主及 Game Controller 输入桥接。
在 macOS 安装 Xcode 后运行 sh ios/scripts/package.sh，可在 output/ 生成未签名 IPA。也可将源码导入自己的 GitHub 仓库，在 Actions 中手动运行 Build unsigned iPad game。
开始比赛后由主队开球，按传球发出。按住摇杆移动，射门、传球、直塞和花式按钮均支持轻点及方向滑动。
点球和任意球训练中配合方向和不同脚法瞄准。进攻与防守可分别改键，设置保存在设备上。
此版本为原创球队和原创卡面。球员卡详情可导入自己的图片。常见比赛判罚由程序模拟，未覆盖完整赛事规程、VAR 和所有裁判解释。离线浏览器端已测试，iPadOS 上的签名安装与实体手柄连接需真机验证。
