# World-Cup-2027
A true football game


iPad 横屏离线足球游戏。

## 下载

- [下载未签名 IPA](downloads/WorldCup2027.ipa)
- [下载 ZIP 压缩包](downloads/WorldCup2027-download.zip)
- [下载源码压缩包](downloads/World%20Cup%202027-source.zip)

打开文件后点击 **Download raw file（下载原始文件）**。也可在仓库菜单选择 **Code → Download ZIP**。私有仓库需登录当前 GitHub 账号。

IPA 需要自行签名后安装。包内资源可离线使用。目标设备为 2021 iPad Pro。

已检查 ARM64 iOS 可执行文件和资源完整性，并在浏览器端验证比赛和触控操作。iPadOS 26.0.1 的安装与黑武士 3 Pro 蓝牙手柄仍需真机测试。当前为原创球队和卡面，规则实现覆盖主要判罚，尚未完整还原全部足球规则。

## 工程

`game/` 是游戏代码与资源，`ios/` 是 iPad 原生宿主。macOS 上运行 `sh ios/scripts/package.sh` 可重新编译未签名 IPA。
