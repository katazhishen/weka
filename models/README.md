# models/ —— 本地语音识别模型

weka 的语音转文字是**完全本地离线**的，用的是 SenseVoice 模型（阿里通义实验室，Apache-2.0）。
模型文件体积较大，不随代码分发，需要单独下载；下载脚本和校验方式都记录在这里。

## 当前已安装

```
models/
└─ sensevoice-int8/
   ├─ model.int8.onnx     228 MB   ← 量化版模型权重
   ├─ tokens.txt          308 KB   ← 词表
   └─ README.md                    ← 本文件
```

状态检查：

```powershell
cd D:\DSH默认文件夹\weka
node src/cli.mjs doctor          # 会打印语音模型状态
# 或
node -e "import('./src/voice.mjs').then(m=>console.log(m.modelStatus()))"
```

## 重新下载

模型来源（与 WeFlow / CipherTalk 使用的一致）：

```
https://modelscope.cn/models/pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue
```

```powershell
cd D:\DSH默认文件夹\weka\models\sensevoice-int8
$base = "https://modelscope.cn/models/pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue/resolve/master"
curl.exe -L -o tokens.txt      "$base/tokens.txt"
curl.exe -L -o model.int8.onnx "$base/model.int8.onnx"
```

国内直连可用；如需代理：`curl.exe -L -x http://127.0.0.1:7890 -o model.int8.onnx "$base/model.int8.onnx"`

可选：`float32` 完整版精度更高、体积 920MB，把 `model.onnx` 下下来改名为 `model.int8.onnx` 放同目录即可（或设置 `WEKA_MODEL_DIR` 指向别的目录）。

## 规格

| 项目 | 值 |
| --- | --- |
| 模型 | SenseVoiceSmall（sherpa-onnx 格式） |
| 量化 | int8 |
| 文件大小 | 228 MB（`model.int8.onnx`） |
| 语言 | 中文 / 英语 / 日语 / 韩语 / 粤语（自动识别） |
| 采样率 | 16 kHz 单声道 |
| 推理 | sherpa-onnx CPU，线程数 = CPU 核数 / 2 |
| 实测速度 | 4~8 秒语音约 70~110 ms（模型加载约 1 秒，之后常驻） |

## 目录约定

- 默认目录：`weka/models/sensevoice-int8/`
- 可用环境变量覆盖：`WEKA_MODEL_DIR=<目录>`
- 期望文件名固定：`model.int8.onnx` + `tokens.txt`
- 转写结果不放在这里，而是缓存在 `~/.weka/archive.db` 的 `transcripts` 表

## 许可证

SenseVoice 模型权重：Apache-2.0（FunAudioLLM/SenseVoice 项目）。
