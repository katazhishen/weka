# vendor/ —— 第三方运行时依赖（本地内置，不用 npm install）

weka 本体是零第三方依赖的纯 Node 实现，但有**两个能力必须借助现成的原生/WASM 模块**才做得动：语音解码和语音识别。
为了不引入 `npm install` 步骤、也不往系统里乱装东西，这两个模块被直接内置在 `vendor/` 下。

| 目录 | 包名 | 版本 | 许可证 | 用途 | 体积 |
| --- | --- | --- | --- | --- | --- |
| `silk-wasm/` | [silk-wasm](https://github.com/idranme/silk-wasm) | 3.7.1 | MIT | 把微信语音的 SILK 编码解码成 PCM | ~280 KB（含 silk.wasm 229KB） |
| `sherpa-onnx-node/` | [sherpa-onnx](https://github.com/kukuqi/sherpa-onnx) | 1.13.3 | Apache-2.0 | 离线语音识别运行时（JS 封装） | ~200 KB |
| `sherpa-onnx-win-x64/` | sherpa-onnx 官方预编译 | 1.13.3 | Apache-2.0 | Windows x64 原生库（onnxruntime 等） | ~20 MB |

## 它们是怎么来的

这两个包是**从本机已安装的 WeFlow 客户端里复制出来的**（WeFlow 自带同样的依赖，版本一致）：

```
D:\Users\34244\AppData\Local\Programs\WeFlow\resources\app.asar.unpacked\node_modules\
  ├─ silk-wasm\
  ├─ sherpa-onnx-node\
  └─ sherpa-onnx-win-x64\
```

复制而不是重新安装的原因：
1. 保持 weka **零安装步骤**，拷走整个目录就能跑；
2. 避免再往系统里装一份重复的东西；
3. 版本与模型完全匹配（WeFlow 用的就是这套组合）。

## 校验

```powershell
# 两个模块能否在纯 Node 下加载
node -e "console.log(Object.keys(require('./vendor/silk-wasm/lib/index.cjs')))"
node -e "console.log(Object.keys(require('./vendor/sherpa-onnx-node/sherpa-onnx.js')).length + ' exports')"
```

`src/voice.mjs` 里的加载顺序：优先 `vendor/`，找不到就报明确错误（不会去碰系统里的其它副本）。

## 移除它们会怎样

- 删 `silk-wasm` → 语音无法解码，聊天页语音气泡会提示转写失败
- 删 `sherpa-onnx-*` → 语音无法识别，其余功能（聊天/朋友圈/分析/导出/防撤回/图片）完全不受影响

## 许可证

- silk-wasm：MIT
- sherpa-onnx：Apache-2.0（含 onnxruntime，MIT）
两者的 LICENSE 文件都保留在各自目录内。
