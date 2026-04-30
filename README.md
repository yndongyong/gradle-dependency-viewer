# Android Gradle 依赖分析器

> 📊 一款 Gradle 依赖关系可视化工具，用于分析和展示 Android 项目中的依赖层级结构，协助解决依赖冲突

**在线地址**: https://yndongyong.github.io/gradle-dependency-viewer/

---

## 功能特性

| 功能 | 说明 |
|------|------|
| **依赖清单展示** | 自动解析 `dependencies` 输出，按库名、版本、来源、深度等维度展示 |
| **版本变化追踪** | 定位请求版本与最终版本不一致的情况，追溯被替换的来源 |
| **依赖路径可视化** | 点击任意库，右侧展示从直接依赖到该库的所有路径 |
| **原始树还原** | 按 Gradle 输出缩进还原依赖树，可展开查看局部关系 |
| **多视图筛选** | 支持按全部/版本变化/直接依赖/间接依赖切换视图 |
| **全文搜索** | 支持按 group:name 或版本号快速搜索 |

---

## 快速开始

### 1. 生成依赖文件

在 Android 项目根目录执行以下命令，将依赖树输出到 `dep.txt`：



```bash
./gradlew :app:dependencies  > dep.txt
```
 指定configuration配置
```bash
./gradlew :app:dependencies --configuration releaseRuntimeClassPath > dep.txt
```

> **提示**：
> - 将 `:app` 替换为实际的 module 名称
> - 将 `releaseRuntimeClassPath` 替换为所需的 configuration `{flavor}{buildType}RuntimeClassPath`（如 `normalReleaseRuntimeClassPath`）
> - 查看所有可用的 configuration：`./gradlew :app:dependencies --all`

### 2. 上传分析

将生成的 `dep.txt` 文件**拖拽**或**点击选择**上传到页面即可。

### 3. 查看结果

- **切换 Configuration**：通过下拉菜单选择不同的构建配置
- **搜索过滤**：在搜索框输入 group:name 或版本号进行过滤
- **筛选视图**：
  - `全部` - 显示所有依赖
  - `只看版本变化` - 仅显示版本被替换的依赖
  - `只看直接依赖` - 仅显示第一层依赖
  - `只看间接依赖` - 仅显示传递依赖
- **查看详情**：点击任意依赖行，右侧弹出依赖路径图和原始树

---

## 核心特性

### 📈 版本冲突定位
- 快速发现版本被 BOM、约束（constraint）或强制规则替换的情况
- 显示 `请求版本 -> 最终版本` 的变更过程

### 🔍 依赖路径追踪
- 选择任意库后，图形化展示从直接依赖到该库的所有链路
- 最多显示 16 条依赖路径

### 🌲 原始树查看
- 按 Gradle 输出缩进还原完整的依赖树结构
- 支持展开/收起操作，便于查看局部依赖关系

---

## 依赖树阅读指南

Gradle 的 `dependencies` 输出有以下规律：

1. **Configuration 分组**：通常优先看 `debugRuntimeClasspath` 或 `releaseRuntimeClassPath`

2. **第一层是直接依赖**：`+---` 顶格出现的库来自你项目的声明、平台 BOM 或 project module

3. **缩进越深越间接**：父节点引入子节点，路径就是"谁带进来的"

4. **`A -> B` 表示版本选择**：请求的是 A，最终被 Gradle 冲突解决、BOM、约束或强制规则选成 B

5. **`(*)` 表示重复省略**：同一个子树前面已经打印过，Gradle 不再展开

6. **`(c)` 表示 constraint**：版本约束，不一定代表真实 jar 被这个节点单独引入

---


## License

MIT License
