# Agent Note：Web 客户端将 mermaid 围栏渲染为图

Status: implemented

[English](2026-08-15-mermaid-fence-rendering.md) | 中文

## 问题

带有 ` ```mermaid ` 围栏的 assistant 回复此前只渲染为普通代码块。Web 客户端的 markdown 渲染器（`MarkdownText`，`packages/client/ui-primitives`）把所有围栏语言都映射到 `CodeBlock`；只有 `math` 拥有语义化渲染。用户让 agent 画流程图或时序图时，拿到的只是一段需要复制到外部渲染器的源码，尽管围栏语言已经声明了意图。

## 决策

`renderCode`（`ui-primitives/src/markdown/render.tsx`）新增一个仅在定稿后生效的分支：info string 为 `mermaid` 的围栏通过新的 `MermaidBlock` 组件渲染；流式期间它与其他围栏一样保持源码 `CodeBlock`，因此冻结块的流式缓存不会固化异步工作。

`MermaidBlock`（`ui-primitives/src/markdown/MermaidBlock.tsx`）：

- 通过动态 import 加载 mermaid——约 500 KB 的模块不进入启动 chunk，没有图表的会话永远不付出这份代价——并只做一次初始化：`startOnLoad: false`、`securityLevel: 'strict'`、内置 `neutral` 配色，以及 `fontFamily: 'var(--dsw-font-family)'`；
- 先用 `mermaid.parse` 校验源码，再调用 `mermaid.render`；
- 任何失败——chunk 加载、解析或渲染——都回退到源码 `CodeBlock`（绝不抛错，与 `highlight.ts` 的未知语法规则一致）；chunk 加载失败不会被缓存，后续围栏会重试；
- 定稿结果与其来源源码绑定，因此编辑过的围栏在新图落地前显示加载中的 `CodeBlock`，而不是闪过一张过期的 SVG；
- 通过 `dangerouslySetInnerHTML` 注入 mermaid 自己产出的 SVG——`securityLevel: 'strict'` 下 mermaid 在产出前会用 DOMPurify 处理标签，因此这与 shiki 生成的 span 树走的是同一条受认可的消费路径。

配色选择 `neutral` 是刻意为之：`base` 是唯一读取 `themeVariables` 的 mermaid 主题，而其颜色运算（khroma）无法解析 CSS `var()` 引用；写字面颜色又会违反只用 token 的样式规则，并让图表在明暗主题切换后定格。图表颜色属于 mermaid 内部的运行时配置，不是组件 CSS；字体仍通过 `var()` 字体族跟随应用——mermaid 会把它原样写进 SVG。

## 否决的替代方案

**做一个围栏渲染器注册表，让 client 插件各自拥有图表渲染。** 否决：`ui-primitives` 刻意保持 zero-cordis，且 `math` 围栏分支是既有先例——围栏语义属于这唯一的渲染器，不受信任内容策略也在这里。

**用 `theme: 'base'` 并把 `themeVariables` 映射到 `--dsw-*` token。** 否决：khroma 的颜色解析器在渲染时拒绝 `var()` 字符串，图表会按类型回退到源码或直接崩溃。

**在 host 侧把 mermaid 渲染成图片再附加。** 否决：markdown 从不渲染本地路径图片（不受信任内容策略），图表需要走文本通道不具备的附件管线，而且会丢失可复制的源码与文本可访问性。

## 影响

定稿的 ` ```mermaid ` 围栏在所有 `MarkdownText` 界面（聊天、计划评审、问题详情、轨迹视图）渲染为图。没有 mermaid 围栏的会话从不加载该模块。损坏的图表退化为源码块，复制控件仍可用。DOM 一致性 fixtures 不受影响：语料中没有 mermaid 围栏，且其流式 DOM 与之前一样是普通 `CodeBlock`。

## 测试

`packages/client/ui-primitives/tests/mermaid.client.spec.tsx` mock 了 mermaid 模块，钉住以下行为：带严格沙箱初始化配置的定稿渲染；解析失败与渲染失败的回退；流式围栏从不加载 mermaid；源码变化时重新渲染且不闪过旧图；成功与失败两条路径上的卸载前取消；以及全新模块图上 chunk 加载失败的回退。`MermaidBlock.tsx` 与 `render.tsx` 保持 100% 行/分支覆盖；包含逐字节钉死的 DOM 一致性 fixtures 在内的 ui-primitives 全部 22 个测试文件保持绿色。

组装后的浏览器转录由 `apps/web/tests/mermaid-fence.e2e.ts` 覆盖：一份手工编写的无 key fixture（一个已闭合的纯文本回合，assistant 消息包裹一个 mermaid 围栏）经真实后端播种，在 Playwright Chromium 中打开，断言 mermaid SVG 取代源码 `CodeBlock` 且无 console 告警，并钉住会话 aria golden（`snapshots/mermaid-fence/ui.expected.md`）——图表在其中呈现为节点标签组成的 `document` 可访问子树。

## 相关

- [Web markdown 增量 AST 渲染器](../architecture/2026-08-06-web-markdown-incremental-ast-renderer.md)——本分支所接入的流式/冻结块管线。
