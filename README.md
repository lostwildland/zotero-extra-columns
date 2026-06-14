# Zotero Extra Columns

Zotero Extra Columns 是一个 Zotero 桌面端插件，用来把条目 `Extra` 栏里的结构化字段显示成原生条目列表列，并在右侧条目详情面板中提供一个更清晰的 `Extra 字段` 区块。

它适合把 Zotero 原本只能堆在 `Extra` 文本框里的信息拆出来查看，例如：

```text
arXiv:2605.03210
titleTranslation: 中文标题
abstractTranslation: 中文摘要
original-date: 2026-05-04
```

安装后，这些字段会像 Zotero 原生列一样出现在条目列表的列选择菜单中。你可以在表头右键菜单里进入 `More Columns -> Extra`，勾选 `arXiv`、`Title Translation`、`Abstract Translation` 等从 `Extra` 中发现的字段。

## 兼容版本

- Zotero `7.0` 到 `9.*`
- 当前已在 Zotero `9.0.3` 上通过自动化测试
- 插件文件：`build/extra-columns.xpi`

## 功能

### 自动发现 Extra 字段

插件启动后会扫描当前 Zotero 数据库中已有条目的 `Extra` 栏，自动发现里面出现过的字段名。只要某个字段在至少一个条目的 `Extra` 中出现过，它就会被注册成一个可选列。

例如库中存在：

```text
arXiv:2605.03210
titleTranslation: 在人工智能饱和的市场中，人类出处验证应被视为劳动基础设施
```

插件会自动提供：

- `arXiv`
- `Title Translation`

### 原生列菜单集成

每个发现到的 `Extra` 字段都会注册为 Zotero 原生 item-tree column。

使用方式：

1. 在 Zotero 条目列表表头上右键。
2. 打开 `More Columns`。
3. 打开 `Extra` 子菜单。
4. 勾选需要显示的 `Extra` 字段。

这些列使用 Zotero 自己的列系统，所以可以正常显示、隐藏、调整列宽，并随 Zotero 保存列状态。

插件会把自己生成的列集中整理到 `More Columns -> Extra` 下，而不是把 `arXiv`、`Title Translation`、`Pages`、`Place` 这类名字全部混在 Zotero 原生列里。这样即使 `Extra` 中存在和 Zotero 原生列同名的字段，也能看出哪些列来自 `Extra`。

### 清理 Extra 字段

插件提供清理功能，可以一键删除某一个 `Extra` 属性的对应行。可以清理全库，也可以只清理当前选中的条目。

入口：

- `Tools -> Extra Columns -> Clean Extra Field`
- 条目右键菜单：`Extra Columns -> Clean Selected Extra Field`
- 条目右键菜单：`Extra Columns -> Clean Extra Field (All Items)`

全库清理菜单会列出当前库中已经发现的 `Extra` 字段。选中条目清理菜单只列出当前选中条目里实际出现的字段。括号中的数字按实际条目行数统计，也就是当前会被删除的字段行数；在选中条目入口中，这个数字只来自当前选择。点击某个字段后，插件会先显示确认框，说明将影响多少个条目、删除多少行。确认后才会真正修改 Zotero 数据。

例如选择清理 `arXiv` 时，下面这些行会被删除：

```text
arXiv:2605.03210
arxiv: 2605.03210
ar-xiv: 2605.03210
```

其他 `Extra` 行会原样保留。

### 右侧详情面板显示 Extra 字段

插件会在右侧条目详情面板中添加一个 `Extra 字段` 区块。选中条目后，所有可解析的 `Extra` 行都会以键值对方式显示，不需要在原始 `Extra` 文本中手动查找。

如果当前条目没有可解析的 `Extra` 字段，这个区块会自动隐藏。

### DOI、URL、arXiv 链接化

在右侧 `Extra 字段` 区块中，以下值会自动变成可点击链接：

- `URL: https://example.com`
- `DOI: 10.48550/ARXIV.2605.03210`
- `arXiv:2605.03210`
- `arXiv: arXiv:2605.03210`

点击后会通过 Zotero 打开对应网页。

### 修改后自动刷新

插件会监听 Zotero 条目的新增、修改、删除、移入回收站和恢复事件。

当你修改某个条目的 `Extra` 栏后：

- 已有列的值会刷新。
- 新出现的字段名会被自动发现并注册。
- 右侧 `Extra 字段` 区块会更新。

默认刷新延迟为 `750ms`，用于避免频繁编辑时反复扫描。

### 中英文界面

插件包含英文和简体中文本地化：

- 英文：`Extra Fields`
- 简体中文：`Extra 字段`

## 支持的 Extra 写法

插件支持两种单行键值格式。

### 常规格式

```text
key: value
```

示例：

```text
arXiv:2605.03210
titleTranslation: 中文标题
DOI: 10.48550/ARXIV.2605.03210
```

### Citeproc Extra 格式

```text
{:key: value}
```

示例：

```text
{:original-date: 1999}
{:titleTranslation: 中文标题}
```

### 字段名规则

字段名需要：

- 以英文字母开头。
- 可包含英文字母、数字、空格、下划线和连字符。
- 冒号右侧必须有非空值。

以下字段名会被归一化为同一个列：

```text
titleTranslation
title-translation
title_translation
Title Translation
```

它们都会显示为 `Title Translation`。

### 内置友好名称

插件会为常见字段提供更自然的列名：

