# 第三方代码与参考

X 浏览助手由本项目独立维护。以下实际复用的开源组件保留原作者的版权与 MIT 许可，不因另建仓库而移除。

## XpandMax

- 来源：[yiren-ai/xpandmax](https://github.com/yiren-ai/xpandmax)
- 参考提交：`c0414c369453d6b6827fca2e700083282aabab8a`
- 许可证：[原始 MIT 许可](extension/third-party/xpandmax-LICENSE.txt)
- 适配文件：`translation.js`、`translation-background.js`、`translation-options.js/html/css`、`follow.js`；`reading.js` 中部分侧栏与通知样式参考原项目。
- 适配内容：本项目品牌、站点范围、作者标题定位、简介界面、关系与数据桥接。

随扩展分发的说明位于 [extension/THIRD_PARTY_NOTICES.txt](extension/THIRD_PARTY_NOTICES.txt)。

## X Viral Monitor — IcyCat

本轮图片增强与长图阅读的主要实现、内置过滤规则，改编或复用自 **[Icy-Cat/x-viral-monitor](https://github.com/Icy-Cat/x-viral-monitor)**。感谢 IcyCat 公开源码；这些实现并非本项目从零原创。

- 来源提交：`b1b896de5079d672afc9d829beef01c51a0b970c`。
- 保留许可：[原始 MIT 许可](extension/third-party/x-viral-monitor-LICENSE.txt)。
- 上游文件：`lib/image-viewer.js`、`lib/long-image-viewer.js`、`styles.css` 的图片样式片段、`src/premium/content-filter/rules.json`。
- 本地适配：`image-viewer.js`、`long-image-viewer.js`、`media.css`、`filter-rules.js/json`。新增独立开关、规则校验与现有设置的整合。
- `extras-core.js` 与 `extras.js` 的 Markdown 功能参考上游分享菜单与 `buildTweetMarkdown` 的设计，使用本项目数据通道重写；规则字段设计参考上游，不包含其收费、授权与远程脚本逻辑。
- 可选远程规则从上游 `main/src/premium/content-filter/rules.json` 更新，仅接收 JSON 数据；内置副本固定于上述提交。

## 开发工具与分发

Playwright 是开发测试依赖，不随扩展打包。版本与依赖许可可通过 `package-lock.json` 及安装后的包信息核对。
