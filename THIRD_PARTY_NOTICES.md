# 第三方代码与参考

X 浏览助手由本项目独立维护。以下实际复用的开源组件保留原作者的版权与 MIT 许可，不因另建仓库而移除。

## XpandMax

- 来源：[yiren-ai/xpandmax](https://github.com/yiren-ai/xpandmax)
- 参考提交：`c0414c369453d6b6827fca2e700083282aabab8a`
- 许可证：[原始 MIT 许可](extension/third-party/xpandmax-LICENSE.txt)
- 适配文件：`translation.js`、`translation-background.js`、`translation-options.js/html/css`、`follow.js`；`reading.js` 中部分侧栏与通知样式参考原项目。
- 适配内容：本项目品牌、站点范围、作者标题定位、简介界面、关系与数据桥接。

随扩展分发的说明位于 [extension/THIRD_PARTY_NOTICES.txt](extension/THIRD_PARTY_NOTICES.txt)。

## 开发工具

Playwright 是开发测试依赖，不随扩展打包。版本与依赖许可可通过 `package-lock.json` 及安装后的包信息核对。