- `arxiv` / `ar-xiv` -> `arXiv`
- `titleTranslation` -> `Title Translation`
- `abstractTranslation` -> `Abstract Translation`
- `citationKey` -> `Citation Key`
- `original-date` -> `Original Date`
- `doi` -> `DOI`
- `url` -> `URL`
- `pmid` -> `PMID`
- `pmcid` -> `PMCID`
- `isbn` -> `ISBN`
- `issn` -> `ISSN`

其他字段会按字段名自动生成人类可读的标题。

## 安装

1. 运行构建，或直接使用已有的 `build/extra-columns.xpi`。
2. 在 Zotero 中打开 `Tools -> Plugins`。
3. 把 `extra-columns.xpi` 拖入插件窗口安装。
4. 按 Zotero 提示启用插件。

安装完成后，在条目列表表头右键打开列菜单，即可在 `More Columns -> Extra` 中勾选从 `Extra` 发现的字段。

## 使用示例

假设某个条目的 `Extra` 栏是：

```text
titleTranslation: 在人工智能饱和的市场中，人类出处验证应被视为劳动基础设施
arXiv:2605.03210
```

插件会提供：

- 条目列表列菜单：`More Columns -> Extra -> Title Translation`
- 条目列表列菜单：`More Columns -> Extra -> arXiv`
- 右侧详情区块：`Extra 字段`
- 可点击链接：`https://arxiv.org/abs/2605.03210`

如果你之后给另一个条目添加：

```text
dataset: Moltbook
model: GPT-5
```

插件会自动新增可勾选列：

- `Dataset`
- `Model`

## 设计原则

### 默认显示功能不修改 Zotero 数据

插件的列显示和右侧详情区块只读取 `Extra` 栏，不会改写条目内容，也不会把 `Extra` 中的值移动到 Zotero 原生字段。

只有 `Clean Extra Field` 和 `Clean Selected Extra Field` 是写操作。它们会在执行前弹出确认框，并只删除被选中字段对应的整行。

### 使用 Zotero 官方插件 API

插件使用 Zotero 7 以后提供的官方接口：

- `Zotero.ItemTreeManager.registerColumn()`：注册原生条目列表列。
- `Zotero.ItemPaneManager.registerSection()`：注册右侧条目详情区块。
- `Zotero.MenuManager.registerMenu()`：注册 Tools 菜单和条目右键菜单。
- `Zotero.Notifier.registerObserver()`：监听条目变化并刷新。

显示列、详情区块和清理菜单都尽量使用 Zotero 官方插件 API。由于 Zotero 当前只支持把自定义列放进 `More Columns`，不支持在 `More Columns` 下再声明插件自己的二级分组，本插件额外做了一个小范围列菜单整理：在 Zotero 生成列菜单后，把本插件注册的列移动到 `More Columns -> Extra`。

### 支持任意用户自定义字段

Zotero 内部有 `extractExtraFields()` 一类工具，但它主要面向 Zotero/CSL 已知字段。这个插件的目标是显示所有用户自定义字段，所以使用自己的解析器保留任意键名。

## 已知限制

- 只解析单行 `key: value` 或 `{:key: value}`。
- 不解析多行 continuation value。
- 条目列表列中显示纯文本；可点击链接只在右侧 `Extra 字段` 区块中提供。
- 字段只有在库中至少出现过一次后才会出现在列菜单中。
- 如果其他插件也注册了同名列，它们不会被移动到 `More Columns -> Extra`；这个子菜单只整理本插件生成的列。

## 开发

当前脚手架需要 Node.js `>=22.8.0`。

```bash
npm install
npm test
npm run typecheck
npm run lint:check
npm run build:xpi
```

构建完成后，安装包会写入：

```text
build/extra-columns.xpi
```

## Zotero 9 本地测试

可以用 `zotero-plugin-scaffold` 在本机 Zotero 中临时安装插件并跑测试：

```bash
ZOTERO_PLUGIN_ZOTERO_BIN_PATH="/Applications/Zotero.app/Contents/MacOS/zotero" \
  npm exec -- zotero-plugin test --no-watch --exit-on-finish
```

当前测试覆盖：

- Extra 常规格式解析。
- Citeproc Extra 格式解析。
- 字段名归一化和友好标签。
- 同一字段取值。
- 字段发现和排序。
- arXiv / DOI / URL 链接生成。
- 删除指定 Extra 字段行。
- Zotero 插件启动。

## 项目结构

```text
addon/
  bootstrap.js                 Zotero 插件生命周期入口
  manifest.json                插件清单和 Zotero 版本兼容范围
  prefs.js                     默认偏好设置
  locale/                      本地化文案
  content/icons/               插件图标

src/
  extraParser.ts               Extra 字段解析、归一化、标签生成
  extraLinks.ts                DOI、URL、arXiv 链接生成
  extraColumnRegistry.ts       原生列发现、注册、注销
  extraSection.ts              右侧 Extra 字段区块
  hooks.ts                     Zotero 生命周期和条目变化监听
  index.ts                     插件实例初始化

test/
  extra*.test.ts               解析和链接单元测试
```

## 发布检查

发布前至少确认：

```bash
npm test
npm run typecheck
npm run lint:check
npm run build:xpi
```

并检查打包后的 XPI 中 `manifest.json` 的兼容范围仍然正确：

```json
{
  "strict_min_version": "7.0",
  "strict_max_version": "9.*"
}
```

如果以后更新兼容范围，不要只改源码里的 `addon/manifest.json`，还需要重新生成 XPI 和更新发布用 metadata，否则 Zotero 仍可能按旧的打包信息拒绝安装。

## License

AGPL-3.0-or-later
