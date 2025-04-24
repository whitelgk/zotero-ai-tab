# zotero-ai-tab
[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)          [English README](https://github.com/whiteofalien/zotero-ai-tab/blob/main/EN-README.md)
 - ![image](https://github.com/user-attachments/assets/7d2608ec-1e56-48c8-b129-8449d09e7454)


# 使用教程：
默认设置界面：

![image](https://github.com/user-attachments/assets/a0caf0f4-25cc-463d-940c-4ce41a55ad2e)


 - 非常简单的设置界面，基本有手就行。

 - api密钥=api-key

 - api端点=api-url
   - 必须是openai兼容格式，url需要完整的带上/chat/completions，不能是https://api.openai.com/v1这种
   - 比如Deepseek官方需要填写https://api.deepseek.com/v1/chat/completions或者https://api.deepseek.com/chat/completions
   - 比如阿里云百炼大模型平台需要填写https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
   - 具体填什么，请参考所用大模型的提供商的调用文档

 - 模型名称各家的设置略有不同
   - 比如Deepseek官方的Deepseek-R1模型需要填写deepseek-reasoner，Deepseek-V3模型需要填写deepseek-chat
   - 阿里云的Deepseek-R1模型需要填写deepseek-r1，Deepseek-V3模型需要填写deepseek-v3
   - 具体填什么，请参考所用大模型的提供商的调用文档

 - 温度默认是0.7
   - 小提示：如果使用Deepseek官方的deepseek-v3的api，建议设置为1
   - deepseek-v3的训练温度为0.3，但是大部分人配置时都使用默认的1，所以deepseek官方自己加了缩放机制，用户设置为1即可。豆包火山大模型平台的最新版v3（deepseek-v3-250324）也支持这种缩放机制，用户使用时设置1即可，其余平台若v3不是最新版0324或者没有支持这种缩放机制，建议设置温度为0.3

 - 系统提示，一般默认不用管，如果有更好地prompt可以自行设定

 - 自定义按钮栏：其实质是内置了prompt的发送按钮，后面的句子即prompt。
   - 小技巧：可以在阅读时选中一段文字后直接拖入侧边栏的输入框，拖进输入框后你会发现文字有zotero格式后缀，这个不用管，插件已内置正则清除代码，正常点击按钮（总结、翻译、解释等按钮）即可。

# 下一阶段（1.0.2版本）
 - 增加ai流式输出，现阶段是ai is thinking，看不到ai的输出过程（难度：较难）

# 感谢
- [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template)
- [Zotero GPT](https://github.com/MuiseDestiny/zotero-gpt)
- [Zotero Pdf Translate](https://github.com/windingwind/zotero-pdf-translate)
- [zotero-paper-agent](https://github.com/windfollowingheart/zotero-paper-agent)

# 开发历程
 - 此前我从未接触过zotero插件的开发，我的代码水平也基本上是学过大学计算机课的编程水平，因此项目全部是由ai进行编写代码，本人只进行思路构建。
 - 去年毕业论文写作之际接触到了zotero，但是有关gpt等ai插件在使用感受上始终差了一点，只能说是差强人意。我在插件商店搜到的gpt、ai等关键词的插件大多采用对话弹窗的设计，这对于大部分只有小小一块笔记本电脑屏幕的学生并不友好。受[Zotero Pdf Translate](https://github.com/windingwind/zotero-pdf-translate)翻译插件的启发，我希望能开发一个侧边栏ai对话插件：在侧边栏进行ai对话，不影响阅读、同时自带ai多种功能。于是这款插件就此诞生。
 - 遗憾的是，我的代码能力有限，我虽有一整套的插件思路，但是代码终究受限于ai的能力。我用ai开发了四五天，完成了这个版本的插件，可以自定义设置模型、具备历史对话记录、具备偷懒版的总结翻译解释等功能。但是我觉得还不够，我还想增加：在侧边栏可以切换模型、可以上传文件给ai、ai输出的文本可以保存到zotero的note、在阅读时选中文字后侧边栏即翻译出来、选中一些条目后可以让ai生产摘要or综述等等功能。总之，我想当缝合怪把其他插件好用的功能都缝成一个插件（有点冒犯各位前辈大佬了，sorry）。但受限于各方面因素，这些短时间内我都无法实现。这个版本上架前我在死磕上传文件的功能，因为我觉得上传文件是后续一系列功能的进度节点，但是连续数天毫无进展让我不得不放弃了。目前进度卡在文档的上传，我的思路是rag，但是在本地分割文档阶段就无法实现，pdfjs库无法调用，后续一切都是无用。我会把最新的这一阶段的项目上架到另一个分支，但是估计会很久都没有进度，我妥协了，我觉得现在的功能也够我用的了，缝合不了就多用几个插件。
 - 开发过程中，我发现其实相关的插件早就有人开发了， [zotero-paper-agent](https://github.com/windfollowingheart/zotero-paper-agent)，向大佬致敬。这个项目的思路很奇特，用的是url的方案，所以代码借鉴有限。

# 最后编辑日期：2025/4/24 CST 23:03
