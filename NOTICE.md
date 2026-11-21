# 来源与修改说明

- 主体源码、接口适配和原有测试来自 [amqsy/mygo-music-bodian](https://github.com/amqsy/mygo-music-bodian)，提交 `c2b0c3aee00ee5dfc4e6253b628e9e784c504d1b`（0.3.3）。沿用 MIT，保留 LICENSE 与上游 Git 历史。
- 本地会话验证请求的签名协议参考 [MoeclubM/PyBodian](https://github.com/MoeclubM/PyBodian) 的 `_query_sign` / `users_login`，提交 `ceb7e4f62b2ebd0248300d43fa422e2bf11ee00c`。其 MIT 许可证保留在 `PyBodian-reference.LICENSE`。未引入其账号提取、TLS 设置或外部播放器代码。
- 宿主合同参考 [MyGo 插件文档](https://music.egoist.dev/zh/plugins/) 及 MB 桌面 MoeJS、iOS / Android QuickJS 实现。

2026-11-21 修改（xTreeRoot，0.3.4）：增加三端可取消登录和迟到响应保护、账号身份一致性校验、退出后保留会话及设备 ID、重新登录时先验证凭据、媒体域名与请求头、独立 ZIP 发布以及回归、匿名在线与实际运行时检查脚本。保留上游功能与 MIT 许可；这是独立维护的衍生版本。
