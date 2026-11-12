# 减重调研结论与候选 · 2026-11-13

## 结论

停止逐模板 AST → JavaScript 转译；转换器与生成文件已删除。当前完整库没有找到可直接替换的纯素材/JSON 方案。优先保留原模板逻辑、减少共享依赖与重复资源，不再叠加第三种渲染框架。

减重调研时的基准为 Windows 模块 1.1.0：730 个原生模板 + 273 个兼容模板，共 1003 个唯一标识。减重候选一直未部署。当前稳定版本已更新到 1.2.0，提供可选扩展安装/卸载；此分支只保存较早的减重研究，不能覆盖当前运行版。

## 已核实的替代库

- [crazy-emoji](https://github.com/anyliew/crazy-emoji/releases/tag/v0.0.6%2Bbuild.16)：固定提交 645f016728358b3660af3476840e6d5213b6e4ee，37 个条目。
- [jj-emoji](https://github.com/anyliew/jj-emoji/releases/tag/v0.0.6%2Bbuild.3)：固定提交 6ec52337fffacfaaf5670b007563e8f5d69e86b3，84 个条目。
- Windows 1.93.1 DLL 隔离加载得到 851 个原生标识，其中 118 个与目前的 273 个兼容模板相同。按输入数量范围及参数接口进一步筛选，117 个未发现接口收窄，156 个仍需兼容实现。`moistening_water` 的原生版本不接受原实现支持的文字输入，不能只凭标识直接替换。`fleshlight_hoshino_alice` 的原生版本增加可选文字。未检查这些模板的图像输出。
- [Petpet 模板库](https://github.com/Dituon/petpet-templates)：148 个唯一标识，和上述无同标识原生实现的 155 个条目仅重合 `bite`、`play` 两个。JSON 模板是成熟路线，但现成内容覆盖不足。
- [petpet-js](https://github.com/Dituon/petpet-js) 是面向浏览器的旧格式实现，需要适配 Canvas/Image 等浏览器接口；[petpet-rs](https://github.com/Dituon/petpet-rs) 0.0.1 未提供所需现成发行包，README 仍列出文字定位、裁剪与变形能力缺口。引入它们不能直接填满当前库。

资源图片只提供素材，原模板中布局、动画、变形和文字处理的执行逻辑仍然需要对应引擎。按标识去重解决重复注册，不保证不同实现的参数和输出等价。上述调查未找到满足完整替换条件的现成组合。

证据：`native-probe-result.json`、`native-catalog.json`、`slim-plan.json`、`petpet-index.json`。原生探测目录和废弃 Canvas 依赖已删除；保留小体积元数据。

## 保留完整库的精简候选

位置：`C:/Users/Admin/.dsh/plugins-data/aurabot/modules-data/meme-lean-stage`。不在模块加载目录，线上不会加载它。

- 保留全部 1003 个标识与原模板代码，仍含私有 CPython 3.12.12，无需用户安装系统 Python。
- 去掉 OpenCV 与开发用 pybind11 包；公共图片辅助库的三个可选 OpenCV 滤镜改为按需导入。已有静态扫描未发现当前新增 273 个模板调用这些滤镜。
- Windows 标准库压缩到 CPython 支持的 python312.zip；去掉 Tcl/Tk、开发文件等。
- 原生库与兼容库中逐字节相同的字体使用硬链接共享，不额外复制。所有生产文件的内容保持原样；候选的可变状态单独复制。

额外运行目录原为 653,471,376 字节（623 MiB）；候选逻辑文件总量为 500,814,743 字节（478 MiB），其中与原生字体共享 88,649,612 字节，独占有效载荷 412,165,131 字节（393 MiB）。相对原方案减少约 230 MiB、37%。这些是兼容扩展的体积，不含原生库原有素材。隔离准备时其它不变文件也与生产硬链接，未复制整库作为备份。

Windows 候选成功加载 273 个兼容条目的元数据；合并后 1003 个标识唯一。与运行中的 API 比较，目录、触发词、参数及其它目录字段一致（标签集合忽略顺序）。见 `lean-report.json`、`lean-parity.json`。本轮未查看模板图片、未生成模板、未向群聊发图，macOS/Linux 未测试。

## 状态与后续条件

本轮调研完成；全原生替换未达成。精简候选尚未发布，不能当成已经部署的优化。

若继续采用精简兼容路线，执行者应先把候选打包逻辑整合进正式安装器，补全 Windows 标准库非代码数据的保留规则，明确可选 OpenCV 滤镜依赖的恢复方式，再进行受允许范围内的运行验收和切换。`build-lean.mjs` 是基于旧版 1.1.0 的本机实验脚本；其中硬链接、辅助库补丁与标准库筛选尚需与 1.2.0 整合，不能直接用作当前版本的安装器。不要恢复已被否决的逐模板转换方案，也不要为去掉 Python 而默默删减模板。

后续线上小修：搜索分页已经在源码与生产版修复（见 artifacts/search-pagination.json），隔离减重候选仍是修复前的入口文件。任何后续切换都须携带当前入口与 `lib/list.mjs`，保留此修复。

后续安全与渲染修复：生产版已修复 Windows Skia ICU 数据路径，以及聊天/面板原始异常泄露。后续候选须同步当前 lib、index.mjs 和 scripts/python-data.mjs/prepare-python.mjs/pack.mjs，并执行 ICU 准备；不得用旧候选覆盖这些修复。证据见 artifacts/icu-fix.json 与 test/errors.test.mjs。

## 实验分支内容

保留减重构建脚本、ICU 修复前的候选体积与目录对比报告，以及现成原生库和 Petpet 的元数据调研。未上传运行时、素材库或图片；构建输入依赖已安装的原始完整库。分支中的主模块代码继承 main 的稳定版，实验代码仅位于 native-work，不会被安装器自动执行。
